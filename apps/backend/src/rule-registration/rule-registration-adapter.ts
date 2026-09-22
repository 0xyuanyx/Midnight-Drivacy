import {
  DeployRuleRequestSchema,
  DeployRuleResultSchema,
  InitialRegistrationStatusSchema,
  RegisteredRuleSchema,
  UpdateRuleRequestSchema,
  type BCAdapter,
  type DeployRuleRequest,
  type DeployRuleResult,
  type InitialRegistrationStatus,
  type RegisteredRule,
  type UpdateRuleRequest,
} from "@drivacy/shared";

import { AppError } from "../errors/app-error.js";

export type RuleRegistrationAdapter = Pick<
  BCAdapter,
  "deployRule" | "getInitialRegistrationStatus" | "updateRule"
>;

type Fetch = typeof fetch;

/**
 * B의 권한·DB 오케스트레이션과 외부 C/Wallet 실행 계층을 잇는 최소 client다.
 * Core·ZK·Compact 알고리즘을 복제하지 않고, 가입자 승인이 필요한 거래를
 * Backend 개발자 키로 대신 서명하지 않도록 월렛 키와 Midnight SDK를 소유하지 않는다.
 * 로컬 probe는 공개 개발자 월렛과 휘발성 상태를 사용하므로 이 경계의 구현체로 사용하지 않는다.
 */
export class ExternalRuleRegistrationAdapter implements RuleRegistrationAdapter {
  private readonly baseUrl: URL;

  public constructor(
    endpoint: string,
    private readonly token: string,
    private readonly fetchImpl: Fetch = fetch,
  ) {
    this.baseUrl = new URL(endpoint.endsWith("/") ? endpoint : `${endpoint}/`);
    if (!/^https?:$/.test(this.baseUrl.protocol)) throw new Error("C_WALLET_ADAPTER_URL must use http or https");
    if (!token.trim()) throw new Error("C_WALLET_ADAPTER_TOKEN must be configured");
  }

  private async request(path: string, init: RequestInit): Promise<unknown> {
    try {
      const response = await this.fetchImpl(new URL(path, this.baseUrl), {
        ...init,
        headers: {
          authorization: `Bearer ${this.token}`,
          "content-type": "application/json",
          ...init.headers,
        },
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) {
        throw new AppError("CHAIN_ADAPTER_UNAVAILABLE", "C/Wallet adapter is unavailable", 503);
      }
      return await response.json();
    } catch (error) {
      if (error instanceof AppError) throw error;
      // 응답 유실은 실제 미제출을 뜻하지 않는다. 불명 상태를 not-submitted으로 바꾸면
      // 같은 Scope에 새 계약을 중복 배포할 수 있으므로 호출 실패 그대로 닫힌다.
      throw new AppError("CHAIN_ADAPTER_UNAVAILABLE", "C/Wallet adapter status is unknown", 503);
    }
  }

  public async deployRule(input: DeployRuleRequest): Promise<DeployRuleResult> {
    const request = DeployRuleRequestSchema.parse(input);
    const response = await this.request("rule-registrations/deploy", {
      method: "POST",
      body: JSON.stringify(request),
    });
    const parsed = DeployRuleResultSchema.safeParse(response);
    if (!parsed.success) throw new AppError("CHAIN_REGISTRATION_INVALID", "C/Wallet adapter returned an invalid deployment", 502);
    return parsed.data;
  }

  public async getInitialRegistrationStatus(operationId: string): Promise<InitialRegistrationStatus> {
    if (!operationId.trim()) throw new AppError("CHAIN_REGISTRATION_INVALID", "Initial registration operation ID is invalid", 500);
    // B가 예약한 operationId를 그대로 조회해야 응답 유실 뒤 기존 거래를 복구할 수 있다.
    // 새 ID로 상태를 우회하면 pending 거래와 별도 배포가 동시에 생길 수 있다.
    const response = await this.request(`rule-registrations/initial/${encodeURIComponent(operationId)}`, {
      method: "GET",
    });
    const parsed = InitialRegistrationStatusSchema.safeParse(response);
    if (!parsed.success || parsed.data.operationId !== operationId) {
      throw new AppError("CHAIN_REGISTRATION_INVALID", "C/Wallet adapter returned an invalid registration status", 502);
    }
    return parsed.data;
  }

  public async updateRule(input: UpdateRuleRequest): Promise<RegisteredRule> {
    const request = UpdateRuleRequestSchema.parse(input);
    const response = await this.request("rule-registrations/update", {
      method: "POST",
      body: JSON.stringify(request),
    });
    const parsed = RegisteredRuleSchema.safeParse(response);
    if (!parsed.success) throw new AppError("CHAIN_REGISTRATION_INVALID", "C/Wallet adapter returned an invalid rule update", 502);
    return parsed.data;
  }
}
