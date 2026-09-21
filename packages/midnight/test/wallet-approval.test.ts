import { describe, expect, it } from "vitest";
import * as Ledger from "@midnight-ntwrk/midnight-js-protocol/ledger";
import { matchesApprovalAction, type ApprovalDisplay } from "../browser/wallet-runtime.js";

const display: ApprovalDisplay = { approvalRequestId: "approval", operationId: "operation",
  step: "deploy", chainContractAddress: "expected-address", network: "local",
  previousStateCommitment: "0".repeat(64), newStateCommitment: "1".repeat(64) };
function action<T extends object>(prototype: object, fields: Record<string, unknown>): T {
  const value = Object.create(prototype) as T;
  for (const [name, field] of Object.entries(fields)) Object.defineProperty(value, name, { value: field });
  return value;
}

describe("subscriber bootstrap transaction approval", () => {
  const deploy = action<Ledger.ContractDeploy>(Ledger.ContractDeploy.prototype, { address: "expected-address" });
  const call = action<Ledger.ContractCall<Ledger.Proof>>(Ledger.ContractCall.prototype,
    { address: "expected-address", entryPoint: "deploy" });

  it("accepts only a matching deployment action for deploy approval", () => {
    expect(matchesApprovalAction([deploy], display)).toBe(true);
    expect(matchesApprovalAction([call], display)).toBe(false);
    expect(matchesApprovalAction([deploy, deploy], display)).toBe(false);
    expect(matchesApprovalAction([action<Ledger.ContractDeploy>(Ledger.ContractDeploy.prototype,
      { address: "other-address" })], display)).toBe(false);
  });

  it("accepts only the expected circuit call for Genesis approval", () => {
    const genesisDisplay = { ...display, step: "initialize" };
    const initialize = action<Ledger.ContractCall<Ledger.Proof>>(Ledger.ContractCall.prototype,
      { address: "expected-address", entryPoint: "initialize" });
    expect(matchesApprovalAction([initialize], genesisDisplay)).toBe(true);
    expect(matchesApprovalAction([deploy], genesisDisplay)).toBe(false);
    expect(matchesApprovalAction([call], genesisDisplay)).toBe(false);
  });
});
