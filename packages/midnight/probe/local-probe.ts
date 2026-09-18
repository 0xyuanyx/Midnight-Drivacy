// Local developer harness only; never a subscriber wallet or server worker.
// Provider and wallet setup adapted from midnightntwrk/create-mn-app
// commit bdc86733d2a9d2e381cb050aec4fdde7b33559b4 (Apache-2.0).
import { strict as assert } from "node:assert";
import { randomBytes } from "node:crypto";
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
import * as Probe from "./managed/state-probe/contract/index.js";
import type { FinalizedTxData } from "@midnight-ntwrk/midnight-js-types";

Object.assign(globalThis, { WebSocket });
setNetworkId("undeployed");
const endpoints = {
  node: "ws://127.0.0.1:9945", indexer: "http://127.0.0.1:8089/api/v4/graphql",
  indexerWS: "ws://127.0.0.1:8089/api/v4/graphql/ws", proof: "http://127.0.0.1:6301",
};
const evidence: Record<string, unknown> = {
  execution: "live", network: "undeployed", purpose: "step-2-technology-probe",
  compiler: "0.31.1", runtime: "0.16.0", onchainRuntime: "3.0.0", midnightJs: "4.1.1", walletSdk: "1.2.0",
  proofServer: "8.1.0", insuranceCalculationVerified: false,
};
function checkpoint() {
  writeFileSync("probe-evidence.json", JSON.stringify(evidence, null, 2));
}
function publicReceipt(data: FinalizedTxData) {
  return { txId: data.txId, status: data.status, blockHash: data.blockHash,
    blockHeight: data.blockHeight, blockTimestamp: data.blockTimestamp };
}
const deadline = setTimeout(() => {
  evidence.failure = "LOCAL_PROBE_TIMEOUT"; checkpoint(); process.exit(1);
}, 10 * 60_000);

async function main() {
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
  try {
    console.log("Syncing local developer wallet...");
    const synced = await wallet.waitForSyncedState();
    assert((synced.unshielded.balances[Ledger.unshieldedToken().raw] ?? 0n) > 0n,
      "Local genesis wallet is not funded");
    const coins = synced.unshielded.availableCoins.filter(c => !c.meta?.registeredForDustGeneration);
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

    const assets = fileURLToPath(new URL("./managed/state-probe", import.meta.url));
    const compiledContract = CompiledContract.make("state-probe", Probe.Contract).pipe(
      CompiledContract.withVacantWitnesses, CompiledContract.withCompiledFileAssets(assets));
    const zkConfigProvider = new NodeZkConfigProvider<"advance">(assets);
    const realProofProvider = httpClientProofProvider(endpoints.proof, zkConfigProvider);
    let successfulProofRequests = 0;
    const proofProvider = {
      ...realProofProvider,
      async proveTx(...args: Parameters<typeof realProofProvider.proveTx>) {
        const proven = await realProofProvider.proveTx(...args);
        successfulProofRequests++; return proven;
      },
    };
    let submittedContractTransactions = 0;
    const walletProvider = {
      getCoinPublicKey: () => shieldedSecretKeys.coinPublicKey,
      getEncryptionPublicKey: () => shieldedSecretKeys.encryptionPublicKey,
      async balanceTx(tx: Parameters<typeof wallet.balanceUnboundTransaction>[0], ttl?: Date) {
        const recipe = await wallet.balanceUnboundTransaction(tx,
          { shieldedSecretKeys, dustSecretKey }, { ttl: ttl ?? new Date(Date.now() + 30 * 60_000) });
        return wallet.finalizeRecipe(recipe);
      },
      async submitTx(tx: Parameters<typeof wallet.submitTransaction>[0]) {
        submittedContractTransactions++;
        return wallet.submitTransaction(tx);
      },
    };
    const publicDataProvider = indexerPublicDataProvider(endpoints.indexer, endpoints.indexerWS);
    const providers = {
      privateStateProvider: levelPrivateStateProvider({
        privateStateStoreName: "drivacy-local-probe-state", accountId: keystore.getBech32Address().toString(),
        privateStoragePasswordProvider: () => "Local-Only-Drivacy-Probe-Password",
      }), publicDataProvider, zkConfigProvider, proofProvider,
      walletProvider, midnightProvider: walletProvider,
    };
    const initial = new Uint8Array(randomBytes(32));
    const first = new Uint8Array(randomBytes(32));
    const second = new Uint8Array(randomBytes(32));
    console.log("Deploying actual Compact state probe...");
    const deployed = await deployContract(providers, {
      compiledContract, args: [initial], privateStateId: "probe", initialPrivateState: {},
    });
    const address = deployed.deployTxData.public.contractAddress;
    evidence.contractAddress = address;
    evidence.deploy = publicReceipt(deployed.deployTxData.public); checkpoint();
    console.log(`Contract indexed: ${address}`);

    const firstTx = await deployed.callTx.advance(initial, first);
    evidence.firstTransition = publicReceipt(firstTx.public); checkpoint();
    const afterFirst = await publicDataProvider.queryContractState(address);
    assert(afterFirst, "First transition not indexed");
    assert.equal(Probe.ledger(afterFirst.data).revision, 1n);
    assert.deepEqual(Probe.ledger(afterFirst.data).stateCommitment, first);
    const secondTx = await deployed.callTx.advance(first, second);
    evidence.secondTransition = publicReceipt(secondTx.public); checkpoint();
    const afterSecond = await publicDataProvider.queryContractState(address);
    assert(afterSecond, "Second transition not indexed");
    assert.equal(Probe.ledger(afterSecond.data).revision, 2n);
    assert.deepEqual(Probe.ledger(afterSecond.data).stateCommitment, second);

    const submissionsBeforeRejection = submittedContractTransactions;
    const proofsBeforeRejection = successfulProofRequests;
    await assert.rejects(() => deployed.callTx.advance(initial, first), /Stale previous state/);
    assert.equal(submittedContractTransactions, submissionsBeforeRejection);
    assert.equal(successfulProofRequests, proofsBeforeRejection);
    const afterRejection = await publicDataProvider.queryContractState(address);
    assert(afterRejection);
    assert.equal(Probe.ledger(afterRejection.data).revision, 2n);
    assert.deepEqual(Probe.ledger(afterRejection.data).stateCommitment, second);
    evidence.staleStateRejectedBeforeSubmission = true;
    await findDeployedContract(providers, {
      compiledContract, contractAddress: address, privateStateId: "probe", initialPrivateState: {},
    });
    evidence.contractReconnected = true;
    assert(successfulProofRequests >= 3, "Missing real contract proof requests");
    assert.equal(submittedContractTransactions, 3);
    evidence.successfulContractProofRequests = successfulProofRequests;
    evidence.submittedContractTransactions = submittedContractTransactions;
    evidence.finalRevision = 2;
    evidence.result = "passed";
    evidence.completedAt = new Date().toISOString(); checkpoint();
    console.log(JSON.stringify({ result: "passed", contractAddress: address,
      finalRevision: 2, successfulContractProofRequests: successfulProofRequests,
      staleStateRejectedBeforeSubmission: true, insuranceCalculationVerified: false }));
  } finally { await wallet.stop(); }
}

main().catch(error => {
  evidence.result = "failed";
  evidence.failure = error instanceof Error ? error.message : "Unknown local probe failure";
  checkpoint(); console.error(evidence.failure); process.exitCode = 1;
}).finally(() => clearTimeout(deadline));
