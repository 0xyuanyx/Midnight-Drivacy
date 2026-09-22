import { randomUUID } from "node:crypto";
import { AdapterRuntimeSchema, ApprovedRuleSchema, ConfirmedStateSchema, DeployRuleResultSchema, InitialRegistrationStatusSchema, RegisteredRuleSchema, RuleSchema, ScopeSchema, hasZeroGenesisMetrics, serializeRule, type AdapterRuntime, type ApprovedRule, type ConfirmedState, type RegisteredRule, type Scope, type User } from "@drivacy/shared";
import { AppError } from "../errors/app-error.js";
import { toRuleVersionNumber } from "../rule/rule-service.js";
import type { ChainScopeDeploymentRow, EvaluationScopeRow, RegistrationTargetRow, RuleRegistrationRepository } from "./rule-registration-repository.js";
import type { RuleRegistrationAdapter } from "./rule-registration-adapter.js";

const kstDate = (value: Date | string): string => {
  const date = value instanceof Date ? value : new Date(value); if (Number.isNaN(date.valueOf())) throw new AppError("INTERNAL_SERVER_ERROR", "Stored scope date is invalid", 500);
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const part=(type:string)=>p.find(x=>x.type===type)?.value; return `${part("year")}-${part("month")}-${part("day")}`;
};
export class RuleRegistrationService {
  public constructor(private readonly repo: RuleRegistrationRepository, private readonly adapter: RuleRegistrationAdapter, runtime: AdapterRuntime) { this.runtime=AdapterRuntimeSchema.parse(runtime); }
  private readonly runtime: AdapterRuntime;
  private scope(target: RegistrationTargetRow, stored: EvaluationScopeRow): Scope { return ScopeSchema.parse({ applicantId:stored.ownerUserId,contractId:stored.insuranceContractId,insurerId:target.insurerId,endorsementId:stored.specialContractId,evaluationPeriod:{id:stored.evaluationPeriodId,startDate:stored.evaluationStartsOn,endDate:stored.evaluationEndsOn} }); }
  private async getScope(target: RegistrationTargetRow): Promise<EvaluationScopeRow> { if(!target.selectedAt)throw new AppError("SPECIAL_CONTRACT_NOT_SELECTED","Special contract is not selected",409); const found=await this.repo.findScope(target.ownerUserId,target.insuranceContractId,target.specialContractId); if(found)return found; const start=kstDate(target.selectedAt),end=kstDate(target.coverageEndsAt); if(start>end)throw new AppError("INVALID_EVALUATION_PERIOD","Special contract selection is after coverage end",409);
    // 평가 Scope는 Rule version이 아닌 최초 특약 선택일부터 보험 종료일까지의 누적 범위다.
    return this.repo.createScope({ownerUserId:target.ownerUserId,insuranceContractId:target.insuranceContractId,specialContractId:target.specialContractId,evaluationPeriodId:randomUUID(),evaluationStartsOn:start,evaluationEndsOn:end}); }
  private approved(target: RegistrationTargetRow) { if(target.status!=="APPROVED")throw new AppError("RULE_NOT_APPROVED","Only approved rule versions can be registered",409); const rule=RuleSchema.safeParse({id:target.ruleId,version:toRuleVersionNumber(target.version),insurerId:target.insurerId,endorsementId:target.specialContractId,...(target.ruleDefinition as object)}); if(!rule.success)throw new AppError("INTERNAL_SERVER_ERROR","Stored rule data is invalid",500); return ApprovedRuleSchema.parse({approval:"approved",rule:rule.data}); }
  private registered(input: unknown, approved: ApprovedRule, deployment?: ChainScopeDeploymentRow): RegisteredRule { const parsed=RegisteredRuleSchema.safeParse(input);if(!parsed.success)throw new AppError("CHAIN_REGISTRATION_INVALID","Chain adapter returned invalid registration",502);const value=parsed.data;
    // ID/Version만 같아도 계수 하나가 다르면 승인 규칙이 아니다. 공유 계약의 고정 직렬화로 전체 필드를 비교한다.
    if(serializeRule(value.rule)!==serializeRule(approved.rule)||value.network!==this.runtime.network||value.adapterProfile!==this.runtime.adapterProfile||(deployment&&value.chainContractAddress!==deployment.chainContractAddress))throw new AppError("CHAIN_REGISTRATION_MISMATCH","Chain adapter registration does not match the requested rule",502);return value; }
  private confirmedGenesis(input: ConfirmedState, scope: Scope, registered: RegisteredRule): ConfirmedState {
    const state=input.state,confirmation=input.confirmation,rule=registered.rule;
    const eligible=rule.minimumDistanceM===0 && rule.initialScore>=rule.minimumScore;
    const discount=eligible ? (rule.initialScore>=rule.premiumMinimumScore ? rule.premiumDiscountBps : rule.baseDiscountBps) : 0;
    // 배포 receipt나 로컬 계산값만으로 초기 상태를 확정하지 않는다. C의 live
    // initialize 확인을 승인 Rule·Scope·계약과 대조한 뒤에만 DB에 넣는다.
    if(confirmation.execution!=="live" || confirmation.network!==registered.network
      || confirmation.adapterProfile!==registered.adapterProfile || confirmation.chainContractAddress!==registered.chainContractAddress
      || confirmation.previousStateCommitment!=="0".repeat(64) || JSON.stringify(state.scope)!==JSON.stringify(scope)
      || state.rule.id!==rule.id || state.rule.version!==rule.version || state.rule.ruleHash!==registered.ruleHash
      || !hasZeroGenesisMetrics(state) || state.conditionsMet!==eligible || state.expectedDiscountBps!==discount)
      throw new AppError("CHAIN_GENESIS_MISMATCH","Chain adapter genesis does not match the requested scope and rule",502);
    return input;
  }
  private async completeInitial(scopeRow: EvaluationScopeRow, target: RegistrationTargetRow,
    scope: Scope, approved: ApprovedRule, operationId: string, input: unknown): Promise<RegisteredRule> {
    const result=DeployRuleResultSchema.safeParse(input);
    if(!result.success)throw new AppError("CHAIN_REGISTRATION_INVALID","Chain adapter returned invalid deployment",502);
    if(result.data.operationId!==operationId)
      throw new AppError("CHAIN_REGISTRATION_MISMATCH","Deployment result belongs to another operation",502);
    const registered=this.registered(result.data.registeredRule,approved);
    const genesis=this.confirmedGenesis(result.data.confirmedGenesis,scope,registered);
    await this.repo.createInitialRegistration(operationId,{evaluationScopeId:scopeRow.id,adapterProfile:registered.adapterProfile,
      network:registered.network,chainContractAddress:registered.chainContractAddress,
      deploymentTransactionId:result.data.deploymentTransactionId},{ruleVersionId:target.ruleVersionId,
      ruleHash:registered.ruleHash,registrationTransactionId:registered.registrationTransactionId},registered,genesis);
    return registered;
  }
  public async register(actor: Pick<User,"id"|"role">, special: string, version: number): Promise<RegisteredRule> { const target=await this.repo.findTarget(actor.id,actor.role,special,version); if(!target)throw new AppError("SPECIAL_CONTRACT_NOT_FOUND","Special contract or rule version was not found",404); const approved=this.approved(target);
    // 보험사 요청은 기존 가입자 Scope의 Rule만 갱신한다. 최초 배포를 보험사가 대신 시작하지 않는다.
    const scopeRow=actor.role==="INSURER" ? await this.repo.findScope(target.ownerUserId,target.insuranceContractId,target.specialContractId) : await this.getScope(target);
    if(!scopeRow)throw new AppError("INITIAL_REGISTRATION_REQUIRED","Subscriber must register the initial rule",409);
    return this.repo.withRegistrationLock(scopeRow.id,this.runtime,async()=>{ const deployment=await this.repo.findDeployment(scopeRow.id,this.runtime); const existing=deployment&&await this.repo.findRegistration(deployment.id,target.ruleVersionId); if(existing&&deployment){
      const scope=this.scope(target,scopeRow), stored=await this.repo.findConfirmedState(scope);
      const parsed=ConfirmedStateSchema.safeParse(stored);
      // 과거 버전 재조회는 current를 바꾸지 않지만, 계약의 확정 State조차
      // 없는 배포 행을 운행 가능한 등록으로 돌려주어서는 안 된다.
      if(!parsed.success || parsed.data.confirmation.execution!=="live"
        || parsed.data.confirmation.network!==deployment.network
        || parsed.data.confirmation.adapterProfile!==deployment.adapterProfile
        || parsed.data.confirmation.chainContractAddress!==deployment.chainContractAddress
        || JSON.stringify(parsed.data.state.scope)!==JSON.stringify(scope))
        throw new AppError("CHAIN_STATE_NOT_CONFIRMED","Registration has no matching confirmed chain state",409);
      return RegisteredRuleSchema.parse({...approved,registration:"chain-confirmed",ruleHash:existing.ruleHash,adapterProfile:deployment.adapterProfile,network:deployment.network,chainContractAddress:deployment.chainContractAddress,registrationTransactionId:existing.registrationTransactionId}); }
    if(!deployment&&actor.role!=="DRIVER")throw new AppError("INITIAL_REGISTRATION_REQUIRED","Subscriber must register the initial rule",409);
    if(deployment&&actor.role!=="INSURER")throw new AppError("RULE_UPDATE_REQUIRES_INSURER","Only the insurer can register a later rule version",403);
    // 기존 registration은 위에서 조회만 한다. 새 등록으로 현재 Rule Version을 과거로 되돌릴 수 없다.
    if(deployment&&(!deployment.currentRuleVersion||toRuleVersionNumber(deployment.currentRuleVersion)>=version))throw new AppError("RULE_VERSION_NOT_NEWER","Only a newer approved rule version can be registered",409);
    const scope=this.scope(target,scopeRow); if(!deployment){
      // 외부 배포 전에 시도 ID를 영속화한다. DB 기록 실패·프로세스 종료 뒤에는
      // C가 기존 거래의 부재를 증명하기 전까지 같은 Scope를 다시 배포하지 않는다.
      const attempt=await this.repo.reserveInitialAttempt(scopeRow.id,target.ruleVersionId,this.runtime);
      if(!attempt.created){
        if(attempt.ruleVersionId!==target.ruleVersionId)throw new AppError("CHAIN_REGISTRATION_UNRESOLVED","Another initial Rule version must be recovered first",409);
        const status=InitialRegistrationStatusSchema.safeParse(await this.adapter.getInitialRegistrationStatus(attempt.operationId));
        if(!status.success || status.data.operationId!==attempt.operationId)
          throw new AppError("CHAIN_REGISTRATION_INVALID","Chain adapter returned invalid registration status",502);
        // 네트워크 응답 유실과 실제 미제출은 다르다. 같은 operationId의 상태를 우선 확인하고,
        // C가 명시한 chain-confirmed만 복구하며 pending이면 중복 배포를 막기 위해 닫힌다.
        if(status.data.status==="chain-confirmed")return this.completeInitial(scopeRow,target,scope,approved,attempt.operationId,status.data.result);
        if(status.data.status!=="not-submitted")throw new AppError("CHAIN_REGISTRATION_UNRESOLVED","Initial deployment status must be recovered before retry",409);
      }
      return this.completeInitial(scopeRow,target,scope,approved,attempt.operationId,
        await this.adapter.deployRule({operationId:attempt.operationId,scope,approvedRule:approved})); }
    // Rule 갱신은 기존 Scope 계약과 registration 이력을 유지한다. 새 Deployment나 Genesis로
    // 누적 State를 초기화하면 과거 운행 연결이 끊기므로 C에는 기존 계약 주소로 update만 요청한다.
    const registered=this.registered(await this.adapter.updateRule({scope,deployment:{network:deployment.network,adapterProfile:deployment.adapterProfile,chainContractAddress:deployment.chainContractAddress},approvedRule:approved}),approved,deployment); await this.repo.createRegistrationAndSetCurrent({chainScopeDeploymentId:deployment.id,ruleVersionId:target.ruleVersionId,ruleHash:registered.ruleHash,registrationTransactionId:registered.registrationTransactionId});return registered; }); }
}
