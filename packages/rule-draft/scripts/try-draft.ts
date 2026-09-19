// Manual, human-triggered check that the Gemini provider (src/providers/gemini.ts)
// actually reaches the live API with a real key. Not part of the automated test
// suite (that suite mocks fetch — see test/provider-gemini.test.ts) because this
// script makes a real network call and costs real API usage.
//
// Usage: node --env-file=.env --import tsx packages/rule-draft/scripts/try-draft.ts <policy-text-file>
//
// Prints only a summary (state, field count, issue codes, model, latency) —
// never the source text, the API key, or the raw provider response — so the
// caller can safely paste stdout into a log file.
import { readFile } from "node:fs/promises";
import {
  createGeminiProvider,
  createRuleDraft,
  RULE_DRAFT_FIELD_NAMES,
  RuleDraftProviderError,
  type DraftProvider,
} from "../src/index.js";

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("usage: try-draft.ts <policy-text-file>");
    process.exitCode = 1;
    return;
  }

  const policyText = await readFile(filePath, "utf8");
  const configuredModel = process.env.GEMINI_MODEL?.trim() || "(unset)";

  const provider = createGeminiProvider();
  const startedAt = Date.now();
  // draft.ts swallows any extract() error into a generic manual_required
  // result (issue code EXTRACTION_FAILED unless the error carries a known
  // RuleDraftIssueCode), which would otherwise hide the real HTTP
  // status/message from this diagnostic run. Capture it on the side so the
  // summary can still report it (message only — response bodies are never
  // logged).
  let rawExtractError: string | null = null;
  const observedProvider: DraftProvider = {
    name: provider.name,
    async extract(text: string) {
      try {
        return await provider.extract(text);
      } catch (error) {
        rawExtractError = error instanceof Error ? error.message : String(error);
        throw error;
      }
    },
  };

  try {
    const result = await createRuleDraft(policyText, observedProvider);
    const elapsedMs = Date.now() - startedAt;
    const filledCount = RULE_DRAFT_FIELD_NAMES.filter((name) => result.values[name] !== null).length;

    console.log(
      JSON.stringify(
        {
          configuredModel,
          usedModel: result.provider.model,
          elapsedMs,
          state: result.state,
          filledFieldCount: filledCount,
          totalFieldCount: RULE_DRAFT_FIELD_NAMES.length,
          issues: result.issues,
          rawExtractError,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    const elapsedMs = Date.now() - startedAt;
    if (error instanceof RuleDraftProviderError) {
      console.log(
        JSON.stringify({ configuredModel, elapsedMs, state: "error", code: error.code, message: error.message }, null, 2),
      );
      return;
    }
    const message = error instanceof Error ? error.message : String(error);
    console.log(JSON.stringify({ configuredModel, elapsedMs, state: "error", code: "UNKNOWN", message }, null, 2));
  }
}

await main();
