import { createInsurerApi } from "./backend";

const id = "11111111-1111-4111-8111-111111111111";

describe("insurer backend boundary", () => {
  it("sends edited policy text with a bearer token and returns a review-only draft", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      state: "draft", reviewRequired: true,
      values: { formula: "cumulative-event-deduction-v1", initialScore: 100, speedingPenalty: 2, accelerationPenalty: null, brakingPenalty: null, minimumDistanceM: 500000, minimumScore: 80, premiumMinimumScore: 90, baseDiscountBps: 1000, premiumDiscountBps: 1200 },
      evidence: { speedingPenalty: "과속 2점", accelerationPenalty: null, brakingPenalty: null, minimumDistanceM: "500km", minimumScore: "80점", premiumMinimumScore: "90점", baseDiscountBps: "10%", premiumDiscountBps: "12%" },
      issues: ["MISSING_FIELDS"], provider: { name: "gemini", model: "gemini-test" },
    }), { status: 200, headers: { "content-type": "application/json" } }));
    const api = createInsurerApi({ baseUrl: "http://localhost:3000/", getAccessToken: async () => "token-123", fetcher });

    const result = await api.createRuleDraft(id, "수정된 약관");

    expect(result.state).toBe("draft");
    expect(result.values.minimumDistanceM).toBe(500000);
    expect(fetcher).toHaveBeenCalledWith(`http://localhost:3000/special-contracts/${id}/rule-drafts`, expect.objectContaining({
      method: "POST", headers: { Authorization: "Bearer token-123", "Content-Type": "application/json" }, body: JSON.stringify({ policyText: "수정된 약관" }),
    }));
  });

  it("never sends a request without a token and preserves an API error code", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ code: "FORBIDDEN", message: "denied", requestId: "req-1" }), { status: 403 }));
    const api = createInsurerApi({ baseUrl: "http://localhost:3000", getAccessToken: async () => null, fetcher });
    await expect(api.createRuleDraft(id, "약관")).rejects.toMatchObject({ code: "AUTH_REQUIRED" });
    expect(fetcher).not.toHaveBeenCalled();

    const authenticated = createInsurerApi({ baseUrl: "http://localhost:3000", getAccessToken: async () => "token", fetcher });
    await expect(authenticated.createRuleDraft(id, "약관")).rejects.toMatchObject({ code: "FORBIDDEN", requestId: "req-1" });
  });

  it("rejects an invalid draft response rather than treating it as approved", async () => {
    const api = createInsurerApi({ baseUrl: "http://localhost:3000", getAccessToken: async () => "token", fetcher: async () => new Response(JSON.stringify({ state: "approved" }), { status: 200 }) });
    await expect(api.createRuleDraft(id, "약관")).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  it("keeps rule draft saving separate from approval", async () => {
    const calls: Array<[string, RequestInit]> = [];
    const api = createInsurerApi({ baseUrl: "http://localhost:3000", getAccessToken: async () => "token", fetcher: async (url, init) => { calls.push([url, init]); return new Response(JSON.stringify({ id, specialContractId: id, versions: [] }), { status: 200 }); } });
    const input = { formula: "cumulative-event-deduction-v1" as const, initialScore: 100 as const, speedingPenalty: 2, accelerationPenalty: 1, brakingPenalty: 3, minimumDistanceM: 500000, minimumScore: 80, premiumMinimumScore: 90, baseDiscountBps: 1000, premiumDiscountBps: 1200 };

    await api.saveRuleVersionDraft(id, input);

    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toBe(`http://localhost:3000/special-contracts/${id}/rules/versions`);
    expect(calls[0][1]).toEqual(expect.objectContaining({ method: "POST", body: JSON.stringify(input) }));
  });
});
