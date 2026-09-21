import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { CalculateTripRequestSchema, TripProcessingResultSchema, type CalculateTripRequest, type TripProcessingResult, type User } from "@drivacy/shared";

import { ChainFinalizer, type PrivateTripSource } from "./chain-finalizer.js";

export type RecoveryAction = "retry" | "status-check";
export interface DueChainJob {
  operationId: string;
  ownerUserId: string;
  sourceKey: string;
  retryCount: number;
  action: RecoveryAction;
}

/** C 구현체는 주입한다. B는 재시도 시 새 operation이나 체인 제출 방식을 만들지 않는다. */
export interface ChainRecoveryGateway {
  retryTemporaryFailure(request: CalculateTripRequest): Promise<TripProcessingResult>;
  getTripStatus(operationId: string): Promise<TripProcessingResult>;
}

export interface ChainJobRecoveryRepository {
  findDueActions(now: Date, limit: number): Promise<DueChainJob[]>;
  beginRetry(operationId: string, token: string, retryCount: number): Promise<boolean>;
  scheduleRetry(operationId: string, token: string, retryCount: number, at: Date): Promise<boolean>;
  scheduleStatusCheck(operationId: string, token: string, at: Date): Promise<boolean>;
  recordFailure(operationId: string, token: string, code: string, retryable: boolean): Promise<boolean>;
  claimExpiredRaw(operationId: string): Promise<{ sourceKey: string; token: string } | undefined>;
  findExpiredRaw(now: Date, limit: number): Promise<string[]>;
  markRawDeleted(operationId: string, token: string): Promise<boolean>;
  releaseRawClaim(operationId: string, token: string): Promise<void>;
}

interface DueRow {
  operationId: string; ownerUserId: string; sourceKey: string; retryCount: number; action: RecoveryAction;
}

/** PostgreSQL reservation conditions make a restart safe: due rows and cleanup candidates live in DB, not timers. */
export class PgChainJobRecoveryRepository implements ChainJobRecoveryRepository {
  public constructor(private readonly pool: Pool) {}

  public async findDueActions(now: Date, limit: number): Promise<DueChainJob[]> {
    const result = await this.pool.query<DueRow>(`SELECT j.operation_id AS "operationId", s.owner_user_id AS "ownerUserId",
      j.source_key AS "sourceKey", j.retry_count AS "retryCount", j.next_action_type AS action
      FROM public.chain_jobs j JOIN public.chain_states s ON s.scope_key=j.scope_key
      WHERE j.status='pending' AND j.next_action_type IS NOT NULL AND j.next_action_at <= $1
      ORDER BY j.next_action_at ASC LIMIT $2`, [now, limit]);
    return result.rows;
  }

  public async beginRetry(operationId: string, token: string, retryCount: number): Promise<boolean> {
    const result = await this.pool.query(`UPDATE public.chain_jobs SET retry_count=retry_count+1
      WHERE operation_id=$1 AND status='pending' AND next_action_type='retry' AND retry_count=$2
        AND claim_token=$3 AND claim_expires_at>clock_timestamp()`, [operationId, retryCount, token]);
    return result.rowCount === 1;
  }

  public async scheduleRetry(operationId: string, token: string, retryCount: number, at: Date): Promise<boolean> {
    const result = await this.pool.query(`UPDATE public.chain_jobs SET next_action_type='retry',next_action_at=$4,
      last_error_code='TEMPORARY_FAILURE',last_error_retryable=true,last_error_at=clock_timestamp()
      WHERE operation_id=$1 AND status='pending' AND retry_count=$2 AND claim_token=$3 AND claim_expires_at>clock_timestamp()`,
    [operationId, retryCount, token, at]);
    return result.rowCount === 1;
  }

  public async scheduleStatusCheck(operationId: string, token: string, at: Date): Promise<boolean> {
    const result = await this.pool.query(`UPDATE public.chain_jobs SET next_action_type='status-check',next_action_at=$3
      WHERE operation_id=$1 AND status='pending' AND claim_token=$2 AND claim_expires_at>clock_timestamp()`, [operationId, token, at]);
    return result.rowCount === 1;
  }

  public async recordFailure(operationId: string, token: string, code: string, retryable: boolean): Promise<boolean> {
    const result = await this.pool.query(`UPDATE public.chain_jobs SET next_action_type=NULL,next_action_at=NULL,
      last_error_code=$3,last_error_retryable=$4,last_error_at=clock_timestamp()
      WHERE operation_id=$1 AND status='pending' AND claim_token=$2 AND claim_expires_at>clock_timestamp()`, [operationId, token, code, retryable]);
    return result.rowCount === 1;
  }

  public async findExpiredRaw(now: Date, limit: number): Promise<string[]> {
    const result = await this.pool.query<{ operationId: string }>(`SELECT operation_id AS "operationId" FROM public.chain_jobs
      WHERE status='abandoned' AND deletion_status='pending' AND raw_expires_at <= $1
      ORDER BY raw_expires_at ASC LIMIT $2`, [now, limit]);
    return result.rows.map(row => row.operationId);
  }

  public async claimExpiredRaw(operationId: string): Promise<{ sourceKey: string; token: string } | undefined> {
    const token = randomUUID();
    const result = await this.pool.query<{ sourceKey: string }>(`UPDATE public.chain_jobs SET claim_token=$2,
      claim_expires_at=clock_timestamp()+interval '5 minutes' WHERE operation_id=$1 AND status='abandoned'
      AND deletion_status='pending' AND raw_expires_at <= clock_timestamp()
      AND (claim_expires_at IS NULL OR claim_expires_at <= clock_timestamp()) RETURNING source_key AS "sourceKey"`, [operationId, token]);
    return result.rows[0] ? { sourceKey: result.rows[0].sourceKey, token } : undefined;
  }

  public async markRawDeleted(operationId: string, token: string): Promise<boolean> {
    const result = await this.pool.query(`UPDATE public.chain_jobs SET deletion_status='deleted',claim_token=NULL,claim_expires_at=NULL
      WHERE operation_id=$1 AND status='abandoned' AND deletion_status='pending' AND claim_token=$2`, [operationId, token]);
    return result.rowCount === 1;
  }

  public async releaseRawClaim(operationId: string, token: string): Promise<void> {
    await this.pool.query(`UPDATE public.chain_jobs SET claim_token=NULL,claim_expires_at=NULL
      WHERE operation_id=$1 AND status='abandoned' AND deletion_status='pending' AND claim_token=$2`, [operationId, token]);
  }
}

export const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 15 * 60_000] as const;
// 상태 불명은 실패 재시도가 아니다. 1분은 재제출 없이 조회만 다시 시도하는 최소 운영 간격이다.
export const STATUS_CHECK_DELAY_MS = 60_000;

/** Callable worker; callers may invoke it after startup or periodically without retaining in-memory job state. */
export class ChainJobRecoveryService {
  public constructor(
    private readonly repository: ChainJobRecoveryRepository,
    private readonly finalizer: ChainFinalizer,
    private readonly gateway: ChainRecoveryGateway,
    private readonly source: PrivateTripSource,
    private readonly now: () => Date = () => new Date(),
  ) {}

  public async recoverDue(limit: number): Promise<void> {
    for (const job of await this.repository.findDueActions(this.now(), limit)) await this.recover(job);
  }

  public async cleanupExpiredRaw(limit: number): Promise<void> {
    for (const operationId of await this.repository.findExpiredRaw(this.now(), limit)) {
      const claim = await this.repository.claimExpiredRaw(operationId);
      if (!claim) continue;
      try {
        await this.source.delete(claim.sourceKey);
        await this.repository.markRawDeleted(operationId, claim.token);
      } catch {
        // 삭제 실패는 이미 안전 종료된 Job만 다시 시도하게 하고, Confirmed State나 pending 상태를 되돌리지 않는다.
        await this.repository.releaseRawClaim(operationId, claim.token);
      }
    }
  }

  private async recover(job: DueChainJob): Promise<void> {
    const actor: User = { id: job.ownerUserId, email: "recovery-worker@internal.invalid", role: "DRIVER" };
    let token: string;
    try { token = await this.finalizer.claim(actor, job.operationId); } catch { return; }
    if (job.action === "retry") {
      // DB 조건부 증가가 두 worker의 같은 retry_count 소비를 막고, operationId/source는 그대로 C에 전달한다.
      if (job.retryCount >= RETRY_DELAYS_MS.length || !await this.repository.beginRetry(job.operationId, token, job.retryCount)) return;
      const request = CalculateTripRequestSchema.parse(await this.source.load(job.sourceKey));
      await this.applyResult(job, actor, token, this.now(), await this.gateway.retryTemporaryFailure(request), job.retryCount + 1);
      return;
    }
    // chain-unknown의 복구는 이 조회뿐이다. 원본을 다시 C에 제출하면 이미 보낸 거래가 중복될 수 있다.
    await this.applyResult(job, actor, token, this.now(), await this.gateway.getTripStatus(job.operationId), job.retryCount);
  }

  private async applyResult(job: DueChainJob, actor: User, token: string, now: Date, input: TripProcessingResult, retryCount: number): Promise<void> {
    const result = TripProcessingResultSchema.parse(input);
    if (result.status === "chain-confirmed") { await this.finalizer.finalize(actor, job.operationId, token); return; }
    if (result.status === "chain-unknown" || result.status === "submitted" || result.status === "awaiting-wallet-approval" || result.status === "proving" || result.status === "calculated") {
      await this.repository.scheduleStatusCheck(job.operationId, token, new Date(now.getTime() + STATUS_CHECK_DELAY_MS));
      return;
    }
    if (result.error.code === "TEMPORARY_FAILURE" && result.error.retryable && retryCount < RETRY_DELAYS_MS.length) {
      await this.repository.scheduleRetry(job.operationId, token, retryCount, new Date(now.getTime() + RETRY_DELAYS_MS[retryCount]));
      return;
    }
    // non-retryable 또는 소진된 오류는 예약만 제거한다. C가 안전 종료를 확인할 때까지 pending Scope를 임의로 풀지 않는다.
    await this.repository.recordFailure(job.operationId, token, result.error.code, result.error.retryable);
    if (!result.error.retryable) await this.finalizer.abandonJob(actor, job.operationId);
  }
}
