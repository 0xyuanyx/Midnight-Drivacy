export type ProofStatus = "valid" | "invalid" | "checking";
export type DashboardDecision = "pending" | "approved" | "rejected";
export type EvaluationDecision = "pending" | "applied" | "not-applied";

export interface HistoryEntry {
  at: string;
  actor: string;
  summary: string;
  tone: "neutral" | "success" | "danger";
}

export interface DashboardRequest {
  displayId: string;
  rule: EvaluationRequest["rule"];
  result: EvaluationRequest["result"];
  id: string;
  applicantName: string;
  contractNumber: string;
  productName: string;
  riderName: string;
  requestedAt: string;
  status: "pending" | "review" | "completed";
  proofStatus: ProofStatus;
  decision: DashboardDecision;
  evaluationPeriod: string;
  privacySummary: string;
  history: HistoryEntry[];
}

export interface EvaluationRequest {
  displayId: string;
  id: string;
  applicantName: string;
  contractNumber: string;
  productName: string;
  riderName: string;
  requestedAt: string;
  status: "verified" | "failed" | "completed";
  proofStatus: ProofStatus;
  decision: EvaluationDecision;
  rule: {
    version: string;
    minimumDistanceKm: number;
    minimumScore: number;
    premiumMinimumScore: number;
    baseDiscountPercent: number;
    premiumDiscountPercent: number;
  };
  result: {
    accumulatedDistanceKm: number;
    score: number;
    tripCount: number;
    evaluationPeriod: string;
  };
  history: HistoryEntry[];
}

export interface WorkspaceState {
  requests: DashboardRequest[];
  evaluations: EvaluationRequest[];
}

const created = (summary: string): HistoryEntry => ({
  at: summary.includes("제출") ? "14:32" : "14:33",
  actor: "시스템",
  summary,
  tone: "neutral",
});

const referenceRule: EvaluationRequest["rule"] = { version: "SAFE-DRIVE v1.4", minimumDistanceKm: 500, minimumScore: 80, premiumMinimumScore: 90, baseDiscountPercent: 10, premiumDiscountPercent: 12 };
const referenceResult = (score: number): EvaluationRequest["result"] => ({ accumulatedDistanceKm: 524.8, score, tripCount: 2, evaluationPeriod: "2026.06.15 — 2026.09.12" });

export function createFixtureWorkspace(): WorkspaceState {
  return {
    requests: [
      {
        id: "REQ-240921-018",
        displayId: "DRV-260913-08", rule: referenceRule, result: referenceResult(87),
        applicantName: "박민준",
        contractNumber: "MIR-48••-1029",
        productName: "개인용 자동차보험",
        riderName: "안전운전 할인특약",
        requestedAt: "14:32",
        status: "pending",
        proofStatus: "valid",
        decision: "pending",
        evaluationPeriod: "최근 90일",
        privacySummary: "평가 결과와 검증에 필요한 최소 정보만 공개",
        history: [created("가입자가 평가 결과 제출"), created("Midnight 증명 검증 완료"), created("할인 판단 대기 상태로 전환")],
      },
      {
        id: "REQ-240921-014",
        displayId: "DRV-260913-07", rule: referenceRule, result: referenceResult(82),
        applicantName: "김서연",
        contractNumber: "MIR-31••-7742",
        productName: "개인용 자동차보험",
        riderName: "안전운전 할인특약",
        requestedAt: "13:18",
        status: "pending",
        proofStatus: "valid",
        decision: "pending",
        evaluationPeriod: "최근 90일",
        privacySummary: "평가 결과와 증명 상태만 공개",
        history: [created("가입자가 평가 결과 제출"), created("Midnight 증명 검증 완료"), created("할인 판단 대기 상태로 전환")],
      },
      {
        id: "REQ-240920-097",
        displayId: "DRV-260913-06", rule: referenceRule, result: referenceResult(76),
        applicantName: "이도윤",
        contractNumber: "MIR-17••-8821",
        productName: "업무용 자동차보험",
        riderName: "안전운전 할인특약",
        requestedAt: "11:54",
        status: "review",
        proofStatus: "invalid",
        decision: "pending",
        evaluationPeriod: "최근 90일",
        privacySummary: "검증 실패 사유 코드만 공개",
        history: [created("가입자가 평가 결과 제출"), created("Midnight 증명 검증 실패"), created("담당자 검토 필요 상태로 전환")],
      },
      { id: "REQ-240920-090", displayId: "DRV-260912-31", applicantName: "최지우", contractNumber: "MIR-43••-2207", productName: "개인용 자동차보험", riderName: "안전운전 할인특약", requestedAt: "어제", status: "completed", proofStatus: "valid", decision: "approved", evaluationPeriod: "최근 90일", privacySummary: "승인된 계산 결과만 공개", rule: referenceRule, result: referenceResult(91), history: [created("특약 요청을 승인했습니다.")] },
    ],
    evaluations: [
      {
        id: "EVL-240921-031",
        displayId: "DRV-260913-08",
        applicantName: "박민준",
        contractNumber: "MIR-52••-3901",
        productName: "개인용 자동차보험",
        riderName: "안전운전 할인특약",
        requestedAt: "14:32",
        status: "verified",
        proofStatus: "valid",
        decision: "pending",
        rule: referenceRule,
        result: referenceResult(87),
        history: [created("가입자가 평가 결과 제출"), created("Midnight 증명 검증 완료"), created("할인 판단 대기 상태로 전환")],
      },
      { id: "EVL-240921-030", displayId: "DRV-260913-07", applicantName: "김서연", contractNumber: "MIR-31••-7742", productName: "개인용 자동차보험", riderName: "안전운전 할인특약", requestedAt: "13:18", status: "verified", proofStatus: "valid", decision: "pending", rule: referenceRule, result: referenceResult(82), history: [created("가입자가 평가 결과 제출"), created("Midnight 증명 검증 완료"), created("할인 판단 대기 상태로 전환")] },
      {
        id: "EVL-240921-026",
        displayId: "DRV-260913-06",
        applicantName: "이도윤",
        contractNumber: "MIR-06••-1488",
        productName: "업무용 자동차보험",
        riderName: "안전운전 할인특약",
        requestedAt: "11:54",
        status: "failed",
        proofStatus: "invalid",
        decision: "pending",
        rule: referenceRule,
        result: referenceResult(76),
        history: [created("가입자가 평가 결과 제출"), created("Midnight 증명 검증 실패"), created("담당자 검토 필요 상태로 전환")],
      },
      {
        id: "EVL-240920-019",
        displayId: "DRV-260912-31",
        applicantName: "최지우",
        contractNumber: "MIR-43••-2207",
        productName: "개인용 자동차보험",
        riderName: "안전운전 할인특약",
        requestedAt: "어제",
        status: "completed",
        proofStatus: "valid",
        decision: "applied",
        rule: referenceRule,
        result: referenceResult(91),
        history: [created("평가 결과가 도착했습니다."), created("12% 보험료 할인을 적용했습니다.")],
      },
    ],
  };
}

type DecisionInput =
  | { workflow: "dashboard"; requestId: string; decision: Exclude<DashboardDecision, "pending"> }
  | { workflow: "evaluations"; requestId: string; decision: Exclude<EvaluationDecision, "pending"> };

export function getEvaluationOutcome(evaluation: Pick<EvaluationRequest, "rule" | "result" | "proofStatus">) {
  const distanceMet = evaluation.result.accumulatedDistanceKm >= evaluation.rule.minimumDistanceKm;
  const scoreMet = evaluation.result.score >= evaluation.rule.minimumScore;
  const eligible = evaluation.proofStatus === "valid" && distanceMet && scoreMet;
  const discountPercent = !eligible
    ? 0
    : evaluation.result.score >= evaluation.rule.premiumMinimumScore
      ? evaluation.rule.premiumDiscountPercent
      : evaluation.rule.baseDiscountPercent;
  return { eligible, discountPercent, distanceMet, scoreMet };
}

export function applyDecision(state: WorkspaceState, input: DecisionInput): WorkspaceState {
  if (input.workflow === "dashboard") {
    return {
      ...state,
      requests: state.requests.map((request) => request.id !== input.requestId || request.decision !== "pending" || request.proofStatus !== "valid" ? request : {
        ...request,
        status: "completed" as const,
        decision: input.decision,
        history: [...request.history, {
          at: "방금 전",
          actor: "보험사 담당자",
          summary: input.decision === "approved" ? "특약 요청을 승인했습니다." : "특약 요청을 반려했습니다.",
          tone: input.decision === "approved" ? "success" as const : "danger" as const,
        }],
      }),
    };
  }
  return {
    ...state,
    evaluations: state.evaluations.map((evaluation) => evaluation.id !== input.requestId || evaluation.decision !== "pending" || !getEvaluationOutcome(evaluation).eligible ? evaluation : {
      ...evaluation,
      status: "completed" as const,
      decision: input.decision,
      history: [...evaluation.history, {
        at: "방금 전",
        actor: "보험사 담당자",
        summary: input.decision === "applied" ? `${getEvaluationOutcome(evaluation).discountPercent}% 보험료 할인을 적용했습니다.` : "보험료 할인을 적용하지 않았습니다.",
        tone: input.decision === "applied" ? "success" as const : "danger" as const,
      }],
    }),
  };
}

export function getDashboardMetrics(state: WorkspaceState) {
  return {
    pending: state.requests.filter((request) => request.status === "pending").length,
    review: state.requests.filter((request) => request.status === "review").length,
    completed: state.requests.filter((request) => request.status === "completed").length,
    total: state.requests.length,
  };
}

export function getEvaluationMetrics(state: WorkspaceState) {
  return {
    awaiting: state.evaluations.filter((evaluation) => evaluation.status === "verified").length,
    failed: state.evaluations.filter((evaluation) => evaluation.status === "failed").length,
    completed: state.evaluations.filter((evaluation) => evaluation.status === "completed").length,
    total: state.evaluations.length,
  };
}
