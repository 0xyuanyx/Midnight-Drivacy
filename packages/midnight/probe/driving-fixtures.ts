// Developer fixtures only. These helpers do not approve/register a real Rule.
import { createDemoRule } from "../../core/src/calculation.js";
import type { CalculateTripRequest, ConfirmedState, RegisteredRule, Scope, Trip } from "../../shared/src/bc-contract.js";
import { ADAPTER_PROFILE } from "../src/state-adapter.js";

export const demoScope: Scope = {
  applicantId: "00000000-0000-4000-8000-000000000001", contractId: "00000000-0000-4000-8000-000000000002",
  insurerId: "00000000-0000-4000-8000-000000000003", endorsementId: "00000000-0000-4000-8000-000000000004", evaluationPeriod: {
    id: "demo-period", startDate: "2026-09-01", endDate: "2026-09-30",
  },
};
export const demoRule = createDemoRule({ id: "demo-rule", version: 1,
  insurerId: demoScope.insurerId, endorsementId: demoScope.endorsementId });
export function demoTrip(number: 1 | 2, salt: string): Trip {
  return { id: `demo-trip-${number}`, source: "simulated", collectionEnabled: true, datasetSalt: salt,
    records: number === 1
      ? [{ index: 0, distanceM: 300_000, durationSeconds: 10_800,
        speedingCount: 2, accelerationCount: 1, brakingCount: 1 }]
      : [{ index: 0, distanceM: 150_000, durationSeconds: 5400,
        speedingCount: 1, accelerationCount: 0, brakingCount: 0 },
        { index: 1, distanceM: 100_000, durationSeconds: 3600,
          speedingCount: 0, accelerationCount: 0, brakingCount: 1 }],
  };
}
export function demoRegisteredRule(ruleHash: string, execution: "fixture" | "live",
  address: string, transactionId: string): RegisteredRule {
  return { approval: "approved", registration: "chain-confirmed", rule: demoRule, ruleHash,
    adapterProfile: ADAPTER_PROFILE, network: execution === "fixture" ? "fixture" : "local",
    chainContractAddress: address, registrationTransactionId: transactionId };
}
export function demoRequest(previous: ConfirmedState, approvedRule: RegisteredRule, trip: Trip): CalculateTripRequest {
  return { contractVersion: "bc-v1", execution: previous.confirmation.execution,
    operationId: `operation-${trip.id}`, idempotencyKey: `idempotency-${trip.id}`,
    scope: demoScope, approvedRule, previous, trip };
}
