import { describe, expect, it } from "vitest";
import type { AdapterRuntime, ConfirmedState, RegisteredRule, Scope, Trip, User } from "@drivacy/shared";

import { ChainProcessingService } from "../src/chain-state/chain-processing-service.js";
import type { ChainProcessingRepository, ChainProcessingTarget } from "../src/chain-state/chain-processing-repository.js";

const runtime: AdapterRuntime = { network: "local", adapterProfile: "drivacy-test" };
const driver: User = { id: "driver", email: "driver@example.invalid", role: "DRIVER" };
const scope: Scope = {
  applicantId: driver.id, contractId: "contract", insurerId: "insurer", endorsementId: "special",
  evaluationPeriod: { id: "period", startDate: "2026-09-01", endDate: "2026-09-30" },
};
const registeredRule: RegisteredRule = {
  approval: "approved", registration: "chain-confirmed", ruleHash: "rule-hash",
  adapterProfile: runtime.adapterProfile, network: runtime.network,
  chainContractAddress: "chain-contract", registrationTransactionId: "registration",
  rule: {
    id: "rule", version: 1, insurerId: scope.insurerId, endorsementId: scope.endorsementId,
    formula: "cumulative-event-deduction-v1", initialScore: 100, speedingPenalty: 2,
    accelerationPenalty: 1, brakingPenalty: 3, minimumDistanceM: 500000,
    minimumScore: 80, premiumMinimumScore: 90, baseDiscountBps: 1000, premiumDiscountBps: 1200,
  },
};
const confirmedState: ConfirmedState = {
  kind: "confirmed",
  state: {
    scope, rule: { id: "rule", version: 1, ruleHash: "rule-hash" }, version: 0, tripCount: 0,
    totals: { distanceM: 0, durationSeconds: 0, speedingCount: 0, accelerationCount: 0, brakingCount: 0 },
    score: 100, conditionsMet: false, expectedDiscountBps: 0, datasetRoot: "genesis-root",
    stateSalt: "a".repeat(64), stateCommitment: "genesis-commitment",
  },
  confirmation: {
    execution: "live", network: runtime.network, adapterProfile: runtime.adapterProfile,
    chainContractAddress: "chain-contract", transactionId: "genesis-transaction", blockId: "genesis-block",
    operationId: "genesis-operation", previousStateCommitment: "none",
    newStateCommitment: "genesis-commitment", ruleHash: "rule-hash", datasetRoot: "genesis-root",
    observedAt: "2026-09-20T00:00:00.000Z",
  },
};
const trip: Trip = {
  id: "trip-operation", source: "simulated", collectionEnabled: true, datasetSalt: "b".repeat(64),
  records: [{ index: 0, distanceM: 1000, durationSeconds: 60, speedingCount: 0, accelerationCount: 0, brakingCount: 0 }],
};

class MemoryRepository implements ChainProcessingRepository {
  public target: ChainProcessingTarget = {
    sessionId: "session", ownerUserId: driver.id, scope, registeredRule, confirmedState, trip,
  };
  public async findEndedSession(): Promise<ChainProcessingTarget | undefined> { return this.target; }
}

const service = (repository: ChainProcessingRepository) => new ChainProcessingService(
  repository,
  {} as never,
  {} as never,
  runtime,
);

describe("ChainProcessingService", () => {
  it("assembles an ended driving session with its stored rule and confirmed state", async () => {
    const request = await service(new MemoryRepository()).assemble(driver, "session", "session-key");

    expect(request).toMatchObject({
      contractVersion: "bc-v1", execution: "live", operationId: trip.id, idempotencyKey: "session-key",
      scope, approvedRule: registeredRule, previous: confirmedState, trip,
    });
  });

  it("rejects a stored state whose Rule cannot be used for the current session", async () => {
    const repository = new MemoryRepository();
    repository.target = {
      ...repository.target,
      confirmedState: { ...confirmedState, state: { ...confirmedState.state, rule: { ...confirmedState.state.rule, version: 2 } } },
    };

    await expect(service(repository).assemble(driver, "session", "session-key"))
      .rejects.toMatchObject({ code: "DRIVING_SESSION_NOT_READY" });
  });
});
