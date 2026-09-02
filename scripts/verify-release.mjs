import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = path.join(root, "output");
const logDirectory = path.join(outputDirectory, "release-verification-logs");
const reportPath = path.join(outputDirectory, "release-verification.json");
const fastOnly = process.argv.includes("--fast");

const safeNames = [
  "ALLUSERSPROFILE", "APPDATA", "ComSpec", "CommonProgramFiles", "CommonProgramFiles(x86)",
  "CommonProgramW6432", "HOMEDRIVE", "HOMEPATH", "LOCALAPPDATA", "NUMBER_OF_PROCESSORS",
  "OS", "Path", "PATHEXT", "PROCESSOR_ARCHITECTURE", "PROCESSOR_IDENTIFIER", "PROCESSOR_LEVEL",
  "PROCESSOR_REVISION", "ProgramData", "ProgramFiles", "ProgramFiles(x86)", "ProgramW6432",
  "PSModulePath", "PUBLIC", "SystemDrive", "SystemRoot", "TEMP", "TMP", "USERDOMAIN",
  "USERNAME", "USERPROFILE", "windir",
];
const childEnvironment = {};
for (const name of safeNames) if (process.env[name] !== undefined) childEnvironment[name] = process.env[name];
childEnvironment.NEXT_TELEMETRY_DISABLED = "1";

const independentChecks = [
  { id: "secret-scan", script: "scripts/scan-secrets.mjs" },
  { id: "unit", script: "scripts/verify-unit.mjs" },
  { id: "typecheck", script: "scripts/verify-typecheck.mjs" },
  { id: "licenses", script: "scripts/verify-licenses.mjs" },
  { id: "mcp", script: "scripts/verify-mcp.mjs" },
].map((check) => ({ ...check, phase: "independent" }));

const orderedChecks = [
  { id: "eve-provider-free", script: "scripts/verify-provider-free.mjs" },
  { id: "production-build", script: "scripts/verify-build.mjs" },
  { id: "visual-atmosphere", script: "scripts/verify-visual-atmosphere.mjs" },
  { id: "production-launcher", script: "scripts/verify-start-local.mjs" },
  { id: "browser-flow", script: "scripts/verify-browser.mjs" },
  { id: "openrouter-offline-preflight", script: "scripts/verify-openrouter-smoke.mjs" },
].map((check) => ({ ...check, phase: "ordered" }));

fs.rmSync(logDirectory, { recursive: true, force: true });
fs.mkdirSync(logDirectory, { recursive: true });

function lastJsonRecord(output) {
  const lines = output.split(/\r?\n/u).filter((line) => line.trim().length > 0);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try {
      const value = JSON.parse(lines[index]);
      if (value && typeof value === "object" && !Array.isArray(value)) return value;
    } catch {}
  }
  return null;
}

async function runCheck(check) {
  const startedAt = new Date();
  const started = performance.now();
  process.stdout.write(`[release] ${check.id} started\n`);
  const result = await new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(root, check.script)], {
      cwd: root,
      env: childEnvironment,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.once("error", (error) => resolve({ exitCode: null, stdout, stderr: `${stderr}${error.stack ?? error.message}\n` }));
    child.once("exit", (exitCode) => resolve({ exitCode, stdout, stderr }));
  });
  const durationMs = Math.round(performance.now() - started);
  const logPath = path.join(logDirectory, `${check.id}.log`);
  fs.writeFileSync(logPath, `${result.stdout}${result.stderr}`, "utf8");
  const state = result.exitCode === 0 ? "passed" : "failed";
  process.stdout.write(`[release] ${check.id} ${state} in ${durationMs}ms\n`);
  return {
    id: check.id,
    phase: check.phase,
    state,
    startedAt: startedAt.toISOString(),
    durationMs,
    exitCode: result.exitCode,
    evidence: lastJsonRecord(result.stdout),
    log: path.relative(root, logPath).replaceAll("\\", "/"),
  };
}

function skipped(check, reason) {
  return { id: check.id, phase: check.phase, state: "skipped", durationMs: 0, reason };
}

const runStartedAt = new Date();
const runStarted = performance.now();
process.stdout.write(`[release] independent phase: ${independentChecks.map((check) => check.id).join(", ")}\n`);
const independentResults = await Promise.all(independentChecks.map(runCheck));
const results = [...independentResults];
const independentPassed = independentResults.every((result) => result.state === "passed");

if (fastOnly) {
  results.push(...orderedChecks.map((check) => skipped(check, "Fast verification mode requested.")));
} else if (!independentPassed) {
  results.push(...orderedChecks.map((check) => skipped(check, "An independent prerequisite failed.")));
} else {
  let priorFailed = false;
  for (const check of orderedChecks) {
    if (priorFailed) {
      results.push(skipped(check, "A prior ordered release gate failed."));
      continue;
    }
    const result = await runCheck(check);
    results.push(result);
    priorFailed = result.state === "failed";
  }
}

const report = {
  schemaVersion: "release-verification-report-v1",
  state: results.some((result) => result.state === "failed") ? "failed" : "passed",
  mode: fastOnly ? "fast-provider-free" : "full-provider-free",
  startedAt: runStartedAt.toISOString(),
  completedAt: new Date().toISOString(),
  durationMs: Math.round(performance.now() - runStarted),
  totalCheckDurationMs: results.reduce((total, result) => total + result.durationMs, 0),
  measurementBoundary: "Durations describe this one local verification run. They are operational evidence, not a comparative performance benchmark.",
  execution: {
    independentParallel: independentChecks.map((check) => check.id),
    orderedSequential: orderedChecks.map((check) => check.id),
    liveProviderCallsAuthorized: false,
    credentialVariablesForwarded: 0,
  },
  counts: {
    passed: results.filter((result) => result.state === "passed").length,
    failed: results.filter((result) => result.state === "failed").length,
    skipped: results.filter((result) => result.state === "skipped").length,
  },
  checks: results,
};

fs.mkdirSync(outputDirectory, { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify({
  schemaVersion: report.schemaVersion,
  state: report.state,
  mode: report.mode,
  durationMs: report.durationMs,
  counts: report.counts,
  report: path.relative(root, reportPath).replaceAll("\\", "/"),
})}\n`);
if (report.state !== "passed") process.exitCode = 1;
