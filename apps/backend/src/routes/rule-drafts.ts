import { Router } from "express";
import { z } from "zod";
import type { AuthDependencies } from "../auth/auth-service.js";
import { AppError } from "../errors/app-error.js";
import { createRequireAuth } from "../middleware/require-auth.js";
import { requireRole } from "../middleware/require-role.js";
import type { RuleDraftService } from "../rule-draft/rule-draft-service.js";

const requestSchema = z.object({ policyText: z.string() }).strict();
const uuid = z.uuid();
export const createRuleDraftRouter = (auth: AuthDependencies, service: RuleDraftService): Router => {
  const router = Router();
  router.post("/special-contracts/:specialContractId/rule-drafts", createRequireAuth(auth), requireRole("INSURER"), async (request, response) => {
    const special = uuid.safeParse(request.params.specialContractId);
    const body = requestSchema.safeParse(request.body);
    if (!special.success || !body.success) throw new AppError("INVALID_REQUEST", "Rule draft request is invalid", 400);
    response.json(await service.create(request.authUser!.id, special.data, body.data.policyText));
  });
  return router;
};
