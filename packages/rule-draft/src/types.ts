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

// P2-9 (confirmed 2026-09-19): which provider/model produced the draft. `model`
// is the model that actually answered (a fallback model if the primary one was
// retried out), or the last model attempted when every attempt failed. It is
// null when no model was called (input rejected before the call, fake provider).
export const RuleDraftProviderNameSchema = z.enum(["gemini", "fake"]);
export type RuleDraftProviderName = z.infer<typeof RuleDraftProviderNameSchema>;

export const RuleDraftProviderMetaSchema = z.object({
  name: RuleDraftProviderNameSchema,
  model: z.string().nullable(),
});
export type RuleDraftProviderMeta = z.infer<typeof RuleDraftProviderMetaSchema>;

// No `approved`, `ruleHash`, or `version` fields here by design (P1-1 §1):
// those belong to B's approval schema, not this draft module.
export const RuleDraftResultSchema = z.object({
  state: RuleDraftStateSchema,
  reviewRequired: z.literal(true),
  values: RuleDraftValuesSchema,
  evidence: RuleDraftEvidenceSchema,
  issues: z.array(z.string()),
  provider: RuleDraftProviderMetaSchema,
});
export type RuleDraftResult = z.infer<typeof RuleDraftResultSchema>;

export interface RuleDraftCandidate {
  values: Partial<Record<RuleDraftFieldName, number | null>>;
  evidence: Partial<Record<RuleDraftFieldName, string | null>>;
}

// What a provider hands back to createRuleDraft: the candidate plus the model
// that produced it. Returned per call (not read from provider state) so
// concurrent calls on one shared provider can't see each other's model.
export interface RuleDraftExtraction {
  candidate: RuleDraftCandidate;
  model: string | null;
}
