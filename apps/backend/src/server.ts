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
import { PgConfirmedDrivingStateReader } from "./driving/pg-confirmed-state-reader.js";

const { port, databaseUrl, supabaseUrl, supabasePublishableKey, midnightNetwork, midnightAdapterProfile } = loadEnvironment();
const pool = createDatabasePool(databaseUrl);
const authRepository = new PgAuthRepository(pool);
const ruleService = new RuleService(new PgRuleRepository(pool));
const app = createApp({
  authRepository,
  supabaseAuthVerifier: createSupabaseAuthVerifier(supabaseUrl, supabasePublishableKey),
  consentService: new ConsentService(new PgConsentRepository(pool)),
  insuranceService: new InsuranceService(new PgInsuranceRepository(pool)),
  ruleService,
  ruleDraftService: new RuleDraftService(ruleService),
  drivingService: new DrivingService(new PgDrivingRepository(pool), { network: midnightNetwork, adapterProfile: midnightAdapterProfile }, new PgConfirmedDrivingStateReader(pool)),
});

app.listen(port, () => {
  console.info(`Drivacy backend listening on port ${port}`);
});
