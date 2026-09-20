import { createApp } from "./app.js";
import { PgAuthRepository } from "./auth/auth-repository.js";
import { createSupabaseAuthVerifier } from "./auth/supabase-auth.js";
import { loadEnvironment } from "./config/env.js";
import { PgConsentRepository } from "./consent/consent-repository.js";
import { ConsentService } from "./consent/consent-service.js";
import { createDatabasePool } from "./db/pool.js";
import { PgInsuranceRepository } from "./insurance/insurance-repository.js";
import { InsuranceService } from "./insurance/insurance-service.js";
import { PgRuleRepository } from "./rule/rule-repository.js";
import { RuleService } from "./rule/rule-service.js";
import { PgDrivingRepository } from "./driving/driving-repository.js";
import { DrivingService } from "./driving/driving-service.js";
import { RuleDraftService } from "./rule-draft/rule-draft-service.js";
import type { ConfirmedDrivingStateReader } from "./driving/confirmed-state-reader.js";

const { port, databaseUrl, supabaseUrl, supabasePublishableKey, midnightNetwork, midnightAdapterProfile } = loadEnvironment();
const pool = createDatabasePool(databaseUrl);
const authRepository = new PgAuthRepository(pool);
const ruleService = new RuleService(new PgRuleRepository(pool));
// 확정 State 저장소가 연결되기 전에는 후속 운행을 0으로 가정하지 않고 안전하게 거부한다.
const unavailableConfirmedStateReader: ConfirmedDrivingStateReader = { getConfirmedDistanceM: async () => undefined };
const app = createApp({
  authRepository,
  supabaseAuthVerifier: createSupabaseAuthVerifier(supabaseUrl, supabasePublishableKey),
  consentService: new ConsentService(new PgConsentRepository(pool)),
  insuranceService: new InsuranceService(new PgInsuranceRepository(pool)),
  ruleService,
  ruleDraftService: new RuleDraftService(ruleService),
  drivingService: new DrivingService(new PgDrivingRepository(pool), { network: midnightNetwork, adapterProfile: midnightAdapterProfile }, unavailableConfirmedStateReader),
});

app.listen(port, () => {
  console.info(`Drivacy backend listening on port ${port}`);
});
