import { randomUUID } from "node:crypto";
import { ConfirmedStateSchema, FinalEvaluationRequestSchema, FinalEvaluationResultSchema, RegisteredRuleSchema,
  type AdapterRuntime, type FinalEvaluationResult, type User } from "@drivacy/shared";
import { AppError } from "../errors/app-error.js";
import type { DiscountApplicationRepository, DiscountApplicationRow } from "./discount-application-repository.js";
import type { FinalEvaluationAdapter } from "./final-evaluation-adapter.js";

export type DiscountApplicationView = ReturnType<typeof view>;
const view = (row: DiscountApplicationRow) => ({
  id: row.id, insuranceContractId: row.insuranceContractId, specialContractId: row.specialContractId,
  specialContractName: row.specialContractName, evaluationPeriod: row.evaluationStartsOn ? {
    startDate: row.evaluationStartsOn, endDate: row.evaluationEndsOn,
  } : undefined,
  stateCommitment: row.stateCommitment, stateVersion: Number(row.stateVersion), ruleHash: row.ruleHash,
  score: row.score, distanceM: Number(row.distanceM), conditionsMet: row.conditionsMet,
  expectedDiscountBps: row.expectedDiscountBps, verificationStatus: row.verificationStatus,
  reviewStatus: row.reviewStatus, appliedDiscountBps: row.appliedDiscountBps,
  resultCommitment: row.resultCommitment, nullifier: row.nullifier, transactionId: row.transactionId,
  network: row.network, chainContractAddress: row.chainContractAddress,
  submittedAt: row.submittedAt, verifiedAt: row.verifiedAt, decidedAt: row.decidedAt,
});

export class DiscountApplicationService {
  public constructor(private readonly repository: DiscountApplicationRepository,
    private readonly adapter: FinalEvaluationAdapter, private readonly runtime: AdapterRuntime) {}

  public async create(actor: User, contractId: string, specialContractId: string): Promise<DiscountApplicationView> {
    if (actor.role !== "DRIVER") throw new AppError("FORBIDDEN", "Only drivers can submit discount applications", 403);
    // 클라이언트의 점수·할인율·commitment를 신뢰하면 확정 State와 다른 결과를 신청할 수 있으므로 식별자만 받고 DB에서 읽는다.
    const operationId = randomUUID();
    const reserved = await this.repository.reserve(actor.id, contractId, specialContractId, operationId,
      this.runtime.network, this.runtime.adapterProfile);
    if (!reserved) throw new AppError("FINAL_STATE_NOT_ELIGIBLE", "No eligible confirmed state exists", 409);
    const row = reserved.row;
    if (row.verificationStatus !== "PENDING") return view(row);
    const confirmed = ConfirmedStateSchema.safeParse(row.confirmedState);
    const registeredRule = RegisteredRuleSchema.safeParse(row.registeredRule);
    if (!confirmed.success || !registeredRule.success || confirmed.data.state.version < 1) {
      // Genesis에는 실제 운행 누적 결과가 없으므로 최종 할인 신청의 근거로 사용할 수 없다.
      throw new AppError("FINAL_STATE_NOT_ELIGIBLE", "Genesis or invalid state cannot be evaluated", 409);
    }
    const request = FinalEvaluationRequestSchema.parse({ contractVersion: "bc-v1", execution: "live",
      operationId: row.evaluationOperationId, scope: confirmed.data.state.scope, registeredRule: registeredRule.data,
      confirmed: confirmed.data });
    const result = reserved.created
      ? await this.adapter.startEvaluation(request)
      : await this.adapter.getEvaluationStatus(row.evaluationOperationId);
    return view(await this.reconcileEvaluationStatus(row, result));
  }

  public async reconcileEvaluationStatus(row: DiscountApplicationRow, input: FinalEvaluationResult): Promise<DiscountApplicationRow> {
    const result = FinalEvaluationResultSchema.parse(input);
    if (result.operationId !== row.evaluationOperationId) throw new AppError("FINAL_EVALUATION_MISMATCH", "Evaluation operation does not match", 502);
    if (result.status === "failed") return await this.repository.markFailed(row.id) ?? row;
    if (result.status !== "verified") return row;
    const matches = result.stateCommitment === row.stateCommitment && result.stateVersion === Number(row.stateVersion)
      && result.rule.ruleHash === row.ruleHash && result.rule.id === row.ruleId
      && result.rule.version === Number(row.ruleVersion) && result.scope.applicantId === row.ownerUserId
      && result.scope.contractId === row.insuranceContractId && result.scope.endorsementId === row.specialContractId
      // 같은 State와 Rule이더라도 다른 보험사ㆍ평가기간의 verified 결과가 결합되면
      // 신청 범위가 바뀔 수 있으므로 클라이언트 입력이 아닌 DB에 고정된 범위까지 대조한다.
      && result.scope.insurerId === row.insurerId && result.scope.evaluationPeriod.id === row.evaluationPeriodId
      && result.scope.evaluationPeriod.startDate === row.evaluationStartsOn
      && result.scope.evaluationPeriod.endDate === row.evaluationEndsOn
      && result.network === row.network && result.adapterProfile === row.adapterProfile
      && result.chainContractAddress === row.chainContractAddress && result.score === row.score
      && result.distanceM === Number(row.distanceM) && result.conditionsMet === row.conditionsMet
      && result.expectedDiscountBps === row.expectedDiscountBps;
    if (!matches) throw new AppError("FINAL_EVALUATION_MISMATCH", "Evaluation result does not match the confirmed application state", 502);
    try {
      // API 재조회와 worker가 동시에 도착해도 PENDING 조건부 UPDATE 하나만 terminal 전이를 수행한다.
      const updated = await this.repository.markVerified(row.id, { resultCommitment: result.resultCommitment,
        nullifier: result.nullifier, transactionId: result.transactionId });
      return updated ?? row;
    } catch (error: unknown) {
      // State commitment와 nullifier를 모두 DB UNIQUE로 막아 병렬 요청과 다른 salt를 이용한 재사용을 최종 차단한다.
      if ((error as { code?: string }).code === "23505") throw new AppError("NULLIFIER_CONFLICT", "Evaluation result was already used", 409);
      throw error;
    }
  }

  public async listMine(actor: User): Promise<DiscountApplicationView[]> {
    if (actor.role !== "DRIVER") throw new AppError("FORBIDDEN", "Only drivers can view their applications", 403);
    return (await this.repository.listOwned(actor.id)).map(view);
  }
  public async getMine(actor: User, id: string): Promise<DiscountApplicationView> {
    if (actor.role !== "DRIVER") throw new AppError("FORBIDDEN", "Only drivers can view their applications", 403);
    const row = await this.repository.findOwned(id, actor.id);
    if (!row) throw new AppError("APPLICATION_NOT_FOUND", "Discount application was not found", 404);
    return view(row);
  }
  public async listForInsurer(actor: User): Promise<DiscountApplicationView[]> {
    if (actor.role !== "INSURER") throw new AppError("FORBIDDEN", "Only insurers can review applications", 403);
    // INSURER 역할만으로는 타 보험사 신청에 접근할 수 있으므로 repository SQL에서 membership과 계약 insurer를 함께 제한한다.
    return (await this.repository.listForInsurer(actor.id)).map(view);
  }
  public async getForInsurer(actor: User, id: string): Promise<DiscountApplicationView> {
    if (actor.role !== "INSURER") throw new AppError("FORBIDDEN", "Only insurers can review applications", 403);
    const row = await this.repository.findForInsurer(id, actor.id);
    if (!row) throw new AppError("APPLICATION_NOT_FOUND", "Discount application was not found", 404);
    return view(row);
  }
  public async decide(actor: User, id: string, decision: "APPLIED" | "REJECTED"): Promise<DiscountApplicationView> {
    if (actor.role !== "INSURER") throw new AppError("FORBIDDEN", "Only insurers can decide applications", 403);
    const current = await this.repository.findForInsurer(id, actor.id);
    if (!current) throw new AppError("APPLICATION_NOT_FOUND", "Discount application was not found", 404);
    if (current.verificationStatus !== "VERIFIED") throw new AppError("APPLICATION_NOT_VERIFIED", "Application is not verified", 409);
    if (current.reviewStatus !== "PENDING_REVIEW") throw new AppError("APPLICATION_ALREADY_DECIDED", "Application decision is final", 409);
    // 증명 유효는 결과의 정합성이고 할인 적용은 별도 업무 결정이므로 검증 완료 후에만 불변 결정을 기록한다.
    const updated = await this.repository.decide(id, actor.id, decision);
    if (!updated) throw new AppError("APPLICATION_ALREADY_DECIDED", "Application decision is final", 409);
    return view(updated);
  }
}
