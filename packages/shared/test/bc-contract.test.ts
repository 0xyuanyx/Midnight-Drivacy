import { describe, expect, it } from "vitest";
import {
  CalculateTripRequestSchema, CandidateStateSchema, DeployRuleRequestSchema, DeployRuleResultSchema, RuleSchema, UpdateRuleRequestSchema,
  TripProcessingResultSchema, canFinalizeState, serializeRule, serializeState, serializeDatasetRecord,
} from "../src/bc-contract.js";

// All values are synthetic contract fixtures, including tests of live envelope shape.
// No hash, proof, wallet, DB, network or chain adapter is executed here.
const scope = {
  applicantId: "demo-driver", contractId: "demo-contract", insurerId: "demo-insurer",
  endorsementId: "demo-endorsement",
  evaluationPeriod: { id: "demo-period", startDate: "2026-09-01", endDate: "2026-09-30" },
};
const rule = {
  id: "demo-rule", version: 1, insurerId: scope.insurerId, endorsementId: scope.endorsementId,
  formula: "cumulative-event-deduction-v1" as const, initialScore: 100 as const,
  speedingPenalty: 2, accelerationPenalty: 1, brakingPenalty: 3,
  minimumDistanceM: 500_000, minimumScore: 80, premiumMinimumScore: 90,
  baseDiscountBps: 1000, premiumDiscountBps: 1200,
};
const ref = { id: rule.id, version: rule.version, ruleHash: "fixture-rule-hash" };
const zero = { distanceM: 0, durationSeconds: 0, speedingCount: 0, accelerationCount: 0, brakingCount: 0 };
const firstTotals = { distanceM: 300_000, durationSeconds: 10_800,
  speedingCount: 2, accelerationCount: 1, brakingCount: 1 };
const secondTripTotals = { distanceM: 250_000, durationSeconds: 9000,
  speedingCount: 1, accelerationCount: 0, brakingCount: 1 };
const secondTotals = { distanceM: 550_000, durationSeconds: 19_800,
  speedingCount: 3, accelerationCount: 1, brakingCount: 2 };

function state(version: number) {
  return { scope, rule: ref, version, tripCount: version,
    totals: version === 0 ? zero : version === 1 ? firstTotals : secondTotals,
    score: version === 0 ? 100 : version === 1 ? 92 : 87,
    conditionsMet: version === 2, expectedDiscountBps: version === 2 ? 1000 : 0,
    datasetRoot: `fixture-root-${version}`, stateSalt: "11".repeat(32),
    stateCommitment: `fixture-state-${version}` };
}

function confirmation(version: number, execution: "fixture" | "live" = "fixture") {
  return { execution, network: execution === "fixture" ? "fixture" as const : "local" as const,
    adapterProfile: "fixture-shape-only", chainContractAddress: "fixture-contract",
    transactionId: `fixture-tx-${version}`, blockId: "fixture-block",
    operationId: `operation-${version}`, previousStateCommitment: `fixture-state-${version - 1}`,
    newStateCommitment: `fixture-state-${version}`, ruleHash: ref.ruleHash,
    datasetRoot: `fixture-root-${version}`, observedAt: "2026-09-17T00:00:00Z" };
}

function request(version = 1, execution: "fixture" | "live" = "fixture") {
  return { contractVersion: "bc-v1" as const, execution, operationId: `operation-${version}`,
    idempotencyKey: `idempotency-${version}`, scope,
    approvedRule: { approval: "approved" as const, rule,
      registration: "chain-confirmed" as const, ruleHash: ref.ruleHash,
      adapterProfile: "fixture-shape-only", network: execution === "fixture" ? "fixture" as const : "local" as const,
      chainContractAddress: "fixture-contract", registrationTransactionId: "fixture-rule-tx" },
    previous: { kind: "confirmed" as const, state: state(version - 1), confirmation: confirmation(version - 1, execution) },
    trip: { id: `trip-${version}`, source: "simulated" as const, collectionEnabled: true as const,
      records: [{ index: 0, ...(version === 1 ? firstTotals : secondTripTotals) }],
      datasetSalt: "00".repeat(32) } };
}

function candidate(version = 1) {
  return { kind: "candidate" as const, state: state(version), operationId: `operation-${version}`,
    tripId: `trip-${version}`, previousStateCommitment: `fixture-state-${version - 1}`,
    explanation: { previousScore: version === 1 ? 100 : 92, newScore: version === 1 ? 92 : 87,
      scoreDelta: version === 1 ? -8 : -5, tripTotals: version === 1 ? firstTotals : secondTripTotals,
      ruleVersion: 1, penalties: version === 1 ? { speeding: 4, acceleration: 1, braking: 3 }
        : { speeding: 2, acceleration: 0, braking: 3 } } };
}

function result(execution: "fixture" | "live" = "fixture") {
  return { contractVersion: "bc-v1" as const, execution, operationId: "operation-1", tripId: "trip-1",
    status: "chain-confirmed" as const, candidate: candidate(), confirmation: confirmation(1, execution) };
}

describe("B↔C internal contract", () => {
  it("models first deployment separately from an update on an existing contract", () => {
    const approvedRule = { approval: "approved", rule };
    const registeredRule = { ...approvedRule, registration: "chain-confirmed", ruleHash: "fixture-rule-hash", adapterProfile: "fixture-adapter", network: "fixture", chainContractAddress: "fixture-contract", registrationTransactionId: "register-tx" };
    expect(DeployRuleRequestSchema.safeParse({ scope, approvedRule }).success).toBe(true);
    expect(DeployRuleResultSchema.safeParse({ deploymentTransactionId: "deploy-tx", registeredRule }).success).toBe(true);
    expect(UpdateRuleRequestSchema.safeParse({ scope, approvedRule, deployment: { network: "fixture", adapterProfile: "fixture-adapter", chainContractAddress: "fixture-contract" } }).success).toBe(true);
  });
  it("accepts the two sequential fixtures with explicit candidate states", () => {
    expect(CalculateTripRequestSchema.parse(request()).previous.state.score).toBe(100);
    expect(CandidateStateSchema.parse(candidate()).state).toMatchObject({ score: 92, conditionsMet: false });
    expect(CalculateTripRequestSchema.parse(request(2)).previous.state.score).toBe(92);
    expect(CandidateStateSchema.parse(candidate(2)).state).toMatchObject({
      score: 87, conditionsMet: true, expectedDiscountBps: 1000, totals: { distanceM: 550_000 } });
  });
  it("serializes rule properties in a stable order without approval metadata", () => {
    const reordered = Object.fromEntries(Object.entries(rule).reverse());
    expect(serializeRule(RuleSchema.parse(reordered))).toBe(serializeRule(rule));
    expect(JSON.parse(serializeRule(rule))).toEqual([
      "drivacy-rule-v1", "demo-rule", 1, "demo-insurer", "demo-endorsement",
      "cumulative-event-deduction-v1", "m", "s", "integer-score", "bps",
      100, 2, 1, 3, 500_000, 80, 90, 1000, 1200]);
  });
  it("binds dataset order, input and salt and excludes state commitment self-reference", () => {
    const trip = request().trip;
    const first = serializeDatasetRecord(trip, 0);
    const changed = structuredClone(trip); changed.records[0]!.speedingCount = 3;
    expect(serializeDatasetRecord(changed, 0)).not.toBe(first);
    changed.records[0]!.speedingCount = 2; changed.datasetSalt = "22".repeat(32);
    expect(serializeDatasetRecord(changed, 0)).not.toBe(first);
    expect(() => serializeDatasetRecord(trip, -1)).toThrow();
    const snapshot = state(1);
    expect(serializeState({ ...snapshot, stateCommitment: "different" })).toBe(serializeState(snapshot));
    expect(serializeState({ ...snapshot, stateSalt: "22".repeat(32) })).not.toBe(serializeState(snapshot));
  });
  it.each([-1, 0.5, Number.MAX_SAFE_INTEGER, NaN])("rejects invalid distance %s", value => {
    const input = request(); input.trip.records[0]!.distanceM = value;
    expect(CalculateTripRequestSchema.safeParse(input).success).toBe(false);
  });
  it("rejects disabled collection, extra raw fields and reordered record indices", () => {
    const input = request();
    expect(CalculateTripRequestSchema.safeParse({ ...input, trip: { ...input.trip, collectionEnabled: false } }).success).toBe(false);
    expect(CalculateTripRequestSchema.safeParse({ ...input, gps: [37, 127] }).success).toBe(false);
    input.trip.records[0]!.index = 1;
    expect(CalculateTripRequestSchema.safeParse(input).success).toBe(false);
  });
  it("rejects unapproved/unregistered and mismatched rules", () => {
    const input = request();
    expect(CalculateTripRequestSchema.safeParse({ ...input, approvedRule: { ...input.approvedRule, approval: "draft" } }).success).toBe(false);
    expect(CalculateTripRequestSchema.safeParse({ ...input, approvedRule: { ...input.approvedRule, registration: "submitted" } }).success).toBe(false);
    input.approvedRule.rule = { ...rule, version: 2 };
    expect(CalculateTripRequestSchema.safeParse(input).success).toBe(false);
  });
  it("rejects another driver or an inconsistent prior score", () => {
    const input = request();
    expect(CalculateTripRequestSchema.safeParse({ ...input, scope: { ...scope, applicantId: "other" } }).success).toBe(false);
    input.previous.state.score = 85;
    expect(CalculateTripRequestSchema.safeParse(input).success).toBe(false);
  });
  it("rejects mixed fixture/live evidence and numeric overflow", () => {
    expect(CalculateTripRequestSchema.safeParse({ ...request(), execution: "live" }).success).toBe(false);
    const input = request(2); input.trip.records[0]!.distanceM = 0xffff_ffff;
    expect(CalculateTripRequestSchema.safeParse(input).success).toBe(false);
  });
  it("never allows fixture confirmation to finalize DB state", () => {
    expect(TripProcessingResultSchema.safeParse(result()).success).toBe(true);
    expect(canFinalizeState(result(), request())).toBe(false);
  });
  it("accepts a matching synthetic live envelope for the consistency gate only", () => {
    expect(canFinalizeState(result("live"), request(1, "live"))).toBe(true);
  });
  it.each(["calculated", "proving", "awaiting-wallet-approval", "submitted", "chain-unknown", "failed"])(
    "never finalizes %s", status => {
      const common = { contractVersion: "bc-v1", execution: "live", operationId: "operation-1", tripId: "trip-1", status };
      const payload = status === "calculated" ? { candidate: candidate() }
        : status === "awaiting-wallet-approval" ? { approvalRequestId: "approval-1" }
        : status === "submitted" || status === "chain-unknown" ? { transactionId: "fixture-tx" }
        : status === "failed" ? { error: { code: "TEMPORARY_FAILURE", retryable: true } } : {};
      expect(TripProcessingResultSchema.safeParse({ ...common, ...payload }).success).toBe(true);
      expect(canFinalizeState({ ...common, ...payload }, request(1, "live"))).toBe(false);
    });
  it.each(["operationId", "previousStateCommitment", "newStateCommitment", "ruleHash", "datasetRoot"])(
    "rejects confirmation mismatch in %s", key => {
      const input = result("live");
      const changed = { ...input, confirmation: { ...input.confirmation, [key]: "other" } };
      expect(TripProcessingResultSchema.safeParse(changed).success).toBe(false);
      expect(canFinalizeState(changed, request(1, "live"))).toBe(false);
    });
  it("rejects confirmations from another network/contract and stale state versions", () => {
    const input = result("live");
    expect(canFinalizeState({ ...input, confirmation: { ...input.confirmation, network: "preprod" } }, request(1, "live"))).toBe(false);
    expect(canFinalizeState({ ...input, confirmation: { ...input.confirmation, chainContractAddress: "other" } }, request(1, "live"))).toBe(false);
    input.candidate.state.version = 2;
    expect(canFinalizeState(input, request(1, "live"))).toBe(false);
  });
  it("does not automatically retry proof invalidity or approval cancellation", () => {
    for (const code of ["PROOF_INVALID", "APPROVAL_CANCELLED"]) {
      expect(TripProcessingResultSchema.safeParse({ contractVersion: "bc-v1", execution: "fixture",
        operationId: "operation-1", tripId: "trip-1", status: "failed", error: { code, retryable: true } }).success).toBe(false);
    }
  });
});
