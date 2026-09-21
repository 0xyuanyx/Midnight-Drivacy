import { randomUUID } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import type { Pool, PoolClient } from "pg";
import type { AdapterRuntime, ConfirmedState, RegisteredRule, Scope, User } from "@drivacy/shared";
import { chainScopeKey } from "../chain-state/scope-key.js";

export interface RegistrationTargetRow {
  ownerUserId: string; insuranceContractId: string; insurerId: string; specialContractId: string;
  selectedAt: Date | string | null; coverageEndsAt: Date | string;
  ruleId: string; ruleVersionId: string; version: string; status: "DRAFT" | "APPROVED"; ruleDefinition: unknown;
}
export interface EvaluationScopeRow { id: string; ownerUserId: string; insuranceContractId: string; specialContractId: string; evaluationPeriodId: string; evaluationStartsOn: string; evaluationEndsOn: string; }
export interface ChainScopeDeploymentRow { id: string; evaluationScopeId: string; adapterProfile: string; network: "fixture" | "local" | "preprod"; chainContractAddress: string; deploymentTransactionId: string; currentRuleVersionId: string | null; currentRuleVersion: string | null; }
export interface RuleRegistrationRow { id: string; chainScopeDeploymentId: string; ruleVersionId: string; ruleHash: string; registrationTransactionId: string; }
export interface InitialRegistrationAttempt { operationId: string; ruleVersionId: string; created: boolean; }
export interface RuleRegistrationRepository {
  findTarget(actorId: string, actorRole: User["role"], specialContractId: string, version: number): Promise<RegistrationTargetRow | undefined>;
  findScope(ownerUserId: string, insuranceContractId: string, specialContractId: string): Promise<EvaluationScopeRow | undefined>;
  createScope(scope: Omit<EvaluationScopeRow, "id">): Promise<EvaluationScopeRow>;
  findDeployment(scopeId: string, runtime: AdapterRuntime): Promise<ChainScopeDeploymentRow | undefined>;
  findRegistration(deploymentId: string, ruleVersionId: string): Promise<RuleRegistrationRow | undefined>;
  findConfirmedState(scope: Scope): Promise<ConfirmedState | undefined>;
  reserveInitialAttempt(scopeId: string, ruleVersionId: string, runtime: AdapterRuntime): Promise<InitialRegistrationAttempt>;
  withRegistrationLock<T>(scopeId: string, runtime: AdapterRuntime, task: () => Promise<T>): Promise<T>;
  createInitialRegistration(operationId: string, deployment: Omit<ChainScopeDeploymentRow, "id" | "currentRuleVersionId" | "currentRuleVersion">, registration: Omit<RuleRegistrationRow, "id" | "chainScopeDeploymentId">, registeredRule: RegisteredRule, confirmedGenesis: ConfirmedState): Promise<void>;
  createRegistrationAndSetCurrent(registration: Omit<RuleRegistrationRow, "id">): Promise<RuleRegistrationRow>;
}

export class PgRuleRegistrationRepository implements RuleRegistrationRepository {
  public constructor(private readonly pool: Pool) {}
  private readonly lockClient = new AsyncLocalStorage<PoolClient>();
  private connection(): Pool | PoolClient { return this.lockClient.getStore() ?? this.pool; }
  private async transaction<T>(task: (client: PoolClient) => Promise<T>): Promise<T> {
    const held=this.lockClient.getStore(),client=held??await this.pool.connect();
    try { await client.query("BEGIN");const result=await task(client);await client.query("COMMIT");return result; }
    catch(error){await client.query("ROLLBACK");throw error;}
    finally { if(!held)client.release(); }
  }
  public async findTarget(user: string, role: User["role"], special: string, version: number): Promise<RegistrationTargetRow | undefined> {
    // 최초 등록은 계약 소유자, 후속 갱신은 보험사 소속만 조회한다. 역할 문자열만으로 객체 접근을 허용하지 않는다.
    const r = await this.connection().query<RegistrationTargetRow>(`SELECT c.owner_user_id AS "ownerUserId", c.id AS "insuranceContractId", c.insurer_id AS "insurerId", s.id AS "specialContractId", sel.selected_at AS "selectedAt", c.coverage_ends_at AS "coverageEndsAt", rules.id AS "ruleId", rv.id AS "ruleVersionId", rv.version, rv.status, rv.rule_definition AS "ruleDefinition" FROM public.special_contracts s JOIN public.insurance_contracts c ON c.id=s.insurance_contract_id JOIN public.rules rules ON rules.special_contract_id=s.id JOIN public.rule_versions rv ON rv.rule_id=rules.id AND rv.version=$4 LEFT JOIN public.special_contract_selections sel ON sel.insurance_contract_id=c.id AND sel.special_contract_id=s.id WHERE s.id=$3 AND (($2='DRIVER' AND c.owner_user_id=$1) OR ($2='INSURER' AND EXISTS (SELECT 1 FROM public.insurer_memberships m WHERE m.insurer_id=c.insurer_id AND m.user_id=$1)))`, [user, role, special, version]);
    return r.rows[0];
  }
  public async findScope(owner: string, contract: string, special: string): Promise<EvaluationScopeRow | undefined> {
    const r = await this.connection().query<EvaluationScopeRow>(`SELECT id,owner_user_id AS "ownerUserId",insurance_contract_id AS "insuranceContractId",special_contract_id AS "specialContractId",evaluation_period_id AS "evaluationPeriodId",evaluation_starts_on::text AS "evaluationStartsOn",evaluation_ends_on::text AS "evaluationEndsOn" FROM public.evaluation_scopes WHERE owner_user_id=$1 AND insurance_contract_id=$2 AND special_contract_id=$3`, [owner, contract, special]); return r.rows[0];
  }
  public async createScope(scope: Omit<EvaluationScopeRow, "id">): Promise<EvaluationScopeRow> {
    const r = await this.connection().query<EvaluationScopeRow>(`INSERT INTO public.evaluation_scopes(owner_user_id,insurance_contract_id,special_contract_id,evaluation_period_id,evaluation_starts_on,evaluation_ends_on) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(owner_user_id,insurance_contract_id,special_contract_id) DO NOTHING RETURNING id,owner_user_id AS "ownerUserId",insurance_contract_id AS "insuranceContractId",special_contract_id AS "specialContractId",evaluation_period_id AS "evaluationPeriodId",evaluation_starts_on::text AS "evaluationStartsOn",evaluation_ends_on::text AS "evaluationEndsOn"`, [scope.ownerUserId,scope.insuranceContractId,scope.specialContractId,scope.evaluationPeriodId,scope.evaluationStartsOn,scope.evaluationEndsOn]);
    return r.rows[0] ?? await this.findScope(scope.ownerUserId, scope.insuranceContractId, scope.specialContractId) as EvaluationScopeRow;
  }
  public async findDeployment(scopeId: string, runtime: AdapterRuntime): Promise<ChainScopeDeploymentRow | undefined> { const r=await this.connection().query<ChainScopeDeploymentRow>(`SELECT d.id,d.evaluation_scope_id AS "evaluationScopeId",d.adapter_profile AS "adapterProfile",d.network,d.chain_contract_address AS "chainContractAddress",d.deployment_transaction_id AS "deploymentTransactionId",d.current_rule_version_id AS "currentRuleVersionId",rv.version AS "currentRuleVersion" FROM public.chain_scope_deployments d LEFT JOIN public.rule_versions rv ON rv.id=d.current_rule_version_id WHERE d.evaluation_scope_id=$1 AND d.network=$2 AND d.adapter_profile=$3`,[scopeId,runtime.network,runtime.adapterProfile]);return r.rows[0]; }
  public async findRegistration(deploymentId: string, versionId: string): Promise<RuleRegistrationRow | undefined> { const r=await this.connection().query<RuleRegistrationRow>(`SELECT id,chain_scope_deployment_id AS "chainScopeDeploymentId",rule_version_id AS "ruleVersionId",rule_hash AS "ruleHash",registration_transaction_id AS "registrationTransactionId" FROM public.rule_registrations WHERE chain_scope_deployment_id=$1 AND rule_version_id=$2`,[deploymentId,versionId]); return r.rows[0]; }
  public async findConfirmedState(scope: Scope): Promise<ConfirmedState | undefined> { const r=await this.connection().query<{confirmed_state:ConfirmedState}>(
    `SELECT confirmed_state FROM public.chain_states WHERE scope_key=$1`,[chainScopeKey(scope)]);return r.rows[0]?.confirmed_state; }
  public async reserveInitialAttempt(scopeId: string, versionId: string, runtime: AdapterRuntime): Promise<InitialRegistrationAttempt> {
    const operationId=randomUUID();
    const created=await this.connection().query<{operation_id:string;rule_version_id:string}>(`INSERT INTO public.initial_registration_attempts
      (operation_id,evaluation_scope_id,rule_version_id,network,adapter_profile)
      VALUES($1,$2,$3,$4,$5) ON CONFLICT(evaluation_scope_id,network,adapter_profile) DO NOTHING
      RETURNING operation_id,rule_version_id`,[operationId,scopeId,versionId,runtime.network,runtime.adapterProfile]);
    if(created.rows[0])return {operationId:created.rows[0].operation_id,ruleVersionId:created.rows[0].rule_version_id,created:true};
    const existing=await this.connection().query<{operation_id:string;rule_version_id:string}>(`SELECT operation_id,rule_version_id FROM public.initial_registration_attempts
      WHERE evaluation_scope_id=$1 AND network=$2 AND adapter_profile=$3`,[scopeId,runtime.network,runtime.adapterProfile]);
    if(!existing.rows[0])throw new Error("INITIAL_REGISTRATION_ATTEMPT_MISSING");
    return {operationId:existing.rows[0].operation_id,ruleVersionId:existing.rows[0].rule_version_id,created:false};
  }
  public async withRegistrationLock<T>(scopeId: string, runtime: AdapterRuntime, task: () => Promise<T>): Promise<T> {
    const client=await this.pool.connect(),args=[scopeId,runtime.network,runtime.adapterProfile];
    const key="$1::text || ':' || $2::text || ':' || $3::text";
    let locked=false,discard=false,failed=false,failure:unknown,value!:T;
    try {
      // session 잠금 아래 조회·시도 예약·최종 DB 기록이 같은 연결을 쓴다.
      // 예약은 외부 C 호출 전에 autocommit하고, 최종 기록만 별도 트랜잭션이다.
      await client.query(`SELECT pg_advisory_lock(hashtextextended(${key}, 0))`,args);
      locked=true;
      value=await this.lockClient.run(client,task);
    } catch(error) {
      // 획득 응답이 불명이라면 세션에 잠금이 남았을 수 있다. 풀에 돌려주지 않는다.
      if(!locked)discard=true;
      failed=true;failure=error;
    }
    try {
      if(locked){const result=await client.query<{released:boolean}>(
        `SELECT pg_advisory_unlock(hashtextextended(${key}, 0)) AS released`,args);
        if(result.rows[0]?.released!==true)throw new Error("REGISTRATION_LOCK_RELEASE_FAILED");}
    } catch(error){discard=true;if(!failed){failed=true;failure=error;}}
    client.release(discard);
    if(failed)throw failure;
    return value;
  }
  private async insertDeployment(q: Pool | PoolClient, d: Omit<ChainScopeDeploymentRow,"id"|"currentRuleVersionId"|"currentRuleVersion">): Promise<ChainScopeDeploymentRow> { const r=await q.query<ChainScopeDeploymentRow>(`INSERT INTO public.chain_scope_deployments(evaluation_scope_id,adapter_profile,network,chain_contract_address,deployment_transaction_id) VALUES($1,$2,$3,$4,$5) RETURNING id,evaluation_scope_id AS "evaluationScopeId",adapter_profile AS "adapterProfile",network,chain_contract_address AS "chainContractAddress",deployment_transaction_id AS "deploymentTransactionId",current_rule_version_id AS "currentRuleVersionId"`,[d.evaluationScopeId,d.adapterProfile,d.network,d.chainContractAddress,d.deploymentTransactionId]);return r.rows[0]; }
  private async insertRegistration(q: Pool | PoolClient, x: Omit<RuleRegistrationRow,"id">): Promise<RuleRegistrationRow> { const r=await q.query<RuleRegistrationRow>(`INSERT INTO public.rule_registrations(chain_scope_deployment_id,rule_version_id,rule_hash,registration_transaction_id) VALUES($1,$2,$3,$4) RETURNING id,chain_scope_deployment_id AS "chainScopeDeploymentId",rule_version_id AS "ruleVersionId",rule_hash AS "ruleHash",registration_transaction_id AS "registrationTransactionId"`,[x.chainScopeDeploymentId,x.ruleVersionId,x.ruleHash,x.registrationTransactionId]);return r.rows[0]; }
  public async createInitialRegistration(operationId: string, d: Omit<ChainScopeDeploymentRow,"id"|"currentRuleVersionId"|"currentRuleVersion">, x: Omit<RuleRegistrationRow,"id"|"chainScopeDeploymentId">, registered: RegisteredRule, genesis: ConfirmedState): Promise<void> { await this.transaction(async c=>{const deployment=await this.insertDeployment(c,d);await this.insertRegistration(c,{...x,chainScopeDeploymentId:deployment.id});
    // 등록·현재 Rule·Genesis를 한 DB 트랜잭션으로 확정한다. initialize 미확정인
    // 배포를 운행 가능한 현재 Rule로 보이게 하지 않는다.
    await c.query(`INSERT INTO public.chain_states(scope_key,owner_user_id,insurance_contract_id,special_contract_id,
      registered_rule,confirmed_state,state_commitment,version) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
      [chainScopeKey(genesis.state.scope),genesis.state.scope.applicantId,genesis.state.scope.contractId,
        genesis.state.scope.endorsementId,registered,genesis,genesis.state.stateCommitment,genesis.state.version]);
    await c.query(`UPDATE public.chain_scope_deployments SET current_rule_version_id=$2 WHERE id=$1`,[deployment.id,x.ruleVersionId]);
    const completed=await c.query(`UPDATE public.initial_registration_attempts SET status='db-confirmed',confirmed_at=now()
      WHERE operation_id=$1 AND evaluation_scope_id=$2 AND rule_version_id=$3 AND network=$4
        AND adapter_profile=$5 AND status='pending' RETURNING operation_id`,
      [operationId,d.evaluationScopeId,x.ruleVersionId,d.network,d.adapterProfile]);
    if(completed.rowCount!==1)throw new Error("INITIAL_REGISTRATION_ATTEMPT_MISMATCH");
  }); }
  public async createRegistrationAndSetCurrent(x: Omit<RuleRegistrationRow,"id">) { return this.transaction(async c=>{const registration=await this.insertRegistration(c,x);
    // 과거 registration 재조회는 여기로 오지 않으므로 current를 되돌리는 rollback이 발생하지 않는다.
    await c.query(`UPDATE public.chain_scope_deployments SET current_rule_version_id=$2 WHERE id=$1`,[x.chainScopeDeploymentId,x.ruleVersionId]);return registration;}); }
}
