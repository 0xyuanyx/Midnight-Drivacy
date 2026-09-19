import type { Pool, PoolClient } from "pg";
import type { AdapterRuntime } from "@drivacy/shared";

export interface RegistrationTargetRow {
  ownerUserId: string; insuranceContractId: string; insurerId: string; specialContractId: string;
  selectedAt: Date | string | null; coverageEndsAt: Date | string;
  ruleId: string; ruleVersionId: string; version: string; status: "DRAFT" | "APPROVED"; ruleDefinition: unknown;
}
export interface EvaluationScopeRow { id: string; ownerUserId: string; insuranceContractId: string; specialContractId: string; evaluationPeriodId: string; evaluationStartsOn: string; evaluationEndsOn: string; }
export interface ChainScopeDeploymentRow { id: string; evaluationScopeId: string; adapterProfile: string; network: "fixture" | "local" | "preprod"; chainContractAddress: string; deploymentTransactionId: string; }
export interface RuleRegistrationRow { id: string; chainScopeDeploymentId: string; ruleVersionId: string; ruleHash: string; registrationTransactionId: string; }
export interface RuleRegistrationRepository {
  findTarget(insurerUserId: string, specialContractId: string, version: number): Promise<RegistrationTargetRow | undefined>;
  findScope(ownerUserId: string, insuranceContractId: string, specialContractId: string): Promise<EvaluationScopeRow | undefined>;
  createScope(scope: Omit<EvaluationScopeRow, "id">): Promise<EvaluationScopeRow>;
  findDeployment(scopeId: string, runtime: AdapterRuntime): Promise<ChainScopeDeploymentRow | undefined>;
  findRegistration(deploymentId: string, ruleVersionId: string): Promise<RuleRegistrationRow | undefined>;
  withRegistrationLock<T>(scopeId: string, ruleVersionId: string, task: () => Promise<T>): Promise<T>;
  createDeploymentAndRegistration(deployment: Omit<ChainScopeDeploymentRow, "id">, registration: Omit<RuleRegistrationRow, "id" | "chainScopeDeploymentId">): Promise<{ deployment: ChainScopeDeploymentRow; registration: RuleRegistrationRow }>;
  createRegistration(registration: Omit<RuleRegistrationRow, "id">): Promise<RuleRegistrationRow>;
}

export class PgRuleRegistrationRepository implements RuleRegistrationRepository {
  public constructor(private readonly pool: Pool) {}
  public async findTarget(user: string, special: string, version: number): Promise<RegistrationTargetRow | undefined> {
    const r = await this.pool.query<RegistrationTargetRow>(`SELECT c.owner_user_id AS "ownerUserId", c.id AS "insuranceContractId", c.insurer_id AS "insurerId", s.id AS "specialContractId", sel.selected_at AS "selectedAt", c.coverage_ends_at AS "coverageEndsAt", rules.id AS "ruleId", rv.id AS "ruleVersionId", rv.version, rv.status, rv.rule_definition AS "ruleDefinition" FROM public.special_contracts s JOIN public.insurance_contracts c ON c.id=s.insurance_contract_id JOIN public.insurer_memberships m ON m.insurer_id=c.insurer_id AND m.user_id=$1 JOIN public.rules rules ON rules.special_contract_id=s.id JOIN public.rule_versions rv ON rv.rule_id=rules.id AND rv.version=$3 LEFT JOIN public.special_contract_selections sel ON sel.insurance_contract_id=c.id AND sel.special_contract_id=s.id WHERE s.id=$2`, [user, special, version]);
    return r.rows[0];
  }
  public async findScope(owner: string, contract: string, special: string): Promise<EvaluationScopeRow | undefined> {
    const r = await this.pool.query<EvaluationScopeRow>(`SELECT id,owner_user_id AS "ownerUserId",insurance_contract_id AS "insuranceContractId",special_contract_id AS "specialContractId",evaluation_period_id AS "evaluationPeriodId",evaluation_starts_on::text AS "evaluationStartsOn",evaluation_ends_on::text AS "evaluationEndsOn" FROM public.evaluation_scopes WHERE owner_user_id=$1 AND insurance_contract_id=$2 AND special_contract_id=$3`, [owner, contract, special]); return r.rows[0];
  }
  public async createScope(scope: Omit<EvaluationScopeRow, "id">): Promise<EvaluationScopeRow> {
    const r = await this.pool.query<EvaluationScopeRow>(`INSERT INTO public.evaluation_scopes(owner_user_id,insurance_contract_id,special_contract_id,evaluation_period_id,evaluation_starts_on,evaluation_ends_on) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(owner_user_id,insurance_contract_id,special_contract_id) DO NOTHING RETURNING id,owner_user_id AS "ownerUserId",insurance_contract_id AS "insuranceContractId",special_contract_id AS "specialContractId",evaluation_period_id AS "evaluationPeriodId",evaluation_starts_on::text AS "evaluationStartsOn",evaluation_ends_on::text AS "evaluationEndsOn"`, [scope.ownerUserId,scope.insuranceContractId,scope.specialContractId,scope.evaluationPeriodId,scope.evaluationStartsOn,scope.evaluationEndsOn]);
    return r.rows[0] ?? await this.findScope(scope.ownerUserId, scope.insuranceContractId, scope.specialContractId) as EvaluationScopeRow;
  }
  public async findDeployment(scopeId: string, runtime: AdapterRuntime): Promise<ChainScopeDeploymentRow | undefined> { const r=await this.pool.query<ChainScopeDeploymentRow>(`SELECT id,evaluation_scope_id AS "evaluationScopeId",adapter_profile AS "adapterProfile",network,chain_contract_address AS "chainContractAddress",deployment_transaction_id AS "deploymentTransactionId" FROM public.chain_scope_deployments WHERE evaluation_scope_id=$1 AND network=$2 AND adapter_profile=$3`,[scopeId,runtime.network,runtime.adapterProfile]);return r.rows[0]; }
  public async findRegistration(deploymentId: string, versionId: string): Promise<RuleRegistrationRow | undefined> { const r=await this.pool.query<RuleRegistrationRow>(`SELECT id,chain_scope_deployment_id AS "chainScopeDeploymentId",rule_version_id AS "ruleVersionId",rule_hash AS "ruleHash",registration_transaction_id AS "registrationTransactionId" FROM public.rule_registrations WHERE chain_scope_deployment_id=$1 AND rule_version_id=$2`,[deploymentId,versionId]); return r.rows[0]; }
  public async withRegistrationLock<T>(scopeId: string, ruleVersionId: string, task: () => Promise<T>): Promise<T> { const c=await this.pool.connect();try{await c.query("BEGIN");
    // DB UNIQUE는 chain transaction 이후의 중복 INSERT만 막는다. C 호출 전 동일 Scope+Rule 작업을 직렬화한다.
    // PostgreSQL은 bigint 두 개의 advisory lock 시그니처를 지원하지 않으므로, 두 식별자를 하나의 bigint key로 합친다.
    await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1::text || ':' || $2::text, 0))",[scopeId,ruleVersionId]); const value=await task();await c.query("COMMIT");return value;
  }catch(error){await c.query("ROLLBACK");throw error;}finally{c.release();} }
  private async insertDeployment(q: Pool | PoolClient, d: Omit<ChainScopeDeploymentRow,"id">): Promise<ChainScopeDeploymentRow> { const r=await q.query<ChainScopeDeploymentRow>(`INSERT INTO public.chain_scope_deployments(evaluation_scope_id,adapter_profile,network,chain_contract_address,deployment_transaction_id) VALUES($1,$2,$3,$4,$5) RETURNING id,evaluation_scope_id AS "evaluationScopeId",adapter_profile AS "adapterProfile",network,chain_contract_address AS "chainContractAddress",deployment_transaction_id AS "deploymentTransactionId"`,[d.evaluationScopeId,d.adapterProfile,d.network,d.chainContractAddress,d.deploymentTransactionId]);return r.rows[0]; }
  private async insertRegistration(q: Pool | PoolClient, x: Omit<RuleRegistrationRow,"id">): Promise<RuleRegistrationRow> { const r=await q.query<RuleRegistrationRow>(`INSERT INTO public.rule_registrations(chain_scope_deployment_id,rule_version_id,rule_hash,registration_transaction_id) VALUES($1,$2,$3,$4) RETURNING id,chain_scope_deployment_id AS "chainScopeDeploymentId",rule_version_id AS "ruleVersionId",rule_hash AS "ruleHash",registration_transaction_id AS "registrationTransactionId"`,[x.chainScopeDeploymentId,x.ruleVersionId,x.ruleHash,x.registrationTransactionId]);return r.rows[0]; }
  public async createDeploymentAndRegistration(d: Omit<ChainScopeDeploymentRow,"id">, x: Omit<RuleRegistrationRow,"id"|"chainScopeDeploymentId">) { const c=await this.pool.connect();try{await c.query("BEGIN");const deployment=await this.insertDeployment(c,d);const registration=await this.insertRegistration(c,{...x,chainScopeDeploymentId:deployment.id});await c.query("COMMIT");return{deployment,registration};}catch(e){await c.query("ROLLBACK");throw e;}finally{c.release();} }
  public async createRegistration(x: Omit<RuleRegistrationRow,"id">) { return this.insertRegistration(this.pool,x); }
}
