import { Router } from "express";
import { z } from "zod";
import { IdempotencyKeySchema } from "@drivacy/shared";

import type { AuthDependencies } from "../auth/auth-service.js";
import type { ChainProcessingService } from "../chain-state/chain-processing-service.js";
import { FinalizationBlocked } from "../chain-state/chain-finalizer.js";
import { AppError } from "../errors/app-error.js";
import { createRequireAuth } from "../middleware/require-auth.js";
import { requireRole } from "../middleware/require-role.js";

const uuid = z.uuid();
type PollingStatus = {
  operationId: string;
  status: string;
  approvalRequestId?: string;
  transactionId?: string;
};

export const pollingStatus = (result: Awaited<ReturnType<ChainProcessingService["getStatus"]>>): PollingStatus => {
  if (result.status === "awaiting-wallet-approval") {
    return { operationId: result.operationId, status: result.status, approvalRequestId: result.approvalRequestId };
  }
  if (result.status === "submitted" || result.status === "chain-unknown") {
    return { operationId: result.operationId, status: result.status, transactionId: result.transactionId };
  }
  if (result.status === "chain-confirmed") {
    // 체인 관측은 B의 DB 확정 이전이다. 가입자 화면의 종단 성공으로 내보내지 않는다.
    return { operationId: result.operationId, status: "db-pending", transactionId: result.confirmation.transactionId };
  }
  return { operationId: result.operationId, status: result.status };
};
const processingError = (error: unknown): never => {
  if (!(error instanceof FinalizationBlocked)) throw error;
  if (error.message === "SCOPE_BUSY") throw new AppError("PROCESSING_SCOPE_BUSY", "Another trip is already processing for this scope", 409);
  if (error.message === "IDEMPOTENCY_CONFLICT") throw new AppError("PROCESSING_JOB_CONFLICT", "A different processing request already exists", 409);
  if (error.message === "STALE_OR_UNREGISTERED_STATE") throw new AppError("STALE_CONFIRMED_STATE", "The confirmed state changed before processing", 409);
  throw new AppError("PROCESSING_NOT_READY", "The driving session cannot be processed", 409);
};

export const createChainProcessingRouter = (auth: AuthDependencies, service: ChainProcessingService) => {
  const router = Router();
  router.post("/driving-sessions/:sessionId/process", createRequireAuth(auth), requireRole("DRIVER"), async (request, response) => {
    const session = uuid.safeParse(request.params.sessionId);
    const key = IdempotencyKeySchema.safeParse(request.header("Idempotency-Key"));
    if (!session.success || !key.success) throw new AppError("INVALID_REQUEST", "Processing request is invalid", 400);
    try {
      response.json(await service.stage(request.authUser!, session.data, key.data));
    } catch (error) { processingError(error); }
  });
  router.get("/trip-processing/:operationId", createRequireAuth(auth), requireRole("DRIVER"), async (request, response) => {
    const operationId = uuid.safeParse(request.params.operationId);
    if (!operationId.success) throw new AppError("INVALID_REQUEST", "Processing operation is invalid", 400);
    try {
      const result = await service.getStatus(request.authUser!, operationId.data);
      const status = pollingStatus(result);
      if (result.status === "chain-confirmed") {
        const summary = await service.getConfirmedSummary(request.authUser!, operationId.data);
        if (summary) {
          response.json({ operationId: operationId.data, status: "db-confirmed", summary });
          return;
        }
      }
      response.json(status);
    } catch (error) { processingError(error); }
  });
  return router;
};
