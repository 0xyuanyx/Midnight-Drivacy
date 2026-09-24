import { afterEach, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";

import { BrowserApprovalCapabilitySigner, createCWalletHttpServer, type BrowserApprovalCallback, type CWalletProcessingRuntime } from "../runtime/c-wallet-http.js";
import type { ApprovalRequest } from "../src/trip-job.js";

const request: ApprovalRequest = { approvalRequestId: "11111111-1111-4111-8111-111111111111", operationId: "operation-1", tripId: "trip-1",
  network: "preprod", chainContractAddress: "contract-1", step: "beginTrip", previousStateCommitment: "previous", newStateCommitment: "next" };
const digest = "a".repeat(64);
const result = { contractVersion: "bc-v1" as const, execution: "live" as const, operationId: request.operationId,
  tripId: request.tripId, status: "awaiting-wallet-approval" as const, approvalRequestId: request.approvalRequestId };

function runtime() {
  const callbacks: Array<{ request: ApprovalRequest; transactionDigest: string; callback: BrowserApprovalCallback }> = [];
  const value: CWalletProcessingRuntime = {
    async saveSource() { return "source"; }, async loadSource() { throw new Error("unused"); }, async deleteSource() {},
    async startTrip() { return result; }, async retryTemporaryFailure() { return result; }, async getTripStatus() { return result; },
    async canAbandonTrip() { return false; },
    async getBrowserApproval() { return { request, transactionHex: "aabb", transactionDigest: digest, phase: "balance" as const }; },
    async receiveBrowserApproval(input) { callbacks.push(input); },
  };
  return { value, callbacks };
}

describe("C/Wallet HTTP runtime boundary", () => {
  const servers: ReturnType<typeof createCWalletHttpServer>[] = [];
  afterEach(async () => { await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve())))); });

  it("keeps B adapter paths behind its internal token", async () => {
    const fake = runtime(); const signer = new BrowserApprovalCapabilitySigner("s".repeat(32));
    const server = createCWalletHttpServer({ runtime: fake.value, internalAdapterToken: "internal", browserCapabilitySigner: signer }); servers.push(server);
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    await expect(fetch(`${base}/trip-processing/${request.operationId}`)).resolves.toMatchObject({ status: 401 });
    await expect((await fetch(`${base}/trip-processing/${request.operationId}`, { headers: { authorization: "Bearer internal" } })).json()).resolves.toEqual(result);
  });

  it("binds a browser callback to its one approval, digest, network and contract capability", async () => {
    const fake = runtime(); const signer = new BrowserApprovalCapabilitySigner("s".repeat(32));
    const server = createCWalletHttpServer({ runtime: fake.value, internalAdapterToken: "internal", browserCapabilitySigner: signer }); servers.push(server);
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const token = signer.issue({ operationId: request.operationId, approvalRequestId: request.approvalRequestId,
      transactionDigest: digest, network: request.network, chainContractAddress: request.chainContractAddress });
    const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };
    await expect((await fetch(`${base}/browser/trip-processing/${request.operationId}`, { headers })).json()).resolves.toMatchObject({
      operationId: request.operationId, approvalRequestId: request.approvalRequestId, transactionDigest: digest,
    });
    await expect(fetch(`${base}/browser/trip-processing/other/approval`, { method: "POST", headers,
      body: JSON.stringify({ decision: "approved", transactionDigest: digest }) })).resolves.toMatchObject({ status: 403 });
    await expect(fetch(`${base}/browser/trip-processing/${request.operationId}/approval`, { method: "POST", headers,
      body: JSON.stringify({ decision: "approved", transactionDigest: "b".repeat(64), transactionId: "forged" }) })).resolves.toMatchObject({ status: 400 });
    await expect(fetch(`${base}/browser/trip-processing/${request.operationId}/approval`, { method: "POST", headers,
      body: JSON.stringify({ decision: "approved", phase: "submitted", transactionDigest: digest, localSubmissionReference: "c".repeat(64) }) })).resolves.toMatchObject({ status: 204 });
    expect(fake.callbacks).toEqual([{ request, transactionDigest: digest,
      callback: { decision: "approved", phase: "submitted", transactionDigest: digest, localSubmissionReference: "c".repeat(64) } }]);
  });
});
