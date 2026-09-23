import type { ConnectedAPI, Configuration, InitialAPI } from "@midnight-ntwrk/dapp-connector-api";

import type { ApprovalRequest } from "../src/trip-job.js";
import type { UserWalletProvider, WalletApprovalDecision, WalletSubmissionResult } from "../src/wallet-provider.js";

export type LaceProviderErrorCode =
  | "LACE_NOT_INSTALLED"
  | "CONNECTOR_VERSION_UNSUPPORTED"
  | "WALLET_PERMISSION_REJECTED"
  | "WALLET_CANCELLED"
  | "WALLET_NETWORK_MISMATCH"
  | "WALLET_SERVICE_URI_MISMATCH"
  | "WALLET_DISCONNECTED"
  | "WALLET_BALANCE_FAILED"
  | "WALLET_SUBMIT_FAILED"
  | "WALLET_RESPONSE_INVALID"
  | "WALLET_APPROVAL_ALREADY_USED"
  | "WALLET_TRANSACTION_MISMATCH"
  | "WALLET_NOT_CONNECTED";

export class LaceProviderError extends Error {
  constructor(public readonly code: LaceProviderErrorCode, cause?: unknown) {
    super(code, { cause });
  }
}

export interface MidnightWindow {
  midnight?: Record<string, InitialAPI | undefined>;
}

export interface DiscoveredWallet {
  key: string;
  rdns: string;
  name: string;
  apiVersion: string;
  initial: InitialAPI;
}

export interface WalletServiceUris {
  network: string;
  indexer: string;
  indexerWS: string;
  proof?: string;
  node: string;
}

export interface LaceWalletInfo {
  key: string;
  name: string;
  rdns: string;
  apiVersion: string;
  network: string;
  publicAddress?: string;
}

export type TransactionApprovalVerifier = (input: ApprovalRequest, transactionHex: string) => Promise<void>;

const verifyApprovalTransaction: TransactionApprovalVerifier = async (input, transactionHex) => {
  // 실제 browser adapter는 기존 runtime과 같은 Ledger action 검사를 적용한다.
  const runtime = await import("./wallet-runtime.js");
  runtime.verifyApprovalTransaction(input, transactionHex);
};

interface ApprovedTransaction {
  transactionDigest: string;
  balancedTransaction: string;
}

const V4_VERSION = /^4\.(?:0|[1-9]\d*)\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;

function isInitialAPI(value: unknown): value is InitialAPI {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<InitialAPI>;
  return typeof candidate.rdns === "string" && typeof candidate.name === "string"
    && typeof candidate.apiVersion === "string" && typeof candidate.connect === "function";
}

function isLace(wallet: DiscoveredWallet): boolean {
  return /lace/i.test(wallet.rdns) || /lace/i.test(wallet.name) || wallet.key === "lace" || wallet.key === "mnLace";
}

function connectorErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  const candidate = error as { type?: unknown; code?: unknown };
  return candidate.type === "DAppConnectorAPIError" && typeof candidate.code === "string" ? candidate.code : undefined;
}

async function transactionDigest(transactionHex: string): Promise<string> {
  if (!/^(?:[0-9a-f]{2})+$/i.test(transactionHex)) throw new LaceProviderError("WALLET_RESPONSE_INVALID");
  const bytes = Uint8Array.from(transactionHex.match(/../g)!, byte => Number.parseInt(byte, 16));
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), byte => byte.toString(16).padStart(2, "0")).join("");
}

function validateServiceUris(configuration: Configuration, expectedNetwork: string, expected?: Partial<WalletServiceUris>): WalletServiceUris {
  if (configuration.networkId !== expectedNetwork) throw new LaceProviderError("WALLET_NETWORK_MISMATCH");
  try {
    const result: WalletServiceUris = {
      network: configuration.networkId,
      indexer: new URL(configuration.indexerUri).toString(),
      indexerWS: new URL(configuration.indexerWsUri).toString(),
      node: new URL(configuration.substrateNodeUri).toString(),
    };
    if (configuration.proverServerUri) result.proof = new URL(configuration.proverServerUri).toString();
    for (const key of ["indexer", "indexerWS", "proof", "node"] as const) {
      if (expected?.[key] && expected[key] !== result[key]) throw new LaceProviderError("WALLET_SERVICE_URI_MISMATCH");
    }
    return result;
  } catch (error) {
    if (error instanceof LaceProviderError) throw error;
    throw new LaceProviderError("WALLET_RESPONSE_INVALID", error);
  }
}

/** window.midnight의 모든 provider를 읽고, v4 Lace 후보만 선택 가능한 정보로 반환한다. */
export function discoverLaceWallets(windowLike: MidnightWindow): DiscoveredWallet[] {
  return Object.entries(windowLike.midnight ?? {})
    .flatMap(([key, value]) => isInitialAPI(value) ? [{ key, rdns: value.rdns, name: value.name,
      apiVersion: value.apiVersion, initial: value }] : [])
    .filter(wallet => V4_VERSION.test(wallet.apiVersion) && isLace(wallet));
}

function selectLaceWallet(windowLike: MidnightWindow): DiscoveredWallet {
  const candidates = discoverLaceWallets(windowLike);
  if (candidates.length === 0) {
    const anyWallet = Object.values(windowLike.midnight ?? {}).some(isInitialAPI);
    throw new LaceProviderError(anyWallet ? "CONNECTOR_VERSION_UNSUPPORTED" : "LACE_NOT_INSTALLED");
  }
  // 같은 이름/rdns의 여러 injection은 사용자 선택 없이 임의로 신뢰하지 않는다.
  if (candidates.length !== 1) throw new LaceProviderError("WALLET_RESPONSE_INVALID");
  return candidates[0]!;
}

/**
 * DApp Connector API v4를 UserWalletProvider에 맞춘 browser-only adapter다.
 * 연결된 Wallet의 service URI만 사용하며, 키 material은 읽거나 반환하지 않는다.
 */
export class LaceWalletProvider implements UserWalletProvider {
  private selected?: DiscoveredWallet;
  private connected?: ConnectedAPI;
  private services?: WalletServiceUris;
  private readonly pending = new Map<string, ApprovalRequest>();
  private readonly approved = new Map<string, ApprovedTransaction>();
  private readonly consumed = new Set<string>();
  private readonly balanced = new Set<string>();

  constructor(
    private readonly expectedNetwork = "preprod",
    private readonly windowLike: MidnightWindow = globalThis as MidnightWindow,
    private readonly verifyTransaction: TransactionApprovalVerifier = verifyApprovalTransaction,
    private readonly expectedServices?: Partial<WalletServiceUris>,
  ) {}

  async connect(): Promise<void> {
    const selected = selectLaceWallet(this.windowLike);
    try {
      const connected = await selected.initial.connect(this.expectedNetwork);
      const status = await connected.getConnectionStatus();
      if (status.status !== "connected" || status.networkId !== this.expectedNetwork) {
        throw new LaceProviderError(status.status === "disconnected" ? "WALLET_DISCONNECTED" : "WALLET_NETWORK_MISMATCH");
      }
      const services = validateServiceUris(await connected.getConfiguration(), this.expectedNetwork, this.expectedServices);
      await connected.hintUsage(["getConnectionStatus", "getConfiguration", "balanceUnsealedTransaction", "submitTransaction"]);
      this.selected = selected;
      this.connected = connected;
      this.services = services;
    } catch (error) {
      this.clearConnection();
      throw this.mapConnectorError(error, "WALLET_PERMISSION_REJECTED");
    }
  }

  async initialize(): Promise<void> {
    const connected = this.requireConnected();
    const status = await connected.getConnectionStatus();
    if (status.status !== "connected") {
      this.clearConnection();
      throw new LaceProviderError("WALLET_DISCONNECTED");
    }
    if (status.networkId !== this.expectedNetwork) throw new LaceProviderError("WALLET_NETWORK_MISMATCH");
    this.services = validateServiceUris(await connected.getConfiguration(), this.expectedNetwork, this.expectedServices);
  }

  async requestApproval(input: ApprovalRequest): Promise<WalletApprovalDecision> {
    this.requireConnected();
    if (input.network !== this.expectedNetwork) throw new LaceProviderError("WALLET_NETWORK_MISMATCH");
    if (this.pending.has(input.approvalRequestId) || this.approved.has(input.approvalRequestId)
      || this.consumed.has(input.approvalRequestId)) throw new LaceProviderError("WALLET_APPROVAL_ALREADY_USED");
    this.pending.set(input.approvalRequestId, input);
    // v4 Wallet은 proven Tx를 balance/sign할 때 실제 승인 UI를 낸다. 이 호출은 TripJob의 대기 ID를 예약한다.
    return "approved";
  }

  async approveTransaction(input: ApprovalRequest & { transactionHex: string; transactionDigest: string }): Promise<WalletApprovalDecision> {
    const request = this.pending.get(input.approvalRequestId);
    if (!request || JSON.stringify(request) !== JSON.stringify(this.approvalIdentity(input))) {
      throw new LaceProviderError("WALLET_TRANSACTION_MISMATCH");
    }
    if (await transactionDigest(input.transactionHex) !== input.transactionDigest) {
      throw new LaceProviderError("WALLET_TRANSACTION_MISMATCH");
    }
    try {
      await this.verifyTransaction(request, input.transactionHex);
      const result = await this.requireConnected().balanceUnsealedTransaction(input.transactionHex);
      if (!result || typeof result.tx !== "string" || !result.tx) throw new LaceProviderError("WALLET_RESPONSE_INVALID");
      this.pending.delete(input.approvalRequestId);
      this.approved.set(input.approvalRequestId, { transactionDigest: input.transactionDigest, balancedTransaction: result.tx });
      return "approved";
    } catch (error) {
      this.pending.delete(input.approvalRequestId);
      this.consumed.add(input.approvalRequestId);
      const mapped = this.mapConnectorError(error, "WALLET_BALANCE_FAILED");
      if (mapped.code === "WALLET_PERMISSION_REJECTED") return "cancelled";
      throw mapped;
    }
  }

  async balance(transactionHex: string, approvalRequestId: string): Promise<string> {
    const approved = this.approved.get(approvalRequestId);
    if (!approved || this.consumed.has(approvalRequestId)) throw new LaceProviderError("WALLET_TRANSACTION_MISMATCH");
    this.approved.delete(approvalRequestId);
    this.consumed.add(approvalRequestId);
    if (await transactionDigest(transactionHex) !== approved.transactionDigest) throw new LaceProviderError("WALLET_TRANSACTION_MISMATCH");
    this.balanced.add(await transactionDigest(approved.balancedTransaction));
    return approved.balancedTransaction;
  }

  async submit(transactionHex: string): Promise<WalletSubmissionResult> {
    const connected = this.requireConnected();
    const digest = await transactionDigest(transactionHex);
    if (!this.balanced.delete(digest)) throw new LaceProviderError("WALLET_TRANSACTION_MISMATCH");
    try {
      await connected.submitTransaction(transactionHex);
      // v4 submitTransaction은 void다. 이 digest는 chain transaction ID가 아니라 조회 전의 local submission reference다.
      // DApp Connector v4 returns no chain transaction ID. Keep this digest
      // inside C as a local broadcast reference only.
      return { localSubmissionReference: digest };
    } catch (error) {
      throw this.mapConnectorError(error, "WALLET_SUBMIT_FAILED");
    }
  }

  async cancel(approvalRequestId: string): Promise<void> {
    this.pending.delete(approvalRequestId);
    this.approved.delete(approvalRequestId);
    this.consumed.add(approvalRequestId);
  }

  async disconnect(): Promise<void> {
    // v4 ConnectedAPI에는 disconnect가 없다. DApp 쪽 참조·승인 상태만 정리한다.
    this.clearConnection();
  }

  getServiceUris(): WalletServiceUris {
    if (!this.services) throw new LaceProviderError("WALLET_NOT_CONNECTED");
    return { ...this.services };
  }

  async getWalletInfo(): Promise<LaceWalletInfo> {
    const selected = this.selected;
    const connected = this.requireConnected();
    if (!selected) throw new LaceProviderError("WALLET_NOT_CONNECTED");
    const address = await connected.getUnshieldedAddress();
    return { key: selected.key, name: selected.name, rdns: selected.rdns, apiVersion: selected.apiVersion,
      network: this.expectedNetwork, publicAddress: typeof address?.unshieldedAddress === "string" ? address.unshieldedAddress : undefined };
  }

  private approvalIdentity(input: ApprovalRequest): ApprovalRequest {
    const { approvalRequestId, operationId, tripId, network, chainContractAddress, step,
      previousStateCommitment, newStateCommitment } = input;
    return { approvalRequestId, operationId, tripId, network, chainContractAddress, step,
      previousStateCommitment, newStateCommitment };
  }

  private requireConnected(): ConnectedAPI {
    if (!this.connected) throw new LaceProviderError("WALLET_NOT_CONNECTED");
    return this.connected;
  }

  private clearConnection(): void {
    this.selected = undefined;
    this.connected = undefined;
    this.services = undefined;
    this.pending.clear();
    this.approved.clear();
    this.balanced.clear();
  }

  private mapConnectorError(error: unknown, fallback: LaceProviderErrorCode): LaceProviderError {
    if (error instanceof LaceProviderError) return error;
    const code = connectorErrorCode(error);
    if (code === "PermissionRejected" || code === "Rejected") return new LaceProviderError("WALLET_PERMISSION_REJECTED", error);
    if (code === "Disconnected") return new LaceProviderError("WALLET_DISCONNECTED", error);
    return new LaceProviderError(fallback, error);
  }
}
