import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const guardPath = path.join(root, "scripts", "provider-free-egress-guard.cjs");
const tscBin = path.join(root, "node_modules", "typescript", "bin", "tsc");
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "agent-or-not-typecheck-"));
const safeNames = [
  "ALLUSERSPROFILE", "APPDATA", "ComSpec", "CommonProgramFiles", "CommonProgramFiles(x86)",
  "CommonProgramW6432", "HOMEDRIVE", "HOMEPATH", "LOCALAPPDATA", "NUMBER_OF_PROCESSORS",
  "OS", "Path", "PATHEXT", "PROCESSOR_ARCHITECTURE", "PROCESSOR_IDENTIFIER", "PROCESSOR_LEVEL",
  "PROCESSOR_REVISION", "ProgramData", "ProgramFiles", "ProgramFiles(x86)", "ProgramW6432",
  "PSModulePath", "PUBLIC", "SystemDrive", "SystemRoot", "TEMP", "TMP", "USERDOMAIN",
  "USERNAME", "USERPROFILE", "windir",
];
const env = {};
for (const name of safeNames) if (process.env[name] !== undefined) env[name] = process.env[name];
env.NODE_OPTIONS = `--require=${guardPath}`;
env.AGENT_OR_NOT_EGRESS_METRICS_DIR = scratch;
env.AGENT_OR_NOT_EGRESS_METRICS_LABEL = "verify";
env.NEXT_TELEMETRY_DISABLED = "1";

try {
  const result = spawnSync(process.execPath, [tscBin, "--noEmit"], {
    cwd: root,
    env,
    encoding: "utf8",
    timeout: 120_000,
    windowsHide: true,
  });
  process.stdout.write(result.stdout ?? "");
  process.stderr.write(result.stderr ?? "");
  assert.equal(result.status, 0, "Provider-free typecheck failed.");
  const metrics = fs.readdirSync(scratch).filter((name) => name.endsWith(".json"))
    .map((name) => JSON.parse(fs.readFileSync(path.join(scratch, name), "utf8")));
  assert.ok(metrics.length >= 1);
  assert.ok(metrics.every((record) => record.attempted === 0 && record.blocked === 0));
  process.stdout.write(`${JSON.stringify({ schemaVersion: "provider-free-typecheck-v1", state: "passed", guardedProcesses: metrics.length, nonLoopbackAttempts: 0 })}\n`);
} finally {
  fs.rmSync(scratch, { recursive: true, force: true });
}
