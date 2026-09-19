import type { RuleDraftExtraction, RuleDraftProviderName } from "./types.js";

// Provider abstraction so `createRuleDraft` (src/draft.ts) can be called with
// any extraction backend. Adapters carry their own config (API key, model id,
// timeout), are constructed once and reused. `name` and the per-call `model`
// end up in the draft's `provider` meta (P2-9).
export interface DraftProvider {
  readonly name: RuleDraftProviderName;
  extract(policyText: string): Promise<RuleDraftExtraction>;
}
