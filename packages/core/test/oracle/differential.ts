import { strict as assert } from "node:assert";
import { readFileSync, writeFileSync } from "node:fs";
import { calculateTrip, CoreCalculationError, type TripCalculation } from "../../src/calculation.js";
import type { CalculateTripRequest } from "../../../shared/src/bc-contract.js";

type ReferenceCase = { name: string; input: CalculateTripRequest;
  expected: Pick<TripCalculation, "next" | "explanation"> };
const reference = JSON.parse(readFileSync("oracle-cases.json", "utf8")) as {
  oracle: string; seed: number; cases: ReferenceCase[];
};
assert.equal(reference.oracle, "python-integer-reference");
assert(reference.cases.length >= 200);
for (const sample of reference.cases) {
  const before = JSON.stringify(sample.input);
  const actual = calculateTrip(sample.input);
  assert.deepEqual(actual.next, sample.expected.next, `${sample.name}: cumulative result`);
  assert.deepEqual(actual.explanation, sample.expected.explanation, `${sample.name}: explanation`);
  assert.equal(actual.previousStateCommitment, sample.input.previous.state.stateCommitment);
  assert.equal(actual.operationId, sample.input.operationId);
  assert.equal(actual.idempotencyKey, sample.input.idempotencyKey);
  assert.equal(actual.tripId, sample.input.trip.id);
  assert.equal(actual.execution, "fixture");
  assert.equal(JSON.stringify(sample.input), before, `${sample.name}: input mutated`);
  assert.deepEqual(calculateTrip(sample.input), actual, `${sample.name}: nondeterministic output`);
}
let rejectionCases = 0;
function reject(mutate: (input: CalculateTripRequest) => unknown, code: string) {
  const input = structuredClone(reference.cases[0]!.input);
  assert.throws(() => calculateTrip(mutate(input)), (error: unknown) =>
    error instanceof CoreCalculationError && error.code === code && !error.retryable);
  rejectionCases++;
}
reject(input => ({ ...input, scope: { ...input.scope, applicantId: "different-fixture-driver" } }), "INVALID_INPUT");
reject(input => { input.previous.state.rule.ruleHash = "wrong-fixture-hash"; return input; }, "INVALID_INPUT");
reject(input => ({ ...input, previous: { ...input.previous, kind: "candidate" } }), "INVALID_INPUT");
reject(input => ({ ...input, execution: "live" }), "INVALID_INPUT");
reject(input => ({ ...input, approvedRule: { ...input.approvedRule, approval: "draft" } }), "RULE_NOT_READY");
reject(input => ({ ...input, approvedRule: { ...input.approvedRule, registration: "submitted" } }), "RULE_NOT_READY");
for (const distance of [-1, 0.5, "500000", NaN, Infinity]) {
  reject(input => ({ ...input, trip: { ...input.trip,
    records: [{ ...input.trip.records[0], distanceM: distance }] } }), "INVALID_INPUT");
}
// A uint32 overflow is a numeric range error, distinct from malformed values.
reject(input => ({ ...input, trip: { ...input.trip,
  records: [{ ...input.trip.records[0], distanceM: 0x1_0000_0000 }] } }), "NUMERIC_RANGE_EXCEEDED");
reject(input => { input.trip.records[0]!.index = 7; return input; }, "INVALID_INPUT");
reject(input => { input.previous.state.score = input.previous.state.score === 100 ? 99 : 100; return input; }, "INVALID_INPUT");
reject(input => {
  const record = { distanceM: 0, durationSeconds: 0, speedingCount: 0, accelerationCount: 0, brakingCount: 0 };
  input.trip.records = [{ index: 0, ...record, distanceM: 0xffff_ffff }, { index: 1, ...record, distanceM: 1 }];
  return input;
}, "NUMERIC_RANGE_EXCEEDED");
const summary = { execution: "offline-differential", oracle: reference.oracle, seed: reference.seed,
  validCases: reference.cases.length, rejectionCases, result: "passed",
  platform: process.platform, architecture: process.arch, node: process.version,
  insuranceCircuitProofVerified: false, chainRequested: false, completedAt: new Date().toISOString() };
writeFileSync("differential-evidence.json", JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary));
