export const ruleFields = ["speedingPenalty", "accelerationPenalty", "brakingPenalty", "minimumDistanceM", "minimumScore", "premiumMinimumScore", "baseDiscountBps", "premiumDiscountBps"] as const;
export type RuleField = typeof ruleFields[number];

export type RuleDraft = {
  state: "draft" | "manual_required";
  reviewRequired: true;
  values: { formula: "cumulative-event-deduction-v1"; initialScore: 100 } & Record<RuleField, number | null>;
  evidence: Record<RuleField, string | null>;
  issues: string[];
  provider: { name: "gemini" | "fake"; model: string | null };
};
export type RuleDraftInput = { formula: "cumulative-event-deduction-v1"; initialScore: 100 } & Record<RuleField, number> & { effectiveFrom?: string; effectiveTo?: string };

export class BackendApiError extends Error {
  constructor(public readonly code: string, message: string, public readonly requestId?: string) { super(message); }
}

type Fetcher = (url: string, init: RequestInit) => Promise<Response>;
type Config = { baseUrl: string; getAccessToken: () => Promise<string | null>; fetcher?: Fetcher };

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }

function parseRuleDraft(value: unknown): RuleDraft {
  if (!isRecord(value) || !["draft", "manual_required"].includes(String(value.state)) || value.reviewRequired !== true || !isRecord(value.values) || !isRecord(value.evidence) || !Array.isArray(value.issues) || !value.issues.every((issue) => typeof issue === "string") || !isRecord(value.provider) || !["gemini", "fake"].includes(String(value.provider.name)) || !(value.provider.model === null || typeof value.provider.model === "string")) throw new BackendApiError("INVALID_RESPONSE", "규칙 초안 응답 형식이 올바르지 않습니다.");
  if (value.values.formula !== "cumulative-event-deduction-v1" || value.values.initialScore !== 100) throw new BackendApiError("INVALID_RESPONSE", "규칙 초안 응답 형식이 올바르지 않습니다.");
  for (const field of ruleFields) {
    const number = value.values[field];
    const evidence = value.evidence[field];
    if (!(number === null || typeof number === "number" && Number.isFinite(number)) || !(evidence === null || typeof evidence === "string")) throw new BackendApiError("INVALID_RESPONSE", "규칙 초안 응답 형식이 올바르지 않습니다.");
  }
  return value as RuleDraft;
}

export function createInsurerApi({ baseUrl, getAccessToken, fetcher = fetch }: Config) {
  const root = baseUrl.replace(/\/+$/, "");
  async function request(path: string, method: string, body?: unknown): Promise<unknown> {
    const token = await getAccessToken();
    if (!token) throw new BackendApiError("AUTH_REQUIRED", "보험사 로그인이 필요합니다.");
    let response: Response;
    try {
      response = await fetcher(`${root}${path}`, { method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    } catch { throw new BackendApiError("NETWORK_ERROR", "서버에 연결하지 못했습니다."); }
    let data: unknown;
    try { data = await response.json(); } catch { throw new BackendApiError("INVALID_RESPONSE", "서버 응답을 읽지 못했습니다."); }
    if (!response.ok) {
      const error = isRecord(data) ? data : {};
      throw new BackendApiError(typeof error.code === "string" ? error.code : "REQUEST_FAILED", typeof error.message === "string" ? error.message : "요청을 처리하지 못했습니다.", typeof error.requestId === "string" ? error.requestId : undefined);
    }
    return data;
  }
  return {
    async createRuleDraft(specialContractId: string, policyText: string): Promise<RuleDraft> {
      return parseRuleDraft(await request(`/special-contracts/${encodeURIComponent(specialContractId)}/rule-drafts`, "POST", { policyText }));
    },
    saveRuleVersionDraft: (specialContractId: string, input: RuleDraftInput) => request(`/special-contracts/${encodeURIComponent(specialContractId)}/rules/versions`, "POST", input),
    getRules: (specialContractId: string) => request(`/special-contracts/${encodeURIComponent(specialContractId)}/rules`, "GET"),
  };
}

export type InsurerApi = ReturnType<typeof createInsurerApi>;
