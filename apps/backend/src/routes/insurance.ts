import { Router } from "express";

import { z } from "zod";

import type { AuthDependencies } from "../auth/auth-service.js";
import { AppError } from "../errors/app-error.js";
import type { InsuranceService } from "../insurance/insurance-service.js";
import { createRequireAuth } from "../middleware/require-auth.js";
import { requireRole } from "../middleware/require-role.js";

const SelectionRequestSchema = z.object({
  specialContractId: z.string().min(1),
}).strict();

const contractId = (value: string | string[]): string => {
  if (typeof value !== "string" || !value.trim()) {
    throw new AppError("INVALID_REQUEST", "Insurance contract ID is required", 400);
  }

  return value;
};

export const createInsuranceRouter = (
  authDependencies: AuthDependencies,
  insuranceService: InsuranceService,
): Router => {
  const insuranceRouter = Router();
  const requireDriver = [createRequireAuth(authDependencies), requireRole("DRIVER")];

  insuranceRouter.get("/insurance-contracts", ...requireDriver, async (request, response) => {
    response.json(await insuranceService.listContracts(request.authUser!.id));
  });

  insuranceRouter.get("/insurance-contracts/:id", ...requireDriver, async (request, response) => {
    response.json(await insuranceService.getContract(contractId(request.params.id), request.authUser!.id));
  });

  insuranceRouter.get(
    "/insurance-contracts/:id/special-contracts",
    ...requireDriver,
    async (request, response) => {
      response.json(
        await insuranceService.listSpecialContracts(contractId(request.params.id), request.authUser!.id),
      );
    },
  );

  insuranceRouter.put(
    "/insurance-contracts/:id/special-contract-selection",
    ...requireDriver,
    async (request, response) => {
      const body = SelectionRequestSchema.safeParse(request.body);
      if (!body.success) {
        throw new AppError("INVALID_REQUEST", "specialContractId is required", 400);
      }

      response.json(
        await insuranceService.selectSpecialContract(
          contractId(request.params.id),
          body.data.specialContractId,
          request.authUser!.id,
        ),
      );
    },
  );

  insuranceRouter.get(
    "/insurance-contracts/:id/special-contract-selection",
    ...requireDriver,
    async (request, response) => {
      response.json(
        await insuranceService.getSelection(contractId(request.params.id), request.authUser!.id),
      );
    },
  );

  return insuranceRouter;
};
