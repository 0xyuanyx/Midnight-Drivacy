import { createAuthOnlyApp } from "./auth-only-app.js";
import { PgAuthRepository } from "./auth/auth-repository.js";
import { DriverOnboardingService } from "./auth/driver-onboarding-service.js";
import { createPrivyAuthVerifier } from "./auth/privy-auth.js";
import { loadAuthOnlyEnvironment } from "./config/env.js";
import { PgConsentRepository } from "./consent/consent-repository.js";
import { ConsentService } from "./consent/consent-service.js";
import { createDatabasePool } from "./db/pool.js";
import { PgInsuranceRepository } from "./insurance/insurance-repository.js";
import { InsuranceService } from "./insurance/insurance-service.js";

const environment = loadAuthOnlyEnvironment();
const pool = createDatabasePool(environment.databaseUrl);
try { await pool.query("SELECT 1"); } catch (error) { await pool.end(); throw error; }
const authRepository = new PgAuthRepository(pool);
const authVerifier = createPrivyAuthVerifier(environment.privyAppId, environment.privyAppSecret);
const app = createAuthOnlyApp({ authRepository, authVerifier,
  driverOnboardingService: new DriverOnboardingService(authRepository, authVerifier),
  consentService: new ConsentService(new PgConsentRepository(pool)),
  insuranceService: new InsuranceService(new PgInsuranceRepository(pool)) }, environment.allowedOrigin);
const server = app.listen(environment.port, "127.0.0.1", () => {
  console.info(`Drivacy auth-only backend listening on 127.0.0.1:${environment.port}`);
});
let stopping = false;
const shutdown = async () => {
  if (stopping) return;
  stopping = true;
  await new Promise<void>(resolve => server.close(() => resolve()));
  await pool.end();
};
process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
