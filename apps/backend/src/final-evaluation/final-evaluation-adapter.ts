import { FinalEvaluationRequestSchema, FinalEvaluationResultSchema,
  type FinalEvaluationRequest, type FinalEvaluationResult } from "@drivacy/shared";
import { AppError } from "../errors/app-error.js";

export interface FinalEvaluationAdapter {
  startEvaluation(request: FinalEvaluationRequest): Promise<FinalEvaluationResult>;
  getEvaluationStatus(operationId: string): Promise<FinalEvaluationResult>;
}

export class ExternalFinalEvaluationAdapter implements FinalEvaluationAdapter {
  private readonly baseUrl: URL;
  public constructor(endpoint: string, private readonly token: string, private readonly fetchImpl: typeof fetch = fetch) {
    this.baseUrl = new URL(endpoint.endsWith("/") ? endpoint : `${endpoint}/`);
    if (!/^https?:$/.test(this.baseUrl.protocol)) throw new Error("C_WALLET_ADAPTER_URL must use http or https");
    if (!token.trim()) throw new Error("C_WALLET_ADAPTER_TOKEN must be configured");
  }
  private async call(path: string, init: RequestInit): Promise<FinalEvaluationResult> {
    try {
      const response = await this.fetchImpl(new URL(path, this.baseUrl), { ...init, headers: {
        authorization: `Bearer ${this.token}`, "content-type": "application/json", ...init.headers,
      }, signal: AbortSignal.timeout(30_000) });
      if (!response.ok) throw new AppError("FINAL_EVALUATION_UNAVAILABLE", "Final evaluation adapter is unavailable", 503);
      const parsed = FinalEvaluationResultSchema.safeParse(await response.json());
      if (!parsed.success) throw new AppError("FINAL_EVALUATION_INVALID", "Final evaluation adapter returned an invalid result", 502);
      return parsed.data;
    } catch (error) {
      if (error instanceof AppError) throw error;
      // 응답 유실은 미제출 증거가 아니므로 새 평가를 만들지 않고 기존 operationId 상태 조회로만 복구한다.
      throw new AppError("FINAL_EVALUATION_UNAVAILABLE", "Final evaluation status is unknown", 503);
    }
  }
  public startEvaluation(input: FinalEvaluationRequest): Promise<FinalEvaluationResult> {
    // nullifier와 proof 계산은 가입자 비밀을 가진 C/Wallet 경계가 담당하며 Backend에서 알고리즘을 복제하지 않는다.
    const request = FinalEvaluationRequestSchema.parse(input);
    return this.call("final-evaluations/start", { method: "POST", body: JSON.stringify(request) });
  }
  public async getEvaluationStatus(operationId: string): Promise<FinalEvaluationResult> {
    if (!operationId.trim()) throw new AppError("FINAL_EVALUATION_INVALID", "Evaluation operation ID is invalid", 500);
    const result = await this.call(`final-evaluations/${encodeURIComponent(operationId)}`, { method: "GET" });
    if (result.operationId !== operationId) throw new AppError("FINAL_EVALUATION_MISMATCH", "Evaluation belongs to another operation", 502);
    return result;
  }
}
