import { describe, expect, it } from "vitest";
import type { ConnectedAPI, InitialAPI } from "@midnight-ntwrk/dapp-connector-api";

import {
  discoverLaceWallets,
  LaceProviderError,
  LaceWalletProvider,
  type MidnightWindow,
} from "../browser/lace-wallet-provider.js";
import type { ApprovalRequest } from "../src/trip-job.js";

const request: ApprovalRequest = {
  approvalRequestId: "approval-1", operationId: "operation-1", tripId: "trip-1",
  network: "preprod", chainContractAddress: "contract-1", step: "beginTrip",
  previousStateCommitment: "previous", newStateCommitment: "next",
};
const apiError = (code: string) => Object.assign(new Error(code), { type: "DAppConnectorAPIError" as const, code, reason: code });
const digest = async (hex: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", Uint8Array.from(hex.match(/../g)!, x => Number.parseInt(x, 16)))), x => x.toString(16).padStart(2, "0")).join("");

function fakeConnected(options: {
  network?: string;
  connectStatus?: "connected" | "disconnected";
  balance?: (tx: string) => Promise<string>;
  submit?: (tx: string) => Promise<void>;
} = {}): ConnectedAPI {
  const network = options.network ?? "preprod";
  return {
    async getConnectionStatus() { return options.connectStatus === "disconnected" ? { status: "disconnected" } : { status: "connected", networkId: network }; },
    async getConfiguration() { return { networkId: network, indexerUri: "https://indexer.example", indexerWsUri: "wss://indexer.example", substrateNodeUri: "wss://node.example", proverServerUri: "https://prover.example" }; },
    async hintUsage() {},
    async balanceUnsealedTransaction(tx: string) { return { tx: await (options.balance?.(tx) ?? Promise.resolve("beef")) }; },
    async submitTransaction(tx: string) { await (options.submit?.(tx) ?? Promise.resolve()); },
    async getUnshieldedAddress() { return { unshieldedAddress: "addr_test" }; },
  } as unknown as ConnectedAPI;
}

function windowFor(connected = fakeConnected(), options: { version?: string; connect?: () => Promise<ConnectedAPI>; key?: string } = {}): MidnightWindow {
  const initial: InitialAPI = {
    rdns: "io.lace.midnight", name: "Lace Midnight", icon: "data:image/svg+xml;base64,",
    apiVersion: options.version ?? "4.0.1", connect: async (network: string) => {
      expect(network).toBe("preprod");
      return options.connect ? options.connect() : connected;
    },
  };
  return { midnight: { [options.key ?? "random-provider-key"]: initial } };
}

async function connectedProvider(connected = fakeConnected()) {
  const provider = new LaceWalletProvider("preprod", windowFor(connected), async () => {});
  await provider.connect();
  await provider.initialize();
  return provider;
}

describe("Lace DApp Connector v4 provider", () => {
  it("discovers Lace by provided metadata instead of relying on one global key", () => {
    expect(discoverLaceWallets(windowFor(fakeConnected(), { key: "a-uuid-like-key" }))).toMatchObject([
      { key: "a-uuid-like-key", name: "Lace Midnight", rdns: "io.lace.midnight", apiVersion: "4.0.1" },
    ]);
  });

  it("rejects missing Lace and unsupported connector versions", async () => {
    await expect(new LaceWalletProvider("preprod", {}).connect()).rejects.toMatchObject({ code: "LACE_NOT_INSTALLED" });
    await expect(new LaceWalletProvider("preprod", windowFor(fakeConnected(), { version: "3.9.0" })).connect())
      .rejects.toMatchObject({ code: "CONNECTOR_VERSION_UNSUPPORTED" });
  });

  it("connects only to preprod and retains Wallet service URIs", async () => {
    const provider = await connectedProvider();
    expect(provider.getServiceUris()).toEqual({ network: "preprod", indexer: "https://indexer.example/",
      indexerWS: "wss://indexer.example/", proof: "https://prover.example/", node: "wss://node.example/" });
    await expect(provider.getWalletInfo()).resolves.toMatchObject({ name: "Lace Midnight", network: "preprod", publicAddress: "addr_test" });
  });

  it("maps connector permission rejection and network mismatch", async () => {
    await expect(new LaceWalletProvider("preprod", windowFor(fakeConnected(), { connect: async () => { throw apiError("PermissionRejected"); } })).connect())
      .rejects.toMatchObject({ code: "WALLET_PERMISSION_REJECTED" });
    await expect(new LaceWalletProvider("preprod", windowFor(fakeConnected({ network: "mainnet" }))).connect())
      .rejects.toMatchObject({ code: "WALLET_NETWORK_MISMATCH" });
  });

  it("rejects a configured Drivacy service URI that conflicts with the connected Wallet", async () => {
    await expect(new LaceWalletProvider("preprod", windowFor(), async () => {}, { node: "wss://different-node.example/" }).connect())
      .rejects.toMatchObject({ code: "WALLET_SERVICE_URI_MISMATCH" });
  });

  it("binds one approval to its proven transaction before balance and submit", async () => {
    const submitted: string[] = [];
    const provider = await connectedProvider(fakeConnected({ submit: async tx => { submitted.push(tx); } }));
    const tx = "aabb";
    const transactionDigest = await digest(tx);
    await expect(provider.balance(tx, request.approvalRequestId)).rejects.toMatchObject({ code: "WALLET_TRANSACTION_MISMATCH" });
    await expect(provider.requestApproval(request)).resolves.toBe("approved");
    await expect(provider.approveTransaction({ ...request, transactionHex: tx, transactionDigest })).resolves.toBe("approved");
    await expect(provider.balance(tx, request.approvalRequestId)).resolves.toBe("beef");
    await expect(provider.submit("beef")).resolves.toEqual({ localSubmissionReference: await digest("beef") });
    expect(submitted).toEqual(["beef"]);
    await expect(provider.balance(tx, request.approvalRequestId)).rejects.toMatchObject({ code: "WALLET_TRANSACTION_MISMATCH" });
  });

  it("does not call the Wallet balance/sign API when the existing action verifier rejects the proven transaction", async () => {
    let balanceCalls = 0;
    const provider = new LaceWalletProvider("preprod", windowFor(fakeConnected({ balance: async () => {
      balanceCalls++;
      return "beef";
    } })), async () => { throw new LaceProviderError("WALLET_TRANSACTION_MISMATCH"); });
    await provider.connect();
    await provider.requestApproval(request);

    await expect(provider.approveTransaction({ ...request, transactionHex: "aabb", transactionDigest: await digest("aabb") }))
      .rejects.toMatchObject({ code: "WALLET_TRANSACTION_MISMATCH" });
    expect(balanceCalls).toBe(0);
  });

  it("maps a user cancellation and submit failure without submitting", async () => {
    const provider = await connectedProvider(fakeConnected({ balance: async () => { throw apiError("Rejected"); } }));
    await provider.requestApproval(request);
    await expect(provider.approveTransaction({ ...request, transactionHex: "aabb", transactionDigest: await digest("aabb") })).resolves.toBe("cancelled");
    await expect(provider.balance("aabb", request.approvalRequestId)).rejects.toMatchObject({ code: "WALLET_TRANSACTION_MISMATCH" });

    const submitProvider = await connectedProvider(fakeConnected({ submit: async () => { throw apiError("InternalError"); } }));
    await submitProvider.requestApproval(request);
    await submitProvider.approveTransaction({ ...request, transactionHex: "aabb", transactionDigest: await digest("aabb") });
    await submitProvider.balance("aabb", request.approvalRequestId);
    await expect(submitProvider.submit("beef")).rejects.toMatchObject({ code: "WALLET_SUBMIT_FAILED" });
  });

  it("clears browser-side connection state on disconnect", async () => {
    const provider = await connectedProvider();
    await provider.disconnect();
    await expect(provider.initialize()).rejects.toBeInstanceOf(LaceProviderError);
    await expect(provider.initialize()).rejects.toMatchObject({ code: "WALLET_NOT_CONNECTED" });
  });
});
