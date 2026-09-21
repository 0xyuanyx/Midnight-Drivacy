import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { ChainFinalizer } from "../src/chain-state/chain-finalizer.js";
import type { ConfirmedState, RegisteredRule, TripProcessingResult, User } from "@drivacy/shared";

const actor: User = { id: "driver", email: "driver@example.invalid", role: "DRIVER" };
const jobRow = {
  operation_id: "operation", scope_key: "scope", trip_id: "trip", previous_commitment: "previous",
  source_key: "private-source", status: "pending", request_hash: "hash", claim_token: null,
  claim_valid: true, confirmed_result: null, deletion_status: "pending",
};
const pool = () => ({ query: vi.fn().mockResolvedValue({ rows: [jobRow], rowCount: 1 }) }) as unknown as Pool;

const confirmedResult: TripProcessingResult = {
  contractVersion: "bc-v1", execution: "live", operationId: "operation", tripId: "trip",
  status: "chain-confirmed",
  candidate: {
    kind: "candidate", operationId: "operation", tripId: "trip", previousStateCommitment: "previous",
    state: {
      scope: { applicantId: "driver", contractId: "contract", insurerId: "insurer", endorsementId: "endorsement",
        evaluationPeriod: { id: "period", startDate: "2026-09-01", endDate: "2026-09-30" } },
      rule: { id: "rule", version: 1, ruleHash: "rule-hash" }, version: 1, tripCount: 1,
      totals: { distanceM: 1, durationSeconds: 1, speedingCount: 0, accelerationCount: 0, brakingCount: 0 },
      score: 100, conditionsMet: false, expectedDiscountBps: 0, datasetRoot: "dataset-root",
      stateSalt: "a".repeat(64), stateCommitment: "new-state",
    },
    explanation: { previousScore: 100, newScore: 100, scoreDelta: 0,
      tripTotals: { distanceM: 1, durationSeconds: 1, speedingCount: 0, accelerationCount: 0, brakingCount: 0 },
      ruleVersion: 1, penalties: { speeding: 0, acceleration: 0, braking: 0 } },
  },
  confirmation: {
    execution: "live", network: "local", adapterProfile: "profile", chainContractAddress: "contract-address",
    transactionId: "transaction", blockId: "block", operationId: "operation",
    previousStateCommitment: "previous", newStateCommitment: "new-state", ruleHash: "rule-hash",
    datasetRoot: "dataset-root", observedAt: "2026-09-20T00:00:00Z",
  },
};

const initialRule: RegisteredRule = { approval: "approved", registration: "chain-confirmed",
  rule: { id: "rule", version: 1, insurerId: "insurer", endorsementId: "endorsement",
    formula: "cumulative-event-deduction-v1", initialScore: 100, speedingPenalty: 2,
    accelerationPenalty: 1, brakingPenalty: 3, minimumDistanceM: 500000,
    minimumScore: 80, premiumMinimumScore: 90, baseDiscountBps: 1000, premiumDiscountBps: 1200 },
  ruleHash: "rule-hash", network: "local", adapterProfile: "profile",
  chainContractAddress: "contract-address", registrationTransactionId: "registration-tx" };
const genesisState: ConfirmedState = { kind: "confirmed", state: {
  ...confirmedResult.candidate.state, version: 0, tripCount: 0, score: 100,
  totals: { distanceM: 0, durationSeconds: 0, speedingCount: 0, accelerationCount: 0, brakingCount: 0 },
}, confirmation: { ...confirmedResult.confirmation, newStateCommitment: "new-state" } };

describe("ChainFinalizer trust-boundary errors", () => {
  it("maps C read failures and malformed status payloads to CHAIN_STATUS_UNAVAILABLE", async () => {
    for (const read of [async () => { throw new Error("transport"); }, async () => ({ bad: true } as never)]) {
      const service = new ChainFinalizer(pool(), { getTripStatus: read, async canAbandonTrip() { return false; } }, {
        async load() { throw new Error("unused"); }, async delete() {},
      });
      await expect(service.finalize(actor, "operation", "claim")).rejects.toThrow("CHAIN_STATUS_UNAVAILABLE");
    }
  });

  it("maps an invalid private source payload to SOURCE_PAYLOAD_INVALID", async () => {
    const service = new ChainFinalizer(pool(), {
      async getTripStatus() { return confirmedResult; }, async canAbandonTrip() { return false; },
    }, { async load() { return { bad: true } as never; }, async delete() {} });
    await expect(service.finalize(actor, "operation", "claim")).rejects.toThrow("SOURCE_PAYLOAD_INVALID");
  });
});

describe("ChainFinalizer Genesis attack cases", () => {
  it.each([
    ["distance", { totals: { ...genesisState.state.totals, distanceM: 1 } }],
    ["trip count", { tripCount: 1 }],
    ["initial score", { score: 99 }],
  ])("rejects forged Genesis %s before any DB write", async (_, changed) => {
    const db = { connect: vi.fn() } as unknown as Pool;
    const service = new ChainFinalizer(db, { async getTripStatus() { throw new Error("unused"); }, async canAbandonTrip() { return false; } },
      { async load() { throw new Error("unused"); }, async delete() {} });
    await expect(service.registerInitial(actor, initialRule,
      { ...genesisState, state: { ...genesisState.state, ...changed } })).rejects.toThrow("INITIAL_BINDING_MISMATCH");
    expect(db.connect).not.toHaveBeenCalled();
  });
});
