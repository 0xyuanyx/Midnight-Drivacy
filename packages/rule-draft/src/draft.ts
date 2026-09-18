import { RULE_DRAFT_ISSUE_CODES, type RuleDraftIssueCode } from "./issues.js";
import {
  RULE_DRAFT_FIELD_NAMES,
  type RuleDraftCandidate,
  type RuleDraftEvidence,
  type RuleDraftExtractor,
  type RuleDraftFieldName,
  type RuleDraftResult,
  type RuleDraftValues,
} from "./types.js";

// Exported so src/pdf.ts can reject over-length extracted text with the same
// limit before it ever reaches createRuleDraft.
export const INPUT_MAX_LENGTH = 20_000;
const DISTANCE_UPPER_BOUND_M = 2_000_000;
const SCORE_OR_PERCENT_UPPER_BOUND = 100;

// Distance is stored/verified in meters (D2), but source policy text quotes it in km
// (e.g. "100km"). A quote grounds a value if its number matches directly, or matches
// after km->m conversion.
const KM_TO_M = 1_000;

function manualDraft(issue: RuleDraftIssueCode): RuleDraftResult {
  const blankValues = Object.fromEntries(
    RULE_DRAFT_FIELD_NAMES.map((name) => [name, null]),
  ) as RuleDraftValues;
  const blankEvidence = Object.fromEntries(
    RULE_DRAFT_FIELD_NAMES.map((name) => [name, null]),
  ) as RuleDraftEvidence;
  return {
    state: "manual_required",
    reviewRequired: true,
    values: blankValues,
    evidence: blankEvidence,
    issues: [issue],
  };
}

function normalizedWhitespace(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

function supportedValue(name: RuleDraftFieldName, value: number | null): boolean {
  if (value === null) return true;
  if (!Number.isInteger(value)) return false;
  if (value < 0) return false;
  if (name === "minimumDistanceM") return value <= DISTANCE_UPPER_BOUND_M;
  return value <= SCORE_OR_PERCENT_UPPER_BOUND;
}

function quoteNumbers(quote: string): number[] {
  const matches = quote.match(/\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?/gu) ?? [];
  return matches.map((match) => Number(match.replaceAll(",", "")));
}

function groundedInSource(
  source: string,
  quote: string | null,
  value: number,
  name: RuleDraftFieldName,
): boolean {
  if (typeof quote !== "string" || !quote.trim()) return false;
  if (!normalizedWhitespace(source).includes(normalizedWhitespace(quote))) return false;
  const numbers = quoteNumbers(quote);
  if (name === "minimumDistanceM") {
    return numbers.some((number) => number === value || number * KM_TO_M === value);
  }
  return numbers.some((number) => number === value);
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

export async function createRuleDraft(
  policyText: string,
  { extract }: { extract: RuleDraftExtractor },
): Promise<RuleDraftResult> {
  if (typeof policyText !== "string" || !policyText.trim()) return manualDraft("EMPTY_INPUT");
  if (policyText.length > INPUT_MAX_LENGTH) return manualDraft("INPUT_TOO_LONG");

  let candidate: RuleDraftCandidate;
  try {
    candidate = await extract(policyText);
  } catch (error) {
    return manualDraft(extractionIssueCode(error) ?? "EXTRACTION_FAILED");
  }

  if (
    !candidate ||
    typeof candidate.values !== "object" ||
    !candidate.values ||
    typeof candidate.evidence !== "object" ||
    !candidate.evidence
  ) {
    return manualDraft("UNVERIFIED_EXTRACTION");
  }

  for (const name of RULE_DRAFT_FIELD_NAMES) {
    const value = candidate.values[name] ?? null;
    const quote = candidate.evidence[name] ?? null;
    if (!supportedValue(name, value)) return manualDraft("UNVERIFIED_EXTRACTION");
    if (value === null) {
      if (quote !== null) return manualDraft("UNVERIFIED_EXTRACTION");
    } else if (!groundedInSource(policyText, quote, value, name)) {
      return manualDraft("UNVERIFIED_EXTRACTION");
    }
  }

  const values = Object.fromEntries(
    RULE_DRAFT_FIELD_NAMES.map((name) => [name, candidate.values[name] ?? null]),
  ) as RuleDraftValues;
  const evidence = Object.fromEntries(
    RULE_DRAFT_FIELD_NAMES.map((name) => [name, candidate.evidence[name] ?? null]),
  ) as RuleDraftEvidence;

  if (RULE_DRAFT_FIELD_NAMES.every((name) => values[name] === null)) {
    return manualDraft("NO_SUPPORTED_FIELDS");
  }

  return {
    state: "draft",
    reviewRequired: true,
    values,
    evidence,
    issues: RULE_DRAFT_FIELD_NAMES.some((name) => values[name] === null) ? ["MISSING_FIELDS"] : [],
  };
}
