import { Router } from "express";
import { z } from "zod";
import type { AuthDependencies } from "../auth/auth-service.js";
import { AppError } from "../errors/app-error.js";
import { createRequireAuth } from "../middleware/require-auth.js";
import type { RuleRegistrationService } from "../rule-registration/rule-registration-service.js";
const uuid=z.uuid(),version=z.coerce.number().int().min(1).max(0xffff_ffff);
export const createRuleRegistrationRouter=(a:AuthDependencies,s:RuleRegistrationService)=>{const r=Router();r.post("/special-contracts/:specialContractId/rules/:version/register",createRequireAuth(a),async(q,p)=>{const id=uuid.safeParse(q.params.specialContractId),v=version.safeParse(q.params.version);if(!id.success||!v.success)throw new AppError("INVALID_REQUEST","Special contract ID and rule version are invalid",400);p.json(await s.register(q.authUser!,id.data,v.data));});return r;};
