import { z } from "zod";

// Field names and ranges per docs/contracts/RULE_DRAFT_CONTRACT.md (P1-1).
// minimumDistanceM range upper bound (2,000,000) is a proposal, not yet confirmed with B/C.
export const RULE_DRAFT_FIELD_NAMES = [
  "minimumDistanceM",
  "minimumScore",
  "discountPercent",
  "speedingPenaltyPoints",
  "hardBrakePenaltyPoints",
  "hardAccelPenaltyPoints",
] as const;

export type RuleDraftFieldName = (typeof RULE_DRAFT_FIELD_NAMES)[number];

export const RuleDraftValuesSchema = z.object({
  minimumDistanceM: z.number().int().min(0).max(2_000_000).nullable(),
  minimumScore: z.number().int().min(0).max(100).nullable(),
  discountPercent: z.number().int().min(0).max(100).nullable(),
  speedingPenaltyPoints: z.number().int().min(0).max(100).nullable(),
  hardBrakePenaltyPoints: z.number().int().min(0).max(100).nullable(),
  hardAccelPenaltyPoints: z.number().int().min(0).max(100).nullable(),
});
export type RuleDraftValues = z.infer<typeof RuleDraftValuesSchema>;

export const RuleDraftEvidenceSchema = z.object({
  minimumDistanceM: z.string().nullable(),
  minimumScore: z.string().nullable(),
  discountPercent: z.string().nullable(),
  speedingPenaltyPoints: z.string().nullable(),
  hardBrakePenaltyPoints: z.string().nullable(),
  hardAccelPenaltyPoints: z.string().nullable(),
});
export type RuleDraftEvidence = z.infer<typeof RuleDraftEvidenceSchema>;

export const RuleDraftStateSchema = z.enum(["draft", "manual_required"]);
export type RuleDraftState = z.infer<typeof RuleDraftStateSchema>;

// No `approved`, `ruleHash`, or `version` fields here by design (P1-1 §1):
// those belong to B's approval schema, not this draft module.
export const RuleDraftResultSchema = z.object({
  state: RuleDraftStateSchema,
  reviewRequired: z.literal(true),
  values: RuleDraftValuesSchema,
  evidence: RuleDraftEvidenceSchema,
  issues: z.array(z.string()),
});
export type RuleDraftResult = z.infer<typeof RuleDraftResultSchema>;

export interface RuleDraftCandidate {
  values: Partial<Record<RuleDraftFieldName, number | null>>;
  evidence: Partial<Record<RuleDraftFieldName, string | null>>;
}

export type RuleDraftExtractor = (policyText: string) => Promise<RuleDraftCandidate>;
