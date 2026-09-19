import { RULE_DRAFT_ISSUE_CODES, type RuleDraftIssueCode } from "./issues.js";
import type { DraftProvider } from "./provider.js";
import {
  RULE_DRAFT_FIELD_NAMES,
  RULE_DRAFT_FORMULA,
  RULE_DRAFT_INITIAL_SCORE,
  RuleDraftValuesSchema,
  type RuleDraftCandidate,
  type RuleDraftEvidence,
  type RuleDraftFieldName,
  type RuleDraftProviderMeta,
  type RuleDraftResult,
  type RuleDraftValues,
} from "./types.js";

// Exported so src/pdf.ts can reject over-length extracted text with the same
// limit before it ever reaches createRuleDraft.
export const INPUT_MAX_LENGTH = 20_000;

// Values are stored in B's units (distance in m, discount in bps; D2 and
// RuleDraftInputSchema), but policy text quotes them in its own units ("100km",
// "10%"). Evidence stays in the source unit, so a quoted number grounds a value
// only after converting by the unit written next to it.
const DISTANCE_UNIT_SCALE: Record<string, number> = { km: 1_000, "㎞": 1_000, 킬로미터: 1_000, m: 1, 미터: 1 };
const DISCOUNT_UNIT_SCALE: Record<string, number> = { "%": 100, 퍼센트: 100, bps: 1 };
const DISCOUNT_FIELDS: readonly RuleDraftFieldName[] = ["baseDiscountBps", "premiumDiscountBps"];

function withConstants(extracted: Record<RuleDraftFieldName, number | null>): RuleDraftValues {
  return { formula: RULE_DRAFT_FORMULA, initialScore: RULE_DRAFT_INITIAL_SCORE, ...extracted };
}

function manualDraft(issue: RuleDraftIssueCode, provider: RuleDraftProviderMeta): RuleDraftResult {
  const blankValues = withConstants(
    Object.fromEntries(RULE_DRAFT_FIELD_NAMES.map((name) => [name, null])) as Record<RuleDraftFieldName, null>,
  );
  const blankEvidence = Object.fromEntries(
    RULE_DRAFT_FIELD_NAMES.map((name) => [name, null]),
  ) as RuleDraftEvidence;
  return {
    state: "manual_required",
    reviewRequired: true,
    values: blankValues,
    evidence: blankEvidence,
    issues: [issue],
    provider,
  };
}

function normalizedWhitespace(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

function supportedValue(name: RuleDraftFieldName, value: number | null): boolean {
  return RuleDraftValuesSchema.shape[name].safeParse(value).success;
}

const QUOTE_NUMBER = /(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)\s*(km|㎞|킬로미터|미터|m|%|퍼센트|bps)?/giu;

function quoteNumbers(quote: string): Array<{ number: number; unit: string | undefined }> {
  return [...quote.matchAll(QUOTE_NUMBER)].map((match) => ({
    number: Number((match[1] ?? "").replaceAll(",", "")),
    unit: match[2]?.toLowerCase(),
  }));
}

// Factor from the quoted unit to the stored unit, or null if the unit cannot
// ground this field (e.g. a bare "10" or "10km" for a discount).
function unitScale(name: RuleDraftFieldName, unit: string | undefined): number | null {
  if (name === "minimumDistanceM") return unit === undefined ? null : (DISTANCE_UNIT_SCALE[unit] ?? null);
  if (DISCOUNT_FIELDS.includes(name)) return unit === undefined ? null : (DISCOUNT_UNIT_SCALE[unit] ?? null);
  return unit === undefined ? 1 : null;
}

function groundedInSource(
  source: string,
  quote: string | null,
  value: number,
  name: RuleDraftFieldName,
): boolean {
  if (typeof quote !== "string" || !quote.trim()) return false;
  if (!normalizedWhitespace(source).includes(normalizedWhitespace(quote))) return false;
  return quoteNumbers(quote).some(({ number, unit }) => {
    const scale = unitScale(name, unit);
    // "12.5%" -> 1250 bps: compare with a tolerance for float products.
    return scale !== null && Math.abs(number * scale - value) < 1e-6;
  });
}

// Provider (src/providers/*) and pdf (src/pdf.ts) adapters throw distinct
// error classes, but each carries a `.code: RuleDraftIssueCode`. Duck-typing
// on that field (rather than importing those classes here) avoids a circular
// dependency, since src/pdf.ts already imports INPUT_MAX_LENGTH from here.
function extractionIssueCode(error: unknown): RuleDraftIssueCode | null {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    RULE_DRAFT_ISSUE_CODES.includes((error as { code: unknown }).code as RuleDraftIssueCode)
  ) {
    return (error as { code: RuleDraftIssueCode }).code;
  }
  return null;
}

// Same duck-typing as above: provider errors may carry the last model they
// attempted (RuleDraftProviderError.model) so a failed draft still records it.
function extractionErrorModel(error: unknown): string | null {
  if (typeof error === "object" && error !== null && "model" in error) {
    const model = (error as { model: unknown }).model;
    if (typeof model === "string") return model;
  }
  return null;
}

export async function createRuleDraft(policyText: string, provider: DraftProvider): Promise<RuleDraftResult> {
  const notCalled: RuleDraftProviderMeta = { name: provider.name, model: null };
  if (typeof policyText !== "string" || !policyText.trim()) return manualDraft("EMPTY_INPUT", notCalled);
  if (policyText.length > INPUT_MAX_LENGTH) return manualDraft("INPUT_TOO_LONG", notCalled);

  let candidate: RuleDraftCandidate;
  let meta: RuleDraftProviderMeta;
  try {
    const extraction = await provider.extract(policyText);
    candidate = extraction.candidate;
    meta = { name: provider.name, model: extraction.model };
  } catch (error) {
    return manualDraft(extractionIssueCode(error) ?? "EXTRACTION_FAILED", {
      name: provider.name,
      model: extractionErrorModel(error),
    });
  }

  if (
    !candidate ||
    typeof candidate.values !== "object" ||
    !candidate.values ||
    typeof candidate.evidence !== "object" ||
    !candidate.evidence
  ) {
    return manualDraft("UNVERIFIED_EXTRACTION", meta);
  }

  for (const name of RULE_DRAFT_FIELD_NAMES) {
    const value = candidate.values[name] ?? null;
    const quote = candidate.evidence[name] ?? null;
    if (!supportedValue(name, value)) return manualDraft("UNVERIFIED_EXTRACTION", meta);
    if (value === null) {
      if (quote !== null) return manualDraft("UNVERIFIED_EXTRACTION", meta);
    } else if (!groundedInSource(policyText, quote, value, name)) {
      return manualDraft("UNVERIFIED_EXTRACTION", meta);
    }
  }

  const values = withConstants(
    Object.fromEntries(
      RULE_DRAFT_FIELD_NAMES.map((name) => [name, candidate.values[name] ?? null]),
    ) as Record<RuleDraftFieldName, number | null>,
  );
  const evidence = Object.fromEntries(
    RULE_DRAFT_FIELD_NAMES.map((name) => [name, candidate.evidence[name] ?? null]),
  ) as RuleDraftEvidence;

  if (RULE_DRAFT_FIELD_NAMES.every((name) => values[name] === null)) {
    return manualDraft("NO_SUPPORTED_FIELDS", meta);
  }

  return {
    state: "draft",
    reviewRequired: true,
    values,
    evidence,
    issues: RULE_DRAFT_FIELD_NAMES.some((name) => values[name] === null) ? ["MISSING_FIELDS"] : [],
    provider: meta,
  };
}
