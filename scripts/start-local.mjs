import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function builtEveProxyPort() {
  const manifestPath = path.join(root, ".next", "routes-manifest.json");
  if (!fs.existsSync(manifestPath)) return null;
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const rules = [
    ...(manifest.rewrites?.beforeFiles ?? []),
    ...(manifest.rewrites?.afterFiles ?? []),
    ...(manifest.rewrites?.fallback ?? []),
  ];
  const rule = rules.find((candidate) => candidate?.source === "/eve/v1/:path+");
  if (!rule || typeof rule.destination !== "string") return null;
  const destination = new URL(rule.destination.replace(":path+", "health"));
  if (destination.protocol !== "http:" || destination.hostname !== "127.0.0.1" || !destination.port) {
    throw new Error("The built Eve proxy is not an explicit 127.0.0.1 HTTP destination.");
  }
  return destination.port;
}

const builtPort = builtEveProxyPort();
const requestedEvePort = process.env.EVE_NEXT_PRODUCTION_PORT?.trim();
if (requestedEvePort && builtPort && requestedEvePort !== builtPort) {
  throw new Error(`EVE_PROXY_PORT_MISMATCH: this Next.js build targets Eve on ${builtPort}, but start requested ${requestedEvePort}. Rebuild with the same EVE_NEXT_PRODUCTION_PORT or omit it so the launcher follows the build.`);
}
const evePort = requestedEvePort || builtPort || "4274";
const webPort = process.env.PORT ?? "3000";
const memoryMcpPort = process.env.AGENT_OR_NOT_MEMORY_MCP_PORT?.trim() || "4275";
if (![evePort, webPort, memoryMcpPort].every((value) => /^\d{2,5}$/u.test(value))) throw new Error("Local ports must be numeric.");
if (new Set([evePort, webPort, memoryMcpPort]).size !== 3) throw new Error("Next.js, Eve, and governed-memory MCP ports must be distinct.");
const memoryMcpPython = process.env.AGENT_OR_NOT_MCP_PYTHON?.trim()
  || path.join(root, "mcp_server", ".venv", "Scripts", "python.exe");
if (!path.isAbsolute(memoryMcpPython) || !fs.existsSync(memoryMcpPython)) {
  throw new Error("The governed-memory MCP environment is missing. Run `uv sync --project mcp_server --frozen`, then start again.");
}

const environment = {
  ...process.env,
  AGENT_OR_NOT_SESSION_NONCE: process.env.AGENT_OR_NOT_SESSION_NONCE ?? randomBytes(32).toString("base64url"),
  AGENT_OR_NOT_MEMORY_MCP_PORT: memoryMcpPort,
  AGENT_OR_NOT_MEMORY_MCP_URL: `http://127.0.0.1:${memoryMcpPort}/mcp`,
  EVE_NEXT_PRODUCTION_PORT: evePort,
  HOSTNAME: "127.0.0.1",
  NODE_ENV: "production",
  NEXT_TELEMETRY_DISABLED: "1",
  PYTHONDONTWRITEBYTECODE: "1",
  PYTHONNOUSERSITE: "1",
};
const commands = [
  [memoryMcpPython, path.join(root, "mcp_server", "server.py"), "--host", "127.0.0.1", "--port", memoryMcpPort],
  [process.execPath, path.join(root, "node_modules", "eve", "bin", "eve.js"), "start", "--host", "127.0.0.1", "--port", evePort],
  [process.execPath, path.join(root, "node_modules", "next", "dist", "bin", "next"), "start", "--hostname", "127.0.0.1", "--port", webPort],
];
const children = commands.map(([executable, ...args], index) => spawn(executable, index === 0 ? args : ["--env-file-if-exists=.env.local", ...args], {
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
