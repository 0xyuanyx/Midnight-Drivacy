import { createHash, randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import {
  CalculateTripRequestSchema, ConfirmedStateSchema, RegisteredRuleSchema,
  TripProcessingResultSchema, canFinalizeState,
  type CalculateTripRequest, type ConfirmedState, type RegisteredRule,
  type Scope, type TripProcessingResult, type User,
} from "@drivacy/shared";

export interface TrustedChainReader {
  getTripStatus(operationId: string): Promise<TripProcessingResult>;
  canAbandonTrip(operationId: string): Promise<boolean>;
}
// 원본 위치는 서버 내부 참조다. 실제 Supabase Storage 구현/권한은 이 포트를 구현한다.
export interface PrivateTripSource {
  load(sourceKey: string): Promise<CalculateTripRequest>;
  delete(sourceKey: string): Promise<void>;
}
export class FinalizationBlocked extends Error {}
const scopeKey = (scope: Scope) => createHash("sha256").update(JSON.stringify(scope)).digest("hex");
interface JobRow {
  operation_id: string; scope_key: string; trip_id: string; previous_commitment: string;
  source_key: string; status: "pending" | "db-confirmed" | "abandoned";
  request_hash: string;
  claim_token: string | null; claim_valid: boolean; confirmed_result: TripProcessingResult | null;
  deletion_status: "pending" | "deleted";
}
interface StateRow { confirmed_state: ConfirmedState; registered_rule: RegisteredRule; state_commitment: string }

/** 인증 middleware가 검증한 User만 전달하는 내부 B worker 서비스. 임의 HTTP body를 연결하지 않는다. */
export class ChainFinalizer {
  constructor(private readonly pool: Pool, private readonly chain: TrustedChainReader,
    private readonly source: PrivateTripSource) {}
  private async transaction<T>(run: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try { await client.query("BEGIN"); const result = await run(client); await client.query("COMMIT"); return result; }
    catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  }
  private async owned(client: PoolClient, actor: User, scope: Scope): Promise<void> {
    if (actor.role !== "DRIVER" || actor.id !== scope.applicantId) throw new FinalizationBlocked("NOT_AUTHORIZED");
    // 객체 권한을 SQL 조건에서 확인한다. 다른 계약의 특약이나 미선택 특약도 거부한다.
    const result = await client.query(
      `SELECT c.id FROM public.insurance_contracts c
       JOIN public.special_contracts s ON s.insurance_contract_id = c.id
       JOIN public.special_contract_selections x ON x.insurance_contract_id = c.id AND x.special_contract_id = s.id
       WHERE c.id = $1 AND c.owner_user_id = $2 AND c.insurer_id = $3 AND s.id = $4 AND s.is_eligible = true`,
      [scope.contractId, actor.id, scope.insurerId, scope.endorsementId]);
    if (result.rowCount !== 1) throw new FinalizationBlocked("NOT_AUTHORIZED");
  }
  /** Rule 승인/계약 binding은 B의 신뢰된 등록 경로에서 전달한다. 스키마의 approved 문자열은 승인 증거가 아니다. */
  async registerInitial(actor: User, registeredInput: RegisteredRule, confirmedInput: ConfirmedState): Promise<void> {
    const registered = RegisteredRuleSchema.parse(registeredInput);
    const confirmed = ConfirmedStateSchema.parse(confirmedInput);
    const s = confirmed.state, c = confirmed.confirmation;
    if (c.execution !== "live" || registered.network !== c.network || registered.adapterProfile !== c.adapterProfile
      || registered.chainContractAddress !== c.chainContractAddress || registered.ruleHash !== s.rule.ruleHash
      || registered.rule.id !== s.rule.id || registered.rule.version !== s.rule.version
      || registered.rule.insurerId !== s.scope.insurerId || registered.rule.endorsementId !== s.scope.endorsementId
      || s.version !== 0) throw new FinalizationBlocked("INITIAL_BINDING_MISMATCH");
    await this.transaction(async client => {
      await this.owned(client, actor, s.scope);
      const inserted = await client.query(
        `INSERT INTO public.chain_states(scope_key,owner_user_id,insurance_contract_id,special_contract_id,
           registered_rule,confirmed_state,state_commitment,version) VALUES($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT(scope_key) DO NOTHING RETURNING scope_key`,
        [scopeKey(s.scope), actor.id, s.scope.contractId, s.scope.endorsementId, registered, confirmed, s.stateCommitment, s.version]);
      if (inserted.rowCount !== 1) throw new FinalizationBlocked("STATE_ALREADY_REGISTERED");
    });
  }
  async createJob(actor: User, input: CalculateTripRequest, sourceKey: string): Promise<void> {
    const request = CalculateTripRequestSchema.parse(input);
    if (request.execution !== "live" || !sourceKey) throw new FinalizationBlocked("LIVE_INPUT_REQUIRED");
    await this.transaction(async client => {
      await this.owned(client, actor, request.scope);
      const requestHash = createHash("sha256").update(JSON.stringify(request)).digest("hex");
      const existing = await client.query<JobRow>("SELECT * FROM public.chain_jobs WHERE operation_id=$1", [request.operationId]);
      if (existing.rows[0]) {
        const job = existing.rows[0];
        if (job.scope_key !== scopeKey(request.scope) || job.request_hash !== requestHash || job.source_key !== sourceKey) {
          throw new FinalizationBlocked("IDEMPOTENCY_CONFLICT");
        }
        if (job.status === "abandoned") throw new FinalizationBlocked("JOB_ABANDONED");
        return;
      }
      const state = await client.query<StateRow>("SELECT * FROM public.chain_states WHERE scope_key=$1 FOR UPDATE", [scopeKey(request.scope)]);
      const current = state.rows[0];
      if (!current || current.state_commitment !== request.previous.state.stateCommitment
        || JSON.stringify(RegisteredRuleSchema.parse(current.registered_rule)) !== JSON.stringify(request.approvedRule)) {
        throw new FinalizationBlocked("STALE_OR_UNREGISTERED_STATE");
      }
      await client.query(`INSERT INTO public.chain_jobs(operation_id,scope_key,idempotency_key,trip_id,previous_commitment,source_key,request_hash)
        VALUES($1,$2,$3,$4,$5,$6,$7)`, [request.operationId, scopeKey(request.scope), request.idempotencyKey,
        request.trip.id, request.previous.state.stateCommitment, sourceKey, requestHash]);
    }).catch(error => {
      // 동일 scope의 진행 중 작업은 예상 가능한 업무 상태다. SQL 오류를 API 오류처럼 노출하지 않는다.
      if (error?.code === "23505") throw new FinalizationBlocked(
        error.constraint === "chain_jobs_one_pending_scope" ? "SCOPE_BUSY" : "IDEMPOTENCY_CONFLICT");
      throw error;
    });
  }
  async claim(actor: User, operationId: string): Promise<string> {
    if (actor.role !== "DRIVER") throw new FinalizationBlocked("NOT_AUTHORIZED");
    const token = randomUUID();
    const result = await this.pool.query(`UPDATE public.chain_jobs j SET claim_token=$1,
      claim_expires_at=clock_timestamp()+interval '5 minutes' FROM public.chain_states s
      WHERE j.operation_id=$2 AND j.scope_key=s.scope_key AND s.owner_user_id=$3
        AND j.status='pending' AND (j.claim_expires_at IS NULL OR j.claim_expires_at<=clock_timestamp())
      RETURNING j.operation_id`, [token, operationId, actor.id]);
    if (result.rowCount !== 1) throw new FinalizationBlocked("CLAIM_UNAVAILABLE");
    return token;
  }
  async finalize(actor: User, operationId: string, token: string): Promise<TripProcessingResult | undefined> {
    // C 조회는 DB 트랜잭션 밖에서 짧게 실행한다. 월렛 승인을 DB row lock으로 기다리지 않는다.
    const lookup = await this.pool.query<JobRow>(`SELECT j.* FROM public.chain_jobs j JOIN public.chain_states s
      ON s.scope_key=j.scope_key WHERE j.operation_id=$1 AND s.owner_user_id=$2`, [operationId, actor.id]);
    const initialJob = lookup.rows[0];
    if (actor.role !== "DRIVER" || !initialJob) throw new FinalizationBlocked("NOT_AUTHORIZED");
    if (initialJob.status === "db-confirmed") return TripProcessingResultSchema.parse(initialJob.confirmed_result);
    if (initialJob.status !== "pending") throw new FinalizationBlocked("JOB_NOT_PENDING");
    const result = TripProcessingResultSchema.parse(await this.chain.getTripStatus(operationId));
    if (result.status !== "chain-confirmed") return undefined;
    const request = CalculateTripRequestSchema.parse(await this.source.load(initialJob.source_key));
    if (!canFinalizeState(result, request) || request.operationId !== operationId || request.trip.id !== initialJob.trip_id
      || createHash("sha256").update(JSON.stringify(request)).digest("hex") !== initialJob.request_hash
      || request.previous.state.stateCommitment !== initialJob.previous_commitment
      || scopeKey(request.scope) !== initialJob.scope_key) throw new FinalizationBlocked("CONFIRMATION_MISMATCH");
    return this.transaction(async client => {
      await this.owned(client, actor, request.scope);
      const jobs = await client.query<JobRow>(`SELECT *, claim_expires_at>clock_timestamp() AS claim_valid
        FROM public.chain_jobs WHERE operation_id=$1 FOR UPDATE`, [operationId]);
      const job = jobs.rows[0]!;
      if (job.status === "db-confirmed") return TripProcessingResultSchema.parse(job.confirmed_result);
      if (job.status !== "pending") throw new FinalizationBlocked("JOB_NOT_PENDING");
      if (job.claim_token !== token || !job.claim_valid) throw new FinalizationBlocked("STALE_CLAIM");
      const state = await client.query<StateRow>("SELECT * FROM public.chain_states WHERE scope_key=$1 FOR UPDATE", [job.scope_key]);
      const current = state.rows[0]!;
      if (JSON.stringify(RegisteredRuleSchema.parse(current.registered_rule)) !== JSON.stringify(request.approvedRule)) {
        throw new FinalizationBlocked("REGISTERED_RULE_MISMATCH");
      }
      const confirmed: ConfirmedState = { kind: "confirmed", state: result.candidate.state, confirmation: result.confirmation };
      const update = await client.query(`UPDATE public.chain_states SET confirmed_state=$1,state_commitment=$2,version=$3
        WHERE scope_key=$4 AND state_commitment=$5 AND version=$6 RETURNING scope_key`,
        [confirmed, result.candidate.state.stateCommitment, result.candidate.state.version,
          job.scope_key, job.previous_commitment, request.previous.state.version]);
      if (update.rowCount !== 1) throw new FinalizationBlocked("STALE_DB_STATE");
      await client.query("UPDATE public.chain_jobs SET status='db-confirmed',confirmed_result=$1 WHERE operation_id=$2", [result, operationId]);
      // 삭제를 같은 DB 트랜잭션에서 호출하지 않는다. 외부 Storage 실패는 DB 확정을 되돌리지 않는다.
      return result;
    });
  }
  async abandonJob(actor: User, operationId: string): Promise<void> {
    if (actor.role !== "DRIVER") throw new FinalizationBlocked("NOT_AUTHORIZED");
    const lookup = await this.pool.query<JobRow & StateRow>(`SELECT j.*,s.confirmed_state FROM public.chain_jobs j
      JOIN public.chain_states s ON s.scope_key=j.scope_key WHERE j.operation_id=$1 AND s.owner_user_id=$2`, [operationId, actor.id]);
    const initial = lookup.rows[0];
    if (!initial) throw new FinalizationBlocked("NOT_AUTHORIZED");
    if (initial.status === "abandoned") return;
    const result = TripProcessingResultSchema.parse(await this.chain.getTripStatus(operationId).catch(() => {
      throw new FinalizationBlocked("CHAIN_STATUS_UNAVAILABLE");
    }));
    const safe = result.status === "failed" && !result.error.retryable
      && await this.chain.canAbandonTrip(operationId).catch(() => { throw new FinalizationBlocked("CHAIN_STATUS_UNAVAILABLE"); });
    if (!safe) {
      throw new FinalizationBlocked("ABANDONMENT_NOT_SAFE");
    }
    await this.transaction(async client => {
      await this.owned(client, actor, ConfirmedStateSchema.parse(initial.confirmed_state).state.scope);
      const jobs = await client.query<JobRow>("SELECT * FROM public.chain_jobs WHERE operation_id=$1 FOR UPDATE", [operationId]);
      if (jobs.rows[0]?.status === "abandoned") return;
      if (jobs.rows[0]?.status !== "pending") throw new FinalizationBlocked("JOB_NOT_PENDING");
      // 미제출 terminal 작업만 pending 제약에서 해제한다. 미확정 원본은 실패 보관 정책에 맡긴다.
      await client.query("UPDATE public.chain_jobs SET status='abandoned',claim_token=NULL,claim_expires_at=NULL WHERE operation_id=$1", [operationId]);
    });
  }
  async deleteConfirmedSource(actor: User, operationId: string): Promise<void> {
    const rows = await this.pool.query<JobRow>(`SELECT j.* FROM public.chain_jobs j JOIN public.chain_states s
      ON s.scope_key=j.scope_key WHERE j.operation_id=$1 AND s.owner_user_id=$2`, [operationId, actor.id]);
    const job = rows.rows[0];
    if (actor.role !== "DRIVER" || !job || job.status !== "db-confirmed") throw new FinalizationBlocked("DB_NOT_CONFIRMED");
    if (job.deletion_status === "deleted") return;
    // delete 포트는 같은 sourceKey 반복 삭제에 성공해야 한다. 외부 삭제 후 DB 기록 실패도 복구한다.
    await this.source.delete(job.source_key);
    await this.pool.query("UPDATE public.chain_jobs SET deletion_status='deleted' WHERE operation_id=$1 AND status='db-confirmed'", [operationId]);
  }
}
