import { describe, expect, it, vi } from "vitest";
import type { FinalEvaluationResult } from "@drivacy/shared";
import { FINAL_EVALUATION_STATUS_CHECK_MS, FinalEvaluationRecoveryService } from "../src/final-evaluation/final-evaluation-recovery.js";
import type { DiscountApplicationRow } from "../src/final-evaluation/discount-application-repository.js";

const now = new Date("2026-09-23T01:00:00Z");
const application: DiscountApplicationRow = { id: "application", ownerUserId: "driver", insuranceContractId: "contract",
  specialContractId: "special", evaluationScopeId: "scope", ruleVersionId: "rule-version", stateCommitment: "state",
  stateVersion: "2", ruleHash: "rule-hash", evaluationOperationId: "operation", resultCommitment: null, nullifier: null,
  verificationStatus: "PENDING", reviewStatus: "PENDING_REVIEW", score: 87, distanceM: "550000", conditionsMet: true,
  expectedDiscountBps: 1000, appliedDiscountBps: null, network: "local", adapterProfile: "profile",
  chainContractAddress: "contract-address", transactionId: null, submittedAt: now, verifiedAt: null, decidedAt: null,
  ruleId: "rule", ruleVersion: "1" };
const status = (value: FinalEvaluationResult["status"]): FinalEvaluationResult => {
  if (value === "awaiting-wallet-approval") return { contractVersion: "bc-v1", execution: "live", operationId: "operation",
    status: value, approvalRequestId: "approval" };
  if (value === "submitted" || value === "chain-unknown") return { contractVersion: "bc-v1", execution: "live",
    operationId: "operation", status: value, transactionId: "transaction" };
  if (value === "failed") return { contractVersion: "bc-v1", execution: "live", operationId: "operation", status: value,
    error: { code: "PROOF_INVALID", retryable: false } };
  if (value === "verified") throw new Error("verified fixture is supplied by the application service test");
  return { contractVersion: "bc-v1", execution: "live", operationId: "operation", status: value };
};

const setup = (result: FinalEvaluationResult) => {
  let available = true;
  const repository = {
    claimDue: vi.fn(async () => available ? (available = false, [{ row: application, claimToken: "claim" }]) : []),
    scheduleStatusCheck: vi.fn(async () => true),
  };
  const adapter = { startEvaluation: vi.fn(), getEvaluationStatus: vi.fn(async () => result) };
  const applications = { reconcileEvaluationStatus: vi.fn(async (row: DiscountApplicationRow, input: FinalEvaluationResult) =>
    input.status === "verified" ? { ...row, verificationStatus: "VERIFIED" as const }
      : input.status === "failed" ? { ...row, verificationStatus: "FAILED" as const } : row) };
  const recovery = new FinalEvaluationRecoveryService(repository as never, applications as never, adapter, () => now);
  return { repository, adapter, applications, recovery };
};

describe("FinalEvaluationRecoveryService", () => {
  it.each(["pending", "proving", "awaiting-wallet-approval", "submitted", "chain-unknown"] as const)(
    "keeps %s as PENDING and schedules the same operation", async value => {
      const x = setup(status(value)); await x.recovery.recoverDue(25);
      expect(x.adapter.getEvaluationStatus).toHaveBeenCalledWith("operation");
      expect(x.adapter.startEvaluation).not.toHaveBeenCalled();
      expect(x.repository.scheduleStatusCheck).toHaveBeenCalledWith("application", "claim",
        new Date(now.getTime() + FINAL_EVALUATION_STATUS_CHECK_MS), undefined);
    });

  it.each(["verified", "failed"] as const)("lets the shared reconciler persist terminal %s without changing review", async value => {
    const result = value === "failed" ? status("failed") : { contractVersion: "bc-v1", execution: "live", operationId: "operation",
      status: "verified", scope: { applicantId: "driver", contractId: "contract", insurerId: "insurer", endorsementId: "special",
        evaluationPeriod: { id: "period", startDate: "2026-09-01", endDate: "2026-09-30" } }, stateCommitment: "state",
      stateVersion: 2, rule: { id: "rule", version: 1, ruleHash: "rule-hash" }, resultCommitment: "result", nullifier: "nullifier",
      score: 87, distanceM: 550000, conditionsMet: true, expectedDiscountBps: 1000, network: "local", adapterProfile: "profile",
      chainContractAddress: "contract-address", transactionId: "transaction", blockId: "block", observedAt: now.toISOString() } as const;
    const x = setup(result); await x.recovery.recoverDue(25);
    expect(x.applications.reconcileEvaluationStatus).toHaveBeenCalledWith(application, result);
    expect(x.repository.scheduleStatusCheck).not.toHaveBeenCalled();
    expect(application.reviewStatus).toBe("PENDING_REVIEW");
  });

  it.each([new Error("timeout"), Object.assign(new Error("unavailable"), { code: "FINAL_EVALUATION_UNAVAILABLE" }),
    Object.assign(new Error("mismatch"), { code: "FINAL_EVALUATION_MISMATCH" }),
    Object.assign(new Error("nullifier"), { code: "NULLIFIER_CONFLICT" })])(
    "keeps PENDING and releases the claim for status/binding failure", async error => {
      const x = setup(status("pending")); x.adapter.getEvaluationStatus.mockRejectedValueOnce(error);
      await expect(x.recovery.recoverDue(25)).resolves.toBeUndefined();
      expect(x.repository.scheduleStatusCheck).toHaveBeenCalledWith("application", "claim",
        new Date(now.getTime() + FINAL_EVALUATION_STATUS_CHECK_MS), expect.any(String));
    });

  it("allows only one claim result and never starts a new Final Evaluation", async () => {
    const x = setup(status("pending"));
    await Promise.all([x.recovery.recoverDue(25), x.recovery.recoverDue(25)]);
    expect(x.adapter.getEvaluationStatus).toHaveBeenCalledTimes(1);
    expect(x.adapter.startEvaluation).not.toHaveBeenCalled();
  });
});
