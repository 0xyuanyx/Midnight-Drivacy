import request from "supertest";
import { describe, expect, it } from "vitest";
import { createFakeProvider } from "@drivacy/rule-draft";
import { RuleDraftInputSchema } from "@drivacy/shared";
import { createApp } from "../src/app.js";
import type { AuthDependencies } from "../src/auth/auth-service.js";
import { AppError } from "../src/errors/app-error.js";
import { RuleDraftService } from "../src/rule-draft/rule-draft-service.js";
import type { RuleService } from "../src/rule/rule-service.js";
import { RuleService as StoredRuleService } from "../src/rule/rule-service.js";
import type { RuleRepository, RuleRow, RuleVersionRow } from "../src/rule/rule-repository.js";

const special = "11111111-1111-4111-8111-111111111111";
const policyText = "과속 1회당 2점 감점 급가속 1회당 1점 감점 급제동 1회당 3점 감점 최소 500km 안전운전 점수 80점 기본 할인 10% 우대 점수 90점 우대 할인 12%";
const provider = createFakeProvider({ values: { speedingPenalty: 2, accelerationPenalty: 1, brakingPenalty: 3, minimumDistanceM: 500000, minimumScore: 80, premiumMinimumScore: 90, baseDiscountBps: 1000, premiumDiscountBps: 1200 }, evidence: { speedingPenalty: "과속 1회당 2점 감점", accelerationPenalty: "급가속 1회당 1점 감점", brakingPenalty: "급제동 1회당 3점 감점", minimumDistanceM: "최소 500km", minimumScore: "안전운전 점수 80점", premiumMinimumScore: "우대 점수 90점", baseDiscountBps: "기본 할인 10%", premiumDiscountBps: "우대 할인 12%" } });
const app = (role: "INSURER" | "DRIVER", allowed = true) => {
  const auth: AuthDependencies = { authRepository: { findUserId: async () => "user", findRoleByUserId: async () => role }, supabaseAuthVerifier: { verifyAccessToken: async () => ({ id: "user", email: "insurer@drivacy.test" }) } };
  const rules = { authorizeDraft: async () => { if (!allowed) throw new AppError("SPECIAL_CONTRACT_NOT_FOUND", "Special contract was not found", 404); } } as RuleService;
  return createApp({ ...auth, ruleDraftService: new RuleDraftService(rules, provider) });
};
class MemoryRules implements RuleRepository { public row: RuleRow | undefined; public versions: RuleVersionRow[]=[];
 async findAuthorizedSpecialContract(){return true;} async findRule(){return this.row;} async findVersions(){return this.versions;} async findVersion(){return this.versions[0];}
 async createRule(s:string,definition:unknown,from:string|null,to:string|null){this.row={id:"22222222-2222-4222-8222-222222222222",specialContractId:s};this.versions=[{version:"1",status:"DRAFT",ruleDefinition:definition,effectiveFrom:from?new Date(from):null,effectiveTo:to?new Date(to):null,approvedBy:null,approvedAt:null,createdAt:new Date("2026-01-01T00:00:00Z"),updatedAt:new Date("2026-01-01T00:00:00Z")}];return this.row;} async updateDraft(){return undefined;} async approveDraft(){return undefined;} async createNextDraft(){return this.versions[0]!;}
}
describe("rule draft route", () => {
  it("returns a review-only draft whose completed values are accepted by the existing save schema", async () => {
    const response = await request(app("INSURER")).post(`/special-contracts/${special}/rule-drafts`).set("Authorization", "Bearer token").send({ policyText });
    expect(response.status).toBe(200); expect(response.body.state).toBe("draft"); expect(response.body.reviewRequired).toBe(true); expect(RuleDraftInputSchema.parse(response.body.values)).toMatchObject({ minimumDistanceM: 500000, baseDiscountBps: 1000 });
  });
  it("stores completed draft values through the existing Rule service as a DRAFT version", async () => {
    const draft = await new RuleDraftService({ authorizeDraft: async () => undefined } as RuleService, provider).create("user", special, policyText);
    const repository = new MemoryRules(); const saved = await new StoredRuleService(repository).create("user", special, draft.values);
    expect(saved.versions[0]).toMatchObject({ status: "DRAFT", ruleDefinition: { minimumDistanceM: 500000 } });
  });
  it("rejects null draft values at the existing Rule save API boundary", async () => {
    const auth: AuthDependencies = { authRepository: { findUserId: async () => "user", findRoleByUserId: async () => "INSURER" }, supabaseAuthVerifier: { verifyAccessToken: async () => ({ id: "user", email: "insurer@drivacy.test" }) } };
    const appWithStorage = createApp({ ...auth, ruleService: new StoredRuleService(new MemoryRules()) });
    const response = await request(appWithStorage).post(`/special-contracts/${special}/rules`).set("Authorization", "Bearer token").send({ formula: "cumulative-event-deduction-v1", initialScore: 100, speedingPenalty: null });
    expect(response.status).toBe(400); expect(response.body.code).toBe("INVALID_REQUEST");
  });
  it("returns manual_required for a missing Gemini configuration/fake fallback without saving a Rule", async () => {
    const service = new RuleDraftService({ authorizeDraft: async () => undefined } as RuleService, createFakeProvider());
    const result = await service.create("user", special, policyText);
    expect(result).toMatchObject({ state: "manual_required", reviewRequired: true }); expect(Object.values(result.values).filter((v) => v === null)).toHaveLength(8);
  });
  it("rejects non-insurers and unauthorized special contracts", async () => {
    const nonInsurer = await request(app("DRIVER")).post(`/special-contracts/${special}/rule-drafts`).set("Authorization", "Bearer token").send({ policyText });
    const forbidden = await request(app("INSURER", false)).post(`/special-contracts/${special}/rule-drafts`).set("Authorization", "Bearer token").send({ policyText });
    expect(nonInsurer.status).toBe(403); expect(forbidden.status).toBe(404);
  });
});
