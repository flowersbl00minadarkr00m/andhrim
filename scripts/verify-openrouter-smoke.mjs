import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseSmokeInvocation,
  providerFreeEnvironment,
  reconcileBoundaryEvidence,
  smokeReportSchema,
  terminateOwnedProcesses,
} from "./lib/openrouter-smoke-contract.mjs";
import { executeSmoke } from "./openrouter-smoke.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function expectContractCode(operation, code) {
  assert.throws(operation, (error) => error?.code === code);
}

function sampleCalls() {
  return [
    { timestamp: "2026-08-30T10:00:00.000Z", modelId: "provider/model", callIndex: 1, toolDefinitionCount: 0 },
    { timestamp: "2026-08-30T10:00:01.000Z", modelId: "provider/model", callIndex: 2, toolDefinitionCount: 0 },
  ];
}

function assertInvocationAndReportContracts() {
  assert.deepEqual(parseSmokeInvocation([]), { kind: "preflight" });
  assert.deepEqual(parseSmokeInvocation(["--preflight"]), { kind: "preflight" });
  expectContractCode(() => parseSmokeInvocation(["--live-openrouter"]), "LIVE_OPT_IN_INCOMPLETE");
  expectContractCode(() => parseSmokeInvocation([
    "--live-openrouter", "--confirm-provider-data-transfer", "--provider", "fixture", "--model", "provider/model",
  ]), "OPENROUTER_MODE_REQUIRED");
  expectContractCode(() => parseSmokeInvocation([
    "--live-openrouter", "--confirm-provider-data-transfer", "--provider", "openrouter", "--model", "not-explicit",
  ]), "EXPLICIT_MODEL_REQUIRED");
  expectContractCode(() => parseSmokeInvocation([
    "--live-openrouter", "--confirm-provider-data-transfer", "--provider", "openrouter", "--model", "provider/model", "--extra",
  ]), "UNKNOWN_ARGUMENT");
  assert.deepEqual(parseSmokeInvocation([
    "--live-openrouter", "--confirm-provider-data-transfer", "--provider", "openrouter", "--model", "provider/model",
  ]), { kind: "live", modelId: "provider/model" });

  const calls = sampleCalls();
  assert.equal(reconcileBoundaryEvidence(calls.slice(0, 1), "provider/model", 1, true).modelCallCount, 1);
  assert.equal(reconcileBoundaryEvidence(calls, "provider/model", 2, true).modelCallCount, 2);
  expectContractCode(() => reconcileBoundaryEvidence([], "provider/model", 1, true), "MODEL_BOUNDARY_NOT_OBSERVED");
  expectContractCode(() => reconcileBoundaryEvidence([...calls, { ...calls[1], callIndex: 3 }], "provider/model", 2, false), "ATTEMPT_BUDGET_EXCEEDED");
  expectContractCode(() => reconcileBoundaryEvidence([{ ...calls[0], toolDefinitionCount: 1 }], "provider/model", 1, false), "MODEL_TOOL_ENVELOPE_PRESENT");

  const validReport = {
    schemaVersion: "openrouter-owner-smoke-report-v1",
    state: "passed",
    timestamp: "2026-08-30T10:00:02.000Z",
    modelId: "provider/model",
    loopbackPorts: { web: 31_001, eve: 31_002 },
    receiptValidated: true,
    sessionCount: 1,
    blockedSessionRequests: 0,
    modelBoundary: { observed: true, modelCallCount: 1, toolDefinitionCount: 0, calls: calls.slice(0, 1) },
    browserNonLoopbackRequests: 0,
    cleanup: { scratchRemoved: true, residualProcessCount: 0, residualPortCount: 0 },
    error: null,
  };
  assert.equal(smokeReportSchema.parse(validReport).state, "passed");
  for (const unsafeReport of [
    { ...validReport, prompt: "forbidden" },
    { ...validReport, assessment: { title: "forbidden" } },
    { ...validReport, providerResponse: { body: "forbidden" } },
    { ...validReport, headers: { authorization: "forbidden" } },
    { ...validReport, apiKey: "forbidden" },
    { ...validReport, ledger: [{ type: "forbidden" }] },
    { ...validReport, modelBoundary: { ...validReport.modelBoundary, calls: [{ ...calls[0], rawOutput: "forbidden" }] } },
  ]) {
    assert.equal(smokeReportSchema.safeParse(unsafeReport).success, false);
  }
  assert.equal(smokeReportSchema.safeParse({ ...validReport, sessionCount: 3 }).success, false);
  assert.equal(smokeReportSchema.safeParse({ ...validReport, blockedSessionRequests: 1 }).success, false);

  const environment = providerFreeEnvironment();
  assert.equal(Object.keys(environment).some((name) => /(?:API_KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|AUTHORIZATION)/iu.test(name)), false);
  expectContractCode(() => providerFreeEnvironment({ OPENROUTER_API_KEY: "x" }), "LIVE_OPT_IN_INCOMPLETE");
  const harnessSource = fs.readFileSync(path.join(root, "scripts", "openrouter-smoke.mjs"), "utf8");
  assert.doesNotMatch(harnessSource, /process\.env\.OPENROUTER_API_KEY/u);
}

async function runFixtureAssertions(metricsDirectory) {
  assertInvocationAndReportContracts();

  const cleanupChild = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
    env: providerFreeEnvironment(),
    stdio: "ignore",
    windowsHide: true,
  });
  assert.ok(cleanupChild.pid);
  const cleanup = await terminateOwnedProcesses([cleanupChild]);
  assert.deepEqual(cleanup.residualProcessIds, []);

  const fixture = await executeSmoke({
    mode: "fixture",
    modelId: "agent-or-not-fixture",
    fixtureScenario: "invalid-first-receipt",
    retainReport: false,
    verifyMissingKey: true,
  });
  assert.equal(smokeReportSchema.parse(fixture.report).state, "passed", JSON.stringify(fixture.report));
  assert.equal(fixture.report.receiptValidated, true);
  assert.equal(fixture.report.sessionCount, 2);
  assert.equal(fixture.report.blockedSessionRequests, 0);
  assert.equal(fixture.report.modelBoundary.modelCallCount, 2);
  assert.deepEqual(fixture.report.modelBoundary.calls.map((call) => [call.callIndex, call.toolDefinitionCount]), [[1, 0], [2, 0]]);
  assert.equal(fixture.report.browserNonLoopbackRequests, 0);
  assert.deepEqual(fixture.report.cleanup, { scratchRemoved: true, residualProcessCount: 0, residualPortCount: 0 });
  assert.ok(fixture.verification.guardedProcessCount >= 4);
  assert.equal(fixture.verification.missingKeyProbePassed, true);
  return fixture;
}

async function main() {
  if (process.env.AGENT_OR_NOT_SMOKE_PREFLIGHT_CHILD === "1") {
    const metricsDirectory = process.env.AGENT_OR_NOT_EGRESS_METRICS_DIR;
    assert.ok(metricsDirectory && path.isAbsolute(metricsDirectory));
    const fixture = await runFixtureAssertions(metricsDirectory);
    process.stdout.write(`${JSON.stringify({
      schemaVersion: "openrouter-smoke-preflight-v1",
      state: "passed",
      liveProviderCalls: 0,
      credentialReadsOutsideExistingAdapter: 0,
      nonLoopbackAttempts: 0,
      boundedSessionBudget: 2,
      fixtureSessions: fixture.report.sessionCount,
      fixtureModelCalls: fixture.report.modelBoundary.modelCallCount,
      receiptValidated: fixture.report.receiptValidated,
      cleanup: fixture.report.cleanup,
    })}\n`);
    return;
  }

  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "agent-or-not-openrouter-preflight-wrapper-"));
  try {
    const environment = providerFreeEnvironment({
      AGENT_OR_NOT_EGRESS_METRICS_DIR: scratch,
      AGENT_OR_NOT_EGRESS_METRICS_LABEL: "verify",
      AGENT_OR_NOT_SMOKE_PREFLIGHT_CHILD: "1",
      NODE_OPTIONS: `--require=${path.join(root, "scripts", "provider-free-egress-guard.cjs")}`,
      NODE_ENV: "test",
    });
    const result = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], {
      cwd: root,
      env: environment,
      encoding: "utf8",
      timeout: 300_000,
      windowsHide: true,
    });
    process.stdout.write(result.stdout ?? "");
    process.stderr.write(result.stderr ?? "");
    assert.equal(result.status, 0, "OpenRouter smoke preflight failed.");
    const metrics = fs.readdirSync(scratch)
      .filter((name) => name.endsWith(".json"))
      .map((name) => JSON.parse(fs.readFileSync(path.join(scratch, name), "utf8")));
    assert.ok(metrics.length >= 1, "OpenRouter smoke preflight produced no outer egress-guard evidence.");
    assert.ok(metrics.every((record) => record.attempted === 0 && record.blocked === 0));
    process.stdout.write(`${JSON.stringify({
      schemaVersion: "openrouter-smoke-preflight-wrapper-v1",
      state: "passed",
      guardedProcesses: metrics.length,
      liveProviderCalls: 0,
      credentialReadsOutsideExistingAdapter: 0,
      nonLoopbackAttempts: 0,
    })}\n`);
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

await main();
