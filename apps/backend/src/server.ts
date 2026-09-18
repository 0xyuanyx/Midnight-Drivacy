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

const { port, databaseUrl, supabaseUrl, supabasePublishableKey } = loadEnvironment();
const pool = createDatabasePool(databaseUrl);
const authRepository = new PgAuthRepository(pool);
const app = createApp({
  authRepository,
  supabaseAuthVerifier: createSupabaseAuthVerifier(supabaseUrl, supabasePublishableKey),
  consentService: new ConsentService(new PgConsentRepository(pool)),
  insuranceService: new InsuranceService(new PgInsuranceRepository(pool)),
  ruleService: new RuleService(new PgRuleRepository(pool)),
});

app.listen(port, () => {
  console.info(`Drivacy backend listening on port ${port}`);
});
