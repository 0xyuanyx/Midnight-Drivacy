// 독립 Chromium 기기 월렛을 실제 로컬 거래의 balance/submit provider로 연결한다.
// 테스트 프로파일만 사용하며 사용자 브라우저나 설치 월렛에는 접근하지 않는다.
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, basename } from "node:path";
import { build } from "esbuild";
import { polyfillNode } from "esbuild-plugin-polyfill-node";
import { chromium } from "playwright";
import type { ApprovalDisplay } from "../browser/wallet-runtime.js";

export async function startBrowserWallet() {
  const root = fileURLToPath(new URL("../browser/", import.meta.url));
  const output = new URL("./browser-build/", import.meta.url);
  await mkdir(output, { recursive: true });
  await build({ entryPoints: [fileURLToPath(new URL("../browser/local-wallet-page.ts", import.meta.url))],
    outfile: fileURLToPath(new URL("wallet.js", output)), bundle: true, format: "esm", platform: "browser",
    target: "es2022", inject: [fileURLToPath(new URL("../browser/polyfills.ts", import.meta.url))],
    plugins: [polyfillNode({ globals: false }), {
      name: "midnight-wasm-bindgen",
      setup(builder) {
        builder.onLoad({ filter: /_bg\.wasm$/ }, async args => {
          // wasm-bindgen의 브라우저 모듈은 WASM exports를 직접 import한다.
          // binary loader로 바꾸면 exports가 사라지므로 실제 모듈을 인스턴스화한다.
          const bytes = await readFile(args.path);
          const module = new WebAssembly.Module(bytes);
          const imports = [...new Set(WebAssembly.Module.imports(module).map(x => x.module))];
          const names = WebAssembly.Module.exports(module).map(x => x.name);
          return { contents: `${imports.map((x, i) => `import * as binding${i} from ${JSON.stringify(x)};`).join("\n")}
            const bytes=Uint8Array.from(atob('${bytes.toString("base64")}'),c=>c.charCodeAt(0));
            const wasm=(await WebAssembly.instantiate(await WebAssembly.compile(bytes),{${imports.map((x,i) => `${JSON.stringify(x)}:binding${i}`).join(",")}})).exports;
            ${names.map(x => `export const ${x}=wasm[${JSON.stringify(x)}];`).join("\n")}`,
            loader: "js", resolveDir: dirname(args.path) };
        });
      },
    }] });
  const server = createServer(async (request, response) => {
    if (request.method !== "GET" || (request.url !== "/" && request.url !== "/wallet.js")) {
      response.writeHead(404); response.end(); return;
    }
    response.setHeader("Content-Type", request.url === "/" ? "text/html; charset=utf-8" : "text/javascript");
    response.end(await readFile(request.url === "/" ? `${root}/local-wallet.html` : new URL("wallet.js", output)));
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("LOCAL_BROWSER_SERVER_FAILED");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
  page.on("pageerror", error => console.error("Browser module:", error.message));
  await page.goto(`http://127.0.0.1:${address.port}`);
  await page.waitForFunction(() => Boolean(window.drivacyLocalWallet));
  const initialization = page.evaluate(() => window.drivacyLocalWallet.initialize());
  // DUST 등록이 필요한 경우에만 실제 DOM 승인 버튼을 누른다.
  void page.locator("#approval:not([hidden])").waitFor({ timeout: 5000 }).then(() => page.locator("#approve").click()).catch(() => {});
  const publicKeys = await initialization;
  const vaultVerified = await page.evaluate(() => window.drivacyLocalWallet.testVault());
  if (!vaultVerified) throw new Error("BROWSER_VAULT_CHECK_FAILED");
  let activeApprovalId: string | undefined;
  let balanceConcurrencyVerified = false;
  async function approve(display: ApprovalDisplay, tx: string, cancel = false) {
    const result = page.evaluate(({ display, tx }) => window.drivacyLocalWallet.approve(display, tx), { display, tx });
    await page.locator("#approval:not([hidden])").waitFor();
    await page.locator(cancel ? "#cancel" : "#approve").click();
    const approved = await result;
    if (approved) activeApprovalId = display.approvalRequestId;
    return approved;
  }
  return { publicKeys, vaultVerified, approve,
    get balanceConcurrencyVerified() { return balanceConcurrencyVerified; },
    async balance(tx: string) {
      if (!activeApprovalId) throw new Error("BROWSER_APPROVAL_REQUIRED");
      const id = activeApprovalId; activeApprovalId = undefined;
      if (!balanceConcurrencyVerified) {
        const result = await page.evaluate(async ({ tx, id }) => {
          // bridge가 아닌 실제 기기 runtime에 같은 승인으로 동시에 두 balance를 요청한다.
          const results = await Promise.allSettled([window.drivacyLocalWallet.balance(tx, id), window.drivacyLocalWallet.balance(tx, id)]);
          const successes = results.filter((x): x is PromiseFulfilledResult<string> => x.status === "fulfilled");
          const failures = results.filter((x): x is PromiseRejectedResult => x.status === "rejected");
          if (successes.length !== 1 || failures.length !== 1 || failures[0]!.reason.message !== "TRANSACTION_NOT_APPROVED") {
            throw new Error("BROWSER_BALANCE_APPROVAL_RACE");
          }
          return successes[0]!.value;
        }, { tx, id });
        balanceConcurrencyVerified = true;
        return result;
      }
      return page.evaluate(({ tx, id }) => window.drivacyLocalWallet.balance(tx, id), { tx, id });
    },
    submit: (tx: string) => page.evaluate(tx => window.drivacyLocalWallet.submit(tx), tx),
    async stop() { try { await page.evaluate(() => window.drivacyLocalWallet.stop()); }
      finally { await browser.close(); await new Promise<void>(resolve => server.close(() => resolve())); } },
  };
  } catch (error) { await browser.close(); await new Promise<void>(resolve => server.close(() => resolve())); throw error; }
}
