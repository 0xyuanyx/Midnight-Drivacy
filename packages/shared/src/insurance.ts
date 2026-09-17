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

// Rule versions and other Rule/State data are intentionally not defined yet.
