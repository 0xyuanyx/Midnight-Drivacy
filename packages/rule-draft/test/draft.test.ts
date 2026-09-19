import { readFileSync } from "node:fs";
import { RuleDraftInputSchema } from "@drivacy/shared";
import { describe, expect, it } from "vitest";
import { createRuleDraft } from "../src/draft.js";
import { RuleDraftPdfError } from "../src/pdf.js";
import type { DraftProvider } from "../src/provider.js";
import { createGeminiProvider, RuleDraftProviderError } from "../src/providers/gemini.js";
import { RULE_DRAFT_FIELD_NAMES, type RuleDraftCandidate, type RuleDraftFieldName } from "../src/types.js";

// Ported from backend/rule-draft/rule-draft.test.mjs (main, untracked) per P2-2.
// P2-10: field names/units follow B's RuleDraftInputSchema (@drivacy/shared):
// distance in integer meters, discounts in bps, two discount tiers.

// Synthetic two-tier rider (not a real policy).
const policy = readFileSync(new URL("./fixtures/synthetic-rider.txt", import.meta.url), "utf8");

const extracted: RuleDraftCandidate = {
  values: {
    speedingPenalty: 2,
    accelerationPenalty: 4,
    brakingPenalty: 3,
    minimumDistanceM: 100_000,
    minimumScore: 80,
    premiumMinimumScore: 90,
    baseDiscountBps: 1_000,
    premiumDiscountBps: 1_500,
  },
  evidence: {
    speedingPenalty: "과속 1회당 2점",
    accelerationPenalty: "급가속 1회당 4점",
    brakingPenalty: "급제동 1회당 3점",
    minimumDistanceM: "누적 100km 이상",
    minimumScore: "최종 점수 80점 이상",
    premiumMinimumScore: "최종 점수 90점 이상",
    baseDiscountBps: "보험료 10% 할인",
    premiumDiscountBps: "보험료 15% 할인",
  },
};

// A candidate with only the given fields filled (value + evidence), rest null.
function only(fields: Partial<Record<RuleDraftFieldName, [number, string]>>): RuleDraftCandidate {
  const candidate: RuleDraftCandidate = { values: {}, evidence: {} };
  for (const name of RULE_DRAFT_FIELD_NAMES) {
    candidate.values[name] = fields[name]?.[0] ?? null;
    candidate.evidence[name] = fields[name]?.[1] ?? null;
  }
  return candidate;
}

// Wraps a bare extract function as a fake provider (no model is called).
function via(extract: (policyText: string) => Promise<RuleDraftCandidate>): DraftProvider {
  return {
    name: "fake",
    extract: async (policyText) => ({ candidate: await extract(policyText), model: null }),
  };
}

describe("createRuleDraft", () => {
  it("2단계 할인 약관의 근거 있는 수치를 B 스키마 필드명 그대로 초안으로 돌려준다", async () => {
    const result = await createRuleDraft(policy, via(async () => extracted));
    expect(result.state).toBe("draft");
    expect(result.reviewRequired).toBe(true);
    expect(result.values).toEqual({
      formula: "cumulative-event-deduction-v1",
      initialScore: 100,
      ...extracted.values,
    });
    expect(result.evidence).toEqual(extracted.evidence);
    expect(result.issues).toEqual([]);
    expect("approved" in result).toBe(false);
    // 1:1 with B's schema: a fully filled draft is a valid RuleDraftInput as-is.
    expect(RuleDraftInputSchema.safeParse(result.values).success).toBe(true);
  });

  it("단일 단계 약관이면 premium 필드는 null로 두어 보험사가 채우게 한다", async () => {
    const singleTier = "누적 100km 이상, 최종 점수 80점 이상이면 보험료 10% 할인.";
    const result = await createRuleDraft(singleTier, via(async () => only({
      minimumDistanceM: [100_000, "누적 100km 이상"],
      minimumScore: [80, "최종 점수 80점 이상"],
      baseDiscountBps: [1_000, "보험료 10% 할인"],
    })));
    expect(result.state).toBe("draft");
    expect(result.values.baseDiscountBps).toBe(1_000);
    expect(result.values.premiumMinimumScore).toBeNull();
    expect(result.values.premiumDiscountBps).toBeNull();
    expect(result.issues).toEqual(["MISSING_FIELDS"]);
  });

  it("천 단위 쉼표가 있는 원문 숫자도 검증한다 (m 단위 직접 표기)", async () => {
    const result = await createRuleDraft("누적 1,000,000m 이상 운행해야 합니다.", via(async () => only({
      minimumDistanceM: [1_000_000, "누적 1,000,000m 이상"],
    })));
    expect(result.state).toBe("draft");
    expect(result.values.minimumDistanceM).toBe(1_000_000);
  });

  it("출처와 맞지 않는 수치를 내면 수동 입력으로 전환한다", async () => {
    const result = await createRuleDraft(policy, via(async () => ({ ...extracted, values: { ...extracted.values, minimumScore: 95 } })));
    expect(result.state).toBe("manual_required");
    expect(result.values.minimumScore).toBeNull();
    expect(result.issues).toEqual(["UNVERIFIED_EXTRACTION"]);
  });

  it("출처 문구가 원문에 없으면 수동 입력으로 전환한다", async () => {
    const result = await createRuleDraft(policy, via(async () => ({
      ...extracted,
      evidence: { ...extracted.evidence, minimumScore: "최종 점수 80점 이상 (가짜)" },
    })));
    expect(result.state).toBe("manual_required");
    expect(result.issues).toEqual(["UNVERIFIED_EXTRACTION"]);
  });

  it("수동 입력 초안도 formula·initialScore 상수는 채우고 추출 필드는 비운다", async () => {
    const result = await createRuleDraft(" ", via(async () => extracted));
    expect(result.state).toBe("manual_required");
    expect(result.values.formula).toBe("cumulative-event-deduction-v1");
    expect(result.values.initialScore).toBe(100);
    expect(RULE_DRAFT_FIELD_NAMES.every((name) => result.values[name] === null)).toBe(true);
  });

  it("공급자 오류는 약관 내용을 노출하지 않고 수동 입력 초안을 제공한다", async () => {
    const result = await createRuleDraft(policy, via(async () => {
      throw new Error(`sensitive: ${policy}`);
    }));
    expect(result.state).toBe("manual_required");
    expect(result.issues).toEqual(["EXTRACTION_FAILED"]);
    expect(JSON.stringify(result).includes(policy)).toBe(false);
  });

  it("빈 입력과 과도한 입력은 모델에 보내지 않는다", async () => {
    let calls = 0;
    const extract = async () => {
      calls += 1;
      return extracted;
    };
    const empty = await createRuleDraft(" ", via(extract));
    const long = await createRuleDraft("가".repeat(20_001), via(extract));
    expect(empty.issues).toEqual(["EMPTY_INPUT"]);
    expect(long.issues).toEqual(["INPUT_TOO_LONG"]);
    expect(calls).toBe(0);
  });

  it("[범위] B 스키마 범위를 벗어난 값(점수 101)은 수동 입력으로 전환한다", async () => {
    const result = await createRuleDraft("최종 점수 101점 이상", via(async () => only({
      minimumScore: [101, "최종 점수 101점 이상"],
    })));
    expect(result.state).toBe("manual_required");
    expect(result.issues).toEqual(["UNVERIFIED_EXTRACTION"]);
  });

  it("[단위] 원문 km 표기는 m 단위 값과 일치하면 승인 전 초안으로 인정한다", async () => {
    const result = await createRuleDraft("누적 250km 이상 운행해야 합니다.", via(async () => only({
      minimumDistanceM: [250_000, "누적 250km 이상"],
    })));
    expect(result.state).toBe("draft");
    expect(result.values.minimumDistanceM).toBe(250_000);
  });

  it("[단위] 원문 km 표기와 m 단위 값이 어긋나면 수동 입력으로 전환한다", async () => {
    // 250km should convert to 250,000m; 25,000m and an unconverted 250 are wrong.
    for (const wrong of [25_000, 250]) {
      const result = await createRuleDraft("누적 250km 이상 운행해야 합니다.", via(async () => only({
        minimumDistanceM: [wrong, "누적 250km 이상"],
      })));
      expect(result.state).toBe("manual_required");
      expect(result.issues).toEqual(["UNVERIFIED_EXTRACTION"]);
    }
  });

  it("[단위] 단위 없는 거리 근거는 m/km를 알 수 없어 수동 입력으로 전환한다", async () => {
    const result = await createRuleDraft("누적 100000 이상 운행해야 합니다.", via(async () => only({
      minimumDistanceM: [100_000, "누적 100000 이상"],
    })));
    expect(result.state).toBe("manual_required");
    expect(result.issues).toEqual(["UNVERIFIED_EXTRACTION"]);
  });

  it("[bps] 원문 10%를 변환 없이 10으로 내면 수동 입력으로 전환한다", async () => {
    const result = await createRuleDraft("보험료 10% 할인", via(async () => only({
      baseDiscountBps: [10, "보험료 10% 할인"],
    })));
    expect(result.state).toBe("manual_required");
    expect(result.issues).toEqual(["UNVERIFIED_EXTRACTION"]);
  });

  it("[bps] 소수 퍼센트(12.5%)도 1250bps로 근거 대조한다", async () => {
    const result = await createRuleDraft("보험료 12.5% 할인", via(async () => only({
      baseDiscountBps: [1_250, "보험료 12.5% 할인"],
    })));
    expect(result.state).toBe("draft");
    expect(result.values.baseDiscountBps).toBe(1_250);
  });

  it("[G2 수정] provider가 PROVIDER_UNAVAILABLE을 던지면 그 코드로 수동 입력 전환한다", async () => {
    const result = await createRuleDraft(policy, via(async () => {
      throw new RuleDraftProviderError("PROVIDER_UNAVAILABLE", "GEMINI_API_KEY and GEMINI_MODEL must be configured");
    }));
    expect(result.state).toBe("manual_required");
    expect(result.issues).toEqual(["PROVIDER_UNAVAILABLE"]);
  });

  it("[G2 수정] provider가 PROVIDER_TIMEOUT을 던지면 그 코드로 수동 입력 전환한다", async () => {
    const result = await createRuleDraft(policy, via(async () => {
      throw new RuleDraftProviderError("PROVIDER_TIMEOUT", "Gemini request timed out");
    }));
    expect(result.state).toBe("manual_required");
    expect(result.issues).toEqual(["PROVIDER_TIMEOUT"]);
  });

  it("[G2 수정] pdf 계층이 PDF_NO_TEXT를 던지면 그 코드로 수동 입력 전환한다", async () => {
    const result = await createRuleDraft(policy, via(async () => {
      throw new RuleDraftPdfError("PDF_NO_TEXT", "PDF has no extractable text");
    }));
    expect(result.state).toBe("manual_required");
    expect(result.issues).toEqual(["PDF_NO_TEXT"]);
  });

  it("[G2 수정] pdf 계층이 PDF_TOO_LARGE를 던지면 그 코드로 수동 입력 전환한다", async () => {
    const result = await createRuleDraft(policy, via(async () => {
      throw new RuleDraftPdfError("PDF_TOO_LARGE", "PDF exceeds size limit");
    }));
    expect(result.state).toBe("manual_required");
    expect(result.issues).toEqual(["PDF_TOO_LARGE"]);
  });
});

describe("createRuleDraft provider 메타 (P2-9)", () => {
  function geminiOk(): Response {
    return {
      ok: true,
      status: 200,
      json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(extracted) }] } }] }),
    } as unknown as Response;
  }
  function gemini503(): Response {
    return { ok: false, status: 503, json: async () => ({}) } as unknown as Response;
  }

  it("정상 초안의 provider.model은 실제로 응답한 모델과 같다", async () => {
    const provider = createGeminiProvider({
      apiKey: "key",
      model: "gemini-3.8-flash",
      fallbackModels: ["gemini-3.7-flash"],
      fetchImpl: async () => geminiOk(),
      retryDelaysMs: [1],
    });
    const result = await createRuleDraft(policy, provider);
    expect(result.state).toBe("draft");
    expect(result.provider).toEqual({ name: "gemini", model: "gemini-3.8-flash" });
  });

  it("폴백 모델로 성공하면 폴백 모델명이 기록된다", async () => {
    const provider = createGeminiProvider({
      apiKey: "key",
      model: "gemini-3.8-flash",
      fallbackModels: ["gemini-3.7-flash", "gemini-3.5-flash"],
      fetchImpl: async (url: string | URL | Request) =>
        String(url).includes("gemini-3.7-flash") ? geminiOk() : gemini503(),
      retryDelaysMs: [1, 1, 1],
    });
    const result = await createRuleDraft(policy, provider);
    expect(result.state).toBe("draft");
    expect(result.provider).toEqual({ name: "gemini", model: "gemini-3.7-flash" });
  });

  it("호출 전 실패는 model=null, 호출 후 전부 실패는 마지막 시도 모델을 남긴다", async () => {
    const provider = createGeminiProvider({
      apiKey: "key",
      model: "gemini-3.8-flash",
      fallbackModels: ["gemini-3.7-flash"],
      fetchImpl: async () => gemini503(),
      retryDelaysMs: [1],
    });
    const empty = await createRuleDraft(" ", provider);
    expect(empty.provider).toEqual({ name: "gemini", model: null });

    const failed = await createRuleDraft(policy, provider);
    expect(failed.state).toBe("manual_required");
    expect(failed.issues).toEqual(["PROVIDER_UNAVAILABLE"]);
    expect(failed.provider).toEqual({ name: "gemini", model: "gemini-3.7-flash" });
  });
});
