import { describe, expect, it } from "vitest";
import { createGeminiProvider, RuleDraftProviderError } from "../src/providers/gemini.js";
import type { RuleDraftCandidate } from "../src/types.js";

const candidate: RuleDraftCandidate = {
  values: {
    speedingPenalty: 2,
    accelerationPenalty: null,
    brakingPenalty: 3,
    minimumDistanceM: 100_000,
    minimumScore: 80,
    premiumMinimumScore: null,
    baseDiscountBps: 1_000,
    premiumDiscountBps: null,
  },
  evidence: {
    speedingPenalty: "과속 1회당 2점",
    accelerationPenalty: null,
    brakingPenalty: "급제동 1회당 3점",
    minimumDistanceM: "누적 100km 이상",
    minimumScore: "최종 점수 80점 이상",
    premiumMinimumScore: null,
    baseDiscountBps: "보험료 10% 할인",
    premiumDiscountBps: null,
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
    expect(result).toEqual({ candidate, model: "gemini-3.8-flash" });
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
      // [P2-8] Timeouts are retried (same as 503/429/network errors), then
      // fall back to other models. Use near-zero backoff so this test stays
      // fast even though every attempt (primary retries + 2 fallbacks) times out.
      retryDelaysMs: [1, 1, 1],
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

// [P2-8] 503 재시도 + 폴백 모델 체인. 실제 백오프 지연은 retryDelaysMs로 근접 0으로 줄여 테스트를 빠르게 유지한다.
describe("createGeminiProvider().extract 재시도/폴백 (P2-8)", () => {
  it("4xx는 즉시 실패하고 재시도하지 않는다", async () => {
    let callCount = 0;
    const fetchImpl = async () => {
      callCount += 1;
      return jsonResponse({ error: "bad request" }, false, 400);
    };
    const provider = createGeminiProvider({
      apiKey: "key",
      model: "gemini-3.8-flash",
      fetchImpl,
      retryDelaysMs: [1, 1, 1],
    });

    await expect(provider.extract("policy text")).rejects.toThrow(/status 400/u);
    expect(callCount).toBe(1);
  });

  it("503 후 재시도에서 성공하면 같은 모델의 결과를 반환한다", async () => {
    let callCount = 0;
    const fetchImpl = async () => {
      callCount += 1;
      if (callCount === 1) return jsonResponse({ error: "unavailable" }, false, 503);
      return jsonResponse({
        candidates: [{ content: { parts: [{ text: JSON.stringify(candidate) }] } }],
      });
    };
    const provider = createGeminiProvider({
      apiKey: "key",
      model: "gemini-3.8-flash",
      fetchImpl,
      retryDelaysMs: [1, 1, 1],
    });

    const result = await provider.extract("policy text");
    expect(result).toEqual({ candidate, model: "gemini-3.8-flash" });
    expect(callCount).toBe(2);
  });

  it("기본 모델과 모든 폴백 모델이 계속 503이면 PROVIDER_UNAVAILABLE로 실패한다", async () => {
    const calledModels: string[] = [];
    const fetchImpl = async (url: string) => {
      calledModels.push(url);
      return jsonResponse({ error: "unavailable" }, false, 503);
    };
    const provider = createGeminiProvider({
      apiKey: "key",
      model: "gemini-3.8-flash",
      fallbackModels: ["gemini-3.7-flash", "gemini-3.5-flash"],
      fetchImpl,
      retryDelaysMs: [1, 1, 1],
    });

    let error: unknown;
    try {
      await provider.extract("policy text");
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(RuleDraftProviderError);
    expect((error as RuleDraftProviderError).code).toBe("PROVIDER_UNAVAILABLE");
    expect((error as RuleDraftProviderError).model).toBe("gemini-3.5-flash");
    // 기본 모델 4회(최초 1 + 재시도 3) + 폴백 2개 모델 각 1회 = 6회
    expect(calledModels.filter((url) => url.includes("gemini-3.8-flash")).length).toBe(4);
    expect(calledModels.some((url) => url.includes("gemini-3.7-flash"))).toBe(true);
    expect(calledModels.some((url) => url.includes("gemini-3.5-flash"))).toBe(true);
  });

  it("기본 모델이 모두 실패해도 폴백 모델이 성공하면 그 모델의 결과를 반환한다", async () => {
    const fetchImpl = async (url: string) => {
      if (url.includes("gemini-3.7-flash")) {
        return jsonResponse({
          candidates: [{ content: { parts: [{ text: JSON.stringify(candidate) }] } }],
        });
      }
      return jsonResponse({ error: "unavailable" }, false, 503);
    };
    const provider = createGeminiProvider({
      apiKey: "key",
      model: "gemini-3.8-flash",
      fallbackModels: ["gemini-3.7-flash", "gemini-3.5-flash"],
      fetchImpl,
      retryDelaysMs: [1, 1, 1],
    });

    const result = await provider.extract("policy text");
    expect(result).toEqual({ candidate, model: "gemini-3.7-flash" });
  });
});
