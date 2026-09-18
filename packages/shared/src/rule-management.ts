import { z } from "zod";

// RuleSchema has cross-field refinements, so Zod cannot omit fields from it.
// Keep the calculation constraints identical while withholding DB-owned fields.
const uint32 = z.number().int().min(0).max(0xffff_ffff);
const score = z.number().int().min(0).max(100);
const bps = z.number().int().min(0).max(10_000);
export const RuleDraftInputSchema = z.object({
  formula: z.literal("cumulative-event-deduction-v1"), initialScore: z.literal(100),
  speedingPenalty: uint32, accelerationPenalty: uint32, brakingPenalty: uint32,
  minimumDistanceM: uint32, minimumScore: score, premiumMinimumScore: score,
  baseDiscountBps: bps, premiumDiscountBps: bps,
  effectiveFrom: z.iso.datetime().optional(),
  effectiveTo: z.iso.datetime().optional(),
}).strict().refine(v => v.premiumMinimumScore >= v.minimumScore, "Premium threshold must not be below minimum score")
  .refine(v => v.premiumDiscountBps >= v.baseDiscountBps, "Premium discount must not be below base discount")
  .refine(v => !v.effectiveFrom || !v.effectiveTo || v.effectiveFrom <= v.effectiveTo, "Invalid effective period");
export type RuleDraftInput = z.infer<typeof RuleDraftInputSchema>;

export const RuleVersionResponseSchema = z.object({
  version: z.number().int().min(1).max(0xffff_ffff), status: z.enum(["DRAFT", "APPROVED"]),
  ruleDefinition: z.object({ formula: z.literal("cumulative-event-deduction-v1"), initialScore: z.literal(100), speedingPenalty: uint32, accelerationPenalty: uint32, brakingPenalty: uint32, minimumDistanceM: uint32, minimumScore: score, premiumMinimumScore: score, baseDiscountBps: bps, premiumDiscountBps: bps }).strict(),
  effectiveFrom: z.string().datetime().nullable(), effectiveTo: z.string().datetime().nullable(),
  approvedBy: z.string().uuid().nullable(), approvedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(), updatedAt: z.string().datetime(),
});
export const RuleResponseSchema = z.object({ id: z.string().uuid(), specialContractId: z.string().uuid(), versions: z.array(RuleVersionResponseSchema) });
export type RuleResponse = z.infer<typeof RuleResponseSchema>;
