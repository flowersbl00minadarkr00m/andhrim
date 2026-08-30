import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
assert.equal(fs.existsSync(path.join(root, ".env.local")), false, "Provider-free start verification requires no .env.local.");
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "agent-or-not-start-"));
const metrics = path.join(scratch, "metrics");
fs.mkdirSync(metrics);
const port = await new Promise((resolve, reject) => {
  const probe = net.createServer();
  probe.once("error", reject);
  probe.listen(0, "127.0.0.1", () => {
    const address = probe.address();
    assert.ok(address && typeof address === "object");
    probe.close(() => resolve(address.port));
  });
});
const evePort = await new Promise((resolve, reject) => {
  const probe = net.createServer();
  probe.once("error", reject);
  probe.listen(0, "127.0.0.1", () => {
    const address = probe.address();
    assert.ok(address && typeof address === "object");
    probe.close(() => resolve(address.port));
  });
});
assert.notEqual(evePort, port, "Launcher verification requires unique web and Eve ports.");
const safeNames = ["ALLUSERSPROFILE", "APPDATA", "ComSpec", "HOMEDRIVE", "HOMEPATH", "LOCALAPPDATA", "OS", "Path", "PATHEXT", "ProgramData", "ProgramFiles", "SystemDrive", "SystemRoot", "TEMP", "TMP", "USERNAME", "USERPROFILE", "windir"];
const env = {};
for (const name of safeNames) if (process.env[name] !== undefined) env[name] = process.env[name];
env.NODE_OPTIONS = `--require=${path.join(root, "scripts", "provider-free-egress-guard.cjs")}`;
env.AGENT_OR_NOT_EGRESS_METRICS_DIR = metrics;
env.AGENT_OR_NOT_EGRESS_METRICS_LABEL = "start";
env.AGENT_OR_NOT_PROVIDER_MODE = "fixture";
env.AGENT_OR_NOT_DATA_DIR = path.join(scratch, "data");
env.AGENT_OR_NOT_FIXTURE_EVIDENCE_PATH = path.join(scratch, "fixture.ndjson");
env.EVE_NEXT_PRODUCTION_PORT = String(evePort);
env.NEXT_TELEMETRY_DISABLED = "1";
env.NODE_ENV = "production";
env.PORT = String(port);

const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");
const build = spawnSync(process.execPath, [nextBin, "build", "--webpack"], {
  cwd: root,
  env: { ...env, AGENT_OR_NOT_EGRESS_METRICS_LABEL: "build" },
  encoding: "utf8",
  timeout: 180_000,
  windowsHide: true,
});
assert.equal(build.status, 0, `Unique-port launcher production build failed.\n${build.stdout}\n${build.stderr}`);

const child = spawn(process.execPath, [path.join(root, "scripts", "start-local.mjs")], { cwd: root, env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
let output = "";
child.stdout.on("data", (value) => { output += value.toString(); });
child.stderr.on("data", (value) => { output += value.toString(); });
try {
  const deadline = Date.now() + 45_000;
  while (true) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/runtime`, {
        headers: { "sec-fetch-site": "same-origin" },
      });
      if (response.ok) {
        const runtime = await response.json();
        assert.equal(runtime.providerMode, "fixture");
        assert.equal(runtime.modelId, "agent-or-not-fixture");
        assert.equal(runtime.configured, true);
        assert.match(runtime.sessionNonce, /^[A-Za-z0-9_-]{43,128}$/u);
        assert.match(runtime.privacyDisclosure, /stays on this computer/u);
        break;
      }
    } catch {}
    if (child.exitCode !== null) throw new Error(`Local start command exited early.\n${output}`);
    if (Date.now() > deadline) throw new Error(`Local start command timed out.\n${output}`);
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
} finally {
  const exited = child.exitCode !== null || child.signalCode !== null
    ? Promise.resolve()
    : new Promise((resolve) => child.once("exit", resolve));
  if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
  await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 20_000))]);
}
assert.ok(child.exitCode !== null || child.signalCode !== null, "Local start command did not exit.");
await new Promise((resolve) => setTimeout(resolve, 500));
const records = fs.readdirSync(metrics).filter((name) => name.endsWith(".json")).map((name) => JSON.parse(fs.readFileSync(path.join(metrics, name), "utf8")));
assert.ok(records.length >= 3);
assert.ok(records.every((record) => record.attempted === 0 && record.blocked === 0));
const live = [...new Set(records.map((record) => record.pid))].filter((pid) => {
  try { process.kill(pid, 0); return true; } catch { return false; }
});
assert.deepEqual(live, [], `Residual local service processes: ${live.join(", ")}`);
process.stdout.write(`${JSON.stringify({ schemaVersion: "local-start-verification-v1", state: "passed", guardedProcesses: records.length, nonLoopbackAttempts: 0, uniquePorts: { web: port, eve: evePort }, residualProcesses: 0 })}\n`);
fs.rmSync(scratch, { recursive: true, force: true });
