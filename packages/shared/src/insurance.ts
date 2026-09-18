import { z } from "zod";

export const SpecialContractSchema = z.object({
  id: z.string().min(1),
  insuranceContractId: z.string().min(1),
  insurerName: z.string().min(1),
  name: z.string().min(1),
  isEligible: z.boolean(),
  status: z.string().min(1),
});
export type SpecialContract = z.infer<typeof SpecialContractSchema>;

export const InsuranceContractSchema = z.object({
  id: z.string().min(1),
  ownerUserId: z.string().min(1),
  insurerName: z.string().min(1),
  coverageStartsAt: z.string().datetime(),
  coverageEndsAt: z.string().datetime(),
  status: z.string().min(1),
  specialContracts: z.array(SpecialContractSchema),
});
export type InsuranceContract = z.infer<typeof InsuranceContractSchema>;

/** 현재 계약에서 선택된 특약만 노출하며 DB 내부 row 식별자는 API에 포함하지 않는다. */
export const SpecialContractSelectionSchema = z.object({
  insuranceContractId: z.string().min(1),
  specialContractId: z.string().min(1),
  selectedAt: z.string().datetime(),
});
export type SpecialContractSelection = z.infer<typeof SpecialContractSelectionSchema>;

// Rule versions and other Rule/State data are intentionally not defined yet.
