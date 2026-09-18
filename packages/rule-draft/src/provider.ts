import type { RuleDraftCandidate } from "./types.js";

// Provider abstraction so `createRuleDraft` (src/draft.ts) can be called with
// any extraction backend. `RuleDraftExtractor` in types.ts is the plain
// function shape; `DraftProvider` wraps it for adapters that carry their own
// config (API key, model id, timeout) constructed once and reused.
export interface DraftProvider {
  extract(policyText: string): Promise<RuleDraftCandidate>;
}
