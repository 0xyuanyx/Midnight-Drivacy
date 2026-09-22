import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import type { CalculateTripRequest, TripProcessingResult } from "@drivacy/shared";

import { ChainJobRecoveryService, PgChainJobRecoveryRepository, RETRY_DELAYS_MS, STATUS_CHECK_DELAY_MS, type ChainJobRecoveryRepository, type DueChainJob } from "../src/chain-state/chain-job-recovery.js";

const now = new Date("2026-09-21T00:00:00.000Z");
const job = (action: DueChainJob["action"], retryCount = 0): DueChainJob => ({ operationId: "operation", ownerUserId: "driver", sourceKey: "source", action, retryCount });
const temporary = (): TripProcessingResult => ({ contractVersion: "bc-v1", execution: "live", operationId: "operation", tripId: "trip", status: "failed", error: { code: "TEMPORARY_FAILURE", retryable: true } });
const unknown = (): TripProcessingResult => ({ contractVersion: "bc-v1", execution: "live", operationId: "operation", tripId: "trip", status: "chain-unknown", transactionId: "transaction" });
const rejected = (): TripProcessingResult => ({ contractVersion: "bc-v1", execution: "live", operationId: "operation", tripId: "trip", status: "failed", error: { code: "CHAIN_REJECTED", retryable: false } });
const retriesExhausted = (): TripProcessingResult => ({ contractVersion: "bc-v1", execution: "live", operationId: "operation", tripId: "trip", status: "failed", error: { code: "RETRIES_EXHAUSTED", retryable: false } });
const request: CalculateTripRequest = { contractVersion: "bc-v1", execution: "live", operationId: "operation", idempotencyKey: "key", scope: { applicantId: "driver", contractId: "contract", insurerId: "insurer", endorsementId: "endorsement", evaluationPeriod: { id: "period", startDate: "2026-09-01", endDate: "2026-09-30" } }, approvedRule: { approval: "approved", registration: "chain-confirmed", ruleHash: "rule-hash", network: "local", adapterProfile: "profile", chainContractAddress: "contract-address", registrationTransactionId: "registration", rule: { id: "rule", version: 1, insurerId: "insurer", endorsementId: "endorsement", formula: "cumulative-event-deduction-v1", initialScore: 100, speedingPenalty: 2, accelerationPenalty: 1, brakingPenalty: 3, minimumDistanceM: 500000, minimumScore: 80, premiumMinimumScore: 90, baseDiscountBps: 1000, premiumDiscountBps: 1200 } }, previous: { kind: "confirmed", state: { scope: { applicantId: "driver", contractId: "contract", insurerId: "insurer", endorsementId: "endorsement", evaluationPeriod: { id: "period", startDate: "2026-09-01", endDate: "2026-09-30" } }, rule: { id: "rule", version: 1, ruleHash: "rule-hash" }, version: 0, tripCount: 0, totals: { distanceM: 0, durationSeconds: 0, speedingCount: 0, accelerationCount: 0, brakingCount: 0 }, score: 100, conditionsMet: false, expectedDiscountBps: 0, datasetRoot: "root", stateSalt: "a".repeat(64), stateCommitment: "previous" }, confirmation: { execution: "live", network: "local", adapterProfile: "profile", chainContractAddress: "contract-address", transactionId: "genesis", blockId: "block", operationId: "genesis-operation", previousStateCommitment: "none", newStateCommitment: "previous", ruleHash: "rule-hash", datasetRoot: "root", observedAt: "2026-09-20T00:00:00Z" } }, trip: { id: "trip", source: "simulated", collectionEnabled: true, datasetSalt: "b".repeat(64), records: [{ index: 0, distanceM: 1, durationSeconds: 1, speedingCount: 0, accelerationCount: 0, brakingCount: 0 }] } };

class MemoryRecoveryRepository implements ChainJobRecoveryRepository {
  public due: DueChainJob[] = [];
  public expired: string[] = [];
  public confirmed: Array<{ operationId: string; ownerUserId: string }> = [];
  public retries: Array<{ count: number; at: Date }> = [];
  public checks: Date[] = [];
  public failures: Array<{ code: string; retryable: boolean }> = [];
  public claimed = new Set<string>();
  public deleted: string[] = [];
  async findDueActions(): Promise<DueChainJob[]> { return this.due; }
  async beginRetry(_operationId: string, _token: string, retryCount: number): Promise<boolean> { return !this.claimed.has(`retry-${retryCount}`) && (this.claimed.add(`retry-${retryCount}`), true); }
  async scheduleRetry(_operationId: string, _token: string, retryCount: number, at: Date): Promise<boolean> { this.retries.push({ count: retryCount, at }); return true; }
  async scheduleStatusCheck(_operationId: string, _token: string, at: Date): Promise<boolean> { this.checks.push(at); return true; }
  async recordFailure(_operationId: string, _token: string, code: string, retryable: boolean): Promise<boolean> { this.failures.push({ code, retryable }); return true; }
  async findExpiredRaw(): Promise<string[]> { return this.expired; }
  async findConfirmedRaw(): Promise<Array<{ operationId: string; ownerUserId: string }>> { return this.confirmed; }
  async claimExpiredRaw(operationId: string): Promise<{ sourceKey: string; token: string } | undefined> { return this.claimed.has(operationId) ? undefined : (this.claimed.add(operationId), { sourceKey: "source", token: "cleanup" }); }
  async markRawDeleted(operationId: string): Promise<boolean> { this.deleted.push(operationId); return true; }
  async releaseRawClaim(operationId: string): Promise<void> { this.claimed.delete(operationId); }
}

const service = (repository: MemoryRecoveryRepository, status: TripProcessingResult, retry = status, deleteSource = vi.fn(async () => undefined)) => {
  const finalizer = { claim: vi.fn(async () => "claim"), finalize: vi.fn(async () => status),
    deleteConfirmedSource: vi.fn(async () => undefined), abandonJob: vi.fn(async () => undefined) };
  const gateway = { getTripStatus: vi.fn(async () => status), retryTemporaryFailure: vi.fn(async () => retry) };
  const source = { load: vi.fn(async () => request), delete: deleteSource };
  return { worker: new ChainJobRecoveryService(repository, finalizer as never, gateway, source, () => now), finalizer, gateway, source };
};

describe("ChainJobRecoveryService", () => {
  it("schedules only TEMPORARY_FAILURE at 1 minute, then retries at 5 and 15 minutes", async () => {
    const first = new MemoryRecoveryRepository(); first.due = [job("status-check", 0)];
    await service(first, temporary()).worker.recoverDue(10);
    expect(first.retries).toEqual([{ count: 0, at: new Date(now.getTime() + RETRY_DELAYS_MS[0]) }]);

    const second = new MemoryRecoveryRepository(); second.due = [job("retry", 0)];
    await service(second, temporary()).worker.recoverDue(10);
    expect(second.retries).toEqual([{ count: 1, at: new Date(now.getTime() + RETRY_DELAYS_MS[1]) }]);

    const third = new MemoryRecoveryRepository(); third.due = [job("retry", 1)];
    await service(third, temporary()).worker.recoverDue(10);
    expect(third.retries).toEqual([{ count: 2, at: new Date(now.getTime() + RETRY_DELAYS_MS[2]) }]);
  });

  it("stops scheduling after the third retry and preserves a non-retryable failure", async () => {
    const exhausted = new MemoryRecoveryRepository(); exhausted.due = [job("retry", 2)];
    const temporaryResult = service(exhausted, temporary()); await temporaryResult.worker.recoverDue(10);
    expect(exhausted.retries).toEqual([]); expect(exhausted.failures).toEqual([{ code: "TEMPORARY_FAILURE", retryable: true }]);
    expect(temporaryResult.finalizer.abandonJob).not.toHaveBeenCalled();

    const nonRetryable = new MemoryRecoveryRepository(); nonRetryable.due = [job("status-check")];
    const result = service(nonRetryable, rejected()); await result.worker.recoverDue(10);
    expect(nonRetryable.retries).toEqual([]); expect(result.finalizer.abandonJob).toHaveBeenCalledWith(expect.objectContaining({ id: "driver" }), "operation");
  });

  it("hands C's terminal RETRIES_EXHAUSTED result to the existing safe-abandon path", async () => {
    const repository = new MemoryRecoveryRepository(); repository.due = [job("retry", 2)];
    const result = service(repository, retriesExhausted()); await result.worker.recoverDue(10);
    expect(repository.retries).toEqual([]); expect(repository.failures).toEqual([{ code: "RETRIES_EXHAUSTED", retryable: false }]);
    expect(result.finalizer.abandonJob).toHaveBeenCalledWith(expect.objectContaining({ id: "driver" }), "operation");
  });

  it("uses status-only recovery for chain-unknown without invoking C retry submission", async () => {
    const repository = new MemoryRecoveryRepository(); repository.due = [job("status-check")];
    const result = service(repository, unknown()); await result.worker.recoverDue(10);
    expect(result.gateway.getTripStatus).toHaveBeenCalledWith("operation"); expect(result.gateway.retryTemporaryFailure).not.toHaveBeenCalled();
    expect(repository.checks).toEqual([new Date(now.getTime() + STATUS_CHECK_DELAY_MS)]);
  });

  it("keeps operation identity and source request when a retry is recovered from DB", async () => {
    const repository = new MemoryRecoveryRepository(); repository.due = [job("retry", 0)];
    const result = service(repository, temporary()); await result.worker.recoverDue(10);
    expect(result.source.load).toHaveBeenCalledWith("source");
    expect(result.gateway.retryTemporaryFailure.mock.calls[0]?.[0]).toMatchObject({ operationId: "operation", trip: { id: "trip" } });
  });

  it("claims expired abandoned raw once, marks deletion, and leaves a failed cleanup retryable", async () => {
    const repository = new MemoryRecoveryRepository(); repository.expired = ["operation"];
    const result = service(repository, unknown()); await result.worker.cleanupExpiredRaw(10);
    expect(result.source.delete).toHaveBeenCalledWith("source"); expect(repository.deleted).toEqual(["operation"]);

    const failed = new MemoryRecoveryRepository(); failed.expired = ["operation"];
    await service(failed, unknown(), unknown(), vi.fn(async () => { throw new Error("storage"); })).worker.cleanupExpiredRaw(10);
    expect(failed.deleted).toEqual([]); expect(failed.claimed.has("operation")).toBe(false);
  });

  it("retries confirmed raw deletion without rolling back the confirmed DB state", async () => {
    const repository = new MemoryRecoveryRepository();
    repository.confirmed = [{ operationId: "operation", ownerUserId: "driver" }];
    const result = service(repository, unknown());
    result.finalizer.deleteConfirmedSource.mockRejectedValueOnce(new Error("storage"));

    await expect(result.worker.cleanupConfirmedRaw(10)).resolves.toBeUndefined();
    await result.worker.cleanupConfirmedRaw(10);
    expect(result.finalizer.deleteConfirmedSource).toHaveBeenCalledTimes(2);
  });
});

describe("PgChainJobRecoveryRepository lease handoff", () => {
  it("atomically releases the current lease when it reserves retry or status-check work", async () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 1, rows: [] });
    const repository = new PgChainJobRecoveryRepository({ query } as unknown as Pool);

    await expect(repository.scheduleRetry("operation", "worker-a", 0, now)).resolves.toBe(true);
    await expect(repository.scheduleStatusCheck("operation", "worker-a", now)).resolves.toBe(true);

    for (const [sql] of query.mock.calls) {
      expect(String(sql)).toContain("claim_token=NULL,claim_expires_at=NULL");
      expect(String(sql)).toContain("claim_token=$");
      expect(String(sql)).toContain("claim_expires_at>clock_timestamp()");
    }
  });

  it("keeps the ownership predicate, so another worker token cannot clear a live lease", async () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 0, rows: [] });
    const repository = new PgChainJobRecoveryRepository({ query } as unknown as Pool);

    await expect(repository.scheduleRetry("operation", "worker-b", 1, now)).resolves.toBe(false);
    const [sql, values] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("claim_token=$3");
    expect(values).toEqual(["operation", 1, "worker-b", now]);
  });

  it("clears a terminal worker lease before safe abandon, which does not require that token", async () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 1, rows: [] });
    const repository = new PgChainJobRecoveryRepository({ query } as unknown as Pool);
    await expect(repository.recordFailure("operation", "worker-a", "RETRIES_EXHAUSTED", false)).resolves.toBe(true);
    expect(String(query.mock.calls[0]?.[0])).toContain("claim_token=NULL,claim_expires_at=NULL");
  });
});
