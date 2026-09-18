import { describe, expect, it } from "vitest";
import { createGeminiProvider, RuleDraftProviderError } from "../src/providers/gemini.js";
import type { RuleDraftCandidate } from "../src/types.js";

const candidate: RuleDraftCandidate = {
  values: {
    minimumDistanceM: 100_000,
    minimumScore: 80,
    discountPercent: 10,
    speedingPenaltyPoints: 2,
    hardBrakePenaltyPoints: 3,
    hardAccelPenaltyPoints: null,
  },
  evidence: {
    minimumDistanceM: "누적 100km 이상",
    minimumScore: "최종 점수 80점 이상",
    discountPercent: "보험료 10% 할인",
    speedingPenaltyPoints: "과속 1회당 2점",
    hardBrakePenaltyPoints: "급제동 1회당 3점",
    hardAccelPenaltyPoints: null,
  },
};

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as unknown as Response;
}

describe("createGeminiProvider config", () => {
  it("키가 없으면 생성 시점에 PROVIDER_UNAVAILABLE로 실패한다", () => {
    let error: unknown;
    try {
      createGeminiProvider({ apiKey: undefined, model: undefined });
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(RuleDraftProviderError);
    expect((error as RuleDraftProviderError).code).toBe("PROVIDER_UNAVAILABLE");
  });

  it("모델만 없어도 PROVIDER_UNAVAILABLE로 실패한다", () => {
    expect(() => createGeminiProvider({ apiKey: "key", model: undefined })).toThrow(RuleDraftProviderError);
  });
});

describe("createGeminiProvider().extract", () => {
  it("정상 응답을 candidate로 파싱한다", async () => {
    const fetchImpl = async () =>
      jsonResponse({
        candidates: [{ content: { parts: [{ text: JSON.stringify(candidate) }] } }],
      });

    const provider = createGeminiProvider({ apiKey: "key", model: "gemini-3.8-flash", fetchImpl });
    const result = await provider.extract("policy text");
    expect(result).toEqual(candidate);
  });

  it("[G2 수정] API 키를 URL 쿼리스트링이 아니라 헤더로 보낸다", async () => {
    let capturedUrl: string | undefined;
    let capturedHeaders: HeadersInit | undefined;
    const fetchImpl = async (url: string, init?: RequestInit) => {
      capturedUrl = url;
      capturedHeaders = init?.headers;
      return jsonResponse({
        candidates: [{ content: { parts: [{ text: JSON.stringify(candidate) }] } }],
      });
    };

    const provider = createGeminiProvider({ apiKey: "secret-key", model: "gemini-3.8-flash", fetchImpl });
    await provider.extract("policy text");

    expect(capturedUrl).not.toContain("secret-key");
    expect(capturedUrl).not.toContain("key=");
    expect((capturedHeaders as Record<string, string>)["x-goog-api-key"]).toBe("secret-key");
  });

  it("타임아웃 시 PROVIDER_TIMEOUT을 던진다", async () => {
    const fetchImpl = async (_url: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const abortError = new Error("The operation was aborted");
          abortError.name = "TimeoutError";
          reject(abortError);
        });
      });

    const provider = createGeminiProvider({
      apiKey: "key",
      model: "gemini-3.8-flash",
      fetchImpl,
      timeoutMs: 1,
    });

    let error: unknown;
    try {
      await provider.extract("policy text");
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(RuleDraftProviderError);
    expect((error as RuleDraftProviderError).code).toBe("PROVIDER_TIMEOUT");
  });

  it("HTTP 오류 응답이면 오류를 던진다", async () => {
    const fetchImpl = async () => jsonResponse({ error: "bad request" }, false, 400);
    const provider = createGeminiProvider({ apiKey: "key", model: "gemini-3.8-flash", fetchImpl });
    await expect(provider.extract("policy text")).rejects.toThrow(/status 400/u);
  });

  it("구조화 텍스트가 깨진 JSON이면 오류를 던진다", async () => {
    const fetchImpl = async () =>
      jsonResponse({
        candidates: [{ content: { parts: [{ text: "{not valid json" }] } }],
      });
    const provider = createGeminiProvider({ apiKey: "key", model: "gemini-3.8-flash", fetchImpl });
    await expect(provider.extract("policy text")).rejects.toThrow();
  });

  it("응답에 구조화 텍스트가 없으면 오류를 던진다", async () => {
    const fetchImpl = async () => jsonResponse({ candidates: [] });
    const provider = createGeminiProvider({ apiKey: "key", model: "gemini-3.8-flash", fetchImpl });
    await expect(provider.extract("policy text")).rejects.toThrow(/no structured text/u);
  });
});
