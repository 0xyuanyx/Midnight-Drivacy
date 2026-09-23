import { Router } from "express";

import type { AuthDependencies } from "../auth/auth-service.js";
import type { DriverOnboardingService } from "../auth/driver-onboarding-service.js";
import { bearerToken, createRequireAuth } from "../middleware/require-auth.js";

/** Returns only the shared application user, not the complete Privy identity record. */
export const createAuthRouter = (
  dependencies: AuthDependencies,
  driverOnboardingService?: DriverOnboardingService,
): Router => {
  const authRouter = Router();

  authRouter.get("/auth/me", createRequireAuth(dependencies), (request, response) => {
    response.json(request.authUser);
  });

  if (driverOnboardingService) {
    // 신규 Privy 사용자는 DB 매핑 전이므로 일반 requireAuth 대신 검증 전용 경계를 사용한다.
    authRouter.post("/auth/driver/onboarding", async (request, response) => {
      const accessToken = bearerToken(request.header("authorization"));
      response.status(200).json(await driverOnboardingService.complete(accessToken, request.body));
    });
  }

  return authRouter;
};
