import { randomUUID } from "node:crypto";
import type { FinalEvaluationResult } from "@drivacy/shared";
import type { DiscountApplicationRepository } from "./discount-application-repository.js";
import type { DiscountApplicationService } from "./discount-application-service.js";
import type { FinalEvaluationAdapter } from "./final-evaluation-adapter.js";

export const FINAL_EVALUATION_STATUS_CHECK_MS = 30_000;

export class FinalEvaluationRecoveryService {
  public constructor(private readonly repository: DiscountApplicationRepository,
    private readonly applications: DiscountApplicationService, private readonly adapter: FinalEvaluationAdapter,
    private readonly now: () => Date = () => new Date()) {}

  public async recoverDue(limit: number): Promise<void> {
    const claimed = await this.repository.claimDue(this.now(), limit, randomUUID());
    for (const application of claimed) await this.recover(application.row, application.claimToken);
  }

  private async recover(row: Parameters<DiscountApplicationService["reconcileEvaluationStatus"]>[0], claimToken: string): Promise<void> {
    let result: FinalEvaluationResult;
    try {
      // 서버 재시작이나 응답 유실은 새 평가 사유가 아니므로 저장된 operationId 상태만 조회한다.
      result = await this.adapter.getEvaluationStatus(row.evaluationOperationId);
      // API 경로와 동일한 binding 검증을 다시 거쳐 다른 Scope·State·Rule 결과의 오염을 막는다.
      const reconciled = await this.applications.reconcileEvaluationStatus(row, result);
      if (reconciled.verificationStatus !== "PENDING") {
        // terminal verification만 저장하고 review status는 보험사 decision API의 책임으로 남긴다.
        return;
      }
      await this.schedule(row.id, claimToken);
    } catch (error) {
      // C 통신 장애·malformed 응답·binding mismatch는 평가 자체의 실패가 아니므로 FAILED로 확정하지 않는다.
      await this.schedule(row.id, claimToken, this.errorCode(error));
    }
  }

  private schedule(id: string, claimToken: string, errorCode?: string): Promise<boolean> {
    return this.repository.scheduleStatusCheck(id, claimToken,
      new Date(this.now().getTime() + FINAL_EVALUATION_STATUS_CHECK_MS), errorCode);
  }
  private errorCode(error: unknown): string {
    const code = (error as { code?: unknown }).code;
    return typeof code === "string" ? code.slice(0, 128) : "FINAL_EVALUATION_STATUS_UNKNOWN";
  }
}
