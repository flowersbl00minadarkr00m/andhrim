import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertLiveEveEnvironmentNames,
  captureSharedDependencyIntegrity,
  parseSmokeInvocation,
  providerFreeEnvironment,
  reconcileBoundaryEvidence,
  reconcileSharedDependencyIntegrity,
  smokeReportSchema,
  terminateOwnedProcesses,
} from "./lib/openrouter-smoke-contract.mjs";
import {
  closeBrowserResourcesBounded,
  executeSmoke,
  preserveEarliestSafeFailure,
  spawnAllowlistedLiveEve,
} from "./openrouter-smoke.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function expectContractCode(operation, code) {
  assert.throws(operation, (error) => error?.code === code);
}

function sampleCalls() {
  return [
    {
      timestamp: "2026-08-30T10:00:00.000Z",
      modelId: "provider/model",
      callIndex: 1,
      classification: "eve-final-output-only-v1",
      toolDefinitionCount: 1,
      toolNames: ["final_output"],
      actionCapableToolDefinitionCount: 0,
    },
    {
      timestamp: "2026-08-30T10:00:01.000Z",
      modelId: "provider/model",
      callIndex: 2,
      classification: "eve-final-output-only-v1",
      toolDefinitionCount: 1,
      toolNames: ["final_output"],
      actionCapableToolDefinitionCount: 0,
    },
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
  expectContractCode(() => reconcileBoundaryEvidence([{ ...calls[0], toolNames: ["web_search"] }], "provider/model", 1, false), "MODEL_TOOL_ENVELOPE_INVALID");

  const validReport = {
    schemaVersion: "openrouter-owner-smoke-report-v2",
    state: "passed",
    timestamp: "2026-08-30T10:00:02.000Z",
    modelId: "provider/model",
    loopbackPorts: { web: 31_001, eve: 31_002 },
    receiptValidated: true,
    sessionCount: 1,
    blockedSessionRequests: 0,
    modelBoundary: {
      observed: true,
      modelCallCount: 1,
      toolDefinitionCount: 1,
      toolEnvelope: "eve-final-output-only-v1",
      calls: calls.slice(0, 1),
    },
    browserNonLoopbackRequests: 0,
    liveEveEnvironmentAllowlistVerified: true,
    cleanup: {
      scratchRemoved: true,
      residualProcessCount: 0,
      residualPortCount: 0,
      processInspectionComplete: true,
      processTreeProofComplete: true,
      sharedDependencyIntegrityVerified: true,
    },
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
  assert.equal(smokeReportSchema.safeParse({
    ...validReport,
    cleanup: { ...validReport.cleanup, processInspectionComplete: false },
  }).success, false);
  assert.equal(smokeReportSchema.safeParse({
    ...validReport,
    cleanup: { ...validReport.cleanup, sharedDependencyIntegrityVerified: false },
  }).success, false);

  const environment = providerFreeEnvironment();
  assert.equal(Object.keys(environment).some((name) => /(?:API_KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|AUTHORIZATION)/iu.test(name)), false);
  expectContractCode(() => providerFreeEnvironment({ OPENROUTER_API_KEY: "x" }), "LIVE_OPT_IN_INCOMPLETE");
  const harnessSource = fs.readFileSync(path.join(root, "scripts", "openrouter-smoke.mjs"), "utf8");
  assert.doesNotMatch(harnessSource, /process\.env\.OPENROUTER_API_KEY/u);
  assert.doesNotMatch(harnessSource, /function prepareLiveEveParentEnvironment/u);
  assert.match(harnessSource, /chromium\.launchServer/u);
  assert.match(harnessSource, /browserServer\.process\(\)/u);
  assert.doesNotMatch(harnessSource, /function runBuild[\s\S]*?spawnSync\(process\.execPath/u);
  const contractSource = fs.readFileSync(path.join(root, "scripts", "lib", "openrouter-smoke-contract.mjs"), "utf8");
  assert.match(contractSource, /spawnSync\("powershell"[\s\S]*?timeout: timeoutMs/u);
  assert.match(contractSource, /inspectionTimedOut/u);
  assert.match(contractSource, /openrouter-owner-smoke-report-v2/u);
  assert.match(contractSource, /Get-CimInstance -ClassName Win32_Process -Property ProcessId,ParentProcessId/u);
  assert.match(harnessSource, /if \(child\.exitCode !== null \|\| child\.signalCode !== null\)/u);
}

function assertEarliestFailureSurvivesCleanupFalsifier() {
  const primaryFailure = { class: "service", code: "SERVICE_START_FAILED" };
  const cleanupFailure = { class: "cleanup", code: "CLEANUP_FAILED" };
  const preservedFailure = preserveEarliestSafeFailure(primaryFailure, cleanupFailure);
  assert.deepEqual(preservedFailure, primaryFailure);
  const report = {
    schemaVersion: "openrouter-owner-smoke-report-v2",
    state: "failed",
    timestamp: "2026-08-30T10:00:02.000Z",
    modelId: "provider/model",
    loopbackPorts: { web: 31_001, eve: 31_002 },
    receiptValidated: false,
    sessionCount: 0,
    blockedSessionRequests: 0,
    modelBoundary: { observed: false, modelCallCount: 0, toolDefinitionCount: null, toolEnvelope: null, calls: [] },
    browserNonLoopbackRequests: 0,
    liveEveEnvironmentAllowlistVerified: true,
    cleanup: {
      scratchRemoved: true,
      residualProcessCount: 0,
      residualPortCount: 0,
      processInspectionComplete: false,
      processTreeProofComplete: false,
      sharedDependencyIntegrityVerified: true,
    },
    error: preservedFailure,
  };
  assert.equal(smokeReportSchema.parse(report).state, "failed");
  assert.equal(report.cleanup.processInspectionComplete, false);
}

async function waitForExit(child, timeoutMs = 15_000) {
  return await new Promise((resolve) => {
    let settled = false;
    const finish = (outcome) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(outcome);
    };
    const timer = setTimeout(() => finish({ code: null, timedOut: true }), timeoutMs);
    child.once("error", () => finish({ code: null, timedOut: false }));
    child.once("exit", (code) => finish({ code, timedOut: false }));
    if (child.exitCode !== null || child.signalCode !== null) {
      finish({ code: child.exitCode, timedOut: false });
    }
  });
}

async function assertLiveEnvironmentAllowlist() {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "agent-or-not-live-env-falsifier-"));
  try {
    const wrapperEvidencePath = path.join(scratch, "wrapper-names.json");
    const childEvidencePath = path.join(scratch, "child-names.json");
    const runtimeEnvironment = {
      AGENT_OR_NOT_DATA_DIR: path.join(scratch, "data"),
      AGENT_OR_NOT_PROVIDER_MODE: "openrouter",
      AGENT_OR_NOT_SESSION_NONCE: "fixture-session-nonce",
      AGENT_OR_NOT_SMOKE_EVIDENCE_PATH: path.join(scratch, "evidence.ndjson"),
      EVE_NEXT_PRODUCTION_PORT: "32101",
      NODE_ENV: "production",
      OPENROUTER_MODEL: "provider/model",
    };
    const unrelatedNames = [
      "DATABASE_URL",
      "SSH_AUTH_SOCK",
      "NPM_CONFIG_USERCONFIG",
      "ANTHROPIC_API_KEY",
      "AWS_ACCESS_KEY_ID",
      "GITHUB_TOKEN",
      "SAMPLE_CREDENTIAL",
    ];
    const testParentEnvironment = { ...providerFreeEnvironment(), OPENROUTER_API_KEY: "x" };
    for (const name of unrelatedNames) testParentEnvironment[name] = "x";
    const probe = `require("node:fs").writeFileSync(${JSON.stringify(childEvidencePath)}, JSON.stringify(Object.keys(process.env).sort()), { encoding: "utf8", flag: "wx" })`;
    const wrapper = spawnAllowlistedLiveEve({
      executable: process.execPath,
      args: ["-e", probe],
      cwd: scratch,
      wrapperEnvironmentEvidencePath: wrapperEvidencePath,
      runtimeEnvironment,
    }, testParentEnvironment);
    const outcome = await waitForExit(wrapper);
    const wrapperCleanup = await terminateOwnedProcesses([wrapper]);
    assert.deepEqual(outcome, { code: 0, timedOut: false });
    assert.equal(wrapperCleanup.processTreeProofComplete, true);
    const wrapperNames = JSON.parse(fs.readFileSync(wrapperEvidencePath, "utf8"));
    const childNames = JSON.parse(fs.readFileSync(childEvidencePath, "utf8"));
    assert.deepEqual(childNames, wrapperNames);
    assert.deepEqual(assertLiveEveEnvironmentNames(childNames), childNames);
    assert.ok(unrelatedNames.every((name) => !childNames.includes(name)));
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

function assertDependencyIntegrityFalsifiers() {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "agent-or-not-dependency-integrity-falsifier-"));
  try {
    const target = path.join(scratch, "fake-shared-target");
    fs.mkdirSync(path.join(target, "nested"), { recursive: true });
    fs.writeFileSync(path.join(target, "one.txt"), "one\n");
    fs.writeFileSync(path.join(target, "nested", "two.txt"), "two\n");
    const roots = [{ label: "fake-package", target }];
    const before = captureSharedDependencyIntegrity(roots);
    assert.equal(reconcileSharedDependencyIntegrity(before, captureSharedDependencyIntegrity(roots)).verified, true);
    fs.writeFileSync(path.join(target, "nested", "two.txt"), "changed\n");
    expectContractCode(
      () => reconcileSharedDependencyIntegrity(before, captureSharedDependencyIntegrity(roots)),
      "DEPENDENCY_INTEGRITY_CHANGED",
    );
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

async function assertBoundedBrowserCloseFalsifier() {
  const calls = [];
  const neverReturns = (name) => ({
    close() {
      calls.push(name);
      return new Promise(() => {});
    },
  });
  const startedAt = Date.now();
  const result = await closeBrowserResourcesBounded(
    neverReturns("browser"),
    neverReturns("browser-server"),
    25,
  );
  assert.deepEqual(calls, ["browser", "browser-server"]);
  assert.equal(result.browserCloseStatus, "timed-out");
  assert.equal(result.browserServerCloseStatus, "timed-out");
  assert.equal(result.complete, false);
  assert.ok(Date.now() - startedAt < 1_000);
}

async function assertCleanupFalsifiers() {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "agent-or-not-cleanup-falsifier-"));
  const spawnedRoots = [];
  let grandchildPid = null;
  try {
    const grandchildPidPath = path.join(scratch, "grandchild.pid");
    const treeRoot = spawn(process.execPath, ["-e", `
      const { spawn } = require("node:child_process");
      const fs = require("node:fs");
      const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore", windowsHide: true });
      fs.writeFileSync(${JSON.stringify(grandchildPidPath)}, String(child.pid));
      setInterval(() => {}, 1000);
    `], { env: providerFreeEnvironment(), stdio: "ignore", windowsHide: true });
    spawnedRoots.push(treeRoot);
    const deadline = Date.now() + 10_000;
    while (!fs.existsSync(grandchildPidPath) && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert.equal(fs.existsSync(grandchildPidPath), true);
    grandchildPid = Number(fs.readFileSync(grandchildPidPath, "utf8"));
    assert.equal(Number.isInteger(grandchildPid), true);
    const treeCleanup = await terminateOwnedProcesses([treeRoot], {
      graceMs: 500,
      inspectDescendants: () => [grandchildPid],
    });
    assert.equal(treeCleanup.inspectionComplete, true);
    assert.equal(treeCleanup.processTreeProofComplete, true);
    assert.ok(treeCleanup.trackedProcessCount >= 2);
    assert.deepEqual(treeCleanup.residualProcessIds, []);

    const inspectionFailureRoot = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
      env: providerFreeEnvironment(),
      stdio: "ignore",
      windowsHide: true,
    });
    spawnedRoots.push(inspectionFailureRoot);
    const killSignals = [];
    const signalRoot = inspectionFailureRoot.kill.bind(inspectionFailureRoot);
    inspectionFailureRoot.kill = (signal) => {
      killSignals.push(signal);
      return signalRoot(signal);
    };
    let inspectionPasses = 0;
    const incompleteCleanup = await terminateOwnedProcesses([inspectionFailureRoot], {
      graceMs: 500,
      inspectionTimeoutMs: 25,
      inspectDescendants: () => {
        inspectionPasses += 1;
        return inspectionPasses === 1 ? new Promise(() => {}) : [];
      },
    });
    assert.equal(inspectionPasses, 3);
    assert.ok(killSignals.includes("SIGTERM"));
    assert.equal(incompleteCleanup.inspectionComplete, false);
    assert.equal(incompleteCleanup.inspectionTimedOut, true);
    assert.equal(incompleteCleanup.processTreeProofComplete, false);
    assert.deepEqual(incompleteCleanup.residualProcessIds, []);

    const residualProofRoot = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
      env: providerFreeEnvironment(),
      stdio: "ignore",
      windowsHide: true,
    });
    spawnedRoots.push(residualProofRoot);
    const residualCleanup = await terminateOwnedProcesses([residualProofRoot], {
      graceMs: 500,
      inspectDescendants: () => [],
      isProcessAlive: () => true,
    });
    assert.equal(residualCleanup.inspectionComplete, true);
    assert.equal(residualCleanup.processTreeProofComplete, false);
    assert.deepEqual(residualCleanup.residualProcessIds, [residualProofRoot.pid]);
  } finally {
    await terminateOwnedProcesses(spawnedRoots, {
      graceMs: 500,
      inspectDescendants: () => (Number.isInteger(grandchildPid) ? [grandchildPid] : []),
    });
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

async function runFixtureAssertions(metricsDirectory) {
  assertInvocationAndReportContracts();
  assertEarliestFailureSurvivesCleanupFalsifier();
  await assertLiveEnvironmentAllowlist();
  assertDependencyIntegrityFalsifiers();
  await assertBoundedBrowserCloseFalsifier();
  await assertCleanupFalsifiers();

  const cleanupChild = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
    env: providerFreeEnvironment(),
    stdio: "ignore",
    windowsHide: true,
  });
  assert.ok(cleanupChild.pid);
  const cleanup = await terminateOwnedProcesses([cleanupChild]);
  assert.equal(cleanup.processTreeProofComplete, true);
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
  assert.deepEqual(fixture.report.modelBoundary.calls.map((call) => [call.callIndex, call.toolDefinitionCount]), [[1, 1], [2, 1]]);
  assert.equal(fixture.report.browserNonLoopbackRequests, 0);
  assert.deepEqual(fixture.report.cleanup, {
    scratchRemoved: true,
    residualProcessCount: 0,
    residualPortCount: 0,
    processInspectionComplete: true,
    processTreeProofComplete: true,
    sharedDependencyIntegrityVerified: true,
  });
  assert.equal(fixture.report.liveEveEnvironmentAllowlistVerified, null);
  assert.ok(fixture.verification.guardedProcessCount >= 4);
  assert.equal(fixture.verification.missingKeyProbePassed, true);
  assert.equal(fixture.verification.sharedDependencyIntegrity.verified, true);
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
      sharedDependencyIntegrity: {
        algorithm: fixture.verification.sharedDependencyIntegrity.algorithm,
        fileCount: fixture.verification.sharedDependencyIntegrity.fileCount,
        totalBytes: fixture.verification.sharedDependencyIntegrity.totalBytes,
        digest: fixture.verification.sharedDependencyIntegrity.digest,
        beforeAfterDigestMatch: true,
      },
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
    const child = spawn(process.execPath, [fileURLToPath(import.meta.url)], {
      cwd: root,
      env: environment,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (value) => { stdout += value; });
    child.stderr.on("data", (value) => { stderr += value; });
    const outcome = await waitForExit(child, 900_000);
    const childCleanup = await terminateOwnedProcesses([child]);
    process.stdout.write(stdout);
    process.stderr.write(stderr);
    assert.equal(outcome.timedOut, false, "OpenRouter smoke preflight timed out.");
    assert.equal(outcome.code, 0, "OpenRouter smoke preflight failed.");
    assert.equal(childCleanup.processTreeProofComplete, true, "OpenRouter smoke preflight child cleanup was incomplete.");
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
