import express from "express";

import { createApp, type BackendDependencies } from "./app.js";
import type { DriverOnboardingService } from "./auth/driver-onboarding-service.js";

/** Local-only driver intake routes while C/Wallet processing is unavailable. */
export const createAuthOnlyApp = (
  dependencies: BackendDependencies & { driverOnboardingService: DriverOnboardingService },
  allowedOrigin: string,
): express.Express => {
  const app = express();
  app.use((request, response, next) => {
    if (request.header("origin") === allowedOrigin) {
      response.setHeader("Access-Control-Allow-Origin", allowedOrigin);
      response.setHeader("Vary", "Origin");
      response.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS");
      response.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
      if (request.method === "OPTIONS") { response.status(204).end(); return; }
    }
    next();
  });
  app.use(createApp(dependencies));
  return app;
};
