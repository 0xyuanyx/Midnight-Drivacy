// Local developer harness only; never the production subscriber UI or server worker.
// Provider and wallet setup adapted from midnightntwrk/create-mn-app
// commit bdc86733d2a9d2e381cb050aec4fdde7b33559b4 (Apache-2.0).
// 학습 순서: 배포/초기화 → 기기 월렛 취소/승인 → 두 운행·DB 확정/삭제 → 최종 결과.
// 모의 기록과 공개 local genesis로 SDK·격리 브라우저·B 서비스/PG를 실제 연결한다.
// 제품 UI, 운영용 BCAdapter·가입자 provisioning·Supabase Storage E2E와 구분한다.
import { strict as assert } from "node:assert";
import { randomBytes, randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { WebSocket } from "ws";
import * as Rx from "rxjs";
import {
  WalletFacade, DustWallet, HDWallet, Roles, ShieldedWallet, UnshieldedWallet,
  createKeystore, NoOpTransactionHistoryStorage, PublicKey,
} from "@midnight-ntwrk/wallet-sdk";
import * as Ledger from "@midnight-ntwrk/midnight-js-protocol/ledger";
import { CompiledContract } from "@midnight-ntwrk/midnight-js-protocol/compact-js";
import { StateValue as ProtocolStateValue } from "@midnight-ntwrk/midnight-js-protocol/onchain-runtime";
import { StateValue as CompactStateValue } from "@midnight-ntwrk/compact-runtime";
import { setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import { deployContract, findDeployedContract } from "@midnight-ntwrk/midnight-js-contracts";
import { httpClientProofProvider } from "@midnight-ntwrk/midnight-js-http-client-proof-provider";
import { indexerPublicDataProvider } from "@midnight-ntwrk/midnight-js-indexer-public-data-provider";
import { levelPrivateStateProvider } from "@midnight-ntwrk/midnight-js-level-private-state-provider";
import { NodeZkConfigProvider } from "@midnight-ntwrk/midnight-js-node-zk-config-provider";
import * as Driving from "../managed/driving-state/contract/index.js";
import { ADAPTER_PROFILE, bootstrapPrivateState, decode, encode, genesis, prepareTrip, scopeBinding, witnesses,
  type DrivingPrivateState } from "../src/state-adapter.js";
import { demoRule, demoScope, demoTrip, demoRegisteredRule, demoRequest } from "./driving-fixtures.js";
import { canFinalizeState, type ConfirmedState, type State,
  type ChainConfirmation } from "../../shared/src/bc-contract.js";
import type { FinalizedTxData } from "@midnight-ntwrk/midnight-js-types";
import { TripJob, getTripStatus, canAbandonTrip, type TransactionHooks, type TripStep } from "../src/trip-job.js";
import { LocalJobStore } from "../src/local-job-store.js";
import { prepareEvaluation, verifyResultOpening } from "../src/evaluation.js";
import { startBrowserWallet } from "./browser-wallet.js";
import { startBackendProbe } from "./backend-local.js";

Object.assign(globalThis, { WebSocket });
setNetworkId("undeployed");
const endpoints = {
  node: "ws://127.0.0.1:9945", indexer: "http://127.0.0.1:8089/api/v4/graphql",
  indexerWS: "ws://127.0.0.1:8089/api/v4/graphql/ws", proof: "http://127.0.0.1:6301",
};
const evidence: Record<string, unknown> = {
  execution: "live", network: "undeployed", purpose: "step-6-final-evaluation-browser-backend-integration",
  compiler: "0.31.1", runtime: "0.16.0", onchainRuntime: "3.0.0", midnightJs: "4.1.1", walletSdk: "1.2.0",
  proofServer: "8.1.0", insuranceCalculationVerified: false,
};
function checkpoint() {
  writeFileSync("driving-evidence.json", JSON.stringify(evidence, null, 2));
}
function publicReceipt(data: FinalizedTxData) {
  // 재현 근거에는 공개 finalized receipt만 남긴다. privateState와 proof 입력은 제외한다.
  return { txId: data.txId, status: data.status, blockHash: data.blockHash,
    blockHeight: data.blockHeight, blockTimestamp: data.blockTimestamp };
}
const deadline = setTimeout(() => {
  evidence.failure = "LOCAL_DRIVING_TIMEOUT"; checkpoint(); process.exit(1);
}, 20 * 60_000);

async function main() {
  // 같은 버전이라도 WASM 런타임이 중복 설치되면 서로 다른 클래스가 될 수 있다.
  // 이전 로컬 실행의 StateValue 오류를 재발시키지 않도록 실제 클래스도 비교한다.
  assert.equal(CompactStateValue, ProtocolStateValue, "Duplicate onchain runtime instances; dedupe dependencies");
  evidence.sharedRuntimeClassVerified = true;
  // Confirm healthy infra before attempting the transaction pipeline.
  const health = await fetch("http://127.0.0.1:9945/health", { signal: AbortSignal.timeout(5000) });
  assert(health.ok, "Node unavailable");
  const nodeHealth = await health.json() as { isSyncing: boolean };
  assert.equal(nodeHealth.isSyncing, false);
  const indexedBlock = await fetch(endpoints.indexer, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: "{ block { height } }" }), signal: AbortSignal.timeout(5000),
  }).then(r => r.json()) as { data?: { block?: { height?: number } } };
  assert(Number(indexedBlock.data?.block?.height) > 0, "Indexer has no blocks");
  await fetch(endpoints.proof, { signal: AbortSignal.timeout(5000) });
  evidence.healthCheckedAt = new Date().toISOString(); checkpoint();

  // Public, pre-funded LOCAL genesis fixture. No user key/seed is read or saved.
  const hd = HDWallet.fromSeed(Buffer.from("00".repeat(31) + "01", "hex"));
  assert.equal(hd.type, "seedOk");
  if (hd.type !== "seedOk") throw new Error("Genesis derivation failed");
  const derived = hd.hdWallet.selectAccount(0)
    .selectRoles([Roles.Zswap, Roles.NightExternal, Roles.Dust]).deriveKeysAt(0);
  assert.equal(derived.type, "keysDerived");
  if (derived.type !== "keysDerived") throw new Error("Genesis role derivation failed");
  hd.hdWallet.clear();
  const shieldedSecretKeys = Ledger.ZswapSecretKeys.fromSeed(derived.keys[Roles.Zswap]);
  const dustSecretKey = Ledger.DustSecretKey.fromSeed(derived.keys[Roles.Dust]);
  const keystore = createKeystore(derived.keys[Roles.NightExternal], "undeployed");
  const wallet = await WalletFacade.init({
    configuration: {
      networkId: "undeployed", indexerClientConnection: {
        indexerHttpUrl: endpoints.indexer, indexerWsUrl: endpoints.indexerWS,
      }, provingServerUrl: new URL(endpoints.proof), relayURL: new URL(endpoints.node),
      txHistoryStorage: new NoOpTransactionHistoryStorage(),
      costParameters: { additionalFeeOverhead: 300_000_000_000_000n, feeBlocksMargin: 5 },
    },
    shielded: c => ShieldedWallet(c).startWithSecretKeys(shieldedSecretKeys),
    unshielded: c => UnshieldedWallet(c).startWithPublicKey(PublicKey.fromKeyStore(keystore)),
    dust: c => DustWallet(c).startWithSecretKey(dustSecretKey, Ledger.LedgerParameters.initialParameters().dust),
  });
  await wallet.start(shieldedSecretKeys, dustSecretKey);
  let browserWallet: Awaited<ReturnType<typeof startBrowserWallet>> | undefined;
  let backend: Awaited<ReturnType<typeof startBackendProbe>> | undefined;
  try {
    console.log("Syncing local developer wallet...");
    const synced = await wallet.waitForSyncedState();
    assert((synced.unshielded.balances[Ledger.unshieldedToken().raw] ?? 0n) > 0n,
      "Local genesis wallet is not funded");
    const coins = synced.unshielded.availableCoins.filter(c => !c.meta?.registeredForDustGeneration);
    // 개발 월렛이 로컬 거래 수수료용 DUST를 확보하도록 준비한다.
    // 이 직접 월렛 호출은 아래의 '계약 트랜잭션 제출' 카운터에 포함되지 않는다.
    if (coins.length) {
      const recipe = await wallet.registerNightUtxosForDustGeneration(coins, keystore.getPublicKey(),
        payload => keystore.signData(payload));
      await wallet.submitTransaction(await wallet.finalizeRecipe(recipe));
    }
    await Rx.firstValueFrom(wallet.state().pipe(
      Rx.filter(s => s.isSynced && s.dust.balance(new Date()) > 0n),
      Rx.timeout({ first: 5 * 60_000 }),
    ));
    // Allow one block for DUST projection to become spendable on chain.
    await new Promise(resolve => setTimeout(resolve, 6000));
    if (process.env.DRIVACY_BROWSER_INTEGRATION === "1") {
      // 최초 배포와 Genesis도 후속 운행과 같은 기기 월렛이 승인한다.
      browserWallet = await startBrowserWallet();
      assert.deepEqual(browserWallet.publicKeys, { coinPublicKey: shieldedSecretKeys.coinPublicKey,
        encryptionPublicKey: shieldedSecretKeys.encryptionPublicKey });
      evidence.localBrowserVaultVerified = browserWallet.vaultVerified;
    }

    const assets = fileURLToPath(new URL("../managed/driving-state", import.meta.url));
    const compiledContract = CompiledContract.make("driving-state", Driving.Contract<DrivingPrivateState>).pipe(
      CompiledContract.withWitnesses(witnesses), CompiledContract.withCompiledFileAssets(assets));
    const zkConfigProvider = new NodeZkConfigProvider<"initialize" | "beginTrip" | "appendRecord" | "finishTrip" | "cancelTrip" | "submitEvaluation">(assets);
    const realProofProvider = httpClientProofProvider(endpoints.proof, zkConfigProvider);
    // 성공 횟수만 확인하면 실패한 proof 요청을 놓칠 수 있어 시도/성공을 따로 센다.
    let successfulProofRequests = 0;
    let contractProofRequests = 0;
    const proofProvider = {
      ...realProofProvider,
      async proveTx(...args: Parameters<typeof realProofProvider.proveTx>) {
        contractProofRequests++;
        const proven = await realProofProvider.proveTx(...args);
        successfulProofRequests++; return proven;
      },
    };
    let submittedContractTransactions = 0;
    let jobHooks: TransactionHooks | undefined;
    let developerApprovals = 0;
    const jobStorePath = `driving-jobs-${randomUUID()}.json`;
    const jobStore = new LocalJobStore(jobStorePath);
    // 개발자가 실행한 로컬 모의 거래만 승인한다. 가입자 UI의 승인으로 표현하지 않는다.
    let currentProvenHex = "";
    let browserCancellationChecked = false;
    let cancelNextBrowserApproval = false;
    let initialBrowserApprovals = 0;
    let bootstrapApproval: { step: "deploy" | "initialize"; expectedAddress?: string; targetCommitment: string } | undefined;
    const developerApproval = { async request(display: import("../src/trip-job.js").ApprovalRequest) {
      developerApprovals++;
      if (!browserWallet) return "approved" as const;
      const cancel = cancelNextBrowserApproval; cancelNextBrowserApproval = false;
      return await browserWallet.approve(display, currentProvenHex, cancel) ? "approved" as const : "cancelled" as const;
    } };
    const walletProvider = {
      getCoinPublicKey: () => shieldedSecretKeys.coinPublicKey,
      getEncryptionPublicKey: () => shieldedSecretKeys.encryptionPublicKey,
      async balanceTx(tx: Parameters<typeof wallet.balanceUnboundTransaction>[0], ttl?: Date) {
        currentProvenHex = Buffer.from(tx.serialize()).toString("hex");
        const balance = async () => {
          if (browserWallet) {
            if (bootstrapApproval) {
              const pending = bootstrapApproval; bootstrapApproval = undefined;
              const actions = Array.from(tx.intents?.values() ?? []).flatMap(intent => intent.actions);
              const action = actions[0];
              const address = action instanceof Ledger.ContractDeploy || action instanceof Ledger.ContractCall
                ? action.address : undefined;
              if (actions.length !== 1 || !address || (pending.expectedAddress && address !== pending.expectedAddress)) {
                throw new Error("BOOTSTRAP_TRANSACTION_MISMATCH");
              }
              const approved = await browserWallet.approve({ approvalRequestId: randomUUID(),
                operationId: `initial-${pending.step}`, step: pending.step, network: "local",
                chainContractAddress: address, previousStateCommitment: "0".repeat(64),
                newStateCommitment: pending.targetCommitment }, currentProvenHex);
              if (!approved) throw new Error("APPROVAL_CANCELLED");
              initialBrowserApprovals++;
            }
            return Ledger.Transaction.deserialize<Ledger.SignatureEnabled, Ledger.Proof, Ledger.Binding>("signature", "proof", "binding",
              Buffer.from(await browserWallet.balance(currentProvenHex), "hex"));
          }
          const recipe = await wallet.balanceUnboundTransaction(tx,
          { shieldedSecretKeys, dustSecretKey }, { ttl: ttl ?? new Date(Date.now() + 30 * 60_000) });
          return wallet.finalizeRecipe(recipe);
        };
        return jobHooks ? jobHooks.balance(balance) : balance();
      },
      async submitTx(tx: Parameters<typeof wallet.submitTransaction>[0]) {
        const submit = async () => {
          submittedContractTransactions++;
          if (browserWallet) return browserWallet.submit(Buffer.from(tx.serialize()).toString("hex"));
          return wallet.submitTransaction(tx);
        };
        // 고정한 SDK 1.2.0도 identifiers().at(-1)을 반환한다. 실제 제출 전에 같은 ID를 기록한다.
        const transactionId = tx.identifiers().at(-1);
        assert(transactionId, "Finalized transaction has no identifier");
        return jobHooks ? jobHooks.submit(transactionId, submit) : submit();
      },
    };
    const publicDataProvider = indexerPublicDataProvider(endpoints.indexer, endpoints.indexerWS);
    const providers = {
      privateStateProvider: levelPrivateStateProvider<"driving", DrivingPrivateState>({
        privateStateStoreName: "drivacy-local-driving-state", accountId: keystore.getBech32Address().toString(),
        privateStoragePasswordProvider: () => "Local-Only-Drivacy-Probe-Password",
      }), publicDataProvider, zkConfigProvider, proofProvider,
      walletProvider, midnightProvider: walletProvider,
    };
    const randomSalt = () => randomBytes(32).toString("hex");
    // Ephemeral LOCAL developer secret, not a subscriber wallet key or server key.
    const ownerSecret = new Uint8Array(randomBytes(32));
    // 여기서 만든 State는 아직 비공개 초기화 입력이다. 체인 확인 전 confirmed로 만들지 않는다.
    const initialState = genesis(demoScope, demoRule, ownerSecret, randomSalt());
    const bootstrap = bootstrapPrivateState(initialState, demoRule, ownerSecret);
    console.log("Deploying Rule/Scope-bound driving contract...");
    if (browserWallet) bootstrapApproval = { step: "deploy", targetCommitment: initialState.stateCommitment };
    const deployed = await deployContract(providers, {
      compiledContract, args: [decode(initialState.rule.ruleHash), scopeBinding(demoScope, ownerSecret),
        Driving.pureCircuits.hashOwner(ownerSecret)],
      privateStateId: "driving", initialPrivateState: bootstrap,
    });
    const address = deployed.deployTxData.public.contractAddress;
    assert.equal(bootstrapApproval, undefined, "Deployment did not use the subscriber approval path");
    evidence.contractAddress = address;
    evidence.adapterProfile = ADAPTER_PROFILE;
    evidence.ruleHash = initialState.rule.ruleHash;
    evidence.deploy = publicReceipt(deployed.deployTxData.public); checkpoint();
    const registeredRule = demoRegisteredRule(initialState.rule.ruleHash, "live", address,
      deployed.deployTxData.public.txId);
    // 등록 Hash/receipt는 실제 로컬 값이다. demoRule의 보험사 승인 메타데이터는
    // 개발 가정이며 실제 보험사 승인·객체 권한을 검증했다는 의미는 아니다.
    type Action = "initialize" | "beginTrip" | "appendRecord" | "finishTrip" | "cancelTrip" | "submitEvaluation";
    async function call(action: Action, ps: DrivingPrivateState) {
      evidence.lastAction = action;
      checkpoint();
      // 해당 호출의 witness 입력을 암호화된 로컬 저장소에 설정한다.
      // 입력을 저장했다는 사실은 체인 상태 전이가 성공했다는 뜻이 아니다.
      await providers.privateStateProvider.set("driving", ps);
      console.log(`Executing ${action}...`);
      return deployed.callTx[action]!();
    }
    async function indexed() {
      const state = await publicDataProvider.queryContractState(address);
      assert(state, "Contract state is not indexed");
      return Driving.ledger(state.data);
    }
    function ledgerSnapshot(view: ReturnType<typeof Driving.ledger>) {
      // Set 조회 객체의 메서드는 매 조회마다 새 함수다. 함수 identity 대신 원장 값을 비교한다.
      const { usedEvaluations, ...fields } = view;
      return { ...fields, usedEvaluations: Array.from(usedEvaluations).map(encode).sort() };
    }
    function confirmation(state: State, previous: string, operationId: string, tx: FinalizedTxData): ChainConfirmation {
      return { execution: "live", network: "local", adapterProfile: ADAPTER_PROFILE,
        chainContractAddress: address, transactionId: tx.txId, blockId: tx.blockHash,
        operationId, previousStateCommitment: previous, newStateCommitment: state.stateCommitment,
        ruleHash: state.rule.ruleHash, datasetRoot: state.datasetRoot, observedAt: new Date().toISOString() };
    }
    if (browserWallet) bootstrapApproval = { step: "initialize", expectedAddress: address,
      targetCommitment: initialState.stateCommitment };
    const initTx = await call("initialize", bootstrap);
    assert.equal(bootstrapApproval, undefined, "Genesis did not use the subscriber approval path");
    // 요청 전송 여부 대신 finalized receipt와 실제 원장 커밋먼트의 일치로 확인한다.
    assert.deepEqual((await indexed()).stateCommitment, decode(initialState.stateCommitment));
    evidence.initialize = publicReceipt(initTx.public); checkpoint();
    let previous: ConfirmedState = { kind: "confirmed", state: initialState,
      confirmation: confirmation(initialState, "0".repeat(64), "genesis-initialize", initTx.public) };
    if (process.env.DRIVACY_BROWSER_INTEGRATION === "1") {
      console.log("Starting isolated PostgreSQL B integration...");
      backend = await startBackendProbe(id => getTripStatus(new LocalJobStore(jobStorePath), id),
        id => canAbandonTrip(new LocalJobStore(jobStorePath), id));
      await backend.register(registeredRule, previous);
      assert.equal(initialBrowserApprovals, 2, "Initial deployment and Genesis require two browser approvals");
      evidence.initialBrowserApprovals = initialBrowserApprovals;
    }
    const rejections: string[] = [];
    async function rejected(label: string, action: Action, ps: DrivingPrivateState, pattern: RegExp) {
      // SDK의 회로 실행에서 거부되는 검사다. invalid raw proof를 노드에 제출하는
      // 검사가 아니다. 요청/성공/제출 카운터와 원장이 모두 그대로인지 확인한다.
      const attempts = contractProofRequests;
      const proofs = successfulProofRequests;
      const submissions = submittedContractTransactions;
      const before = ledgerSnapshot(await indexed());
      await assert.rejects(() => call(action, ps), pattern);
      assert.equal(contractProofRequests, attempts, "Invalid request reached the proof provider");
      assert.equal(successfulProofRequests, proofs, "Invalid request reached successful proof generation");
      assert.equal(submittedContractTransactions, submissions, "Invalid request was submitted");
      assert.deepEqual(ledgerSnapshot(await indexed()), before, "Rejected request altered the chain");
      rejections.push(label);
    }
    const firstRequest = demoRequest(previous, registeredRule, demoTrip(1, randomSalt()));
    const first = prepareTrip(firstRequest, ownerSecret, randomSalt(), randomSalt());
    await rejected("score", "beginTrip", { ...first.initial,
      nextOpening: { ...first.initial.nextOpening, score: 97n } }, /Calculation result mismatch/);
    await rejected("rule", "beginTrip", { ...first.initial,
      ruleOpening: { ...first.initial.ruleOpening, speedingPenalty: 1n } }, /Registered rule mismatch/);
    await rejected("previous-opening", "beginTrip", { ...first.initial,
      previousOpening: { ...first.initial.previousOpening, salt: new Uint8Array(randomBytes(32)) } }, /Stale previous state/);
    await rejected("owner", "beginTrip", { ...first.initial,
      ownerSecret: new Uint8Array(randomBytes(32)) }, /Unauthorized/);
    if (browserWallet) {
      const request = { ...demoRequest(previous, registeredRule, { ...demoTrip(1, randomSalt()), id: "cancelled-trip" }),
        operationId: "operation-cancelled-trip", idempotencyKey: "idempotency-cancelled-trip" };
      const cancelledTrip = prepareTrip(request, ownerSecret, randomSalt(), randomSalt());
      const candidate = cancelledTrip.candidate;
      if (backend) await backend.stage(request);
      const cancelled = new TripJob(request, candidate, jobStore, developerApproval);
      const submissions = submittedContractTransactions;
      const before = ledgerSnapshot(await indexed());
      cancelNextBrowserApproval = true;
      await assert.rejects(() => cancelled.runStep("beginTrip", async hooks => {
        jobHooks = hooks;
        try { return (await call("beginTrip", cancelledTrip.initial)).public; }
        finally { jobHooks = undefined; }
      }, tx => ({ transactionId: tx.txId, blockId: tx.blockHash })), /APPROVAL_CANCELLED/);
      const status = await cancelled.getStatus();
      assert.equal(status.status, "failed");
      assert("error" in status && status.error.code === "APPROVAL_CANCELLED" && !status.error.retryable);
      await assert.rejects(() => browserWallet!.balance(currentProvenHex), /BROWSER_APPROVAL_REQUIRED/);
      assert.equal(submittedContractTransactions, submissions);
      assert.deepEqual(ledgerSnapshot(await indexed()), before);
      if (backend) await backend.abandon(request);
      browserCancellationChecked = true;

      // beginTrip이 이미 원장에 반영된 뒤 다음 단계 승인이 취소되면 DB scope만 풀 수 없다.
      // 가입자가 별도 cancelTrip을 승인하고 실제 receipt를 확인한 뒤에만 B가 abandoned로 닫는다.
      const submittedRequest = { ...demoRequest(previous, registeredRule,
        { ...demoTrip(1, randomSalt()), id: "cancelled-after-begin-trip" }),
      operationId: "operation-cancelled-after-begin", idempotencyKey: "idempotency-cancelled-after-begin" };
      const submittedTrip = prepareTrip(submittedRequest, ownerSecret, randomSalt(), randomSalt());
      if (backend) await backend.stage(submittedRequest);
      const submittedJob = new TripJob(submittedRequest, submittedTrip.candidate, jobStore, developerApproval);
      const executeAction = (action: Action, ps: DrivingPrivateState) => async (hooks: TransactionHooks) => {
        jobHooks = hooks;
        try { return (await call(action, ps)).public; }
        finally { jobHooks = undefined; }
      };
      await submittedJob.runStep("beginTrip", executeAction("beginTrip", submittedTrip.initial),
        tx => ({ transactionId: tx.txId, blockId: tx.blockHash }));
      assert.equal((await indexed()).active, true);
      cancelNextBrowserApproval = true;
      await assert.rejects(() => submittedJob.runStep("appendRecord:0",
        executeAction("appendRecord", submittedTrip.steps[0]!),
        tx => ({ transactionId: tx.txId, blockId: tx.blockHash })), /APPROVAL_CANCELLED/);
      assert.equal(await canAbandonTrip(jobStore, submittedRequest.operationId), false);
      if (backend) await backend.expectAbandonBlocked(submittedRequest);
      const cancelTx = await submittedJob.cancelAfterSubmission(executeAction("cancelTrip", submittedTrip.final),
        tx => ({ transactionId: tx.txId, blockId: tx.blockHash }));
      assert(cancelTx.transactionId && cancelTx.blockId);
      const cancelledLedger = await indexed();
      assert.equal(cancelledLedger.active, false);
      assert.deepEqual(cancelledLedger.stateCommitment, decode(previous.state.stateCommitment));
      assert.equal(await canAbandonTrip(jobStore, submittedRequest.operationId), true);
      if (backend) await backend.abandon(submittedRequest);
      evidence.submittedTripCancelledOnChainBeforeBackendScopeRelease = true;
    }
    const transitions: unknown[] = [];
    for (const number of [1, 2] as const) {
      // 첫 운행의 실제 확정 opening/receipt를 두 번째 입력으로 이어 붙인다.
      // 과거 원본을 다시 넣거나 누적 거리/이벤트를 0으로 초기화하지 않는다.
      const request = number === 1 ? firstRequest
        : demoRequest(previous, registeredRule, demoTrip(2, randomSalt()));
      const prepared = number === 1 ? first : prepareTrip(request, ownerSecret, randomSalt(), randomSalt());
      if (backend) await backend.stage(request);
      const job = new TripJob(request, prepared.candidate, jobStore, developerApproval);
      const stepReceipts = new Map<TripStep, FinalizedTxData>();
      async function approvedCall(step: TripStep, action: Action, ps: DrivingPrivateState) {
        const execute = async (hooks: TransactionHooks) => {
          jobHooks = hooks;
          try {
            const tx = await call(action, ps);
            stepReceipts.set(step, tx.public);
            // 실제 체인 성공은 그대로 두고 C 결과 반환만 끊는 장애를 한 번 주입한다.
            // receipt/원장을 직접 재확인해 복구하고 거래를 다시 만들지 않아야 한다.
            if (number === 1 && step === "beginTrip") throw new Error("SIMULATED_RESULT_INTERRUPTION");
            return tx.public;
          } finally { jobHooks = undefined; }
        };
        if (number === 1 && step === "beginTrip") {
          await assert.rejects(() => job.runStep(step, execute, tx => ({ transactionId: tx.txId, blockId: tx.blockHash })),
            /SIMULATED_RESULT_INTERRUPTION/);
          const interrupted = await job.getStatus();
          assert.equal(interrupted.status, "chain-unknown");
          const tx = stepReceipts.get(step)!;
          assert.equal(tx.status, "SucceedEntirely");
          const pending = await indexed();
          assert.equal(pending.active, true);
          assert.equal(pending.cursor, 0n);
          assert.deepEqual(pending.targetCommitment, decode(prepared.candidate.state.stateCommitment));
          assert.deepEqual(pending.stateCommitment, decode(previous.state.stateCommitment));
          const submissionsBeforeRecovery = submittedContractTransactions;
          const proofsBeforeRecovery = contractProofRequests;
          const approvalsBeforeRecovery = developerApprovals;
          const recoveryJob = new TripJob(request, prepared.candidate, new LocalJobStore(jobStorePath), developerApproval);
          await recoveryJob.recoverStep(step, { transactionId: tx.txId, blockId: tx.blockHash });
          await recoveryJob.runStep(step, async () => { throw new Error("Recovered transaction was resent"); }, () => { throw new Error("Unreachable"); });
          assert.equal(submittedContractTransactions, submissionsBeforeRecovery);
          assert.equal(contractProofRequests, proofsBeforeRecovery);
          assert.equal(developerApprovals, approvalsBeforeRecovery);
          evidence.actualChainResultInterruptionRecoveredWithoutResubmission = true;
        } else {
          await job.runStep(step, execute, tx => ({ transactionId: tx.txId, blockId: tx.blockHash }));
        }
        return stepReceipts.get(step)!;
      }
      const beginTx = await approvedCall("beginTrip", "beginTrip", prepared.initial);
      assert.equal((await indexed()).revision, BigInt(number - 1));
      assert.deepEqual((await indexed()).stateCommitment, decode(previous.state.stateCommitment));
      await rejected(`trip-${number}-incomplete`, "finishTrip", prepared.final, /Incomplete dataset/);
      const step0 = prepared.steps[0]!;
      await rejected(`trip-${number}-record`, "appendRecord", { ...step0,
        recordOpening: { ...step0.recordOpening, metrics: { ...step0.recordOpening.metrics, distanceM: 1n } } },
        /Dataset inclusion mismatch/);
      const recordReceipts: unknown[] = [];
      for (const [index, step] of prepared.steps.entries()) {
        const tx = await approvedCall(`appendRecord:${index}`, "appendRecord", step);
        recordReceipts.push(publicReceipt(tx));
        // 기록별 처리가 성공해도 최신 확정 State는 finishTrip까지 이전 값이어야 한다.
        assert.equal((await indexed()).revision, BigInt(number - 1));
        assert.deepEqual((await indexed()).stateCommitment, decode(previous.state.stateCommitment));
      }
      const finishTx = await approvedCall("finishTrip", "finishTrip", prepared.final);
      const onchain = await indexed();
      assert.equal(onchain.revision, BigInt(number));
      assert.equal(onchain.active, false);
      assert.deepEqual(onchain.stateCommitment, decode(prepared.candidate.state.stateCommitment));
      assert.deepEqual(onchain.ruleHash, decode(registeredRule.ruleHash));
      assert.deepEqual(onchain.datasetRoot, decode(prepared.candidate.state.datasetRoot));
      const receipt = confirmation(prepared.candidate.state, prepared.candidate.previousStateCommitment,
        request.operationId, finishTx);
      const result = await job.confirm(receipt);
      // 체인 확정 후 원본 record/path witness는 더 필요하지 않다.
      // C의 현재 privateState도 집계 opening만 남긴다. LevelDB 과거 page의 물리 삭제 보장은 아니다.
      await providers.privateStateProvider.set("driving", bootstrapPrivateState(prepared.candidate.state, demoRule, ownerSecret));
      // B가 받는 계약의 일관성 검사까지 확인한다. 실제 B DB 트랜잭션을 실행하지는 않는다.
      assert(canFinalizeState(result, request), "B/C confirmation consistency gate failed");
      // B 저장 실패를 가정하고 새 C 객체/저장소에서 동일 결과를 다시 읽는다.
      // 실제 B DB 장애를 발생시키는 검사가 아니며, proof/제출이 늘지 않아야 한다.
      const submissionsBeforeReload = submittedContractTransactions;
      const approvalsBeforeReload = developerApprovals;
      const reloaded = new TripJob(request, prepared.candidate, new LocalJobStore(jobStorePath), developerApproval);
      assert.deepEqual(await reloaded.getStatus(), result);
      assert.deepEqual(await getTripStatus(new LocalJobStore(jobStorePath), request.operationId), result);
      await reloaded.runStep("finishTrip", async () => { throw new Error("Confirmed step was executed twice"); }, () => { throw new Error("Unreachable"); });
      assert.equal(submittedContractTransactions, submissionsBeforeReload);
      assert.equal(developerApprovals, approvalsBeforeReload);
      if (backend) {
        const proofs = contractProofRequests, submissions = submittedContractTransactions, approvals = developerApprovals;
        previous = await backend.finish(request, number === 1);
        assert.equal(contractProofRequests, proofs); assert.equal(submittedContractTransactions, submissions);
        assert.equal(developerApprovals, approvals);
      } else previous = { kind: "confirmed", state: prepared.candidate.state, confirmation: receipt };
      transitions.push({ number, begin: publicReceipt(beginTx), records: recordReceipts,
        finish: publicReceipt(finishTx), newStateCommitment: receipt.newStateCommitment,
        datasetRoot: receipt.datasetRoot, bcConsistencyGatePassed: true, persistedResultReloadedWithoutResubmission: true });
      evidence.transitions = transitions; checkpoint();
      console.log(`Trip ${number} confirmed: revision ${onchain.revision}`);
    }
    assert.equal(previous.state.totals.distanceM, 550_000);
    assert.equal(previous.state.score, 87);
    assert.equal(previous.state.expectedDiscountBps, 1000);
    await rejected("stale-replay", "beginTrip", first.initial, /Stale previous state/);
    const evaluation = prepareEvaluation(previous, registeredRule, ownerSecret, randomSalt());
    if (browserWallet) {
      // final evaluation도 실제 proven Tx를 가입자 기기 월렛의 승인/balance/submit에 연결한다.
      jobHooks = { async balance(run) {
        developerApprovals++;
        assert(await browserWallet!.approve({ approvalRequestId: randomUUID(), operationId: "final-evaluation",
          step: "submitEvaluation", network: "local", chainContractAddress: address,
          previousStateCommitment: previous.state.stateCommitment, newStateCommitment: previous.state.stateCommitment }, currentProvenHex));
        return run();
      }, async submit(_id, run) { return run(); } };
    }
    let evaluationTx;
    try { evaluationTx = await call("submitEvaluation", evaluation.privateState); }
    finally { jobHooks = undefined; }
    const evaluated = await indexed();
    assert.deepEqual(evaluated.resultCommitment, decode(evaluation.resultCommitment));
    assert.deepEqual(evaluated.submittedState, decode(previous.state.stateCommitment));
    assert.deepEqual(evaluated.evaluationNullifier, decode(evaluation.nullifier));
    assert(evaluated.usedEvaluations.member(decode(evaluation.nullifier)));
    assert(verifyResultOpening(evaluation.result, encode(evaluated.resultCommitment)));
    assert(!verifyResultOpening({ ...evaluation.result, score: evaluation.result.score + 1n }, evaluation.resultCommitment));
    const resalted = prepareEvaluation(previous, registeredRule, ownerSecret, randomSalt());
    assert.equal(resalted.nullifier, evaluation.nullifier);
    await rejected("duplicate-final-evaluation-with-new-salt", "submitEvaluation", resalted.privateState, /Evaluation already submitted/);
    evidence.finalEvaluation = { receipt: publicReceipt(evaluationTx.public), resultCommitment: evaluation.resultCommitment,
      stateCommitment: previous.state.stateCommitment, nullifier: evaluation.nullifier, privateOpeningVerified: true };
    await findDeployedContract(providers, {
      compiledContract, contractAddress: address, privateStateId: "driving",
      initialPrivateState: bootstrapPrivateState(previous.state, demoRule, ownerSecret),
    });
    assert.equal(submittedContractTransactions, browserWallet ? 12 : 10);
    // 기본 10회에 브라우저 연결 검사는 beginTrip + cancelTrip 2회를 추가한다.
    // 변조/중복 요청은 이 횟수를 늘리지 않아야 한다.
    // 취소 검사도 proof까지는 실제 생성하지만 기기 월렛에서 balance/submit을 하지 않는다.
    assert.equal(successfulProofRequests, browserWallet ? 14 : 10);
    assert.equal(contractProofRequests, browserWallet ? 14 : 10);
    assert.equal(developerApprovals, browserWallet ? 12 : 7);
    evidence.developerApprovalRequests = developerApprovals;
    evidence.walletApprovalJobInterfaceVerified = true;
    evidence.persistedResultReloadedWithoutResubmission = true;
    evidence.subscriberBrowserWalletVerified = false;
    evidence.backendDatabaseVerified = false;
    evidence.localBrowserWalletVerified = Boolean(browserWallet);
    evidence.browserCancellationPreventedBalanceAndSubmission = browserCancellationChecked;
    evidence.cancelledTripJobTerminalWithoutSubmission = browserCancellationChecked;
    evidence.cancelledBackendJobReleasedScopeWithoutSourceDeletion = Boolean(backend);
    evidence.concurrentBrowserBalanceAllowedExactlyOnce = browserWallet?.balanceConcurrencyVerified ?? false;
    evidence.localBackendDatabaseVerified = Boolean(backend);
    evidence.actualLocalDatabaseFailureRecoveredWithoutResubmission = Boolean(backend);
    evidence.actualLocalOriginalFilesDeletedAfterDatabaseConfirmation = Boolean(backend);
    evidence.supabaseAuthAndStorageVerified = false;
    evidence.finalEvaluationProofAndNullifierVerified = true;
    evidence.insuranceCalculationVerified = true;
    evidence.completeDatasetVerified = true;
    evidence.twoCumulativeTransitionsVerified = true;
    evidence.contractReconnected = true;
    evidence.invalidRequestsRejectedBeforeProofOrSubmission = rejections;
    evidence.successfulContractProofRequests = successfulProofRequests;
    evidence.contractProofRequests = contractProofRequests;
    evidence.submittedContractTransactions = submittedContractTransactions;
    evidence.finalRevision = 2;
    evidence.result = "passed";
    evidence.completedAt = new Date().toISOString(); checkpoint();
    console.log(JSON.stringify({ result: "passed", finalRevision: 2,
      successfulContractProofRequests: successfulProofRequests, rejectedCases: rejections.length }));
  } finally { if (browserWallet) await browserWallet.stop(); if (backend) await backend.stop(); await wallet.stop(); }
}

main().catch(() => {
  evidence.result = "failed";
  // Provider messages can contain proof inputs; never copy them to evidence/logs.
  evidence.failure = "LOCAL_DRIVING_VERIFICATION_FAILED";
  checkpoint(); console.error(evidence.failure); process.exitCode = 1;
}).finally(() => clearTimeout(deadline));
