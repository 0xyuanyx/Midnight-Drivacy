import { createFakeProvider, createGeminiProvider, createRuleDraft, type DraftProvider, type RuleDraftResult } from "@drivacy/rule-draft";
import type { RuleService } from "../rule/rule-service.js";

export class RuleDraftService {
  public constructor(private readonly rules: RuleService, private readonly provider: DraftProvider = configuredProvider()) {}

  public async create(userId: string, specialContractId: string, policyText: string): Promise<RuleDraftResult> {
    await this.rules.authorizeDraft(userId, specialContractId);
    // 초안은 검토용 결과일 뿐이므로 특약 Rule이나 승인 상태를 DB에 기록하지 않는다.
    return createRuleDraft(policyText, this.provider);
  }
}

const configuredProvider = (): DraftProvider => {
  try { return createGeminiProvider(); }
  // 키·모델이 없을 때도 서버 오류로 끝내지 않고 수기 입력 가능한 빈 초안을 돌려준다.
  catch { return createFakeProvider(); }
};
