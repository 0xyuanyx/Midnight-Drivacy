import { describe, expect, it, vi } from "vitest";
import type { ApprovedRule, DeployRuleResult, RegisteredRule, Scope } from "@drivacy/shared";

import { ExternalRuleRegistrationAdapter } from "../src/rule-registration/rule-registration-adapter.js";

const scope: Scope = {
  applicantId: "driver", contractId: "contract", insurerId: "insurer", endorsementId: "special",
  evaluationPeriod: { id: "period", startDate: "2026-09-01", endDate: "2026-09-30" },
};
const approved: ApprovedRule = { approval: "approved", rule: {
  id: "rule", version: 1, insurerId: "insurer", endorsementId: "special",
  formula: "cumulative-event-deduction-v1", initialScore: 100, speedingPenalty: 2,
  accelerationPenalty: 1, brakingPenalty: 3, minimumDistanceM: 500000,
  minimumScore: 80, premiumMinimumScore: 90, baseDiscountBps: 1000, premiumDiscountBps: 1200,
} };
const registered: RegisteredRule = { ...approved, registration: "chain-confirmed", ruleHash: "rule-hash",
  adapterProfile: "production-adapter", network: "preprod", chainContractAddress: "contract-address",
  registrationTransactionId: "registration-tx" };
const deployment: DeployRuleResult = { operationId: "operation", deploymentTransactionId: "deployment-tx",
  registeredRule: registered, confirmedGenesis: { kind: "confirmed", state: { scope,
    rule: { id: "rule", version: 1, ruleHash: "rule-hash" }, version: 0, tripCount: 0,
    totals: { distanceM: 0, durationSeconds: 0, speedingCount: 0, accelerationCount: 0, brakingCount: 0 },
    score: 100, conditionsMet: false, expectedDiscountBps: 0, datasetRoot: "empty-root",
    stateSalt: "a".repeat(64), stateCommitment: "genesis-commitment" }, confirmation: {
    execution: "live", network: "preprod", adapterProfile: "production-adapter",
    chainContractAddress: "contract-address", transactionId: "initialize-tx", blockId: "block",
    operationId: "operation", previousStateCommitment: "0".repeat(64),
    newStateCommitment: "genesis-commitment", ruleHash: "rule-hash", datasetRoot: "empty-root",
    observedAt: "2026-09-22T00:00:00.000Z",
  } } };

const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { "content-type": "application/json" },
});

describe("ExternalRuleRegistrationAdapter", () => {
  it("delegates the three Shared registration operations without owning a wallet key", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(deployment))
      .mockResolvedValueOnce(response({ operationId: "operation", status: "chain-confirmed", result: deployment }))
      .mockResolvedValueOnce(response({ ...registered, rule: { ...registered.rule, version: 2 } }));
    const adapter = new ExternalRuleRegistrationAdapter("https://c-wallet.example/bridge/", "secret", fetchMock as never);

    await expect(adapter.deployRule({ operationId: "operation", scope, approvedRule: approved })).resolves.toEqual(deployment);
    await expect(adapter.getInitialRegistrationStatus("operation")).resolves.toMatchObject({ status: "chain-confirmed" });
    await expect(adapter.updateRule({ scope, deployment: { network: "preprod", adapterProfile: "production-adapter",
      chainContractAddress: "contract-address" }, approvedRule: { ...approved, rule: { ...approved.rule, version: 2 } } }))
      .resolves.toMatchObject({ rule: { version: 2 } });

    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("https://c-wallet.example/bridge/rule-registrations/deploy");
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("/rule-registrations/initial/operation");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ headers: expect.objectContaining({ authorization: "Bearer secret" }) });
  });

  it("fails closed instead of interpreting a lost response as not-submitted", async () => {
    const adapter = new ExternalRuleRegistrationAdapter("https://c-wallet.example/", "secret",
      vi.fn().mockRejectedValue(new Error("network lost")) as never);

    await expect(adapter.getInitialRegistrationStatus("operation"))
      .rejects.toMatchObject({ code: "CHAIN_ADAPTER_UNAVAILABLE", statusCode: 503 });
  });

  it("rejects an adapter status for another operation", async () => {
    const adapter = new ExternalRuleRegistrationAdapter("https://c-wallet.example/", "secret",
      vi.fn().mockResolvedValue(response({ operationId: "other", status: "pending" })) as never);

    await expect(adapter.getInitialRegistrationStatus("operation"))
      .rejects.toMatchObject({ code: "CHAIN_REGISTRATION_INVALID", statusCode: 502 });
  });
});
