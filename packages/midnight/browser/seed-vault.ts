// 브라우저 기기 안에서 seed를 암호화한다. 서버 전송·localStorage 평문 저장은 하지 않는다.
// 비밀번호 분실/다중 기기 복구는 MVP 범위 밖이며 XSS를 막아 주는 장치는 아니다.
interface VaultRecord { salt: Uint8Array; iv: Uint8Array; ciphertext: ArrayBuffer }
const databaseName = "drivacy-wallet-vault-v1";
async function key(passphrase: string, salt: Uint8Array) {
  if (passphrase.length < 12) throw new Error("WALLET_PASSWORD_TOO_SHORT");
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt: salt as Uint8Array<ArrayBuffer>, iterations: 310_000, hash: "SHA-256" },
    material, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}
async function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => { request.result.createObjectStore("seeds"); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error("WALLET_STORAGE_UNAVAILABLE"));
  });
}
export async function saveSeed(seed: Uint8Array, passphrase: string): Promise<void> {
  if (seed.length !== 32) throw new Error("INVALID_SEED_LENGTH");
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await key(passphrase, salt), seed as Uint8Array<ArrayBuffer>);
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("seeds", "readwrite");
      // 기기 월렛을 매번 새 seed로 덮지 않는다. 최초 생성만 add로 저장한다.
      tx.objectStore("seeds").add({ salt, iv, ciphertext } satisfies VaultRecord, "wallet");
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(new Error("WALLET_ALREADY_CREATED_OR_STORAGE_FAILED"));
    });
  } finally { db.close(); }
}
export async function loadSeed(passphrase: string): Promise<Uint8Array> {
  const db = await database();
  let record: VaultRecord;
  try {
    record = await new Promise((resolve, reject) => {
      const request = db.transaction("seeds", "readonly").objectStore("seeds").get("wallet");
      request.onsuccess = () => request.result ? resolve(request.result as VaultRecord) : reject(new Error("WALLET_NOT_CREATED"));
      request.onerror = () => reject(new Error("WALLET_STORAGE_UNAVAILABLE"));
    });
  } finally { db.close(); }
  try {
    return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: record.iv as Uint8Array<ArrayBuffer> },
      await key(passphrase, record.salt), record.ciphertext));
  } catch { throw new Error("WALLET_UNLOCK_FAILED"); }
}
export async function createSeed(passphrase: string): Promise<void> {
  const seed = crypto.getRandomValues(new Uint8Array(32));
  try { await saveSeed(seed, passphrase); } finally { seed.fill(0); }
}
