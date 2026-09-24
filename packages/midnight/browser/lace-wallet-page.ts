import { LaceProviderError, LaceWalletProvider, discoverLaceWallets, type MidnightWindow } from "./lace-wallet-provider.js";

type PendingApproval = {
  operationId: string; tripId: string; status: "awaiting-wallet-approval" | "chain-unknown"; approvalRequestId: string;
  network: string; chainContractAddress: string; step: "beginTrip" | `appendRecord:${number}` | "finishTrip" | "cancelTrip";
  previousStateCommitment: string; newStateCommitment: string;
  phase: "balance" | "submit"; transactionHex: string; balancedTransactionHex?: string; transactionDigest: string;
  walletServices?: { indexer: string; indexerWS: string; proof: string; node: string };
};
const expectedNetwork = "preprod";
const status = document.querySelector<HTMLElement>("#status")!;
const providers = document.querySelector<HTMLElement>("#providers")!;
const details = document.querySelector<HTMLElement>("#details")!;
const connectButton = document.querySelector<HTMLButtonElement>("#connect")!;
const loadButton = document.querySelector<HTMLButtonElement>("#load")!;
const approvalButton = document.querySelector<HTMLButtonElement>("#approve")!;
const cancelButton = document.querySelector<HTMLButtonElement>("#cancel")!;
const runtimeUrl = document.querySelector<HTMLInputElement>("#runtime-url")!;
const operationId = document.querySelector<HTMLInputElement>("#operation-id")!;
const approvalToken = document.querySelector<HTMLInputElement>("#approval-token")!;
const provider = new LaceWalletProvider(expectedNetwork);
let pending: PendingApproval | undefined;

function show(message: string) { status.textContent = message; }
function endpoint(suffix = ""): string {
  const base = runtimeUrl.value.trim().replace(/\/$/, "");
  if (!/^https?:\/\//.test(base) || !operationId.value.trim() || !approvalToken.value.trim()) throw new Error("RUNTIME_DETAILS_REQUIRED");
  return `${base}/browser/trip-processing/${encodeURIComponent(operationId.value.trim())}${suffix}`;
}
async function runtimeRequest(method: "GET" | "POST", suffix = "", body?: unknown): Promise<Response> {
  return fetch(endpoint(suffix), { method, headers: { authorization: `Bearer ${approvalToken.value.trim()}`,
    ...(body === undefined ? {} : { "content-type": "application/json" }) }, body: body === undefined ? undefined : JSON.stringify(body) });
}

const discovered = discoverLaceWallets(globalThis as unknown as MidnightWindow);
providers.textContent = discovered.length === 0 ? "Lace v4 provider was not found." : discovered
  .map(wallet => `${wallet.name} (${wallet.rdns}, API ${wallet.apiVersion})`).join("\n");

connectButton.onclick = async () => {
  try {
    await provider.connect(); await provider.initialize();
    const info = await provider.getWalletInfo(); const services = provider.getServiceUris();
    details.textContent = `${info.name}\n${info.rdns}\nNetwork: ${info.network}\nPublic address: ${info.publicAddress ?? "not granted"}\nIndexer: ${services.indexer}\nNode: ${services.node}`;
    loadButton.disabled = false; show("Lace connected; load a C runtime approval capability.");
  } catch (error) { show(error instanceof LaceProviderError ? error.code : "WALLET_CONNECTION_FAILED"); }
};

loadButton.onclick = async () => {
  try {
    const response = await runtimeRequest("GET");
    if (!response.ok) throw new Error(`C_RUNTIME_${response.status}`);
    pending = await response.json() as PendingApproval;
    if (pending.network !== expectedNetwork || pending.operationId !== operationId.value.trim()) throw new Error("C_RUNTIME_APPROVAL_MISMATCH");
    const services = provider.getServiceUris();
    if (!pending.walletServices || services.indexer !== new URL(pending.walletServices.indexer).toString()
      || services.indexerWS !== new URL(pending.walletServices.indexerWS).toString()
      || services.node !== new URL(pending.walletServices.node).toString()
      || (services.proof ?? "") !== new URL(pending.walletServices.proof).toString()) throw new Error("C_RUNTIME_SERVICE_MISMATCH");
    approvalButton.disabled = false; cancelButton.disabled = false;
    show(`Awaiting wallet approval: ${pending.approvalRequestId} (${pending.step})`);
  } catch (error) { show(error instanceof Error ? error.message : "C_RUNTIME_STATUS_FAILED"); }
};

async function callback(body: Record<string, unknown>) {
  if (!pending) throw new Error("NO_PENDING_APPROVAL");
  const response = await runtimeRequest("POST", "/approval", { transactionDigest: pending.transactionDigest, ...body });
  if (!response.ok) throw new Error(`C_RUNTIME_CALLBACK_${response.status}`);
}

approvalButton.onclick = async () => {
  try {
    if (!pending) throw new Error("NO_PENDING_APPROVAL");
    const request = { approvalRequestId: pending.approvalRequestId, operationId: pending.operationId, tripId: pending.tripId,
      network: pending.network, chainContractAddress: pending.chainContractAddress, step: pending.step,
      previousStateCommitment: pending.previousStateCommitment, newStateCommitment: pending.newStateCommitment };
    if (pending.phase !== "balance") throw new Error("C_RUNTIME_NOT_READY_FOR_BALANCE");
    await provider.requestApproval(request);
    const decision = await provider.approveTransaction({ ...request, transactionHex: pending.transactionHex, transactionDigest: pending.transactionDigest });
    if (decision === "cancelled") { await callback({ decision: "cancelled" }); show("APPROVAL_CANCELLED"); return; }
    const balanced = await provider.balance(pending.transactionHex, pending.approvalRequestId);
    await callback({ decision: "approved", phase: "balanced", balancedTransactionHex: balanced });
    let submitReady: Response | undefined;
    for (let attempt = 0; attempt < 30; attempt++) {
      const response = await runtimeRequest("GET");
      if (!response.ok) throw new Error(`C_RUNTIME_SUBMIT_${response.status}`);
      const candidate = await response.json() as PendingApproval;
      if (candidate.phase === "submit") { pending = candidate; submitReady = response; break; }
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    if (!submitReady) throw new Error("C_RUNTIME_SUBMIT_NOT_READY");
    if (pending.phase !== "submit" || pending.balancedTransactionHex !== balanced) throw new Error("C_RUNTIME_SUBMISSION_MISMATCH");
    const submission = await provider.submit(balanced);
    await callback({ decision: "approved", phase: "submitted", localSubmissionReference: submission.localSubmissionReference });
    show("Submitted to Lace. C independently observes the SDK transaction ID and ledger state before confirmation.");
  } catch (error) { show(error instanceof LaceProviderError ? error.code : error instanceof Error ? error.message : "WALLET_APPROVAL_FAILED"); }
};
cancelButton.onclick = async () => { try { await callback({ decision: "cancelled" }); show("APPROVAL_CANCELLED"); } catch (error) { show(error instanceof Error ? error.message : "C_RUNTIME_CALLBACK_FAILED"); } };
