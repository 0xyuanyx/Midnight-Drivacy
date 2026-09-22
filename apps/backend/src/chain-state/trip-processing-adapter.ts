import { z } from "zod";
import {
  CalculateTripRequestSchema,
  TripProcessingResultSchema,
  type CalculateTripRequest,
  type TripProcessingResult,
} from "@drivacy/shared";

import { AppError } from "../errors/app-error.js";
import type { ChainRecoveryGateway } from "./chain-job-recovery.js";
import type { ChainProcessingGateway, TripRequestSource } from "./chain-processing-service.js";

type Fetch = typeof fetch;
const sourceResponse = z.object({ sourceKey: z.string().min(1).max(1024) }).strict();
const abandonResponse = z.object({ safe: z.boolean() }).strict();

/**
 * raw 운행과 C Job은 외부 실행 계층에 위임하고 Backend에는 sourceKey만 남긴다.
 * 가입자 Wallet Key·ZK 내부 상태·C journal을 Backend가 소유하지 않게 하며,
 * 로컬 개발자 probe를 production 성공 경로로 재사용하지 않는다.
 */
export class ExternalTripProcessingAdapter implements TripRequestSource, ChainProcessingGateway, ChainRecoveryGateway {
  private readonly baseUrl: URL;

  public constructor(endpoint: string, private readonly token: string, private readonly fetchImpl: Fetch = fetch) {
    this.baseUrl = new URL(endpoint.endsWith("/") ? endpoint : `${endpoint}/`);
    if (!/^https?:$/.test(this.baseUrl.protocol)) throw new Error("C_WALLET_ADAPTER_URL must use http or https");
    if (!token.trim()) throw new Error("C_WALLET_ADAPTER_TOKEN must be configured");
  }

  private async request(path: string, init: RequestInit): Promise<unknown> {
    try {
      const response = await this.fetchImpl(new URL(path, this.baseUrl), { ...init, headers: {
        authorization: `Bearer ${this.token}`, "content-type": "application/json", ...init.headers,
      }, signal: AbortSignal.timeout(30_000) });
      if (!response.ok) throw new AppError("CHAIN_ADAPTER_UNAVAILABLE", "C/Wallet processing adapter is unavailable", 503);
      if (response.status === 204) return undefined;
      return await response.json();
    } catch (error) {
      if (error instanceof AppError) throw error;
      // 응답 유실은 chain failure나 미제출 증거가 아니므로 기존 operationId 상태 조회로만 복구한다.
      throw new AppError("CHAIN_ADAPTER_UNAVAILABLE", "C/Wallet processing status is unknown", 503);
    }
  }

  public async save(input: CalculateTripRequest): Promise<string> {
    const request = CalculateTripRequestSchema.parse(input);
    const parsed = sourceResponse.safeParse(await this.request("trip-sources", {
      method: "POST", body: JSON.stringify(request),
    }));
    if (!parsed.success) throw new AppError("SOURCE_STORAGE_INVALID", "Private trip source returned an invalid key", 502);
    return parsed.data.sourceKey;
  }

  public async load(sourceKey: string): Promise<CalculateTripRequest> {
    const parsed = CalculateTripRequestSchema.safeParse(await this.request(`trip-sources/${encodeURIComponent(sourceKey)}`, { method: "GET" }));
    if (!parsed.success) throw new AppError("SOURCE_PAYLOAD_INVALID", "Private trip source payload is invalid", 502);
    return parsed.data;
  }

  public async delete(sourceKey: string): Promise<void> {
    await this.request(`trip-sources/${encodeURIComponent(sourceKey)}`, { method: "DELETE" });
  }

  private async processing(path: string, init: RequestInit): Promise<TripProcessingResult> {
    const parsed = TripProcessingResultSchema.safeParse(await this.request(path, init));
    if (!parsed.success) throw new AppError("CHAIN_PROCESSING_INVALID", "C/Wallet adapter returned an invalid trip status", 502);
    return parsed.data;
  }

  public startTrip(request: CalculateTripRequest): Promise<TripProcessingResult> {
    // operationId는 Trip ID로 고정돼 C가 동일 요청을 새 Job으로 만들지 않고 기존 journal을 이어가게 한다.
    return this.processing("trip-processing/start", { method: "POST", body: JSON.stringify(CalculateTripRequestSchema.parse(request)) });
  }

  public retryTemporaryFailure(request: CalculateTripRequest): Promise<TripProcessingResult> {
    return this.processing("trip-processing/retry", { method: "POST", body: JSON.stringify(CalculateTripRequestSchema.parse(request)) });
  }

  public getTripStatus(operationId: string): Promise<TripProcessingResult> {
    return this.processing(`trip-processing/${encodeURIComponent(operationId)}`, { method: "GET" });
  }

  public async canAbandonTrip(operationId: string): Promise<boolean> {
    const parsed = abandonResponse.safeParse(await this.request(
      `trip-processing/${encodeURIComponent(operationId)}/can-abandon`, { method: "GET" },
    ));
    if (!parsed.success) throw new AppError("CHAIN_PROCESSING_INVALID", "C/Wallet adapter returned an invalid abandon decision", 502);
    return parsed.data.safe;
  }
}
