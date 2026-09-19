import { RuleDraftInputSchema } from "@drivacy/shared";
import { z } from "zod";

// P2-10: field names, units and ranges come from B's RuleDraftInputSchema in
// @drivacy/shared (packages/shared/src/rule-management.ts). This module only
// wraps them as nullable; it keeps no range constants of its own.
// Only these fields are extracted from the policy text (each needs evidence).
// `formula`/`initialScore` are fixed constants, not extracted (see below), and
// `effectiveFrom`/`effectiveTo` are left to the insurer.
export const RULE_DRAFT_FIELD_NAMES = [
  "speedingPenalty",
  "accelerationPenalty",
  "brakingPenalty",
  "minimumDistanceM",
  "minimumScore",
  "premiumMinimumScore",
  "baseDiscountBps",
  "premiumDiscountBps",
] as const;

export type RuleDraftFieldName = (typeof RULE_DRAFT_FIELD_NAMES)[number];

// Constants B's schema requires as literals. The LLM never chooses them.
export const RULE_DRAFT_FORMULA = "cumulative-event-deduction-v1" as const;
export const RULE_DRAFT_INITIAL_SCORE = 100 as const;

// RuleDraftInputSchema carries cross-field refinements, so Zod refuses
// `.partial()`/`.pick()` on it. Reuse each field schema from `.shape` instead.
// Cross-field checks (premium >= base) run when B validates the full input.
const inputShape = RuleDraftInputSchema.shape;

export const RuleDraftValuesSchema = z.object({
  formula: inputShape.formula,
  initialScore: inputShape.initialScore,
  ...(Object.fromEntries(
    RULE_DRAFT_FIELD_NAMES.map((name) => [name, inputShape[name].nullable()]),
  ) as { [K in RuleDraftFieldName]: z.ZodNullable<(typeof inputShape)[K]> }),
});
export type RuleDraftValues = z.infer<typeof RuleDraftValuesSchema>;

export const RuleDraftEvidenceSchema = z.object(
  Object.fromEntries(RULE_DRAFT_FIELD_NAMES.map((name) => [name, z.string().nullable()])) as {
    [K in RuleDraftFieldName]: z.ZodNullable<z.ZodString>;
  },
);
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
