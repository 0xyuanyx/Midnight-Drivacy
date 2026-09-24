/**
 * Concrete C-side driving executor.  It deliberately reuses the Compact,
 * proof, provider and TripJob sequence from probe/driving-local.ts; the probe
 * remains the local deployment fixture and is not imported as a production
 * runtime.  No HTTP input to this module contains a wallet seed or key.
 */
import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import * as Ledger from "@midnight-ntwrk/midnight-js-protocol/ledger";
import { CompiledContract } from "@midnight-ntwrk/midnight-js-protocol/compact-js";
import { findDeployedContract } from "@midnight-ntwrk/midnight-js-contracts";
import { httpClientProofProvider } from "@midnight-ntwrk/midnight-js-http-client-proof-provider";
import { indexerPublicDataProvider } from "@midnight-ntwrk/midnight-js-indexer-public-data-provider";
import { levelPrivateStateProvider } from "@midnight-ntwrk/midnight-js-level-private-state-provider";
import { setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import { NodeZkConfigProvider } from "@midnight-ntwrk/midnight-js-node-zk-config-provider";
import * as Driving from "../managed/driving-state/contract/index.js";
import {
  ADAPTER_PROFILE, bootstrapPrivateState, decode, encode, prepareTrip, witnesses,
  type DrivingPrivateState,
} from "../src/state-adapter.js";
import { LocalJobStore } from "../src/local-job-store.js";
import {
  JobBlocked, TripJob, canAbandonTrip, getTripStatus,
  type ApprovalRequest, type TransactionHooks, type TripStep, type WalletApproval,
} from "../src/trip-job.js";
import {
  CalculateTripRequestSchema, type CalculateTripRequest, type ChainConfirmation,
  type TripProcessingResult,
} from "../../shared/src/bc-contract.js";
import type { BrowserApprovalCallback, CWalletProcessingRuntime } from "./c-wallet-http.js";

type Action = "beginTrip" | "appendRecord" | "finishTrip" | "cancelTrip";
type PendingPhase = "balance" | "submit";
type PendingApproval = {
  request?: ApprovalRequest;
  transactionHex: string;
  transactionDigest: string;
  phase: PendingPhase;
  balancedTransactionHex?: string;
  decision?: (value: "approved" | "cancelled") => void;
  balanced?: (hex: string) => void;
  submitted?: () => void;
};

export interface DrivingRuntimeEndpoints {
  node: string;
  indexer: string;
  indexerWS: string;
  proof: string;
}

/** Local-only configuration, supplied when C starts -- never by B/browser HTTP. */
export interface DrivingRuntimeConfiguration {
  network: string;
  endpoints: DrivingRuntimeEndpoints;
  chainContractAddress: string;
  compiledAssetsPath: string;
  privateStateStoreName: string;
  privateStateAccountId: string;
  privateStoragePassword: () => string;
  /** Resolves C's contract-opening witness locally; it is not a subscriber wallet key. */
  loadOwnerSecret: () => Promise<Uint8Array> | Uint8Array;
  // Concrete SDK key classes differ between supported Midnight SDK releases.
  // These are public values supplied by the connected Wallet configuration.
  walletPublicKeys: { coinPublicKey: any; encryptionPublicKey: any };
  journalPath: string;
  sourceStorePath: string;
  now?: () => number;
}

const digest = (hex: string) => createHash("sha256").update(Buffer.from(hex, "hex")).digest("hex");
const randomSalt = () => randomBytes(32).toString("hex");
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
};

class LocalSourceStore {
  constructor(private readonly path: string) {}
  async save(request: CalculateTripRequest) {
    const all = await this.read(); const key = createHash("sha256").update(JSON.stringify(request)).digest("hex");
    all[key] = request; await this.write(all); return key;
  }
  async load(key: string) {
    const value = (await this.read())[key];
    if (!value) throw new Error("UNKNOWN_SOURCE");
    return CalculateTripRequestSchema.parse(value);
  }
  async delete(key: string) { const all = await this.read(); delete all[key]; await this.write(all); }
  private async read(): Promise<Record<string, CalculateTripRequest>> {
    try { return JSON.parse(await readFile(this.path, "utf8")) as Record<string, CalculateTripRequest>; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return {}; throw error; }
  }
  private async write(value: Record<string, CalculateTripRequest>) {
    const file = resolve(this.path); await mkdir(dirname(file), { recursive: true });
    const temporary = `${file}.${randomBytes(8).toString("hex")}.tmp`;
    try { await writeFile(temporary, JSON.stringify(value), { mode: 0o600 }); await rename(temporary, file); }
    finally { await unlink(temporary).catch(() => undefined); }
  }
}

/**
 * LocalJobStore is intentionally used only for a development/demo C runtime.
 * Production needs a durable, multi-process journal plus an indexer receipt
 * store before restart recovery can safely resume browser-held submissions.
 */
export class DrivingRuntime implements CWalletProcessingRuntime {
  private readonly store: LocalJobStore;
  private readonly sources: LocalSourceStore;
  private readonly pending = new Map<string, PendingApproval>();
  private readonly jobs = new Map<string, TripJob>();
  private readonly runs = new Map<string, Promise<void>>();
  private deployed?: Awaited<ReturnType<typeof findDeployedContract>>;
  private providers?: Record<string, unknown>;
  private ownerSecret?: Uint8Array;

  constructor(private readonly config: DrivingRuntimeConfiguration) {
    this.store = new LocalJobStore(config.journalPath);
    this.sources = new LocalSourceStore(config.sourceStorePath);
  }

  async saveSource(request: CalculateTripRequest) { return this.sources.save(CalculateTripRequestSchema.parse(request)); }
  async loadSource(sourceKey: string) { return this.sources.load(sourceKey); }
  async deleteSource(sourceKey: string) { await this.sources.delete(sourceKey); }
  async getTripStatus(operationId: string) { return getTripStatus(this.store, operationId); }
  async canAbandonTrip(operationId: string) { return canAbandonTrip(this.store, operationId); }

  async startTrip(input: CalculateTripRequest): Promise<TripProcessingResult> {
    const request = CalculateTripRequestSchema.parse(input);
    await this.ensureInitialized(request);
    if (request.approvedRule.adapterProfile !== ADAPTER_PROFILE) throw new Error("ADAPTER_PROFILE_MISMATCH");
    if (request.approvedRule.network !== this.config.network || request.approvedRule.chainContractAddress !== this.config.chainContractAddress) {
      throw new Error("RUNTIME_NETWORK_OR_CONTRACT_MISMATCH");
    }
    const prepared = prepareTrip(request, this.requireOwnerSecret(), randomSalt(), randomSalt());
    const existing = this.jobs.get(request.operationId);
    const job = existing ?? new TripJob(request, prepared.candidate, this.store, this.approvalFor(request.operationId), this.config.now);
    this.jobs.set(request.operationId, job);
    if (!this.runs.has(request.operationId)) {
      const run = this.runTrip(request, prepared, job).finally(() => this.runs.delete(request.operationId));
      this.runs.set(request.operationId, run);
    }
    // Run until its first durable status; normal browser approval continues asynchronously.
    await Promise.resolve();
    return job.getStatus();
  }

  async retryTemporaryFailure(request: CalculateTripRequest): Promise<TripProcessingResult> {
    const job = this.jobs.get(request.operationId);
    if (!job) throw new JobBlocked("RUNTIME_RESTART_RECOVERY_REQUIRED");
    await job.retryTemporaryFailure();
    this.runs.delete(request.operationId);
    return this.startTrip(request);
  }

  async getBrowserApproval(operationId: string) {
    const pending = this.pending.get(operationId);
    if (!pending?.request) return undefined;
    return { request: pending.request, transactionHex: pending.transactionHex,
      transactionDigest: pending.transactionDigest, phase: pending.phase,
      balancedTransactionHex: pending.balancedTransactionHex,
      walletServices: { indexer: this.config.endpoints.indexer, indexerWS: this.config.endpoints.indexerWS,
        proof: this.config.endpoints.proof, node: this.config.endpoints.node } };
  }

  async receiveBrowserApproval(input: { request: ApprovalRequest; transactionDigest: string; callback: BrowserApprovalCallback }) {
    const pending = this.pending.get(input.request.operationId);
    if (!pending?.request || pending.request.approvalRequestId !== input.request.approvalRequestId
      || pending.transactionDigest !== input.transactionDigest || pending.request.network !== input.request.network
      || pending.request.chainContractAddress !== input.request.chainContractAddress) throw new Error("APPROVAL_NOT_PENDING");
    if (input.callback.transactionDigest !== pending.transactionDigest) throw new Error("APPROVAL_DIGEST_MISMATCH");
    if (input.callback.decision === "cancelled") {
      if (pending.phase !== "balance" || !pending.decision) throw new Error("APPROVAL_CALLBACK_REUSED");
      pending.decision("cancelled"); return;
    }
    if (input.callback.phase === "balanced") {
      if (pending.phase !== "balance" || !pending.decision || !pending.balanced || !input.callback.balancedTransactionHex) {
        throw new Error("APPROVAL_CALLBACK_REUSED");
      }
      // Do not equate this with the proven transaction: Wallet balance may alter
      // bindings. The SDK will derive the actual identifier from these exact bytes.
      pending.balancedTransactionHex = input.callback.balancedTransactionHex;
      pending.decision("approved"); pending.balanced(input.callback.balancedTransactionHex); return;
    }
    if (input.callback.phase === "submitted") {
      if (pending.phase !== "submit" || !pending.submitted) throw new Error("APPROVAL_CALLBACK_REUSED");
      pending.submitted(); return;
    }
    throw new Error("APPROVAL_PHASE_REQUIRED");
  }

  private approvalFor(operationId: string): WalletApproval {
    return { request: async request => {
      const pending = this.pending.get(operationId);
      if (!pending || pending.request) throw new Error("APPROVAL_REQUEST_MISMATCH");
      const decision = deferred<"approved" | "cancelled">(); pending.request = request; pending.decision = decision.resolve;
      return decision.promise;
    } };
  }

  private async runTrip(request: CalculateTripRequest, prepared: ReturnType<typeof prepareTrip>, job: TripJob) {
    try {
      const receipts = new Map<TripStep, { txId: string; blockHash: string }>();
      const execute = (step: TripStep, action: Action, state: DrivingPrivateState) => async (hooks: TransactionHooks) => {
        const tx = await this.call(action, state, request.operationId, hooks);
        receipts.set(step, tx.public);
        return tx.public;
      };
      await job.runStep("beginTrip", execute("beginTrip", "beginTrip", prepared.initial), tx => ({ transactionId: tx.txId, blockId: tx.blockHash }));
      for (const [index, state] of prepared.steps.entries()) {
        const step = `appendRecord:${index}` as const;
        await job.runStep(step, execute(step, "appendRecord", state), tx => ({ transactionId: tx.txId, blockId: tx.blockHash }));
      }
      const final = await job.runStep("finishTrip", execute("finishTrip", "finishTrip", prepared.final), tx => ({ transactionId: tx.txId, blockId: tx.blockHash }));
      const ledger = await this.indexed();
      if (ledger.active || encode(ledger.stateCommitment) !== prepared.candidate.state.stateCommitment
        || encode(ledger.ruleHash) !== request.approvedRule.ruleHash || encode(ledger.datasetRoot) !== prepared.candidate.state.datasetRoot) {
        throw new Error("INDEXER_STATE_MISMATCH");
      }
      const confirmation: ChainConfirmation = { execution: "live", network: this.config.network, adapterProfile: ADAPTER_PROFILE,
        chainContractAddress: this.config.chainContractAddress, transactionId: final.transactionId, blockId: final.blockId,
        operationId: request.operationId, previousStateCommitment: prepared.candidate.previousStateCommitment,
        newStateCommitment: prepared.candidate.state.stateCommitment, ruleHash: request.approvedRule.ruleHash,
        datasetRoot: prepared.candidate.state.datasetRoot, observedAt: new Date().toISOString() };
      await job.confirm(confirmation);
      await (this.providers!.privateStateProvider as { set(id: string, value: DrivingPrivateState): Promise<void> })
        .set("driving", bootstrapPrivateState(prepared.candidate.state, request.approvedRule.rule, this.requireOwnerSecret()));
    } catch (error) {
      // TripJob already writes chain-unknown after a known transaction ID. Never
      // turn that uncertainty into an invented failure or resend it here.
      if (!(error instanceof JobBlocked) || error.reason !== "APPROVAL_CANCELLED") throw error;
    } finally { this.pending.delete(request.operationId); }
  }

  private async call(action: Action, state: DrivingPrivateState, operationId: string, hooks: TransactionHooks) {
    await (this.providers!.privateStateProvider as { set(id: string, value: DrivingPrivateState): Promise<void> }).set("driving", state);
    const pending: PendingApproval = { transactionHex: "", transactionDigest: "", phase: "balance" };
    this.pending.set(operationId, pending);
    const walletProvider = this.providers!.walletProvider as { hooks?: TransactionHooks; operationId?: string };
    walletProvider.hooks = hooks; walletProvider.operationId = operationId;
    try { return await this.deployed!.callTx[action]!(); }
    finally { walletProvider.hooks = undefined; walletProvider.operationId = undefined; }
  }

  private async ensureInitialized(request: CalculateTripRequest) {
    if (this.deployed) return;
    setNetworkId(this.config.network);
    this.ownerSecret = new Uint8Array(await this.config.loadOwnerSecret());
    if (this.ownerSecret.length !== 32) throw new Error("INVALID_OWNER_SECRET");
    const assets = this.config.compiledAssetsPath;
    const compiledContract = CompiledContract.make("driving-state", Driving.Contract<DrivingPrivateState>).pipe(
      CompiledContract.withWitnesses(witnesses), CompiledContract.withCompiledFileAssets(assets));
    const zkConfigProvider = new NodeZkConfigProvider<Action>(assets);
    const publicDataProvider = indexerPublicDataProvider(this.config.endpoints.indexer, this.config.endpoints.indexerWS);
    const runtime = this;
    const walletProvider: { hooks?: TransactionHooks; operationId?: string;
      getCoinPublicKey(): any; getEncryptionPublicKey(): any; balanceTx(tx: { serialize(): Uint8Array }): Promise<any>;
      submitTx(tx: { serialize(): Uint8Array; identifiers(): string[] }): Promise<void> } = {
      getCoinPublicKey: () => runtime.config.walletPublicKeys.coinPublicKey,
      getEncryptionPublicKey: () => runtime.config.walletPublicKeys.encryptionPublicKey,
      async balanceTx(tx) {
        const operationId = this.operationId; const hooks = this.hooks;
        if (!operationId || !hooks) throw new Error("WALLET_APPROVAL_CONTEXT_REQUIRED");
        const pending = runtime.pending.get(operationId); if (!pending) throw new Error("APPROVAL_NOT_PENDING");
        pending.transactionHex = Buffer.from(tx.serialize()).toString("hex"); pending.transactionDigest = digest(pending.transactionHex);
        return hooks.balance(async () => {
          const next = deferred<string>(); pending.balanced = next.resolve;
          const hex = await next.promise;
          return Ledger.Transaction.deserialize<Ledger.SignatureEnabled, Ledger.Proof, Ledger.Binding>("signature", "proof", "binding", Buffer.from(hex, "hex"));
        });
      },
      async submitTx(tx) {
        const operationId = this.operationId; const hooks = this.hooks;
        if (!operationId || !hooks) throw new Error("WALLET_APPROVAL_CONTEXT_REQUIRED");
        const pending = runtime.pending.get(operationId); if (!pending?.balancedTransactionHex) throw new Error("SUBMIT_WITHOUT_BALANCED_TRANSACTION");
        const serialized = Buffer.from(tx.serialize()).toString("hex");
        if (serialized !== pending.balancedTransactionHex) throw new Error("BALANCED_TRANSACTION_MISMATCH");
        const transactionId = tx.identifiers().at(-1); if (!transactionId) throw new Error("FINALIZED_TRANSACTION_ID_UNAVAILABLE");
        pending.phase = "submit";
        return hooks.submit(transactionId, async () => {
          const sent = deferred<void>(); pending.submitted = sent.resolve; await sent.promise;
        });
      },
    };
    const providers = {
      privateStateProvider: levelPrivateStateProvider<"driving", DrivingPrivateState>({
        privateStateStoreName: this.config.privateStateStoreName, accountId: this.config.privateStateAccountId,
        privateStoragePasswordProvider: this.config.privateStoragePassword,
      }), publicDataProvider, zkConfigProvider, proofProvider: httpClientProofProvider(this.config.endpoints.proof, zkConfigProvider),
      walletProvider, midnightProvider: walletProvider,
    };
    this.providers = providers;
    this.deployed = await findDeployedContract(providers, { compiledContract, contractAddress: this.config.chainContractAddress,
      privateStateId: "driving", initialPrivateState: bootstrapPrivateState(request.previous.state, request.approvedRule.rule, this.requireOwnerSecret()) });
  }

  private async indexed() {
    const state = await (this.providers!.publicDataProvider as { queryContractState(address: string): Promise<{ data: unknown } | undefined> })
      .queryContractState(this.config.chainContractAddress);
    if (!state) throw new Error("CONTRACT_STATE_NOT_INDEXED");
    return Driving.ledger(state.data);
  }
  private requireOwnerSecret() { if (!this.ownerSecret) throw new Error("RUNTIME_NOT_INITIALIZED"); return this.ownerSecret; }
}

export async function createDrivingRuntime(config: DrivingRuntimeConfiguration): Promise<DrivingRuntime> {
  return new DrivingRuntime(config);
}
