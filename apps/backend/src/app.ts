import express from "express";

import type { AuthDependencies } from "./auth/auth-service.js";
import type { ConsentService } from "./consent/consent-service.js";
import type { InsuranceService } from "./insurance/insurance-service.js";
import type { RuleService } from "./rule/rule-service.js";
import type { RuleRegistrationService } from "./rule-registration/rule-registration-service.js";
import type { DrivingService } from "./driving/driving-service.js";
import type { RuleDraftService } from "./rule-draft/rule-draft-service.js";
import { createRuleDraftRouter } from "./routes/rule-drafts.js";
import { createDrivingRouter } from "./routes/driving.js";
import { createRuleRegistrationRouter } from "./routes/rule-registration.js";
import { createChainProcessingRouter } from "./routes/chain-processing.js";
import type { ChainProcessingService } from "./chain-state/chain-processing-service.js";
import { createRuleRouter } from "./routes/rules.js";
import { errorHandler, notFoundHandler } from "./middleware/error-handler.js";
import { requestId } from "./middleware/request-id.js";
import { createAuthRouter } from "./routes/auth.js";
import { createConsentRouter } from "./routes/consent.js";
import { healthRouter } from "./routes/health.js";
import { createInsuranceRouter } from "./routes/insurance.js";

export interface BackendDependencies extends AuthDependencies {
  consentService?: ConsentService;
  insuranceService?: InsuranceService;
  ruleService?: RuleService;
  ruleRegistrationService?: RuleRegistrationService;
  drivingService?: DrivingService;
  ruleDraftService?: RuleDraftService;
  chainProcessingService?: ChainProcessingService;
}

/**
 * App construction is separate from network startup: tests can exercise the
 * HTTP contract without opening a port, while server.ts owns runtime concerns.
 */
export const createApp = (dependencies?: BackendDependencies): express.Express => {
  const app = express();

  app.use(express.json());
  app.use(requestId);
  app.use(healthRouter);
  if (dependencies) {
    app.use(createAuthRouter(dependencies));
    if (dependencies.consentService) {
      app.use(createConsentRouter(dependencies, dependencies.consentService));
    }
    if (dependencies.insuranceService) {
      app.use(createInsuranceRouter(dependencies, dependencies.insuranceService));
    }
    if (dependencies.ruleService) app.use(createRuleRouter(dependencies, dependencies.ruleService));
    if (dependencies.ruleDraftService) app.use(createRuleDraftRouter(dependencies, dependencies.ruleDraftService));
    if (dependencies.ruleRegistrationService) app.use(createRuleRegistrationRouter(dependencies, dependencies.ruleRegistrationService));
    if (dependencies.drivingService) app.use(createDrivingRouter(dependencies, dependencies.drivingService));
    if (dependencies.chainProcessingService) app.use(createChainProcessingRouter(dependencies, dependencies.chainProcessingService));
  }
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};
