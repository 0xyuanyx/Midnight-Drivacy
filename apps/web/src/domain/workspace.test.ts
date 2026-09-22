import { applyDecision, createFixtureWorkspace, getDashboardMetrics, getEvaluationOutcome } from "./workspace";

describe("insurer decision state", () => {
  it("does not treat a valid proof as an approved business decision", () => {
    const state = createFixtureWorkspace();
    const request = state.requests.find((item) => item.id === "REQ-240921-018");

    expect(request?.proofStatus).toBe("valid");
    expect(request?.decision).toBe("pending");
  });

  it("updates the selected request, history, and dashboard metrics from one entity", () => {
    const initial = createFixtureWorkspace();
    const next = applyDecision(initial, {
      workflow: "dashboard",
      requestId: "REQ-240921-018",
      decision: "approved",
    });

    const request = next.requests.find((item) => item.id === "REQ-240921-018");
    expect(request?.decision).toBe("approved");
    expect(request?.history.at(-1)?.summary).toBe("특약 요청을 승인했습니다.");
    expect(getDashboardMetrics(next)).toEqual({ pending: 1, review: 1, completed: 2, total: 4 });
  });

  it("keeps the approved rule threshold separate from accumulated driving distance", () => {
    const state = createFixtureWorkspace();
    const evaluation = state.evaluations.find((item) => item.id === "EVL-240921-031");

    expect(evaluation?.rule.minimumDistanceKm).toBe(500);
    expect(evaluation?.result.accumulatedDistanceKm).toBe(524.8);
  });

  it("applies no discount below the rule, base discount from 80, and premium from 90", () => {
    const evaluation = createFixtureWorkspace().evaluations[0];
    expect(getEvaluationOutcome({ ...evaluation, result: { ...evaluation.result, accumulatedDistanceKm: 499, score: 94 } }).discountPercent).toBe(0);
    expect(getEvaluationOutcome({ ...evaluation, result: { ...evaluation.result, score: 79 } }).discountPercent).toBe(0);
    expect(getEvaluationOutcome({ ...evaluation, result: { ...evaluation.result, score: 80 } }).discountPercent).toBe(10);
    expect(getEvaluationOutcome({ ...evaluation, result: { ...evaluation.result, score: 90 } }).discountPercent).toBe(12);
  });

  it("does not approve invalid proofs or apply discounts to ineligible evaluations", () => {
    const state = createFixtureWorkspace();
    const invalidRequest = applyDecision(state, { workflow: "dashboard", requestId: "REQ-240920-097", decision: "approved" });
    const ineligible = { ...state, evaluations: state.evaluations.map((item) => item.id === "EVL-240921-031" ? { ...item, result: { ...item.result, score: 69 } } : item) };
    const invalidEvaluation = applyDecision(ineligible, { workflow: "evaluations", requestId: "EVL-240921-031", decision: "applied" });

    expect(invalidRequest.requests.find((item) => item.id === "REQ-240920-097")?.decision).toBe("pending");
    expect(invalidEvaluation.evaluations.find((item) => item.id === "EVL-240921-031")?.decision).toBe("pending");
  });

  it("keeps the submitted and verified history on a completed request", () => {
    const request = createFixtureWorkspace().requests.find((item) => item.id === "REQ-240920-090");

    expect(request?.history.map((entry) => entry.summary)).toEqual([
      "가입자가 평가 결과 제출",
      "Midnight 증명 검증 완료",
      "할인 판단 대기 상태로 전환",
      "특약 요청을 승인했습니다.",
    ]);
  });
});
