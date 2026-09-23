import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const bridgeUrl = "http://127.0.0.1:3001";
const processes = [
  ["bridge", [join(root, "scripts/demo-bridge.mjs")], root, {}],
  ["insurer", [join(root, "node_modules/vite/bin/vite.js"), "--host", "127.0.0.1", "--port", "5173", "--strictPort"], join(root, "apps/web"), { VITE_DEMO_BRIDGE_URL: bridgeUrl }],
  ["driver", [join(root, "node_modules/expo/bin/cli"), "start", "--web", "--port", "8081"], join(root, "apps/mobile"), { EXPO_PUBLIC_DEMO_BRIDGE_URL: bridgeUrl }],
];
const children = processes.map(([name, args, cwd, vars]) => {
  const child = spawn(process.execPath, args, { cwd, env: { ...process.env, ...vars }, stdio: "inherit" });
  child.on("exit", (code) => {
    if (code && !stopping) {
      console.error(`${name} stopped with code ${code}`);
      stop(code);
    }
  });
  return child;
});
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) if (!child.killed) child.kill();
  process.exitCode = code;
}
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
console.log(`Linked frontend demo: insurer http://127.0.0.1:5173 · driver http://127.0.0.1:8081 · bridge ${bridgeUrl}`);
