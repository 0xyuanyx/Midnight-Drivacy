import { describe, expect, it } from "vitest";
import { CandidateStateSchema, CalculateTripRequestSchema, type CalculateTripRequest } from "../../shared/src/bc-contract.js";
import { calculateTrip, createDemoRule, CoreCalculationError, type TripCalculation } from "../src/calculation.js";

// Offline fixtures only. Promotion below simulates confirmation for calculation tests;
// it never proves a transaction or provides an adapter usable by production.
const zero = { distanceM: 0, durationSeconds: 0, speedingCount: 0, accelerationCount: 0, brakingCount: 0 };
const first = { distanceM: 300_000, durationSeconds: 10_800, speedingCount: 2, accelerationCount: 1, brakingCount: 1 };
const second = { distanceM: 250_000, durationSeconds: 9000, speedingCount: 1, accelerationCount: 0, brakingCount: 1 };
function request(): CalculateTripRequest {
  const scope = { applicantId: "fixture-driver", contractId: "fixture-policy", insurerId: "fixture-insurer",
    endorsementId: "fixture-endorsement", evaluationPeriod: { id: "fixture-period", startDate: "2026-09-01", endDate: "2026-09-30" } };
  const rule = createDemoRule({ id: "fixture-rule", version: 1, insurerId: scope.insurerId, endorsementId: scope.endorsementId });
  return { contractVersion: "bc-v1", execution: "fixture", operationId: "fixture-op-1", idempotencyKey: "fixture-key-1", scope,
    approvedRule: { approval: "approved", registration: "chain-confirmed", rule, ruleHash: "fixture-rule-hash",
      adapterProfile: "fixture-calculation-only", network: "fixture", chainContractAddress: "fixture-contract", registrationTransactionId: "fixture-rule-tx" },
    previous: { kind: "confirmed", state: { scope, rule: { id: rule.id, version: 1, ruleHash: "fixture-rule-hash" },
      version: 0, tripCount: 0, totals: { ...zero }, score: 100, conditionsMet: false, expectedDiscountBps: 0,
      datasetRoot: "fixture-root-0", stateSalt: "11".repeat(32), stateCommitment: "fixture-state-0" },
      confirmation: { execution: "fixture", network: "fixture", adapterProfile: "fixture-calculation-only", chainContractAddress: "fixture-contract",
        transactionId: "fixture-tx-0", blockId: "fixture-block", operationId: "fixture-genesis", previousStateCommitment: "fixture-empty",
        newStateCommitment: "fixture-state-0", ruleHash: "fixture-rule-hash", datasetRoot: "fixture-root-0", observedAt: "2026-09-17T00:00:00Z" } },
    trip: { id: "fixture-trip-1", source: "simulated", collectionEnabled: true, records: [{ index: 0, ...first }], datasetSalt: "22".repeat(32) } };
}
function fixtureNext(input: CalculateTripRequest, computed: TripCalculation): CalculateTripRequest {
  const next = structuredClone(input);
  next.operationId = "fixture-op-2"; next.idempotencyKey = "fixture-key-2";
  next.previous.state = { ...computed.next, datasetRoot: "fixture-root-1", stateSalt: "33".repeat(32), stateCommitment: "fixture-state-1" };
  next.previous.confirmation = { ...input.previous.confirmation, operationId: input.operationId,
    previousStateCommitment: input.previous.state.stateCommitment, newStateCommitment: "fixture-state-1", datasetRoot: "fixture-root-1" };
  next.trip = { ...next.trip, id: "fixture-trip-2", records: [{ index: 0, ...second }] };
  return next;
}
function errorCode(input: unknown) {
  try { calculateTrip(input); throw new Error("Expected calculation to reject"); }
  catch (error) { expect(error).toBeInstanceOf(CoreCalculationError); return (error as CoreCalculationError).code; }
}
function freeze(value: unknown): void {
  if (typeof value === "object" && value !== null) {
    Object.values(value).forEach(freeze); Object.freeze(value);
  }
}

describe("Core cumulative calculation", () => {
  it("continues two trips from the previous state without requiring previous raw records", () => {
    const input = request(); const calculated = calculateTrip(input);
    expect(calculated.next).toMatchObject({ version: 1, tripCount: 1, totals: first, score: 92, conditionsMet: false, expectedDiscountBps: 0 });
    expect(calculated.explanation).toEqual({ previousScore: 100, newScore: 92, scoreDelta: -8, tripTotals: first,
      ruleVersion: 1, penalties: { speeding: 4, acceleration: 1, braking: 3 } });
    const next = fixtureNext(input, calculated);
    expect(CalculateTripRequestSchema.safeParse(next).success).toBe(true);
    const accumulated = calculateTrip(next);
    expect(accumulated.previousStateCommitment).toBe("fixture-state-1");
    expect(accumulated.next).toMatchObject({ version: 2, tripCount: 2, totals: { distanceM: 550_000, durationSeconds: 19_800,
      speedingCount: 3, accelerationCount: 1, brakingCount: 2 }, score: 87, conditionsMet: true, expectedDiscountBps: 1000 });
    expect(accumulated.explanation).toMatchObject({ previousScore: 92, newScore: 87, scoreDelta: -5, tripTotals: second,
      penalties: { speeding: 2, acceleration: 0, braking: 3 } });
  });
  it.each([
    [499_999, 80, false, 0], [500_000, 79, false, 0], [500_000, 80, true, 1000],
    [500_000, 89, true, 1000], [500_000, 90, true, 1200], [500_000, 100, true, 1200],
  ])("uses exact m and inclusive score boundaries: %i m, %i points", (distanceM, score, eligible, discount) => {
    const input = request(); input.trip.records = [{ index: 0, ...zero, distanceM, accelerationCount: 100 - score }];
    expect(calculateTrip(input).next).toMatchObject({ score, conditionsMet: eligible, expectedDiscountBps: discount });
  });
  it("clamps at zero while retaining cumulative events and unclamped trip penalties", () => {
    const input = request(); input.trip.records = [{ index: 0, ...zero, distanceM: 500_000, speedingCount: 60 }];
    const calculated = calculateTrip(input);
    expect(calculated.next.score).toBe(0); expect(calculated.explanation.scoreDelta).toBe(-100);
    expect(calculated.explanation.penalties.speeding).toBe(120);
    const continued = calculateTrip(fixtureNext(input, calculated));
    expect(continued.next.totals.speedingCount).toBe(61);
    expect(continued.next.score).toBe(0); expect(continued.explanation.scoreDelta).toBe(0);
    expect(continued.explanation.penalties).toEqual({ speeding: 2, acceleration: 0, braking: 3 });
  });
  it("reads coefficients, thresholds and discounts from the supplied rule", () => {
    const input = request(); Object.assign(input.approvedRule.rule, { speedingPenalty: 7, accelerationPenalty: 0, brakingPenalty: 2,
      minimumDistanceM: 300_000, minimumScore: 80, premiumMinimumScore: 85, baseDiscountBps: 2000, premiumDiscountBps: 2500 });
    expect(calculateTrip(input).next).toMatchObject({ score: 84, conditionsMet: true, expectedDiscountBps: 2000 });
  });
  it("sums all five metrics over multiple records", () => {
    const input = request(); input.trip.records = [
      { index: 0, distanceM: 100_000, durationSeconds: 3000, speedingCount: 1, accelerationCount: 0, brakingCount: 0 },
      { index: 1, distanceM: 200_000, durationSeconds: 7800, speedingCount: 1, accelerationCount: 1, brakingCount: 1 },
    ];
    expect(calculateTrip(input).next.totals).toEqual(first);
  });
  it("is deterministic, does not mutate inputs or share mutable state with them", () => {
    const input = request(); const before = structuredClone(input); freeze(input);
    const calculated = calculateTrip(input); expect(calculated).toEqual(calculateTrip(input)); expect(input).toEqual(before);
    calculated.next.scope.applicantId = "changed-output";
    expect(input.scope.applicantId).toBe("fixture-driver");
  });
  it("emits calculation only, without fabricated commitments, salts, confirmations or raw records", () => {
    const calculated = calculateTrip(request());
    expect(calculated.kind).toBe("calculation"); expect(CandidateStateSchema.safeParse(calculated).success).toBe(false);
    for (const key of ["datasetRoot", "stateCommitment", "stateSalt", "confirmation", "records", "datasetSalt"])
      expect(calculated.next).not.toHaveProperty(key);
    expect(calculated).not.toHaveProperty("trip.records");
  });
  it.each([-1, 0.5, "300000", NaN])("rejects malformed distance %s", distanceM => {
    const input = request(); expect(errorCode({ ...input, trip: { ...input.trip, records: [{ ...input.trip.records[0], distanceM }] } })).toBe("INVALID_INPUT");
  });
  it.each(["approval", "registration"])("rejects a rule that is not ready: %s", field => {
    const input = request(); expect(errorCode({ ...input, approvedRule: { ...input.approvedRule, [field]: "pending" } })).toBe("RULE_NOT_READY");
  });
  it("rejects wrong scope/rule, inconsistent prior results, candidate prior state and mixed execution", () => {
    const input = request();
    const variants = [
      { ...input, scope: { ...input.scope, applicantId: "another" } },
      { ...input, approvedRule: { ...input.approvedRule, rule: { ...input.approvedRule.rule, version: 2 } } },
      { ...input, previous: { ...input.previous, state: { ...input.previous.state, score: 85 } } },
      { ...input, previous: { ...input.previous, kind: "candidate" } }, { ...input, execution: "live" },
    ];
    variants.forEach(variant => expect(errorCode(variant)).toBe("INVALID_INPUT"));
  });
  it("rejects disabled collection and gaps in record order", () => {
    const input = request();
    expect(errorCode({ ...input, trip: { ...input.trip, collectionEnabled: false } })).toBe("INVALID_INPUT");
    input.trip.records[0]!.index = 1; expect(errorCode(input)).toBe("INVALID_INPUT");
  });
  it.each(["distanceM", "durationSeconds", "speedingCount", "accelerationCount", "brakingCount"] as const)(
    "rejects cumulative uint32 overflow: %s", key => {
      const input = request(); input.previous.state.version = 1; input.previous.state.tripCount = 1;
      input.previous.state.totals = { ...zero, distanceM: 500_000, [key]: 0xffff_ffff };
      const events = key.endsWith("Count"); Object.assign(input.previous.state, {
        score: events ? 0 : 100, conditionsMet: !events, expectedDiscountBps: events ? 0 : 1200 });
      input.trip.records = [{ index: 0, ...zero, [key]: 1 }];
      expect(errorCode(input)).toBe("NUMERIC_RANGE_EXCEEDED");
    });
  it("rejects version overflow and explanation penalties beyond safe integer range", () => {
    const input = request(); input.previous.state.version = 0xffff_ffff; input.previous.state.tripCount = 0xffff_ffff;
    expect(errorCode(input)).toBe("NUMERIC_RANGE_EXCEEDED");
    const huge = request(); huge.approvedRule.rule.speedingPenalty = 0xffff_ffff;
    huge.trip.records = [{ index: 0, ...zero, speedingCount: 0xffff_ffff }];
    expect(errorCode(huge)).toBe("NUMERIC_RANGE_EXCEEDED");
  });
  it("keeps error payloads generic and non-retryable", () => {
    try { calculateTrip({ raw: "private-secret-fixture" }); }
    catch (error) { expect(error).toBeInstanceOf(CoreCalculationError);
      expect((error as CoreCalculationError).retryable).toBe(false);
      expect((error as Error).message).toBe("INVALID_INPUT"); }
  });
});
