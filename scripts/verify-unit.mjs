import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const vitestBin = path.join(root, "node_modules", "vitest", "vitest.mjs");
const guardPath = path.join(root, "scripts", "provider-free-egress-guard.cjs");
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "agent-or-not-unit-"));

const allowedEnvironmentNames = [
  "ALLUSERSPROFILE", "APPDATA", "ComSpec", "CommonProgramFiles", "CommonProgramFiles(x86)",
  "CommonProgramW6432", "HOMEDRIVE", "HOMEPATH", "LOCALAPPDATA", "NUMBER_OF_PROCESSORS",
  "OS", "Path", "PATHEXT", "PROCESSOR_ARCHITECTURE", "PROCESSOR_IDENTIFIER",
  "PROCESSOR_LEVEL", "PROCESSOR_REVISION", "ProgramData", "ProgramFiles", "ProgramFiles(x86)",
  "ProgramW6432", "PSModulePath", "PUBLIC", "SystemDrive", "SystemRoot", "TEMP", "TMP",
  "USERDOMAIN", "USERNAME", "USERPROFILE", "windir",
];

const environment = {};
for (const name of allowedEnvironmentNames) {
  if (process.env[name] !== undefined) environment[name] = process.env[name];
}
environment.NODE_OPTIONS = `--require=${guardPath}`;
environment.AGENT_OR_NOT_EGRESS_METRICS_DIR = scratch;
environment.AGENT_OR_NOT_EGRESS_METRICS_LABEL = "verify";
environment.NODE_ENV = "test";

try {
  const result = spawnSync(process.execPath, [vitestBin, "run"], {
    cwd: root,
    env: environment,
    encoding: "utf8",
    timeout: 60_000,
    windowsHide: true,
  });
  process.stdout.write(result.stdout ?? "");
  process.stderr.write(result.stderr ?? "");
  assert.equal(result.status, 0, "Provider-free unit verification failed.");
  const metrics = fs.readdirSync(scratch)
    .filter((name) => name.endsWith(".json"))
    .map((name) => JSON.parse(fs.readFileSync(path.join(scratch, name), "utf8")));
  assert.ok(metrics.length >= 1);
  assert.ok(metrics.every((record) => record.attempted === 0 && record.blocked === 0));
  process.stdout.write(`${JSON.stringify({ schemaVersion: "provider-free-unit-verification-v1", state: "passed", guardedProcesses: metrics.length, nonLoopbackAttempts: 0 })}\n`);
} finally {
  fs.rmSync(scratch, { recursive: true, force: true });
}
