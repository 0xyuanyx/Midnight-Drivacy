import type { Pool } from "pg";

export interface DiscountApplicationRow {
  id: string; ownerUserId: string; insuranceContractId: string; specialContractId: string;
  evaluationScopeId: string; ruleVersionId: string; stateCommitment: string; stateVersion: string;
  ruleHash: string; evaluationOperationId: string; resultCommitment: string | null; nullifier: string | null;
  verificationStatus: "PENDING" | "VERIFIED" | "FAILED";
  reviewStatus: "PENDING_REVIEW" | "APPLIED" | "REJECTED";
  score: number; distanceM: string; conditionsMet: boolean; expectedDiscountBps: number;
  appliedDiscountBps: number | null; network: "local" | "preprod"; adapterProfile: string;
  chainContractAddress: string; transactionId: string | null;
  submittedAt: Date | string; verifiedAt: Date | string | null; decidedAt: Date | string | null;
  specialContractName?: string; evaluationStartsOn?: string; evaluationEndsOn?: string;
  confirmedState?: unknown; registeredRule?: unknown;
  ruleId?: string; ruleVersion?: string;
}

export interface VerifiedEvaluation {
  resultCommitment: string; nullifier: string; transactionId: string;
}

export interface ClaimedEvaluationApplication { row: DiscountApplicationRow; claimToken: string }

export interface DiscountApplicationRepository {
  reserve(ownerUserId: string, contractId: string, specialContractId: string, operationId: string,
    network: string, adapterProfile: string): Promise<{ row: DiscountApplicationRow; created: boolean } | undefined>;
  markVerified(id: string, value: VerifiedEvaluation): Promise<DiscountApplicationRow | undefined>;
  markFailed(id: string): Promise<DiscountApplicationRow | undefined>;
  listOwned(ownerUserId: string): Promise<DiscountApplicationRow[]>;
  findOwned(id: string, ownerUserId: string): Promise<DiscountApplicationRow | undefined>;
  listForInsurer(userId: string): Promise<DiscountApplicationRow[]>;
  findForInsurer(id: string, userId: string): Promise<DiscountApplicationRow | undefined>;
  decide(id: string, userId: string, decision: "APPLIED" | "REJECTED"): Promise<DiscountApplicationRow | undefined>;
  claimDue(now: Date, limit: number, claimToken: string): Promise<ClaimedEvaluationApplication[]>;
  scheduleStatusCheck(id: string, claimToken: string, at: Date, errorCode?: string): Promise<boolean>;
}

const projection = `a.id,a.owner_user_id AS "ownerUserId",a.insurance_contract_id AS "insuranceContractId",
  a.special_contract_id AS "specialContractId",a.evaluation_scope_id AS "evaluationScopeId",
  a.rule_version_id AS "ruleVersionId",a.state_commitment AS "stateCommitment",a.state_version AS "stateVersion",
  a.rule_hash AS "ruleHash",a.evaluation_operation_id AS "evaluationOperationId",
  a.result_commitment AS "resultCommitment",a.nullifier,a.verification_status AS "verificationStatus",
  a.review_status AS "reviewStatus",a.score,a.distance_m AS "distanceM",a.conditions_met AS "conditionsMet",
  a.expected_discount_bps AS "expectedDiscountBps",a.applied_discount_bps AS "appliedDiscountBps",
  a.network,a.adapter_profile AS "adapterProfile",a.chain_contract_address AS "chainContractAddress",
  a.transaction_id AS "transactionId",a.submitted_at AS "submittedAt",a.verified_at AS "verifiedAt",
  a.decided_at AS "decidedAt",sc.name AS "specialContractName",
  es.evaluation_starts_on::text AS "evaluationStartsOn",es.evaluation_ends_on::text AS "evaluationEndsOn"`;

const normalize = (raw: Record<string, unknown>): DiscountApplicationRow => ({
  id: raw.id as string, ownerUserId: (raw.ownerUserId ?? raw.owner_user_id) as string,
  insuranceContractId: (raw.insuranceContractId ?? raw.insurance_contract_id) as string,
  specialContractId: (raw.specialContractId ?? raw.special_contract_id) as string,
  evaluationScopeId: (raw.evaluationScopeId ?? raw.evaluation_scope_id) as string,
  ruleVersionId: (raw.ruleVersionId ?? raw.rule_version_id) as string,
  stateCommitment: (raw.stateCommitment ?? raw.state_commitment) as string,
  stateVersion: String(raw.stateVersion ?? raw.state_version), ruleHash: (raw.ruleHash ?? raw.rule_hash) as string,
  evaluationOperationId: (raw.evaluationOperationId ?? raw.evaluation_operation_id) as string,
  resultCommitment: (raw.resultCommitment ?? raw.result_commitment ?? null) as string | null,
  nullifier: (raw.nullifier ?? null) as string | null,
  verificationStatus: (raw.verificationStatus ?? raw.verification_status) as DiscountApplicationRow["verificationStatus"],
  reviewStatus: (raw.reviewStatus ?? raw.review_status) as DiscountApplicationRow["reviewStatus"],
  score: raw.score as number, distanceM: String(raw.distanceM ?? raw.distance_m),
  conditionsMet: (raw.conditionsMet ?? raw.conditions_met) as boolean,
  expectedDiscountBps: (raw.expectedDiscountBps ?? raw.expected_discount_bps) as number,
  appliedDiscountBps: (raw.appliedDiscountBps ?? raw.applied_discount_bps ?? null) as number | null,
  network: raw.network as DiscountApplicationRow["network"], adapterProfile: (raw.adapterProfile ?? raw.adapter_profile) as string,
  chainContractAddress: (raw.chainContractAddress ?? raw.chain_contract_address) as string,
  transactionId: (raw.transactionId ?? raw.transaction_id ?? null) as string | null,
  submittedAt: (raw.submittedAt ?? raw.submitted_at) as Date | string,
  verifiedAt: (raw.verifiedAt ?? raw.verified_at ?? null) as Date | string | null,
  decidedAt: (raw.decidedAt ?? raw.decided_at ?? null) as Date | string | null,
  specialContractName: raw.specialContractName as string | undefined,
  evaluationStartsOn: raw.evaluationStartsOn as string | undefined,
  evaluationEndsOn: raw.evaluationEndsOn as string | undefined,
  confirmedState: raw.confirmedState, registeredRule: raw.registeredRule,
  ruleId: raw.ruleId as string | undefined, ruleVersion: raw.ruleVersion === undefined ? undefined : String(raw.ruleVersion),
});

export class PgDiscountApplicationRepository implements DiscountApplicationRepository {
  public constructor(private readonly pool: Pool) {}

  public async reserve(ownerUserId: string, contractId: string, specialContractId: string, operationId: string,
    network: string, adapterProfile: string): Promise<{ row: DiscountApplicationRow; created: boolean } | undefined> {
    const result = await this.pool.query<DiscountApplicationRow & { created: boolean }>(`WITH target AS (
      SELECT es.id AS evaluation_scope_id,es.owner_user_id,es.insurance_contract_id,es.special_contract_id,
        d.current_rule_version_id AS rule_version_id,cs.state_commitment,cs.version AS state_version,
        rr.rule_hash,r.id AS rule_id,rv.version AS rule_version,cs.confirmed_state,cs.registered_rule,
        (cs.confirmed_state #>> '{state,score}')::integer AS score,
        (cs.confirmed_state #>> '{state,totals,distanceM}')::bigint AS distance_m,
        (cs.confirmed_state #>> '{state,conditionsMet}')::boolean AS conditions_met,
        (cs.confirmed_state #>> '{state,expectedDiscountBps}')::integer AS expected_discount_bps,
        d.network,d.adapter_profile,d.chain_contract_address
      FROM public.evaluation_scopes es
      JOIN public.insurance_contracts c ON c.id=es.insurance_contract_id AND c.owner_user_id=es.owner_user_id
      JOIN public.special_contract_selections sel ON sel.insurance_contract_id=c.id AND sel.special_contract_id=es.special_contract_id
      JOIN public.chain_scope_deployments d ON d.evaluation_scope_id=es.id AND d.network=$5 AND d.adapter_profile=$6
      JOIN public.rule_registrations rr ON rr.chain_scope_deployment_id=d.id AND rr.rule_version_id=d.current_rule_version_id
      JOIN public.rule_versions rv ON rv.id=d.current_rule_version_id
      JOIN public.rules r ON r.id=rv.rule_id AND r.special_contract_id=es.special_contract_id
      JOIN public.chain_states cs ON cs.owner_user_id=es.owner_user_id AND cs.insurance_contract_id=es.insurance_contract_id
        AND cs.special_contract_id=es.special_contract_id AND cs.state_commitment=cs.confirmed_state #>> '{state,stateCommitment}'
        AND cs.registered_rule->>'ruleHash'=rr.rule_hash
      WHERE es.owner_user_id=$1 AND es.insurance_contract_id=$2 AND es.special_contract_id=$3
        AND d.network IN ('local','preprod') AND cs.version>0
    ), inserted AS (
      INSERT INTO public.discount_applications(owner_user_id,insurance_contract_id,special_contract_id,evaluation_scope_id,
        rule_version_id,state_commitment,state_version,rule_hash,evaluation_operation_id,score,distance_m,conditions_met,
        expected_discount_bps,network,adapter_profile,chain_contract_address)
      SELECT owner_user_id,insurance_contract_id,special_contract_id,evaluation_scope_id,rule_version_id,state_commitment,
        state_version,rule_hash,$4,score,distance_m,conditions_met,expected_discount_bps,network,adapter_profile,chain_contract_address
      FROM target
      -- 애플리케이션 선조회만으로는 병렬 요청을 막을 수 없으므로 DB UNIQUE 충돌을 원자적 no-op UPDATE로 수렴시킨다.
      ON CONFLICT(evaluation_scope_id,state_commitment) DO UPDATE SET state_commitment=EXCLUDED.state_commitment
      RETURNING *,evaluation_operation_id=$4 AS created
    ) SELECT i.*,t.confirmed_state AS "confirmedState",t.registered_rule AS "registeredRule",
        t.rule_id AS "ruleId",t.rule_version AS "ruleVersion",i.created
      FROM inserted i JOIN target t ON t.evaluation_scope_id=i.evaluation_scope_id`,
    [ownerUserId, contractId, specialContractId, operationId, network, adapterProfile]);
    const raw = result.rows[0] as unknown as Record<string, unknown> | undefined;
    return raw ? { row: normalize(raw), created: raw.created as boolean } : undefined;
  }

  public async markVerified(id: string, value: VerifiedEvaluation): Promise<DiscountApplicationRow | undefined> {
    const result = await this.pool.query<DiscountApplicationRow>(`UPDATE public.discount_applications SET
      verification_status='VERIFIED',result_commitment=$2,nullifier=$3,transaction_id=$4,verified_at=clock_timestamp(),
      recovery_claim_token=NULL,recovery_claim_expires_at=NULL,next_status_check_at=NULL,last_recovery_error_code=NULL
      WHERE id=$1 AND verification_status='PENDING' RETURNING *`, [id, value.resultCommitment, value.nullifier, value.transactionId]);
    return result.rows[0] ? normalize(result.rows[0] as unknown as Record<string, unknown>) : undefined;
  }
  public async markFailed(id: string): Promise<DiscountApplicationRow | undefined> {
    const result = await this.pool.query<DiscountApplicationRow>(`UPDATE public.discount_applications SET
      verification_status='FAILED',verified_at=clock_timestamp(),recovery_claim_token=NULL,recovery_claim_expires_at=NULL,
      next_status_check_at=NULL,last_recovery_error_code=NULL
      WHERE id=$1 AND verification_status='PENDING' RETURNING *`, [id]);
    return result.rows[0] ? normalize(result.rows[0] as unknown as Record<string, unknown>) : undefined;
  }
  private async rows(sql: string, values: unknown[]): Promise<DiscountApplicationRow[]> {
    return (await this.pool.query<DiscountApplicationRow>(sql, values)).rows;
  }
  public listOwned(ownerUserId: string): Promise<DiscountApplicationRow[]> { return this.rows(
    `SELECT ${projection} FROM public.discount_applications a JOIN public.special_contracts sc ON sc.id=a.special_contract_id
     JOIN public.evaluation_scopes es ON es.id=a.evaluation_scope_id WHERE a.owner_user_id=$1 ORDER BY a.submitted_at DESC`, [ownerUserId]); }
  public async findOwned(id: string, ownerUserId: string): Promise<DiscountApplicationRow | undefined> { return (await this.rows(
    `SELECT ${projection} FROM public.discount_applications a JOIN public.special_contracts sc ON sc.id=a.special_contract_id
     JOIN public.evaluation_scopes es ON es.id=a.evaluation_scope_id WHERE a.id=$1 AND a.owner_user_id=$2`, [id, ownerUserId]))[0]; }
  public listForInsurer(userId: string): Promise<DiscountApplicationRow[]> { return this.rows(
    `SELECT ${projection} FROM public.discount_applications a JOIN public.insurance_contracts c ON c.id=a.insurance_contract_id
     JOIN public.insurer_memberships m ON m.insurer_id=c.insurer_id AND m.user_id=$1
     JOIN public.special_contracts sc ON sc.id=a.special_contract_id JOIN public.evaluation_scopes es ON es.id=a.evaluation_scope_id
     ORDER BY a.submitted_at DESC`, [userId]); }
  public async findForInsurer(id: string, userId: string): Promise<DiscountApplicationRow | undefined> { return (await this.rows(
    `SELECT ${projection} FROM public.discount_applications a JOIN public.insurance_contracts c ON c.id=a.insurance_contract_id
     JOIN public.insurer_memberships m ON m.insurer_id=c.insurer_id AND m.user_id=$2
     JOIN public.special_contracts sc ON sc.id=a.special_contract_id JOIN public.evaluation_scopes es ON es.id=a.evaluation_scope_id
     WHERE a.id=$1`, [id, userId]))[0]; }
  public async decide(id: string, userId: string, decision: "APPLIED" | "REJECTED"): Promise<DiscountApplicationRow | undefined> {
    const result = await this.pool.query<DiscountApplicationRow>(`UPDATE public.discount_applications a SET review_status=$3,
      applied_discount_bps=CASE WHEN $3='APPLIED' THEN a.expected_discount_bps ELSE NULL END,decided_at=clock_timestamp()
      FROM public.insurance_contracts c,public.insurer_memberships m
      WHERE a.id=$1 AND c.id=a.insurance_contract_id AND m.insurer_id=c.insurer_id AND m.user_id=$2
        AND a.verification_status='VERIFIED' AND a.review_status='PENDING_REVIEW' RETURNING a.*`, [id, userId, decision]);
    return result.rows[0] ? normalize(result.rows[0] as unknown as Record<string, unknown>) : undefined;
  }

  public async claimDue(now: Date, limit: number, claimToken: string): Promise<ClaimedEvaluationApplication[]> {
    const result = await this.pool.query(`WITH due AS (
      SELECT id FROM public.discount_applications
      WHERE verification_status='PENDING' AND review_status='PENDING_REVIEW'
        AND evaluation_operation_id IS NOT NULL AND COALESCE(next_status_check_at,submitted_at)<=$1
        AND (recovery_claim_expires_at IS NULL OR recovery_claim_expires_at<=clock_timestamp())
      ORDER BY COALESCE(next_status_check_at,submitted_at) ASC
      FOR UPDATE SKIP LOCKED LIMIT $2
    ) UPDATE public.discount_applications a SET recovery_claim_token=$3,
      recovery_claim_expires_at=clock_timestamp()+interval '5 minutes',last_status_check_at=clock_timestamp()
      FROM due,public.rule_versions rv,public.rules r
      WHERE a.id=due.id AND rv.id=a.rule_version_id AND r.id=rv.rule_id
      RETURNING a.*,r.id AS "ruleId",rv.version AS "ruleVersion"`, [now, limit, claimToken]);
    // DB row lock과 조건부 claim을 한 문장에 묶어 여러 인스턴스가 같은 신청을 동시에 복구하지 못하게 한다.
    return result.rows.map((raw: Record<string, unknown>) => ({ row: normalize(raw), claimToken }));
  }

  public async scheduleStatusCheck(id: string, claimToken: string, at: Date, errorCode?: string): Promise<boolean> {
    const result = await this.pool.query(`UPDATE public.discount_applications SET next_status_check_at=$3,
      last_recovery_error_code=$4,recovery_claim_token=NULL,recovery_claim_expires_at=NULL
      WHERE id=$1 AND verification_status='PENDING' AND review_status='PENDING_REVIEW'
        AND recovery_claim_token=$2 AND recovery_claim_expires_at>clock_timestamp()`,
    [id, claimToken, at, errorCode ?? null]);
    return result.rowCount === 1;
  }
}
