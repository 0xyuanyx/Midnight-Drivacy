import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const child = spawn(
  process.execPath,
  ["--env-file=.env", "--import=tsx", "apps/backend/src/auth-only-server.ts"],
  {
    cwd: root,
    env: {
      ...process.env,
      NODE_EXTRA_CA_CERTS: resolve(root, "config/supabase-root-2021.crt"),
    },
    stdio: "inherit",
  },
);

child.on("error", (error) => {
  console.error("Failed to start the auth-only backend:", error);
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});

// On Windows, Ctrl+C reaches both processes in the same console. child.kill()
// would force-terminate Node before the Backend can close its DB pool.
if (process.platform !== "win32") {
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => child.kill(signal));
  }
}
