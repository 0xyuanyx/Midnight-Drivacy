import { Router } from "express";
import { z } from "zod";
import type { AuthDependencies } from "../auth/auth-service.js";
import type { DiscountApplicationService } from "../final-evaluation/discount-application-service.js";
import { AppError } from "../errors/app-error.js";
import { createRequireAuth } from "../middleware/require-auth.js";
import { requireRole } from "../middleware/require-role.js";

const uuid = z.uuid();
const createBody = z.object({ insuranceContractId: uuid, specialContractId: uuid }).strict();
const decisionBody = z.object({ decision: z.enum(["APPLIED", "REJECTED"]) }).strict();

export const createDiscountApplicationRouter = (auth: AuthDependencies, service: DiscountApplicationService) => {
  const router = Router();
  router.post("/discount-applications", createRequireAuth(auth), requireRole("DRIVER"), async (req, res) => {
    const body = createBody.safeParse(req.body);
    if (!body.success) throw new AppError("INVALID_REQUEST", "Application target is invalid", 400);
    res.json(await service.create(req.authUser!, body.data.insuranceContractId, body.data.specialContractId));
  });
  router.get("/discount-applications", createRequireAuth(auth), requireRole("DRIVER"), async (req, res) => {
    res.json(await service.listMine(req.authUser!));
  });
  router.get("/discount-applications/:id", createRequireAuth(auth), requireRole("DRIVER"), async (req, res) => {
    const id = uuid.safeParse(req.params.id); if (!id.success) throw new AppError("INVALID_REQUEST", "Application ID is invalid", 400);
    res.json(await service.getMine(req.authUser!, id.data));
  });
  router.get("/insurer/discount-applications", createRequireAuth(auth), requireRole("INSURER"), async (req, res) => {
    res.json(await service.listForInsurer(req.authUser!));
  });
  router.get("/insurer/discount-applications/:id", createRequireAuth(auth), requireRole("INSURER"), async (req, res) => {
    const id = uuid.safeParse(req.params.id); if (!id.success) throw new AppError("INVALID_REQUEST", "Application ID is invalid", 400);
    res.json(await service.getForInsurer(req.authUser!, id.data));
  });
  router.post("/insurer/discount-applications/:id/decision", createRequireAuth(auth), requireRole("INSURER"), async (req, res) => {
    const id = uuid.safeParse(req.params.id), body = decisionBody.safeParse(req.body);
    if (!id.success || !body.success) throw new AppError("INVALID_REQUEST", "Decision request is invalid", 400);
    res.json(await service.decide(req.authUser!, id.data, body.data.decision));
  });
  return router;
};
