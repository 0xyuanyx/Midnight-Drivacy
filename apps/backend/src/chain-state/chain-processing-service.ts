import {
  CONTRACT_VERSION, CalculateTripRequestSchema, ConfirmedStateSchema, RegisteredRuleSchema,
  ScopeSchema, TripSchema,
  type AdapterRuntime, type CalculateTripRequest, type TripProcessingResult, type User,
} from "@drivacy/shared";

import { AppError } from "../errors/app-error.js";
import { ChainFinalizer, type PrivateTripSource } from "./chain-finalizer.js";
import type { ChainProcessingRepository } from "./chain-processing-repository.js";

/**
 * The request contains private simulated records. A concrete durable source is
 * intentionally injected later, rather than storing it in a public API or a
 * C-local journal.
 */
export interface TripRequestSource extends PrivateTripSource {
  /** Re-saving one operation must return its original source key. */
  save(request: CalculateTripRequest): Promise<string>;
}

/** A future C adapter may be injected here; B does not calculate or submit a trip. */
export interface ChainProcessingGateway {
  getTripStatus(operationId: string): Promise<TripProcessingResult>;
  canAbandonTrip(operationId: string): Promise<boolean>;
}

export class ChainProcessingService {
  public constructor(
    private readonly repository: ChainProcessingRepository,
    private readonly finalizer: ChainFinalizer,
    private readonly source: TripRequestSource,
    private readonly runtime: AdapterRuntime,
  ) {}

  public async assemble(user: User, sessionId: string, idempotencyKey: string): Promise<CalculateTripRequest> {
    if (user.role !== "DRIVER") throw new AppError("FORBIDDEN", "Only drivers can process driving sessions", 403);
    const target = await this.repository.findEndedSession(user.id, sessionId, this.runtime);
    if (!target) throw new AppError("DRIVING_SESSION_NOT_READY", "Driving session has no current confirmed chain state", 409);
    const scope = ScopeSchema.safeParse(target.scope);
    const rule = RegisteredRuleSchema.safeParse(target.registeredRule);
    const previous = ConfirmedStateSchema.safeParse(target.confirmedState);
    const trip = TripSchema.safeParse(target.trip);
    if (!scope.success || !rule.success || !previous.success || !trip.success
      || target.ownerUserId !== user.id || scope.data.applicantId !== user.id) {
      throw new AppError("INTERNAL_SERVER_ERROR", "Stored processing data is invalid", 500);
    }
    const request = CalculateTripRequestSchema.safeParse({
      // A session owns one generated Trip, so its Trip ID is the stable operation identity on retries.
      contractVersion: CONTRACT_VERSION, execution: "live", operationId: trip.data.id,
      idempotencyKey, scope: scope.data, approvedRule: rule.data, previous: previous.data, trip: trip.data,
    });
    if (!request.success) throw new AppError("DRIVING_SESSION_NOT_READY", "Driving session cannot be processed with the current chain state", 409);
    return request.data;
  }

  public async stage(user: User, sessionId: string, idempotencyKey: string): Promise<{ operationId: string }> {
    const request = await this.assemble(user, sessionId, idempotencyKey);
    const sourceKey = await this.source.save(request);
    try {
      await this.finalizer.createJob(user, request, sourceKey);
      return { operationId: request.operationId };
    } catch (error) {
      await this.source.delete(sourceKey);
      throw error;
    }
  }
}
