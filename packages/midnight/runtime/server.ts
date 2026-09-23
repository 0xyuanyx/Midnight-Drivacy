import { createCWalletHttpServer, BrowserApprovalCapabilitySigner, type CWalletProcessingRuntime } from "./c-wallet-http.js";

const modulePath = process.env.C_WALLET_RUNTIME_MODULE;
const adapterToken = process.env.C_WALLET_ADAPTER_TOKEN;
const browserSecret = process.env.C_BROWSER_APPROVAL_TOKEN_SECRET;
const port = Number(process.env.C_WALLET_PORT ?? 3100);
if (!modulePath || !adapterToken || !browserSecret || !Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("C_WALLET_RUNTIME_MODULE, C_WALLET_ADAPTER_TOKEN, C_BROWSER_APPROVAL_TOKEN_SECRET, and valid C_WALLET_PORT are required");
}

const loaded = await import(modulePath) as { createRuntime?: () => Promise<CWalletProcessingRuntime> | CWalletProcessingRuntime };
if (!loaded.createRuntime) throw new Error("C_WALLET_RUNTIME_MODULE must export createRuntime()");
const runtime = await loaded.createRuntime();
createCWalletHttpServer({ runtime, internalAdapterToken: adapterToken,
  browserCapabilitySigner: new BrowserApprovalCapabilitySigner(browserSecret) })
  .listen(port, "127.0.0.1", () => console.info(`C/Wallet runtime listening on 127.0.0.1:${port}`));
