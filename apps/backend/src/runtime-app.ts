import type { Pool } from "pg";

import { createApp } from "./app.js";
import { PgAuthRepository } from "./auth/auth-repository.js";
import { createSupabaseAuthVerifier } from "./auth/supabase-auth.js";
import type { Environment } from "./config/env.js";
import { PgConsentRepository } from "./consent/consent-repository.js";
import { ConsentService } from "./consent/consent-service.js";
import { PgInsuranceRepository } from "./insurance/insurance-repository.js";
import { InsuranceService } from "./insurance/insurance-service.js";
import { PgRuleRepository } from "./rule/rule-repository.js";
import { RuleService } from "./rule/rule-service.js";
import { PgDrivingRepository } from "./driving/driving-repository.js";
import { DrivingService } from "./driving/driving-service.js";
import { RuleDraftService } from "./rule-draft/rule-draft-service.js";
import { PgConfirmedDrivingStateReader } from "./driving/pg-confirmed-state-reader.js";
import { PgRuleRegistrationRepository } from "./rule-registration/rule-registration-repository.js";
import { RuleRegistrationService } from "./rule-registration/rule-registration-service.js";
import type { RuleRegistrationAdapter } from "./rule-registration/rule-registration-adapter.js";
import { PgChainProcessingRepository } from "./chain-state/chain-processing-repository.js";
import { ChainProcessingService, type ChainProcessingGateway, type TripRequestSource } from "./chain-state/chain-processing-service.js";
import { ChainFinalizer } from "./chain-state/chain-finalizer.js";
import { ChainJobRecoveryService, PgChainJobRecoveryRepository, type ChainRecoveryGateway } from "./chain-state/chain-job-recovery.js";
import { PgDiscountApplicationRepository } from "./final-evaluation/discount-application-repository.js";
import { DiscountApplicationService } from "./final-evaluation/discount-application-service.js";
import type { FinalEvaluationAdapter } from "./final-evaluation/final-evaluation-adapter.js";
import { FinalEvaluationRecoveryService } from "./final-evaluation/final-evaluation-recovery.js";

export type TripProcessingAdapter = TripRequestSource & ChainProcessingGateway & ChainRecoveryGateway;

export const createRuntime = (
  environment: Environment,
  pool: Pool,
  ruleRegistrationAdapter: RuleRegistrationAdapter,
  tripProcessingAdapter: TripProcessingAdapter,
  finalEvaluationAdapter: FinalEvaluationAdapter,
) => {
  const authRepository = new PgAuthRepository(pool);
  const ruleService = new RuleService(new PgRuleRepository(pool));
  const runtime = {
    network: environment.midnightNetwork,
    adapterProfile: environment.midnightAdapterProfile,
  };

  // 테스트에서만 service를 조립하고 실제 서버에서 누락하는 차이를 막기 위해 production dependency를 한곳에서 명시한다.
  // C/Wallet 계층은 가입자 키를 Backend에 들이지 않는 외부 adapter로만 주입하며, 미구성 상태를 Fake 성공으로 대체하지 않는다.
  const finalizer = new ChainFinalizer(pool, tripProcessingAdapter, tripProcessingAdapter);
  const recovery = new ChainJobRecoveryService(new PgChainJobRecoveryRepository(pool), finalizer,
    tripProcessingAdapter, tripProcessingAdapter);
  const discountApplications = new PgDiscountApplicationRepository(pool);
  const discountApplicationService = new DiscountApplicationService(
    discountApplications, finalEvaluationAdapter, runtime);
  const finalEvaluationRecovery = new FinalEvaluationRecoveryService(
    discountApplications, discountApplicationService, finalEvaluationAdapter);
  const app = createApp({
    authRepository,
    supabaseAuthVerifier: createSupabaseAuthVerifier(environment.supabaseUrl, environment.supabasePublishableKey),
    consentService: new ConsentService(new PgConsentRepository(pool)),
    insuranceService: new InsuranceService(new PgInsuranceRepository(pool)),
    ruleService,
    ruleDraftService: new RuleDraftService(ruleService),
    ruleRegistrationService: new RuleRegistrationService(
      new PgRuleRegistrationRepository(pool),
      ruleRegistrationAdapter,
      runtime,
    ),
    drivingService: new DrivingService(
      new PgDrivingRepository(pool),
      runtime,
      new PgConfirmedDrivingStateReader(pool),
    ),
    // source 저장과 Job 생성 뒤에만 외부 C 처리를 시작해 응답 유실 시 기존 operationId로 복구할 수 있게 한다.
    chainProcessingService: new ChainProcessingService(new PgChainProcessingRepository(pool), finalizer,
      tripProcessingAdapter, tripProcessingAdapter, recovery, runtime),
    discountApplicationService,
  });
  return { app, recovery, finalEvaluationRecovery };
};

export const createRuntimeApp = (environment: Environment, pool: Pool,
  ruleRegistrationAdapter: RuleRegistrationAdapter, tripProcessingAdapter: TripProcessingAdapter,
  finalEvaluationAdapter: FinalEvaluationAdapter) =>
  createRuntime(environment, pool, ruleRegistrationAdapter, tripProcessingAdapter, finalEvaluationAdapter).app;
