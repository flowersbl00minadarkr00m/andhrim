import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evePort = process.env.EVE_NEXT_PRODUCTION_PORT ?? "4274";
const webPort = process.env.PORT ?? "3000";
if (!/^\d{2,5}$/u.test(evePort) || !/^\d{2,5}$/u.test(webPort)) throw new Error("Local ports must be numeric.");

const environment = {
  ...process.env,
  EVE_NEXT_PRODUCTION_PORT: evePort,
  HOSTNAME: "127.0.0.1",
  NODE_ENV: "production",
  NEXT_TELEMETRY_DISABLED: "1",
};
const commands = [
  [path.join(root, "node_modules", "eve", "bin", "eve.js"), "start", "--host", "127.0.0.1", "--port", evePort],
  [path.join(root, "node_modules", "next", "dist", "bin", "next"), "start", "--hostname", "127.0.0.1", "--port", webPort],
];
const children = commands.map(([executable, ...args]) => spawn(process.execPath, ["--env-file-if-exists=.env.local", executable, ...args], {
  cwd: root,
  env: environment,
  stdio: "inherit",
  windowsHide: true,
}));

let stopping = false;
async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  const exits = children.map((child) => {
    if (child.exitCode !== null) return Promise.resolve();
    const exit = new Promise((resolve) => child.once("exit", resolve));
    child.kill("SIGTERM");
    return exit;
  });
  await Promise.race([Promise.all(exits), new Promise((resolve) => setTimeout(resolve, 15_000))]);
  process.exit(code);
}
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => { void stop(0); });
for (const child of children) {
  child.once("error", (error) => { process.stderr.write(`${error.message}\n`); void stop(1); });
  child.once("exit", (code, signal) => {
    if (!stopping) {
      process.stderr.write(`A local service stopped unexpectedly (${code ?? signal}).\n`);
      void stop(code ?? 1);
    }
  });
}
