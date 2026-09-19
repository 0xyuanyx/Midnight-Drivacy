import { describe, expect, it } from "vitest";
import { createRuleDraft } from "../src/draft.js";
import { RuleDraftPdfError } from "../src/pdf.js";
import type { DraftProvider } from "../src/provider.js";
import { createGeminiProvider, RuleDraftProviderError } from "../src/providers/gemini.js";
import type { RuleDraftCandidate } from "../src/types.js";

// Ported from backend/rule-draft/rule-draft.test.mjs (main, untracked) per P2-2.
// Field names/units updated to the P1-1 proposal (docs/contracts/RULE_DRAFT_CONTRACT.md)
// and D2 (docs/PLAN_DECISIONS.md): minimumDistanceKm -> minimumDistanceM (integer meters).
// The two OpenAI-adapter tests from the original file are out of scope here (provider
// adapters belong to P2-3); this file covers createRuleDraft only.

const policy =
  "안전운전 특약: 평가기간 누적 100km 이상, 최종 점수 80점 이상이면 보험료 10% 할인. 과속 1회당 2점, 급제동 1회당 3점 감점.";

const extracted: RuleDraftCandidate = {
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

// Wraps a bare extract function as a fake provider (no model is called).
function via(extract: (policyText: string) => Promise<RuleDraftCandidate>): DraftProvider {
  return {
    name: "fake",
    extract: async (policyText) => ({ candidate: await extract(policyText), model: null }),
  };
}

describe("createRuleDraft", () => {
  it("문구에 근거한 수치만 승인 전 초안으로 돌려준다", async () => {
    const result = await createRuleDraft(policy, via(async () => extracted));
    expect(result.state).toBe("draft");
    expect(result.reviewRequired).toBe(true);
    expect(result.values).toEqual(extracted.values);
    expect(result.evidence).toEqual(extracted.evidence);
    expect(result.issues).toEqual(["MISSING_FIELDS"]);
    expect("approved" in result).toBe(false);
  });

  it("약관에 없는 값은 null로 두어 수기 검토할 수 있다", async () => {
    const result = await createRuleDraft("누적 100km 이상 운행해야 합니다.", via(async () => ({
      values: {
        ...extracted.values,
        minimumScore: null,
        discountPercent: null,
        speedingPenaltyPoints: null,
        hardBrakePenaltyPoints: null,
      },
      evidence: {
        ...extracted.evidence,
        minimumDistanceM: "누적 100km 이상",
        minimumScore: null,
        discountPercent: null,
        speedingPenaltyPoints: null,
        hardBrakePenaltyPoints: null,
      },
    })));
    expect(result.state).toBe("draft");
    expect(result.values.minimumDistanceM).toBe(100_000);
    expect(result.values.minimumScore).toBeNull();
    expect(result.issues).toEqual(["MISSING_FIELDS"]);
  });

  it("천 단위 쉼표가 있는 원문 숫자도 검증한다 (m 단위 직접 표기)", async () => {
    const result = await createRuleDraft("누적 1,000,000m 이상 운행해야 합니다.", via(async () => ({
      values: { minimumDistanceM: 1_000_000, minimumScore: null, discountPercent: null, speedingPenaltyPoints: null, hardBrakePenaltyPoints: null, hardAccelPenaltyPoints: null },
      evidence: { minimumDistanceM: "누적 1,000,000m 이상", minimumScore: null, discountPercent: null, speedingPenaltyPoints: null, hardBrakePenaltyPoints: null, hardAccelPenaltyPoints: null },
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

  it("[단위] 원문 km 표기는 m 단위 값과 일치하면 승인 전 초안으로 인정한다", async () => {
    const result = await createRuleDraft("누적 250km 이상 운행해야 합니다.", via(async () => ({
      values: { minimumDistanceM: 250_000, minimumScore: null, discountPercent: null, speedingPenaltyPoints: null, hardBrakePenaltyPoints: null, hardAccelPenaltyPoints: null },
      evidence: { minimumDistanceM: "누적 250km 이상", minimumScore: null, discountPercent: null, speedingPenaltyPoints: null, hardBrakePenaltyPoints: null, hardAccelPenaltyPoints: null },
    })));
    expect(result.state).toBe("draft");
    expect(result.values.minimumDistanceM).toBe(250_000);
  });

  it("[단위] 원문 km 표기와 m 단위 값이 어긋나면 수동 입력으로 전환한다", async () => {
    const result = await createRuleDraft("누적 250km 이상 운행해야 합니다.", via(async () => ({
      // 250km should convert to 250,000m; 25,000m is a wrong conversion.
      values: { minimumDistanceM: 25_000, minimumScore: null, discountPercent: null, speedingPenaltyPoints: null, hardBrakePenaltyPoints: null, hardAccelPenaltyPoints: null },
      evidence: { minimumDistanceM: "누적 250km 이상", minimumScore: null, discountPercent: null, speedingPenaltyPoints: null, hardBrakePenaltyPoints: null, hardAccelPenaltyPoints: null },
    })));
    expect(result.state).toBe("manual_required");
    expect(result.issues).toEqual(["UNVERIFIED_EXTRACTION"]);
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

  it("[급가속] hardAccelPenaltyPoints도 근거 검증을 통과하면 채워진다", async () => {
    const policyWithHardAccel = `${policy} 급가속 1회당 4점 감점.`;
    const result = await createRuleDraft(policyWithHardAccel, via(async () => ({
      ...extracted,
      values: { ...extracted.values, hardAccelPenaltyPoints: 4 },
      evidence: { ...extracted.evidence, hardAccelPenaltyPoints: "급가속 1회당 4점" },
    })));
    expect(result.state).toBe("draft");
    expect(result.values.hardAccelPenaltyPoints).toBe(4);
    expect(result.issues).toEqual([]);
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
