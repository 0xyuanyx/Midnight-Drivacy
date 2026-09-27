import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const mobile = resolve(root, "apps/mobile");
const output = resolve(mobile, "dist");
const port = 8081;
const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
};

// 심사 프리뷰는 완성된 웹 산출물을 제공한다. 캐시를 지워 이전 실행의 연결 주소가 재사용되지 않게 한다.
const exportProcess = spawn(process.execPath, [resolve(root, "node_modules/expo/bin/cli"), "export", "--platform", "web", "--clear"], {
  cwd: mobile,
  env: process.env,
  stdio: "inherit",
});
let stopping = false;
let server;
function stop() {
  if (stopping) return;
  stopping = true;
  if (exportProcess.exitCode === null && exportProcess.pid) {
    if (process.platform === "win32") {
      // Windows에서는 연결 데모가 종료될 때 Expo 빌드의 자식 프로세스도 함께 닫는다.
      spawn("taskkill", ["/PID", String(exportProcess.pid), "/T", "/F"], { stdio: "ignore" });
    } else {
      exportProcess.kill();
    }
  }
  if (server?.listening) server.close();
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
const exportCode = await new Promise((done, reject) => {
  exportProcess.on("error", reject);
  exportProcess.on("exit", (code) => done(code));
});
if (stopping) process.exit(0);
if (exportCode !== 0) process.exit(exportCode ?? 1);

server = createServer(async (request, response) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405);
    response.end();
    return;
  }
  try {
    const pathname = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname);
    const target = resolve(output, `.${pathname === "/" ? "/index.html" : pathname}`);
    if (target !== output && !target.startsWith(output + sep)) throw new Error("INVALID_PATH");
    const candidates = extname(target) ? [target] : [target + ".html", resolve(target, "index.html")];
    for (const file of candidates) {
      try {
        if (!(await stat(file)).isFile()) continue;
        const data = await readFile(file);
        response.writeHead(200, { "content-type": mimeTypes[extname(file)] ?? "application/octet-stream", "cache-control": "no-cache" });
        response.end(request.method === "HEAD" ? undefined : data);
        return;
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    }
    response.writeHead(404);
    response.end("Not found");
  } catch {
    response.writeHead(400);
    response.end("Invalid request");
  }
});
server.on("error", (error) => {
  console.error(`Drivacy driver preview failed: ${error.message}`);
  process.exitCode = 1;
});
server.listen(port, "127.0.0.1", () => console.log(`Drivacy driver preview: http://127.0.0.1:${port}`));
