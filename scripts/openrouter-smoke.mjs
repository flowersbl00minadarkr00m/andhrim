import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertLiveEveEnvironmentNames,
  captureSharedDependencyIntegrity,
  liveEveInheritedEnvironmentNames,
  liveEveRuntimeEnvironmentNames,
  SmokeContractError,
  parseSmokeInvocation,
  providerFreeEnvironment,
  readSmokeModelCalls,
  reconcileBoundaryEvidence,
  reconcileSharedDependencyIntegrity,
  reserveLoopbackPort,
  residualLoopbackPorts,
  settleOperationWithin,
  SMOKE_SESSION_BUDGET,
  terminateOwnedProcesses,
  writeSmokeReport,
} from "./lib/openrouter-smoke-contract.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const guardPath = path.join(root, "scripts", "provider-free-egress-guard.cjs");
export const BROWSER_CLOSE_TIMEOUT_MS = 5_000;

function safeError(error, fallbackClass = "internal", fallbackCode = "INTERNAL_ERROR") {
  if (error instanceof SmokeContractError) return { class: error.errorClass, code: error.code };
  return { class: fallbackClass, code: fallbackCode };
}

async function runProviderFreePreflight() {
  const child = spawn(process.execPath, [path.join(root, "scripts", "verify-openrouter-smoke.mjs")], {
    cwd: root,
    env: providerFreeEnvironment(),
    stdio: "inherit",
    windowsHide: true,
  });
  const outcome = await waitForChildExit(child, 900_000);
  const cleanup = await terminateOwnedProcesses([child]);
  process.exitCode = !outcome.timedOut && outcome.code === 0 && cleanup.processTreeProofComplete ? 0 : 1;
}

function guardedEnvironment(label, overrides = {}) {
  return providerFreeEnvironment({
    NODE_OPTIONS: `--require=${guardPath}`,
    AGENT_OR_NOT_EGRESS_METRICS_LABEL: label,
    ...overrides,
  });
}

function waitForChildExit(child, timeoutMs) {
  return new Promise((resolve) => {
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
  });
}

async function runBuild(executable, args, environment, runtimeRoot, children) {
  const child = spawn(process.execPath, [executable, ...args], {
    cwd: runtimeRoot,
    env: environment,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  children.push(child);
  let output = "";
  const retainDiagnostic = (value) => { output = `${output}${value}`.slice(-64 * 1024); };
  child.stdout.on("data", retainDiagnostic);
  child.stderr.on("data", retainDiagnostic);
  const outcome = await waitForChildExit(child, 180_000);
  if (outcome.timedOut || outcome.code !== 0) {
    process.stderr.write(`[openrouter-smoke build diagnostic]\n${output}\n`);
    throw new SmokeContractError("build", "BUILD_FAILED");
  }
}

function createScratchWorkspace(scratch) {
  const runtimeRoot = path.join(scratch, "workspace");
  const excludedRoots = new Set([".git", ".next", ".output", ".eve", ".playwright", "data", "logs", "node_modules", "output"]);
  fs.cpSync(root, runtimeRoot, {
    recursive: true,
    filter(source) {
      const relative = path.relative(root, source);
      if (!relative) return true;
      const first = relative.split(path.sep)[0];
      if (excludedRoots.has(first)) return false;
      return first === ".env.example" || !first.startsWith(".env");
    },
  });

  const dependencySource = fs.realpathSync(path.join(root, "node_modules"));
  const dependencyOverlay = path.join(runtimeRoot, "node_modules");
  const privateDependencyCaches = new Set([".cache", ".nitro", ".vite"]);
  const sharedDependencyRoots = [];
  fs.mkdirSync(dependencyOverlay);
  for (const entry of fs.readdirSync(dependencySource, { withFileTypes: true })) {
    if (privateDependencyCaches.has(entry.name)) continue;
    const source = path.join(dependencySource, entry.name);
    if (!fs.statSync(source).isDirectory()) continue;
    const destination = path.join(dependencyOverlay, entry.name);
    if (entry.name.startsWith("@") && !entry.isSymbolicLink()) {
      fs.mkdirSync(destination);
      for (const scopedEntry of fs.readdirSync(source, { withFileTypes: true })) {
        const scopedSource = path.join(source, scopedEntry.name);
        if (!fs.statSync(scopedSource).isDirectory()) continue;
        const target = fs.realpathSync(scopedSource);
        fs.symlinkSync(target, path.join(destination, scopedEntry.name), "junction");
        sharedDependencyRoots.push({ label: `${entry.name}/${scopedEntry.name}`, target });
      }
      continue;
    }
    const target = fs.realpathSync(source);
    fs.symlinkSync(target, destination, "junction");
    sharedDependencyRoots.push({ label: entry.name, target });
  }
  for (const name of privateDependencyCaches) fs.mkdirSync(path.join(dependencyOverlay, name));
  return { runtimeRoot, sharedDependencyRoots };
}

async function waitForLoopback(url, children, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    const exitedChild = children.find((child) => child.exitCode !== null || child.signalCode !== null);
    if (exitedChild) {
      if (exitedChild.smokeStartupDiagnostic) {
        process.stderr.write(`[openrouter-smoke ${exitedChild.smokeLabel ?? "service"} startup diagnostic]\n${exitedChild.smokeStartupDiagnostic}\n`);
      }
      throw new SmokeContractError("service", "SERVICE_START_FAILED");
    }
    try {
      const response = await fetch(url, { redirect: "error" });
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new SmokeContractError("service", "SERVICE_START_FAILED");
}

function captureStartupDiagnostic(child, label) {
  child.smokeLabel = label;
  child.smokeStartupDiagnostic = "";
  const retain = (value) => {
    child.smokeStartupDiagnostic = `${child.smokeStartupDiagnostic}${value}`.slice(-64 * 1024);
  };
  child.stdout?.on("data", retain);
  child.stderr?.on("data", retain);
  child.smokeDiagnosticListener = retain;
  return child;
}

function stopStartupDiagnostic(child) {
  if (!child?.smokeDiagnosticListener) return;
  child.stdout?.off("data", child.smokeDiagnosticListener);
  child.stderr?.off("data", child.smokeDiagnosticListener);
  child.smokeDiagnosticListener = null;
  child.smokeStartupDiagnostic = "";
}

export async function closeBrowserResourcesBounded(browser, browserServer, timeoutMs = BROWSER_CLOSE_TIMEOUT_MS) {
  const closeOne = async (resource) => (
    resource
      ? await settleOperationWithin(() => resource.close(), timeoutMs)
      : { status: "not-applicable" }
  );
  const browserResult = await closeOne(browser);
  const browserServerResult = await closeOne(browserServer);
  const successful = new Set(["fulfilled", "not-applicable"]);
  return {
    browserCloseStatus: browserResult.status,
    browserServerCloseStatus: browserServerResult.status,
    complete: successful.has(browserResult.status) && successful.has(browserServerResult.status),
  };
}

const liveEveWrapperSource = String.raw`
const { spawn } = require("node:child_process");
const fs = require("node:fs");
let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { input += chunk; });
process.stdin.on("end", () => {
  try {
    const config = JSON.parse(input);
    const inherited = new Set(config.inheritedNames);
    const runtimeNames = new Set(Object.keys(config.runtimeEnvironment));
    const allowed = new Set([...inherited, ...runtimeNames]);
    for (const name of Object.keys(process.env)) {
      if (!inherited.has(name)) delete process.env[name];
    }
    for (const [name, value] of Object.entries(config.runtimeEnvironment)) {
      if (name === "OPENROUTER_API_KEY" || !runtimeNames.has(name)) process.exit(78);
      process.env[name] = value;
    }
    const names = Object.keys(process.env).sort();
    if (!Object.prototype.hasOwnProperty.call(process.env, "OPENROUTER_API_KEY")
      || names.some((name) => !allowed.has(name))
      || [...runtimeNames].some((name) => !names.includes(name))) process.exit(78);
    fs.writeFileSync(config.wrapperEnvironmentEvidencePath, JSON.stringify(names), { encoding: "utf8", flag: "wx" });
    const child = spawn(config.executable, config.args, {
      cwd: config.cwd,
      stdio: config.childStdio,
      windowsHide: true,
    });
    const forward = (signal) => { try { child.kill(signal); } catch {} };
    process.on("SIGTERM", () => forward("SIGTERM"));
    process.on("SIGINT", () => forward("SIGINT"));
    child.once("error", () => { process.exitCode = 1; });
    child.once("exit", (code) => { process.exitCode = code ?? 1; });
  } catch {
    process.exitCode = 78;
  }
});
`;

export function spawnAllowlistedLiveEve(config, parentEnvironmentForTest) {
  const runtimeNames = Object.keys(config.runtimeEnvironment);
  if (runtimeNames.length !== liveEveRuntimeEnvironmentNames.length
    || runtimeNames.some((name) => !liveEveRuntimeEnvironmentNames.includes(name))
    || runtimeNames.includes("OPENROUTER_API_KEY")) {
    throw new SmokeContractError("configuration", "LIVE_OPT_IN_INCOMPLETE");
  }
  const wrapper = spawn(process.execPath, ["-e", liveEveWrapperSource], {
    cwd: config.cwd,
    ...(parentEnvironmentForTest === undefined ? {} : { env: parentEnvironmentForTest }),
    stdio: ["pipe", "ignore", "ignore"],
    windowsHide: true,
  });
  wrapper.stdin.on("error", () => {});
  wrapper.stdin.end(JSON.stringify({
    inheritedNames: liveEveInheritedEnvironmentNames,
    runtimeEnvironment: config.runtimeEnvironment,
    wrapperEnvironmentEvidencePath: config.wrapperEnvironmentEvidencePath,
    executable: config.executable,
    args: config.args,
    cwd: config.cwd,
    childStdio: config.childStdio ?? "ignore",
  }));
  return wrapper;
}

function failedConfigurationReport(error) {
  return {
    schemaVersion: "openrouter-owner-smoke-report-v1",
    state: "failed",
    timestamp: new Date().toISOString(),
    modelId: null,
    loopbackPorts: null,
    receiptValidated: false,
    sessionCount: 0,
    blockedSessionRequests: 0,
    modelBoundary: { observed: false, modelCallCount: 0, toolDefinitionCount: null, calls: [] },
    browserNonLoopbackRequests: 0,
    liveEveEnvironmentAllowlistVerified: null,
    cleanup: {
      scratchRemoved: true,
      residualProcessCount: 0,
      residualPortCount: 0,
      processInspectionComplete: true,
      sharedDependencyIntegrityVerified: true,
    },
    error: safeError(error, "configuration", "LIVE_OPT_IN_INCOMPLETE"),
  };
}

export async function executeSmoke({
  mode,
  modelId,
  fixtureScenario = "invalid-first-receipt",
  retainReport = false,
  verifyMissingKey = false,
}) {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "agent-or-not-openrouter-smoke-"));
  const dataDirectory = path.join(scratch, "data");
  const evidenceDirectory = path.join(scratch, "evidence");
  const metricsDirectory = path.join(scratch, "egress");
  const evidencePath = path.join(evidenceDirectory, "model-boundary.ndjson");
  fs.mkdirSync(dataDirectory);
  fs.mkdirSync(evidenceDirectory);
  fs.mkdirSync(metricsDirectory);

  const sessionNonce = randomBytes(32).toString("base64url");
  let browser;
  let browserServer;
  const children = [];
  let ports = null;
  let receiptValidated = false;
  let sessionCount = 0;
  let blockedSessionRequests = 0;
  let browserNonLoopbackRequests = 0;
  let failure = null;
  let calls = [];
  let guardedProcessCount = 0;
  let missingKeyProbePassed = false;
  let liveEveEnvironmentAllowlistVerified = null;
  let dependencyIntegrityBaseline = null;
  let dependencyIntegrityResult = null;
  let sharedDependencyRoots = [];
  const cleanupPorts = [];
  const cleanup = {
    scratchRemoved: false,
    residualProcessCount: 0,
    residualPortCount: 0,
    processInspectionComplete: true,
    sharedDependencyIntegrityVerified: true,
  };

  try {
    const webPort = await reserveLoopbackPort();
    const evePort = await reserveLoopbackPort();
    if (webPort === evePort) throw new SmokeContractError("service", "SERVICE_START_FAILED");
    ports = { web: webPort, eve: evePort };
    cleanupPorts.push(webPort, evePort);
    cleanup.sharedDependencyIntegrityVerified = false;
    const workspace = createScratchWorkspace(scratch);
    const { runtimeRoot } = workspace;
    sharedDependencyRoots = workspace.sharedDependencyRoots;
    dependencyIntegrityBaseline = captureSharedDependencyIntegrity(sharedDependencyRoots);

    const commonEnvironment = {
      AGENT_OR_NOT_DATA_DIR: dataDirectory,
      AGENT_OR_NOT_SESSION_NONCE: sessionNonce,
      EVE_NEXT_PRODUCTION_PORT: String(evePort),
      NEXT_TELEMETRY_DISABLED: "1",
      NODE_ENV: "production",
      PORT: String(webPort),
    };
    const buildEnvironment = guardedEnvironment("build", {
      ...commonEnvironment,
      AGENT_OR_NOT_EGRESS_METRICS_DIR: metricsDirectory,
      AGENT_OR_NOT_PROVIDER_MODE: "fixture",
    });
    const eveBin = path.join(runtimeRoot, "node_modules", "eve", "bin", "eve.js");
    const nextBin = path.join(runtimeRoot, "node_modules", "next", "dist", "bin", "next");
    await runBuild(eveBin, ["build"], buildEnvironment, runtimeRoot, children);
    await runBuild(nextBin, ["build", "--webpack"], buildEnvironment, runtimeRoot, children);

    let eveServer;
    if (mode === "fixture") {
      const eveEnvironment = guardedEnvironment("start", {
        ...commonEnvironment,
        AGENT_OR_NOT_EGRESS_METRICS_DIR: metricsDirectory,
        AGENT_OR_NOT_PROVIDER_MODE: "fixture",
        AGENT_OR_NOT_FIXTURE_SCENARIO: fixtureScenario,
        AGENT_OR_NOT_SMOKE_EVIDENCE_PATH: evidencePath,
      });
      eveServer = captureStartupDiagnostic(spawn(process.execPath, [eveBin, "start", "--host", "127.0.0.1", "--port", String(evePort)], {
        cwd: runtimeRoot,
        env: eveEnvironment,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      }), "fixture-eve");
    } else {
      const liveEnvironmentEvidencePath = path.join(evidenceDirectory, "live-eve-environment-names.json");
      eveServer = spawnAllowlistedLiveEve({
        executable: process.execPath,
        args: [eveBin, "start", "--host", "127.0.0.1", "--port", String(evePort)],
        cwd: runtimeRoot,
        wrapperEnvironmentEvidencePath: liveEnvironmentEvidencePath,
        childStdio: "ignore",
        runtimeEnvironment: {
          AGENT_OR_NOT_DATA_DIR: dataDirectory,
          AGENT_OR_NOT_PROVIDER_MODE: "openrouter",
          AGENT_OR_NOT_SESSION_NONCE: sessionNonce,
          AGENT_OR_NOT_SMOKE_EVIDENCE_PATH: evidencePath,
          EVE_NEXT_PRODUCTION_PORT: String(evePort),
          NODE_ENV: "production",
          OPENROUTER_MODEL: modelId,
        },
      });
      eveServer.smokeEnvironmentEvidencePath = liveEnvironmentEvidencePath;
    }

    const nextEnvironment = guardedEnvironment("start", {
      ...commonEnvironment,
      AGENT_OR_NOT_EGRESS_METRICS_DIR: metricsDirectory,
      AGENT_OR_NOT_PROVIDER_MODE: mode === "live" ? "openrouter" : "fixture",
      ...(mode === "live" ? { OPENROUTER_MODEL: modelId } : {}),
    });
    const nextServer = captureStartupDiagnostic(spawn(process.execPath, [nextBin, "start", "--hostname", "127.0.0.1", "--port", String(webPort)], {
      cwd: runtimeRoot,
      env: nextEnvironment,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    }), "next");
    children.push(eveServer, nextServer);
    const serviceChildren = [eveServer, nextServer];
    await waitForLoopback(`http://127.0.0.1:${evePort}/eve/v1/health`, serviceChildren);
    stopStartupDiagnostic(eveServer);
    await waitForLoopback(`http://127.0.0.1:${webPort}`, serviceChildren);
    stopStartupDiagnostic(nextServer);
    if (mode === "live") {
      const observedEnvironmentNames = JSON.parse(fs.readFileSync(eveServer.smokeEnvironmentEvidencePath, "utf8"));
      assertLiveEveEnvironmentNames(observedEnvironmentNames);
      liveEveEnvironmentAllowlistVerified = true;
    }

    const { chromium } = await import("@playwright/test");
    browserServer = await chromium.launchServer({ headless: true, env: providerFreeEnvironment() });
    const browserProcess = browserServer.process();
    if (!browserProcess?.pid) throw new SmokeContractError("browser", "BROWSER_FAILED");
    children.push(browserProcess);
    const browserEndpoint = new URL(browserServer.wsEndpoint());
    if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(browserEndpoint.hostname)) {
      throw new SmokeContractError("browser", "BROWSER_FAILED");
    }
    const browserPort = Number(browserEndpoint.port);
    if (!Number.isInteger(browserPort) || browserPort < 1 || browserPort > 65_535) {
      throw new SmokeContractError("browser", "BROWSER_FAILED");
    }
    const browserHost = browserEndpoint.hostname === "[::1]" ? "::1" : browserEndpoint.hostname;
    cleanupPorts.push({ host: browserHost, port: browserPort });
    browser = await chromium.connect(browserEndpoint.href);
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: "light" });
    const baseUrl = `http://127.0.0.1:${webPort}`;
    await context.route("**/*", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const loopback = ["127.0.0.1", "localhost", "::1"].includes(url.hostname);
      if (!["data:", "blob:", "about:"].includes(url.protocol) && !loopback) {
        browserNonLoopbackRequests += 1;
        await route.abort("blockedbyclient");
        return;
      }
      if (mode === "live" && request.method() === "GET" && url.href === `${baseUrl}/api/runtime`) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          headers: { "cache-control": "no-store" },
          body: JSON.stringify({
            providerMode: "openrouter",
            modelId,
            configured: true,
            sessionNonce,
            privacyDisclosure: `OpenRouter mode: the representative assessment is sent through OpenRouter to ${modelId}.`,
          }),
        });
        return;
      }
      const isSessionRequest = request.method() === "POST"
        && url.origin === baseUrl
        && url.pathname === "/eve/v1/session"
        && request.headers()["x-agent-or-not-session"] === sessionNonce;
      if (isSessionRequest) {
        if (sessionCount >= SMOKE_SESSION_BUDGET) {
          blockedSessionRequests += 1;
          await route.abort("blockedbyclient");
          return;
        }
        sessionCount += 1;
      }
      await route.continue();
    });

    const page = await context.newPage();
    await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 60_000 });
    await page.getByRole("heading", { name: "Delegation assessment" }).waitFor({ timeout: 30_000 });
    for (let index = 0; index < 4; index += 1) {
      await page.getByRole("button", { name: /Continue/u }).click();
    }
    await page.getByRole("button", { name: /Generate receipt/u }).click();
    try {
      await page.getByText("Validated local result", { exact: true }).waitFor({ timeout: mode === "live" ? 240_000 : 60_000 });
      receiptValidated = true;
    } catch {
      if (blockedSessionRequests > 0) throw new SmokeContractError("evidence", "ATTEMPT_BUDGET_EXCEEDED");
      throw new SmokeContractError("validation", "RECEIPT_NOT_OBSERVED");
    }
    if (browserNonLoopbackRequests !== 0) throw new SmokeContractError("browser", "BROWSER_FAILED");
    if (blockedSessionRequests !== 0) throw new SmokeContractError("evidence", "ATTEMPT_BUDGET_EXCEEDED");
    if (mode === "fixture" && verifyMissingKey) {
      const keyProbePort = await reserveLoopbackPort();
      cleanupPorts.push(keyProbePort);
      const keyProbe = spawn(process.execPath, [eveBin, "start", "--host", "127.0.0.1", "--port", String(keyProbePort)], {
        cwd: runtimeRoot,
        env: guardedEnvironment("verify", {
          ...commonEnvironment,
          AGENT_OR_NOT_EGRESS_METRICS_DIR: metricsDirectory,
          AGENT_OR_NOT_PROVIDER_MODE: "openrouter",
          AGENT_OR_NOT_SESSION_NONCE: sessionNonce,
          EVE_NEXT_PRODUCTION_PORT: String(keyProbePort),
          OPENROUTER_MODEL: "provider/model",
        }),
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      });
      children.push(keyProbe);
      let keyProbeOutput = "";
      keyProbe.stdout.on("data", (value) => { keyProbeOutput = `${keyProbeOutput}${value}`.slice(-32 * 1024); });
      keyProbe.stderr.on("data", (value) => { keyProbeOutput = `${keyProbeOutput}${value}`.slice(-32 * 1024); });
      const keyProbeExit = await waitForChildExit(keyProbe, 30_000);
      if (keyProbeExit.timedOut
        || keyProbeExit.code === 0
        || !/OPENROUTER_API_KEY is required in openrouter mode/u.test(keyProbeOutput)) {
        throw new SmokeContractError("configuration", "LIVE_OPT_IN_INCOMPLETE");
      }
      missingKeyProbePassed = true;
    }
  } catch (error) {
    failure = safeError(error);
  } finally {
    const browserCloseResult = await closeBrowserResourcesBounded(browser, browserServer);
    if (!browserCloseResult.complete) failure ??= { class: "cleanup", code: "CLEANUP_FAILED" };
    try {
      const result = await terminateOwnedProcesses(children);
      cleanup.residualProcessCount = result.residualProcessIds.length;
      cleanup.processInspectionComplete = result.inspectionComplete;
      if (!result.processTreeProofComplete) failure = { class: "cleanup", code: "CLEANUP_FAILED" };
    } catch {
      failure = { class: "cleanup", code: "CLEANUP_FAILED" };
      cleanup.residualProcessCount = 1;
      cleanup.processInspectionComplete = false;
    }
    try {
      calls = readSmokeModelCalls(evidencePath);
    } catch {
      failure ??= { class: "evidence", code: "EVIDENCE_INVALID" };
      calls = [];
    }
    try {
      const metrics = fs.readdirSync(metricsDirectory)
        .filter((name) => name.endsWith(".json"))
        .map((name) => JSON.parse(fs.readFileSync(path.join(metricsDirectory, name), "utf8")));
      guardedProcessCount = metrics.length;
      if (metrics.length === 0 || metrics.some((record) => record.attempted !== 0 || record.blocked !== 0)) {
        failure ??= { class: "evidence", code: "EVIDENCE_INVALID" };
      }
    } catch {
      failure ??= { class: "evidence", code: "EVIDENCE_INVALID" };
    }
    if (dependencyIntegrityBaseline) {
      try {
        const after = captureSharedDependencyIntegrity(sharedDependencyRoots);
        dependencyIntegrityResult = reconcileSharedDependencyIntegrity(dependencyIntegrityBaseline, after);
        cleanup.sharedDependencyIntegrityVerified = true;
      } catch {
        cleanup.sharedDependencyIntegrityVerified = false;
        failure = { class: "cleanup", code: "DEPENDENCY_INTEGRITY_CHANGED" };
      }
    }
    try {
      fs.rmSync(scratch, { recursive: true, force: true });
      cleanup.scratchRemoved = !fs.existsSync(scratch);
    } catch {
      failure = { class: "cleanup", code: "CLEANUP_FAILED" };
    }
    if (cleanupPorts.length > 0) {
      const residualPorts = await residualLoopbackPorts(cleanupPorts);
      cleanup.residualPortCount = residualPorts.length;
      if (residualPorts.length > 0) failure = { class: "cleanup", code: "CLEANUP_FAILED" };
    }
  }

  let modelBoundary;
  try {
    modelBoundary = reconcileBoundaryEvidence(calls, modelId, sessionCount, receiptValidated);
  } catch (error) {
    failure = safeError(error, "evidence", "EVIDENCE_INVALID");
    modelBoundary = { observed: false, modelCallCount: 0, toolDefinitionCount: null, calls: [] };
  }
  if (!cleanup.scratchRemoved
    || cleanup.residualProcessCount !== 0
    || cleanup.residualPortCount !== 0
    || !cleanup.processInspectionComplete
    || !cleanup.sharedDependencyIntegrityVerified) {
    failure ??= { class: "cleanup", code: "CLEANUP_FAILED" };
  }

  const report = {
    schemaVersion: "openrouter-owner-smoke-report-v1",
    state: receiptValidated && failure === null ? "passed" : "failed",
    timestamp: new Date().toISOString(),
    modelId,
    loopbackPorts: ports,
    receiptValidated,
    sessionCount,
    blockedSessionRequests,
    modelBoundary,
    browserNonLoopbackRequests,
    liveEveEnvironmentAllowlistVerified,
    cleanup,
    error: receiptValidated && failure === null ? null : (failure ?? { class: "internal", code: "INTERNAL_ERROR" }),
  };
  let reportPath = null;
  if (retainReport) reportPath = writeSmokeReport(root, report);
  return {
    report,
    reportPath,
    verification: {
      guardedProcessCount,
      missingKeyProbePassed,
      sharedDependencyIntegrity: dependencyIntegrityResult,
    },
  };
}

async function main() {
  let invocation;
  try {
    invocation = parseSmokeInvocation(process.argv.slice(2));
  } catch (error) {
    const report = failedConfigurationReport(error);
    const reportPath = writeSmokeReport(root, report);
    process.stdout.write(`${JSON.stringify({ state: report.state, report: path.relative(root, reportPath), error: report.error })}\n`);
    process.exitCode = 1;
    return;
  }
  if (invocation.kind === "preflight") {
    await runProviderFreePreflight();
    return;
  }
  const result = await executeSmoke({ mode: "live", modelId: invocation.modelId, retainReport: true });
  process.stdout.write(`${JSON.stringify({
    state: result.report.state,
    report: path.relative(root, result.reportPath),
    error: result.report.error,
    cleanup: result.report.cleanup,
  })}\n`);
  if (result.report.state !== "passed") process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
