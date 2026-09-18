import { Router } from "express";

import type { AuthDependencies } from "../auth/auth-service.js";
import type { ConsentService } from "../consent/consent-service.js";
import { AppError } from "../errors/app-error.js";
import { createRequireAuth } from "../middleware/require-auth.js";
import { requireRole } from "../middleware/require-role.js";

export const createConsentRouter = (
  authDependencies: AuthDependencies,
  consentService: ConsentService,
): Router => {
  const consentRouter = Router();
  const requireDriver = [createRequireAuth(authDependencies), requireRole("DRIVER")];

  consentRouter.get("/consent", ...requireDriver, async (request, response) => {
    response.json(await consentService.getConsent(request.authUser!.id));
  });

  consentRouter.post("/consent", ...requireDriver, async (request, response) => {
    // userId와 시간을 body에서 받지 않아 다른 사용자의 동의를 만들거나 조작할 수 없다.
    if (request.body !== undefined && (typeof request.body !== "object" || Object.keys(request.body).length > 0)) {
      throw new AppError("INVALID_REQUEST", "Consent does not accept a request body", 400);
    }

    response.status(200).json(await consentService.grantConsent(request.authUser!.id));
  });

  return consentRouter;
};
