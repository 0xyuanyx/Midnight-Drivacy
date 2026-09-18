import { Buffer } from "buffer";
import { WalletFacade, DustWallet, HDWallet, Roles, ShieldedWallet, UnshieldedWallet,
  createKeystore, NoOpTransactionHistoryStorage, PublicKey } from "@midnight-ntwrk/wallet-sdk";
import * as Ledger from "@midnight-ntwrk/midnight-js-protocol/ledger";
import * as Rx from "rxjs";
import { loadSeed } from "./seed-vault.js";

export interface WalletEndpoints { network: "undeployed" | "preprod"; indexer: string; indexerWS: string; proof: string; node: string }
export interface ApprovalDisplay {
  approvalRequestId: string; operationId: string; step: string;
  chainContractAddress: string; network: string;
  previousStateCommitment: string; newStateCommitment: string;
}
const fromHex = (hex: string) => {
  if (!/^(?:[0-9a-f]{2})+$/.test(hex)) throw new Error("INVALID_TRANSACTION_ENCODING");
  return new Uint8Array(Buffer.from(hex, "hex"));
};
const toHex = (bytes: Uint8Array) => Buffer.from(bytes).toString("hex");
const digest = async (hex: string) => toHex(new Uint8Array(await crypto.subtle.digest("SHA-256", fromHex(hex))));

/** 브라우저에서만 생성한다. 반환 객체에 seed/개인키/secretKey getter를 넣지 않는다. */
export async function unlockWallet(passphrase: string, endpoints: WalletEndpoints) {
  const seed = await loadSeed(passphrase);
  const hd = HDWallet.fromSeed(Buffer.from(seed));
  seed.fill(0);
  if (hd.type !== "seedOk") throw new Error("WALLET_DERIVATION_FAILED");
  const derived = hd.hdWallet.selectAccount(0).selectRoles([Roles.Zswap, Roles.NightExternal, Roles.Dust]).deriveKeysAt(0);
  hd.hdWallet.clear();
  if (derived.type !== "keysDerived") throw new Error("WALLET_DERIVATION_FAILED");
  const shieldedSecretKeys = Ledger.ZswapSecretKeys.fromSeed(derived.keys[Roles.Zswap]);
  const dustSecretKey = Ledger.DustSecretKey.fromSeed(derived.keys[Roles.Dust]);
  const keystore = createKeystore(derived.keys[Roles.NightExternal], endpoints.network);
  const wallet = await WalletFacade.init({
    configuration: { networkId: endpoints.network,
      indexerClientConnection: { indexerHttpUrl: endpoints.indexer, indexerWsUrl: endpoints.indexerWS },
      provingServerUrl: new URL(endpoints.proof), relayURL: new URL(endpoints.node),
      txHistoryStorage: new NoOpTransactionHistoryStorage(),
      costParameters: { additionalFeeOverhead: 300_000_000_000_000n, feeBlocksMargin: 5 } },
    shielded: c => ShieldedWallet(c).startWithSecretKeys(shieldedSecretKeys),
    unshielded: c => UnshieldedWallet(c).startWithPublicKey(PublicKey.fromKeyStore(keystore)),
    dust: c => DustWallet(c).startWithSecretKey(dustSecretKey, Ledger.LedgerParameters.initialParameters().dust),
  });
  await wallet.start(shieldedSecretKeys, dustSecretKey);
  const approved = new Map<string, string>();
  const consumedApprovalIds = new Set<string>();
  const balancedTransactions = new Set<string>();
  return {
    publicKeys: { coinPublicKey: shieldedSecretKeys.coinPublicKey, encryptionPublicKey: shieldedSecretKeys.encryptionPublicKey },
    async prepareFees(confirm: () => Promise<boolean>) {
      const state = await wallet.waitForSyncedState();
      const coins = state.unshielded.availableCoins.filter(c => !c.meta?.registeredForDustGeneration);
      if (coins.length) {
        // DUST 등록도 기기 월렛의 서명을 사용하므로 가입자의 별도 승인을 받는다.
        if (!await confirm()) throw new Error("APPROVAL_CANCELLED");
        const recipe = await wallet.registerNightUtxosForDustGeneration(coins, keystore.getPublicKey(), payload => keystore.signData(payload));
        await wallet.submitTransaction(await wallet.finalizeRecipe(recipe));
      }
      await Rx.firstValueFrom(wallet.state().pipe(Rx.filter(s => s.isSynced && s.dust.balance(new Date()) > 0n), Rx.timeout({ first: 300_000 })));
    },
    async approve(display: ApprovalDisplay, transactionHex: string,
      confirm: (display: ApprovalDisplay & { transactionDigest: string }) => Promise<boolean>) {
      if (approved.has(display.approvalRequestId) || consumedApprovalIds.has(display.approvalRequestId)) throw new Error("APPROVAL_ALREADY_USED");
      if ((display.network === "local" ? "undeployed" : display.network) !== endpoints.network) throw new Error("WALLET_NETWORK_MISMATCH");
      const tx = Ledger.Transaction.deserialize<Ledger.SignatureEnabled, Ledger.Proof, Ledger.PreBinding>("signature", "proof", "pre-binding", fromHex(transactionHex));
      const actions = Array.from(tx.intents?.values() ?? []).flatMap(intent => intent.actions);
      const call = actions[0];
      if (actions.length !== 1 || !(call instanceof Ledger.ContractCall)
        || call.address !== display.chainContractAddress
        || (typeof call.entryPoint === "string" ? call.entryPoint : new TextDecoder().decode(call.entryPoint)) !== display.step.split(":")[0]) {
        throw new Error("WALLET_CALL_MISMATCH");
      }
      // 승인 대기 중 중복 요청과 취소한 승인 ID의 재사용도 차단한다.
      consumedApprovalIds.add(display.approvalRequestId);
      const hash = await digest(transactionHex);
      const result = await confirm({ ...display, transactionDigest: hash });
      if (result) approved.set(display.approvalRequestId, hash);
      return result;
    },
    async balance(transactionHex: string, approvalRequestId: string) {
      const expected = approved.get(approvalRequestId);
      if (!expected) throw new Error("TRANSACTION_NOT_APPROVED");
      // 승인 한 번은 바로 그 proven Tx의 balance에만 사용한다. 다른 Tx에 재사용하지 않는다.
      approved.delete(approvalRequestId);
      consumedApprovalIds.add(approvalRequestId);
      // digest의 await 전에 소비한다. 동시에 balance를 호출해도 승인 한 번만 통과한다.
      if (expected !== await digest(transactionHex)) throw new Error("TRANSACTION_NOT_APPROVED");
      const tx = Ledger.Transaction.deserialize<Ledger.SignatureEnabled, Ledger.Proof, Ledger.PreBinding>("signature", "proof", "pre-binding", fromHex(transactionHex));
      const recipe = await wallet.balanceUnboundTransaction(tx, { shieldedSecretKeys, dustSecretKey },
        { ttl: new Date(Date.now() + 30 * 60_000) });
      const finalized = toHex((await wallet.finalizeRecipe(recipe)).serialize());
      balancedTransactions.add(await digest(finalized));
      return finalized;
    },
    async submit(transactionHex: string) {
      const hash = await digest(transactionHex);
      if (!balancedTransactions.delete(hash)) throw new Error("TRANSACTION_NOT_APPROVED");
      return wallet.submitTransaction(Ledger.Transaction.deserialize<Ledger.SignatureEnabled, Ledger.Proof, Ledger.Binding>("signature", "proof", "binding", fromHex(transactionHex)));
    },
    async stop() { approved.clear(); consumedApprovalIds.clear(); balancedTransactions.clear(); await wallet.stop(); },
  };
}
