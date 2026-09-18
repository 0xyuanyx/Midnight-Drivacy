import { ConfirmedStateSchema, RegisteredRuleSchema, type ConfirmedState, type RegisteredRule } from "../../shared/src/bc-contract.js";
import * as Driving from "../managed/driving-state/contract/index.js";
import { ADAPTER_PROFILE, bootstrapPrivateState, decode, encode, ruleOpening, stateOpening } from "./state-adapter.js";

/** 최종 확정 State만 읽는다. 삭제된 과거 records를 다시 받지 않는다. */
export function prepareEvaluation(input: ConfirmedState, registeredInput: RegisteredRule,
  ownerSecret: Uint8Array, salt: string) {
  const confirmed = ConfirmedStateSchema.parse(input);
  const registered = RegisteredRuleSchema.parse(registeredInput);
  const state = confirmed.state;
  const c = confirmed.confirmation;
  if (state.version < 1 || state.rule.ruleHash !== registered.ruleHash
    || state.rule.id !== registered.rule.id || state.rule.version !== registered.rule.version
    || state.scope.insurerId !== registered.rule.insurerId || state.scope.endorsementId !== registered.rule.endorsementId
    || c.network !== registered.network || c.adapterProfile !== ADAPTER_PROFILE
    || registered.adapterProfile !== ADAPTER_PROFILE || c.chainContractAddress !== registered.chainContractAddress
    || encode(Driving.pureCircuits.hashRule(ruleOpening(registered.rule))) !== registered.ruleHash) {
    throw new Error("EVALUATION_CONTEXT_MISMATCH");
  }
  const opening = stateOpening(state, ownerSecret);
  if (encode(Driving.pureCircuits.hashState(opening)) !== state.stateCommitment) throw new Error("EVALUATION_OPENING_MISMATCH");
  const result: Driving.ResultOpening = { scope: opening.scope, rule: opening.rule,
    state: decode(state.stateCommitment), version: opening.version, score: opening.score,
    distanceM: opening.totals.distanceM, conditionsMet: opening.conditionsMet,
    expectedDiscountBps: opening.expectedDiscountBps, salt: decode(salt) };
  return { result, resultCommitment: encode(Driving.pureCircuits.hashResult(result)),
    nullifier: encode(Driving.pureCircuits.hashEvaluation(ownerSecret, opening.scope, opening.rule, result.state)),
    privateState: { ...bootstrapPrivateState(state, registered.rule, ownerSecret), resultSalt: decode(salt) } };
}

// 보험사는 비공개 결과 opening을 받아 공개 resultCommitment와 대조한다.
// 이 해시 일치만으로 체인 receipt 진위나 계약/보험사 권한을 대신하지 않는다.
export function verifyResultOpening(result: Driving.ResultOpening, commitment: string): boolean {
  return encode(Driving.pureCircuits.hashResult(result)) === commitment;
}
