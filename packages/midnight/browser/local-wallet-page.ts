// 학습/통합 검사용 페이지다. A의 제품 화면을 대신하는 디자인이 아니다.
// 공개 local genesis fixture만 이 파일에서 사용한다. 실제 createSeed 경로와 구분한다.
import { saveSeed, loadSeed, createSeed } from "./seed-vault.js";
import { unlockWallet, type ApprovalDisplay } from "./wallet-runtime.js";

declare global {
  interface Window {
    drivacyLocalWallet: {
      initialize(): Promise<{ coinPublicKey: string; encryptionPublicKey: string }>;
      approve(display: ApprovalDisplay, tx: string): Promise<boolean>;
      balance(tx: string, id: string): Promise<string>;
      submit(tx: string): Promise<string>;
      testVault(): Promise<boolean>;
      stop(): Promise<void>;
    };
  }
}
const passphrase = "Public-Local-Fixture-Only-Password";
let wallet: Awaited<ReturnType<typeof unlockWallet>>;
const status = document.querySelector<HTMLElement>("#status")!;
function confirm(message: string): Promise<boolean> {
  const panel = document.querySelector<HTMLElement>("#approval")!;
  document.querySelector<HTMLElement>("#request")!.textContent = message;
  panel.hidden = false;
  return new Promise(resolve => {
    const approve = document.querySelector<HTMLButtonElement>("#approve")!;
    const cancel = document.querySelector<HTMLButtonElement>("#cancel")!;
    const settle = (value: boolean) => { panel.hidden = true; approve.onclick = null; cancel.onclick = null; resolve(value); };
    approve.onclick = () => settle(true); cancel.onclick = () => settle(false);
  });
}
window.drivacyLocalWallet = {
  async initialize() {
    if (location.hostname !== "127.0.0.1" && location.hostname !== "localhost") throw new Error("LOCAL_FIXTURE_ONLY");
    // seed는 이 브라우저에서만 파생한다. 아래 값은 누구나 아는 로컬 테스트 genesis다.
    const seed = new Uint8Array(32); seed[31] = 1;
    await saveSeed(seed, passphrase); seed.fill(0);
    wallet = await unlockWallet(passphrase, { network: "undeployed", indexer: "http://127.0.0.1:8089/api/v4/graphql",
      indexerWS: "ws://127.0.0.1:8089/api/v4/graphql/ws", proof: "http://127.0.0.1:6301", node: "ws://127.0.0.1:9945" });
    await wallet.prepareFees(() => confirm("로컬 학습 월렛: 수수료용 DUST 등록을 승인합니다."));
    status.textContent = "로컬 학습 월렛 준비 완료";
    return wallet.publicKeys;
  },
  approve(display, tx) { return wallet.approve(display, tx, d => confirm(
    `로컬 학습 거래 ${d.step}\n계약 ${d.chainContractAddress}\n승인 대상 Tx(잔액 처리 전) SHA256 ${d.transactionDigest}\n어댑터가 제공한 작업 ${d.operationId}\n어댑터가 제공한 이전 ${d.previousStateCommitment}\n어댑터가 제공한 목표 ${d.newStateCommitment}`)); },
  balance(tx, id) { return wallet.balance(tx, id); },
  submit(tx) { return wallet.submit(tx); },
  async testVault() {
    // 잘못된 비밀번호는 동일 encrypted seed를 열지 못해야 한다.
    try { await loadSeed("Wrong-Local-Fixture-Password"); return false; } catch { /* expected */ }
    const seed = await loadSeed(passphrase);
    const okay = seed.length === 32 && seed[31] === 1;
    seed.fill(0);
    // 이미 만들어 둔 월렛을 createSeed로 덮지 못해야 한다.
    try { await createSeed(passphrase); return false; } catch { return okay; }
  },
  stop() { return wallet.stop(); },
};
