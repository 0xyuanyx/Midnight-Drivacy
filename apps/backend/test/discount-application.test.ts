import { describe, expect, it, vi } from "vitest";
import type { ConfirmedState, FinalEvaluationResult, RegisteredRule, Scope, User } from "@drivacy/shared";
import { DiscountApplicationService } from "../src/final-evaluation/discount-application-service.js";
import type { DiscountApplicationRepository, DiscountApplicationRow, VerifiedEvaluation } from "../src/final-evaluation/discount-application-repository.js";

const driver: User = { id: "driver", email: "driver@example.invalid", role: "DRIVER" };
const insurer: User = { id: "insurer-user", email: "insurer@example.invalid", role: "INSURER" };
const scope: Scope = { applicantId: driver.id, contractId: "contract", insurerId: "insurer", endorsementId: "special",
  evaluationPeriod: { id: "period", startDate: "2026-09-01", endDate: "2026-09-30" } };
const rule: RegisteredRule = { approval: "approved", registration: "chain-confirmed", ruleHash: "rule-hash",
  adapterProfile: "profile", network: "local", chainContractAddress: "chain-contract", registrationTransactionId: "registration",
  rule: { id: "rule", version: 1, insurerId: "insurer", endorsementId: "special", formula: "cumulative-event-deduction-v1",
    initialScore: 100, speedingPenalty: 2, accelerationPenalty: 1, brakingPenalty: 3, minimumDistanceM: 500000,
    minimumScore: 80, premiumMinimumScore: 90, baseDiscountBps: 1000, premiumDiscountBps: 1200 } };
const confirmed: ConfirmedState = { kind: "confirmed", state: { scope, rule: { id: "rule", version: 1, ruleHash: "rule-hash" },
  version: 2, tripCount: 2, totals: { distanceM: 550000, durationSeconds: 1000, speedingCount: 3, accelerationCount: 1, brakingCount: 2 },
  score: 87, conditionsMet: true, expectedDiscountBps: 1000, datasetRoot: "dataset", stateSalt: "a".repeat(64), stateCommitment: "state" },
  confirmation: { execution: "live", network: "local", adapterProfile: "profile", chainContractAddress: "chain-contract",
    transactionId: "trip-tx", blockId: "trip-block", operationId: "trip-op", previousStateCommitment: "previous",
    newStateCommitment: "state", ruleHash: "rule-hash", datasetRoot: "dataset", observedAt: "2026-09-22T00:00:00Z" } };

const row = (operationId = "evaluation-op"): DiscountApplicationRow => ({ id: "application", ownerUserId: driver.id,
  insuranceContractId: "contract", specialContractId: "special", insurerId: "insurer",
  evaluationScopeId: "scope", evaluationPeriodId: "period", ruleVersionId: "rule-version",
  stateCommitment: "state", stateVersion: "2", ruleHash: "rule-hash", evaluationOperationId: operationId,
  resultCommitment: null, nullifier: null, verificationStatus: "PENDING", reviewStatus: "PENDING_REVIEW",
  score: 87, distanceM: "550000", conditionsMet: true, expectedDiscountBps: 1000, appliedDiscountBps: null,
  network: "local", adapterProfile: "profile", chainContractAddress: "chain-contract", transactionId: null,
  submittedAt: "2026-09-23T00:00:00Z", verifiedAt: null, decidedAt: null, confirmedState: confirmed, registeredRule: rule,
  ruleId: "rule", ruleVersion: "1", evaluationStartsOn: "2026-09-01", evaluationEndsOn: "2026-09-30" });
type VerifiedResult = Extract<FinalEvaluationResult, { status: "verified" }>;
const verified = (operationId: string): VerifiedResult => ({ contractVersion: "bc-v1", execution: "live", operationId,
  status: "verified", scope, stateCommitment: "state", stateVersion: 2, rule: { id: "rule", version: 1, ruleHash: "rule-hash" },
  resultCommitment: "result", nullifier: "nullifier", score: 87, distanceM: 550000, conditionsMet: true,
  expectedDiscountBps: 1000, network: "local", adapterProfile: "profile", chainContractAddress: "chain-contract",
  transactionId: "evaluation-tx", blockId: "block", observedAt: "2026-09-23T00:00:00Z" });

class MemoryRepository implements DiscountApplicationRepository {
  current?: DiscountApplicationRow; created = true; nullifierConflict = false; eligible = true;
  async reserve(_owner: string, _contract: string, _special: string, operationId: string) {
    if (!this.eligible) return undefined;
    if (!this.current) this.current = row(operationId); else this.created = false;
    return { row: this.current, created: this.created };
  }
  async markVerified(_id: string, value: VerifiedEvaluation) { if (this.nullifierConflict) throw Object.assign(new Error(), { code: "23505" });
    this.current = { ...this.current!, verificationStatus: "VERIFIED", resultCommitment: value.resultCommitment,
      nullifier: value.nullifier, transactionId: value.transactionId, verifiedAt: new Date() }; return this.current; }
  async markFailed() { this.current = { ...this.current!, verificationStatus: "FAILED", verifiedAt: new Date() }; return this.current; }
  async listOwned(userId: string) { return this.current?.ownerUserId === userId ? [this.current] : []; }
  async findOwned(id: string, userId: string) { return this.current?.id === id && this.current.ownerUserId === userId ? this.current : undefined; }
  async listForInsurer() { return this.current ? [this.current] : []; }
  async findForInsurer(id: string) { return this.current?.id === id ? this.current : undefined; }
  async decide(_id: string, _user: string, decision: "APPLIED" | "REJECTED") { if (this.current?.reviewStatus !== "PENDING_REVIEW") return undefined;
    this.current = { ...this.current, reviewStatus: decision, appliedDiscountBps: decision === "APPLIED" ? 1000 : null, decidedAt: new Date() }; return this.current; }
  async claimDue() { return this.current ? [{ row: this.current, claimToken: "claim" }] : []; }
  async scheduleStatusCheck() { return true; }
}
const setup = (repository = new MemoryRepository()) => {
  const adapter = { startEvaluation: vi.fn(), getEvaluationStatus: vi.fn() };
  return { repository, adapter, service: new DiscountApplicationService(repository, adapter, { network: "local", adapterProfile: "profile" }) };
};

describe("DiscountApplicationService", () => {
  it.each(["confirmed State가 없음", "Genesis만 존재", "다른 가입자의 계약"])("rejects when %s", async () => {
    const repository = new MemoryRepository(); repository.eligible = false;
    await expect(setup(repository).service.create(driver, "contract", "special"))
      .rejects.toMatchObject({ code: "FINAL_STATE_NOT_ELIGIBLE" });
  });
  it("reserves the latest confirmed State and stores only a verified C result", async () => {
    const x = setup(); x.adapter.startEvaluation.mockImplementation(async request => verified(request.operationId));
    const result = await x.service.create(driver, "contract", "special");
    expect(result).toMatchObject({ verificationStatus: "VERIFIED", resultCommitment: "result", nullifier: "nullifier" });
    expect(x.adapter.startEvaluation.mock.calls[0]?.[0]).toMatchObject({ confirmed, registeredRule: rule });
  });
  it("keeps pending states out of insurer review completion", async () => {
    const x = setup(); x.adapter.startEvaluation.mockImplementation(async request => ({ contractVersion: "bc-v1", execution: "live",
      operationId: request.operationId, status: "proving" }));
    await expect(x.service.create(driver, "contract", "special")).resolves.toMatchObject({ verificationStatus: "PENDING" });
    await expect(x.service.decide(insurer, "application", "APPLIED")).rejects.toMatchObject({ code: "APPLICATION_NOT_VERIFIED" });
  });
  it("persists a terminal evaluation failure separately from insurer rejection", async () => {
    const x = setup(); x.adapter.startEvaluation.mockImplementation(async request => ({ contractVersion: "bc-v1", execution: "live",
      operationId: request.operationId, status: "failed", error: { code: "PROOF_INVALID", retryable: false } }));
    await expect(x.service.create(driver, "contract", "special")).resolves.toMatchObject({ verificationStatus: "FAILED", reviewStatus: "PENDING_REVIEW" });
  });
  it("reuses the stored operationId after an unavailable response instead of starting again", async () => {
    const x = setup(); x.adapter.startEvaluation.mockRejectedValueOnce(new Error("network"));
    await expect(x.service.create(driver, "contract", "special")).rejects.toThrow("network");
    x.adapter.getEvaluationStatus.mockImplementation(async operationId => verified(operationId));
    await expect(x.service.create(driver, "contract", "special")).resolves.toMatchObject({ verificationStatus: "VERIFIED" });
    expect(x.adapter.startEvaluation).toHaveBeenCalledTimes(1); expect(x.adapter.getEvaluationStatus).toHaveBeenCalledTimes(1);
  });
  it("lets only one parallel same-State request start C", async () => {
    const x = setup();
    x.adapter.startEvaluation.mockImplementation(async request => ({ contractVersion: "bc-v1", execution: "live",
      operationId: request.operationId, status: "pending" }));
    x.adapter.getEvaluationStatus.mockImplementation(async operationId => ({ contractVersion: "bc-v1", execution: "live",
      operationId, status: "pending" }));
    await Promise.all([x.service.create(driver, "contract", "special"), x.service.create(driver, "contract", "special")]);
    expect(x.adapter.startEvaluation).toHaveBeenCalledTimes(1);
    expect(x.adapter.getEvaluationStatus).toHaveBeenCalledTimes(1);
  });
  it.each([
    ["operation", (r: VerifiedResult) => ({ ...r, operationId: "other" })],
    ["state", (r: VerifiedResult) => ({ ...r, stateCommitment: "other" })],
    ["rule", (r: VerifiedResult) => ({ ...r, rule: { ...r.rule, ruleHash: "other" } })],
    ["scope", (r: VerifiedResult) => ({ ...r, scope: { ...r.scope, contractId: "other" } })],
    ["insurer", (r: VerifiedResult) => ({ ...r, scope: { ...r.scope, insurerId: "other" } })],
    ["evaluation period id", (r: VerifiedResult) => ({ ...r, scope: { ...r.scope,
      evaluationPeriod: { ...r.scope.evaluationPeriod, id: "other" } } })],
    ["evaluation period start", (r: VerifiedResult) => ({ ...r, scope: { ...r.scope,
      evaluationPeriod: { ...r.scope.evaluationPeriod, startDate: "2026-09-02" } } })],
    ["evaluation period end", (r: VerifiedResult) => ({ ...r, scope: { ...r.scope,
      evaluationPeriod: { ...r.scope.evaluationPeriod, endDate: "2026-10-01" } } })],
  ])("rejects a %s binding mismatch", async (_name, mutate) => {
    const x = setup(); x.adapter.startEvaluation.mockImplementation(async request => mutate(verified(request.operationId)));
    await expect(x.service.create(driver, "contract", "special")).rejects.toMatchObject({ code: "FINAL_EVALUATION_MISMATCH" });
  });
  it("maps the DB nullifier uniqueness defense to a conflict", async () => {
    const x = setup(); x.repository.nullifierConflict = true;
    x.adapter.startEvaluation.mockImplementation(async request => verified(request.operationId));
    await expect(x.service.create(driver, "contract", "special")).rejects.toMatchObject({ code: "NULLIFIER_CONFLICT" });
  });
  it("rejects insurer submission and driver insurer review", async () => {
    const x = setup(); await expect(x.service.create(insurer, "contract", "special")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(x.service.listForInsurer(driver)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("applies only the verified expected discount and makes the decision immutable", async () => {
    const repository = new MemoryRepository(); repository.current = { ...row(), verificationStatus: "VERIFIED", resultCommitment: "r", nullifier: "n", verifiedAt: new Date() };
    const x = setup(repository);
    await expect(x.service.decide(insurer, "application", "APPLIED")).resolves.toMatchObject({ reviewStatus: "APPLIED", appliedDiscountBps: 1000 });
    await expect(x.service.decide(insurer, "application", "REJECTED")).rejects.toMatchObject({ code: "APPLICATION_ALREADY_DECIDED" });
  });
  it("records rejection without converting it to evaluation failure and permits no same-State replacement", async () => {
    const repository = new MemoryRepository(); repository.current = { ...row(), verificationStatus: "VERIFIED", resultCommitment: "r", nullifier: "n", verifiedAt: new Date() };
    const x = setup(repository); await x.service.decide(insurer, "application", "REJECTED");
    expect(repository.current).toMatchObject({ verificationStatus: "VERIFIED", reviewStatus: "REJECTED", appliedDiscountBps: null });
    await expect(x.service.create(driver, "contract", "special")).resolves.toMatchObject({ id: "application", reviewStatus: "REJECTED" });
  });
  it("allows a new application after rejection only when a new confirmed commitment is reserved", async () => {
    const repository = new MemoryRepository();
    const next = { ...row(), id: "new-application", stateCommitment: "new-state", stateVersion: "3",
      confirmedState: { ...confirmed, state: { ...confirmed.state, version: 3, tripCount: 3, stateCommitment: "new-state" },
        confirmation: { ...confirmed.confirmation, newStateCommitment: "new-state" } } };
    vi.spyOn(repository, "reserve").mockResolvedValue({ row: next, created: true });
    const x = setup(repository); x.adapter.startEvaluation.mockImplementation(async request => ({ contractVersion: "bc-v1", execution: "live",
      operationId: request.operationId, status: "pending" }));
    await expect(x.service.create(driver, "contract", "special")).resolves.toMatchObject({ id: "new-application", stateCommitment: "new-state" });
  });
  it("never exposes raw records, salts, witness, path, or wallet material", async () => {
    const repository = new MemoryRepository(); repository.current = row(); const result = await setup(repository).service.getMine(driver, "application");
    const json = JSON.stringify(result);
    for (const privateName of ["records", "segments", "datasetSalt", "stateSalt", "ownerSecret", "witness", "wallet", "gps", "path"]) expect(json).not.toContain(privateName);
  });
});
