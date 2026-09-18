import { describe, expect, it } from "vitest";
import { createConstructorContext, createCircuitContext } from "@midnight-ntwrk/compact-runtime";
import * as Driving from "../managed/driving-state/contract/index.js";
import { buildDataset, decode, encode, genesis, prepareTrip, scopeBinding, witnesses,
  type DrivingPrivateState, type PreparedTrip } from "../src/state-adapter.js";
import { demoScope, demoRule, demoTrip, demoRegisteredRule, demoRequest } from "../probe/driving-fixtures.js";
import type { ConfirmedState, State } from "../../shared/src/bc-contract.js";
import { ADAPTER_PROFILE } from "../src/state-adapter.js";
import { prepareEvaluation, verifyResultOpening } from "../src/evaluation.js";

const owner = decode("11".repeat(32));
const contractAddress = "22".repeat(32);
const coinPublicKey = "33".repeat(32);
const salt = (n: number) => n.toString(16).padStart(2, "0").repeat(32);
// Synthetic receipts are ONLY for generated-circuit unit tests.
function confirmed(state: State): ConfirmedState {
  return { kind: "confirmed", state, confirmation: { execution: "fixture", network: "fixture",
    adapterProfile: ADAPTER_PROFILE, chainContractAddress: contractAddress,
    transactionId: "synthetic-tx", blockId: "synthetic-block", operationId: "synthetic-operation",
    previousStateCommitment: state.stateCommitment, newStateCommitment: state.stateCommitment,
    ruleHash: state.rule.ruleHash, datasetRoot: state.datasetRoot, observedAt: "2026-09-18T00:00:00Z" } };
}
function setup(hostWitnesses: Driving.Witnesses<DrivingPrivateState> = witnesses) {
  const state = genesis(demoScope, demoRule, owner, salt(1));
  const registered = demoRegisteredRule(state.rule.ruleHash, "fixture", contractAddress, "synthetic-registration");
  const prepared = prepareTrip(demoRequest(confirmed(state), registered, demoTrip(1, salt(2))), owner, salt(3), salt(4));
  const contract = new Driving.Contract(hostWitnesses);
  const initial = contract.initialState(createConstructorContext(prepared.initial, coinPublicKey),
    decode(state.rule.ruleHash), scopeBinding(demoScope, owner), Driving.pureCircuits.hashOwner(owner));
  let context = createCircuitContext(contractAddress, coinPublicKey, initial.currentContractState, prepared.initial);
  function run(name: keyof Driving.ImpureCircuits<DrivingPrivateState>, ps: DrivingPrivateState) {
    // Advance context only on a successful generated-circuit execution.
    const result = contract.impureCircuits[name]({ ...context, currentPrivateState: ps });
    context = result.context;
    return result;
  }
  const ledger = () => Driving.ledger(context.currentQueryContext.state);
  run("initialize", prepared.initial);
  return { state, registered, prepared, run, ledger };
}
function complete(s: ReturnType<typeof setup>, p: PreparedTrip) {
  s.run("beginTrip", p.initial);
  for (const step of p.steps) s.run("appendRecord", step);
  s.run("finishTrip", p.final);
}

describe("approved Rule / complete Dataset / cumulative state circuit", () => {
  it("chains two trips without resetting totals; one unmet discount condition has a valid transition", () => {
    const s = setup();
    complete(s, s.prepared);
    expect(s.prepared.candidate.state.score).toBe(92);
    expect(s.prepared.candidate.state.conditionsMet).toBe(false);
    expect(s.ledger().revision).toBe(1n);
    const second = prepareTrip(demoRequest(confirmed(s.prepared.candidate.state), s.registered,
      demoTrip(2, salt(5))), owner, salt(6), salt(7));
    complete(s, second);
    expect(second.candidate.state.totals.distanceM).toBe(550_000);
    expect(second.candidate.state.score).toBe(87);
    expect(second.candidate.state.expectedDiscountBps).toBe(1000);
    expect(s.ledger().revision).toBe(2n);
    expect(encode(s.ledger().stateCommitment)).toBe(second.candidate.state.stateCommitment);
  });
  it("rejects a manipulated score", () => {
    const s = setup();
    expect(() => s.run("beginTrip", { ...s.prepared.initial,
      nextOpening: { ...s.prepared.initial.nextOpening, score: 97n } })).toThrow(/Calculation result mismatch/);
  });
  it("rejects a different Rule even when it could calculate a plausible result", () => {
    const s = setup();
    expect(() => s.run("beginTrip", { ...s.prepared.initial,
      ruleOpening: { ...s.prepared.initial.ruleOpening, speedingPenalty: 1n } })).toThrow(/Registered rule mismatch/);
  });
  it("rejects a different previous opening salt", () => {
    const s = setup();
    expect(() => s.run("beginTrip", { ...s.prepared.initial,
      previousOpening: { ...s.prepared.initial.previousOpening, salt: decode(salt(99)) } })).toThrow(/Stale previous state/);
  });
  it("rejects replay from an old confirmed State", () => {
    const s = setup(); complete(s, s.prepared);
    expect(() => s.run("beginTrip", s.prepared.initial)).toThrow(/Stale previous state/);
    expect(s.ledger().revision).toBe(1n);
  });
  it("rejects a changed record against the frozen Dataset Root", () => {
    const s = setup(); s.run("beginTrip", s.prepared.initial);
    const step = s.prepared.steps[0]!;
    expect(() => s.run("appendRecord", { ...step, recordOpening: { ...step.recordOpening,
      metrics: { ...step.recordOpening.metrics, distanceM: 1n } } })).toThrow(/Dataset inclusion mismatch/);
    expect(s.ledger().cursor).toBe(0n);
  });
  it("rejects a different Merkle sibling", () => {
    const s = setup(); s.run("beginTrip", s.prepared.initial);
    const step = s.prepared.steps[0]!;
    const siblings = [...step.inclusionPath.siblings]; siblings[0] = decode(salt(55));
    expect(() => s.run("appendRecord", { ...step,
      inclusionPath: { ...step.inclusionPath, siblings } })).toThrow(/Dataset inclusion mismatch/);
  });
  it("binds Merkle position to the record cursor", () => {
    const s = setup(); s.run("beginTrip", s.prepared.initial);
    const step = s.prepared.steps[0]!;
    const right = [...step.inclusionPath.right]; right[0] = true;
    expect(() => s.run("appendRecord", { ...step,
      inclusionPath: { ...step.inclusionPath, right } })).toThrow(/Merkle position mismatch/);
  });
  it("requires every record before finish", () => {
    const s = setup(); s.run("beginTrip", s.prepared.initial);
    expect(() => s.run("finishTrip", s.prepared.final)).toThrow(/Incomplete dataset/);
    expect(encode(s.ledger().stateCommitment)).toBe(s.state.stateCommitment);
  });
  it("rejects skipped, reordered and duplicated records", () => {
    const s = setup(); complete(s, s.prepared);
    const p = prepareTrip(demoRequest(confirmed(s.prepared.candidate.state), s.registered,
      demoTrip(2, salt(5))), owner, salt(6), salt(7));
    s.run("beginTrip", p.initial);
    const second = p.steps[1]!;
    expect(() => s.run("appendRecord", { ...second, pendingBefore: p.initial.pendingBefore })).toThrow(/Record order mismatch/);
    s.run("appendRecord", p.steps[0]!);
    expect(() => s.run("appendRecord", { ...p.steps[0]!, pendingBefore: second.pendingBefore })).toThrow(/Record order mismatch/);
    expect(() => s.run("finishTrip", { ...p.final, pendingBefore: second.pendingBefore })).toThrow(/Incomplete dataset/);
  });
  it("rejects false running totals", () => {
    const s = setup(); s.run("beginTrip", s.prepared.initial);
    const step = s.prepared.steps[0]!;
    expect(() => s.run("appendRecord", { ...step, pendingAfter: { ...step.pendingAfter,
      totals: { ...step.pendingAfter.totals, distanceM: 999n } } })).toThrow(/Accumulation totals mismatch/);
  });
  it("rejects internally consistent target results that do not match the accumulated records", () => {
    const s = setup(); const p = s.prepared;
    const next = { ...p.initial.nextOpening, totals: { ...p.initial.nextOpening.totals, distanceM: 1n } };
    const target = Driving.pureCircuits.hashState(next);
    const initial = { ...p.initial, nextOpening: next, pendingAfter: { ...p.initial.pendingAfter, target } };
    s.run("beginTrip", initial);
    const step = { ...p.steps[0]!, nextOpening: next,
      pendingBefore: { ...p.steps[0]!.pendingBefore, target }, pendingAfter: { ...p.steps[0]!.pendingAfter, target } };
    s.run("appendRecord", step);
    expect(() => s.run("finishTrip", { ...p.final, nextOpening: next,
      pendingBefore: { ...p.final.pendingBefore, target } })).toThrow(/Final totals mismatch/);
    expect(encode(s.ledger().stateCommitment)).toBe(s.state.stateCommitment);
  });
  it("requires owner-secret knowledge for state mutations", () => {
    const s = setup();
    expect(() => s.run("beginTrip", { ...s.prepared.initial, ownerSecret: decode(salt(77)) })).toThrow(/Unauthorized/);
  });
  it("rejects a different Scope binding", () => {
    const s = setup();
    expect(() => s.run("beginTrip", { ...s.prepared.initial,
      nextOpening: { ...s.prepared.initial.nextOpening, scope: decode(salt(66)) } })).toThrow(/State scope mismatch/);
  });
  it("cancel preserves confirmed State and permits a new begin", () => {
    const s = setup(); s.run("beginTrip", s.prepared.initial);
    s.run("appendRecord", s.prepared.steps[0]!);
    s.run("cancelTrip", s.prepared.final);
    expect(s.ledger().revision).toBe(0n);
    expect(encode(s.ledger().stateCommitment)).toBe(s.state.stateCommitment);
    complete(s, s.prepared);
  });
  it("a completed trip cannot be finished again", () => {
    const s = setup(); complete(s, s.prepared);
    expect(() => s.run("finishTrip", s.prepared.final)).toThrow(/Incomplete dataset/);
    expect(s.ledger().revision).toBe(1n);
  });
  it("rejects uint32 total overflow and keeps large weighted penalties out of Field wrapping", () => {
    const s = setup(); const m = s.prepared.initial.previousOpening.totals;
    expect(() => Driving.pureCircuits.addMetrics({ ...m, distanceM: 0xffff_ffffn }, { ...m, distanceM: 1n })).toThrow();
    expect(Driving.pureCircuits.calculatedScore({ ...s.prepared.initial.ruleOpening,
      speedingPenalty: 0xffff_ffffn, accelerationPenalty: 0xffff_ffffn, brakingPenalty: 0xffff_ffffn },
      { ...m, speedingCount: 0xffff_ffffn, accelerationCount: 0xffff_ffffn, brakingCount: 0xffff_ffffn })).toBe(0n);
  });
  it("supports a 1024-record Dataset and checks first and last path position", () => {
    const trip = demoTrip(1, salt(2));
    trip.records = Array.from({ length: 1024 }, (_, index) => ({ ...trip.records[0]!, index, distanceM: index }));
    const dataset = buildDataset(trip);
    for (const index of [0, 1023]) {
      expect(Driving.pureCircuits.pathIndex(dataset.paths[index]!)).toBe(BigInt(index));
      expect(encode(Driving.pureCircuits.pathRoot(Driving.pureCircuits.hashRecord(dataset.trip,
        dataset.records[index]!), dataset.paths[index]!))).toBe(encode(dataset.root));
    }
  });
  it("stores no exact score, distance, original records or salts on the public ledger", () => {
    const s = setup(); complete(s, s.prepared);
    expect(Object.keys(s.ledger())).toEqual(["ruleHash", "scopeBinding", "ownerBinding", "stateCommitment",
      "initialized", "active", "pendingCommitment", "targetCommitment", "datasetRoot", "recordCount", "cursor", "revision",
      "usedEvaluations", "evaluationNullifier", "submittedState", "resultCommitment", "submissionRevision"]);
  });
  it("submits an exact private insurer result without reading original records", () => {
    const s = setup(); complete(s, s.prepared);
    const evaluation = prepareEvaluation(confirmed(s.prepared.candidate.state), s.registered, owner, salt(8));
    s.run("submitEvaluation", evaluation.privateState);
    expect(encode(s.ledger().resultCommitment)).toBe(evaluation.resultCommitment);
    expect(encode(s.ledger().evaluationNullifier)).toBe(evaluation.nullifier);
    expect(s.ledger().usedEvaluations.member(decode(evaluation.nullifier))).toBe(true);
    expect(s.ledger().submissionRevision).toBe(1n);
    expect(verifyResultOpening(evaluation.result, evaluation.resultCommitment)).toBe(true);
    expect(verifyResultOpening({ ...evaluation.result, score: 100n }, evaluation.resultCommitment)).toBe(false);
    expect(verifyResultOpening({ ...evaluation.result, distanceM: 550_000n }, evaluation.resultCommitment)).toBe(false);
  });
  it("keeps nullifier stable across result salts and rejects a duplicate evaluation", () => {
    const s = setup(); complete(s, s.prepared);
    const a = prepareEvaluation(confirmed(s.prepared.candidate.state), s.registered, owner, salt(8));
    const b = prepareEvaluation(confirmed(s.prepared.candidate.state), s.registered, owner, salt(9));
    expect(a.nullifier).toBe(b.nullifier);
    expect(a.resultCommitment).not.toBe(b.resultCommitment);
    s.run("submitEvaluation", a.privateState);
    expect(() => s.run("submitEvaluation", b.privateState)).toThrow(/already submitted/);
    expect(s.ledger().submissionRevision).toBe(1n);
  });
  it("rejects final evaluation while a trip is pending", () => {
    const s = setup(); complete(s, s.prepared);
    const state = confirmed(s.prepared.candidate.state);
    const evaluation = prepareEvaluation(state, s.registered, owner, salt(8));
    const second = prepareTrip(demoRequest(state, s.registered, demoTrip(2, salt(5))), owner, salt(6), salt(7));
    s.run("beginTrip", second.initial);
    expect(() => s.run("submitEvaluation", evaluation.privateState)).toThrow(/not ready/);
  });
  it("rejects a stale or manipulated final opening", () => {
    const s = setup(); complete(s, s.prepared);
    const first = confirmed(s.prepared.candidate.state);
    const evaluation = prepareEvaluation(first, s.registered, owner, salt(8));
    expect(() => s.run("submitEvaluation", { ...evaluation.privateState, previousOpening: {
      ...evaluation.privateState.previousOpening, score: 100n } })).toThrow(/Calculation result mismatch/);
    const second = prepareTrip(demoRequest(first, s.registered, demoTrip(2, salt(5))), owner, salt(6), salt(7));
    complete(s, second);
    expect(() => s.run("submitEvaluation", evaluation.privateState)).toThrow(/Stale evaluation/);
  });
  it("gives a new confirmed State a distinct nullifier without clearing cumulative values", () => {
    const s = setup(); complete(s, s.prepared);
    const first = confirmed(s.prepared.candidate.state);
    const a = prepareEvaluation(first, s.registered, owner, salt(8));
    s.run("submitEvaluation", a.privateState);
    const second = prepareTrip(demoRequest(first, s.registered, demoTrip(2, salt(5))), owner, salt(6), salt(7));
    complete(s, second);
    const b = prepareEvaluation(confirmed(second.candidate.state), s.registered, owner, salt(9));
    s.run("submitEvaluation", b.privateState);
    expect(a.nullifier).not.toBe(b.nullifier);
    expect(s.ledger().usedEvaluations.size()).toBe(2n);
    expect(second.candidate.state.totals.distanceM).toBe(550_000);
  });
  it("does not accept genesis, another owner or another registered contract", () => {
    const s = setup();
    expect(() => prepareEvaluation(confirmed(s.state), s.registered, owner, salt(8))).toThrow(/CONTEXT/);
    complete(s, s.prepared);
    const evaluation = prepareEvaluation(confirmed(s.prepared.candidate.state), s.registered, owner, salt(8));
    expect(() => s.run("submitEvaluation", { ...evaluation.privateState, ownerSecret: decode(salt(44)) })).toThrow(/Unauthorized/);
    expect(() => prepareEvaluation(confirmed(s.prepared.candidate.state), { ...s.registered, chainContractAddress: "other" }, owner, salt(8))).toThrow(/CONTEXT/);
  });
  it("binds the nullifier to the checked owner even when a witness changes between reads", () => {
    let armed = false, reads = 0, alternate = 44;
    const malicious: Driving.Witnesses<DrivingPrivateState> = { ...witnesses,
      ownerSecret: ({ privateState: ps }) => [ps,
        armed && ++reads % 2 === 0 ? decode(salt(alternate)) : ps.ownerSecret] };
    const s = setup(malicious);
    complete(s, s.prepared);
    const evaluation = prepareEvaluation(confirmed(s.prepared.candidate.state), s.registered, owner, salt(8));
    armed = true;
    s.run("submitEvaluation", evaluation.privateState);
    // 같은 이름의 witness를 다시 호출해도 같은 값이라는 보장은 없다.
    // 소유자 검사를 통과한 secret에 대응하는 nullifier인지 확인한다.
    expect(encode(s.ledger().evaluationNullifier)).toBe(evaluation.nullifier);
    reads = 0; alternate = 45;
    expect(() => s.run("submitEvaluation", evaluation.privateState)).toThrow(/Evaluation already submitted/);
    expect(s.ledger().usedEvaluations.size()).toBe(1n);
  });
});
