import { Router } from "express";

import type { AuthDependencies } from "../auth/auth-service.js";
import { createRequireAuth } from "../middleware/require-auth.js";

/** Returns only the shared application user, not the complete Supabase Auth record. */
export const createAuthRouter = (dependencies: AuthDependencies): Router => {
  const authRouter = Router();

  authRouter.get("/auth/me", createRequireAuth(dependencies), (request, response) => {
    response.json(request.authUser);
  });

  return authRouter;
};
