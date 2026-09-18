import type { DraftProvider } from "../provider.js";
import { RULE_DRAFT_FIELD_NAMES, type RuleDraftCandidate } from "../types.js";

function emptyCandidate(): RuleDraftCandidate {
  return {
    values: Object.fromEntries(
      RULE_DRAFT_FIELD_NAMES.map((name) => [name, null]),
    ) as RuleDraftCandidate["values"],
    evidence: Object.fromEntries(
      RULE_DRAFT_FIELD_NAMES.map((name) => [name, null]),
    ) as RuleDraftCandidate["evidence"],
  };
}

// Deterministic, no-network provider for tests, local dev, and manual fallback
// when no real provider is configured. Returns a fixed candidate (all fields
// null by default) regardless of input.
export function createFakeProvider(candidate: RuleDraftCandidate = emptyCandidate()): DraftProvider {
  return {
    async extract() {
      return candidate;
    },
  };
}
