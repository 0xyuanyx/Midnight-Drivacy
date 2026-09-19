import { z } from "zod";
import { TripSchema } from "./bc-contract.js";

/**
 * Idempotency is carried in the Idempotency-Key request header rather than
 * allowing a caller to choose a session or generated trip identifier.
 */
export const IdempotencyKeySchema = z.string().trim().min(1).max(255);
export type IdempotencyKey = z.infer<typeof IdempotencyKeySchema>;

/**
 * The client may choose only the contract, selected special contract, and
 * evaluation period. Rule/state/calculation inputs must be resolved by the
 * Backend from its own authoritative records when the API is implemented.
 */
export const StartDrivingSessionRequestSchema = z.object({
  insuranceContractId: z.uuid(),
  specialContractId: z.uuid(),
  evaluationPeriod: z.string().trim().min(1),
}).strict();
export type StartDrivingSessionRequest = z.infer<typeof StartDrivingSessionRequestSchema>;

export const DrivingSessionStatusSchema = z.enum(["GENERATED", "ENDED"]);
export const DrivingSessionResponseSchema = z.object({
  sessionId: z.uuid(), status: DrivingSessionStatusSchema, startedAt: z.iso.datetime(),
  endedAt: z.iso.datetime().nullable(), trip: TripSchema,
}).strict();
export type DrivingSessionResponse = z.infer<typeof DrivingSessionResponseSchema>;

// Trip, processing, Rule, and State contracts are intentionally not defined here:
// this repository has no confirmed source schema or persistence keys for them yet.
