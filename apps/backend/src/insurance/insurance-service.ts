import {
  InsuranceContractSchema,
  SpecialContractSchema,
  SpecialContractSelectionSchema,
  type InsuranceContract,
  type SpecialContract,
  type SpecialContractSelection,
} from "@drivacy/shared";

import { AppError } from "../errors/app-error.js";
import type {
  InsuranceContractRow,
  InsuranceRepository,
  SelectionRow,
  SpecialContractRow,
} from "./insurance-repository.js";

const toIsoString = (value: Date | string): string =>
  value instanceof Date ? value.toISOString() : value;

const toSpecialContract = (row: SpecialContractRow): SpecialContract => {
  const parsed = SpecialContractSchema.safeParse(row);
  if (!parsed.success) {
    throw new AppError("INTERNAL_SERVER_ERROR", "Stored special contract data is invalid", 500);
  }

  return parsed.data;
};

const toSelection = (row: SelectionRow): SpecialContractSelection => {
  const parsed = SpecialContractSelectionSchema.safeParse({
    ...row,
    selectedAt: toIsoString(row.selectedAt),
  });
  if (!parsed.success) {
    throw new AppError("INTERNAL_SERVER_ERROR", "Stored selection data is invalid", 500);
  }

  return parsed.data;
};

const toContract = (
  row: InsuranceContractRow,
  specialContracts: SpecialContract[],
): InsuranceContract => {
  const parsed = InsuranceContractSchema.safeParse({
    ...row,
    coverageStartsAt: toIsoString(row.coverageStartsAt),
    coverageEndsAt: toIsoString(row.coverageEndsAt),
    specialContracts,
  });
  if (!parsed.success) {
    throw new AppError("INTERNAL_SERVER_ERROR", "Stored insurance contract data is invalid", 500);
  }

  return parsed.data;
};

export class InsuranceService {
  public constructor(private readonly repository: InsuranceRepository) {}

  public async listContracts(userId: string): Promise<InsuranceContract[]> {
    const contracts = await this.repository.listOwnedContracts(userId);
    const specialContracts = await this.repository.findSpecialContracts(contracts.map(({ id }) => id));
    const byContractId = new Map<string, SpecialContract[]>();

    for (const specialContract of specialContracts.map(toSpecialContract)) {
      const current = byContractId.get(specialContract.insuranceContractId) ?? [];
      current.push(specialContract);
      byContractId.set(specialContract.insuranceContractId, current);
    }

    return contracts.map((contract) => toContract(contract, byContractId.get(contract.id) ?? []));
  }

  public async getContract(contractId: string, userId: string): Promise<InsuranceContract> {
    const contract = await this.getOwnedContract(contractId, userId);
    const specialContracts = (await this.repository.findSpecialContracts([contractId])).map(toSpecialContract);

    return toContract(contract, specialContracts);
  }

  public async listSpecialContracts(contractId: string, userId: string): Promise<SpecialContract[]> {
    await this.getOwnedContract(contractId, userId);
    return (await this.repository.findSpecialContracts([contractId])).map(toSpecialContract);
  }

  public async selectSpecialContract(
    contractId: string,
    specialContractId: string,
    userId: string,
  ): Promise<SpecialContractSelection> {
    await this.getOwnedContract(contractId, userId);
    const specialContract = await this.repository.findSelectableSpecialContract(
      contractId,
      specialContractId,
    );

    if (!specialContract) {
      // 계약 소속 조건을 함께 검사해 다른 계약의 특약 존재 여부를 노출하지 않는다.
      throw new AppError("SPECIAL_CONTRACT_NOT_FOUND", "Special contract was not found", 404);
    }
    if (!specialContract.isEligible) {
      throw new AppError(
        "SPECIAL_CONTRACT_NOT_ELIGIBLE",
        "Special contract is not eligible for selection",
        409,
      );
    }

    return toSelection(await this.repository.upsertSelection(contractId, specialContractId));
  }

  public async getSelection(contractId: string, userId: string): Promise<SpecialContractSelection> {
    await this.getOwnedContract(contractId, userId);
    const selection = await this.repository.findSelection(contractId);
    if (!selection) {
      throw new AppError(
        "SPECIAL_CONTRACT_SELECTION_NOT_FOUND",
        "No special contract has been selected for this contract",
        404,
      );
    }

    return toSelection(selection);
  }

  private async getOwnedContract(contractId: string, userId: string): Promise<InsuranceContractRow> {
    const contract = await this.repository.findOwnedContract(contractId, userId);
    if (!contract) {
      throw new AppError("INSURANCE_CONTRACT_NOT_FOUND", "Insurance contract was not found", 404);
    }

    return contract;
  }
}
