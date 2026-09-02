import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import http from "node:http";
import { createRequire } from "node:module";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "agent-or-not-browser-"));
const metricsDirectory = path.join(scratch, "metrics");
const dataDirectory = path.join(scratch, "data");
const artifactDirectory = path.join(root, ".playwright");
const fixtureEvidencePath = path.join(scratch, "browser-model-call.ndjson");
const sessionNonce = randomBytes(32).toString("base64url");
const learningTransitionDelayMs = 31_000;
const semanticReceiptDeadlineMs = 120_000;
fs.mkdirSync(metricsDirectory);
fs.mkdirSync(artifactDirectory, { recursive: true });

process.env.AGENT_OR_NOT_EGRESS_METRICS_DIR = metricsDirectory;
process.env.AGENT_OR_NOT_EGRESS_METRICS_LABEL = "verify";
createRequire(import.meta.url)(path.join(root, "scripts", "provider-free-egress-guard.cjs"));

async function reserveLoopbackPort() {
  return await new Promise((resolve, reject) => {
  const server = net.createServer();
  server.once("error", reject);
  server.listen(0, "127.0.0.1", () => {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    server.close(() => resolve(address.port));
  });
  });
}

async function waitForAppliedLearningReceipt(page, baseUrl, {
  existingReceiptIds,
  expectedCandidateId,
  expectedRule,
}) {
  const startedAt = Date.now();
  const deadline = startedAt + semanticReceiptDeadlineMs;
  let polls = 0;
  let lastStateSummary = "state not read";
  while (Date.now() <= deadline) {
    polls += 1;
    const response = await page.request.get(`${baseUrl}/api/state`);
    if (response.ok()) {
      const state = await response.json();
      const newReceipts = Object.values(state.projection.receipts)
        .filter((receipt) => !existingReceiptIds.has(receipt.receiptId));
      lastStateSummary = JSON.stringify({
        receiptIds: Object.keys(state.projection.receipts),
        assessmentIds: Object.keys(state.projection.assessments),
        candidateStatus: state.projection.candidates[expectedCandidateId]?.status,
        ruleActive: state.projection.rules[expectedRule.ruleId]?.active,
      });
      if (newReceipts.length > 0) {
        assert.equal(newReceipts.length, 1, "The learning transition must persist exactly one new receipt.");
        const receipt = newReceipts[0];
        const assessment = state.projection.assessments[receipt.assessmentId];
        assert.ok(assessment, "The applied-rule receipt must retain its source assessment.");
        assert.equal(assessment.answers.specificationClarity, 2, "The rapid answer transition persisted stale assessment state.");
        assert.equal(receipt.recommendation, "human-led", "The approved learning rule did not adjust the persisted recommendation.");
        assert.deepEqual(receipt.appliedRules, [{
          ruleId: expectedRule.ruleId,
          version: expectedRule.version,
          sourceOutcomeId: expectedRule.sourceOutcomeId,
          explanation: `Approved candidate ${expectedCandidateId} matched specificationClarity lte 3.`,
        }], "The persisted receipt did not retain exact approved-rule provenance.");
        return {
          assessmentId: assessment.assessmentId,
          receiptId: receipt.receiptId,
          elapsedMs: Date.now() - startedAt,
          polls,
        };
      }
    } else {
      lastStateSummary = `state request returned ${response.status()}`;
    }

    const alert = page.getByRole("alert");
    if (await alert.count() > 0 && await alert.first().isVisible()) {
      const alertText = (await alert.first().innerText()).trim();
      if (alertText) throw new Error(`Learning transition failed before persistence: ${alertText}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Learning transition did not persist its semantic receipt within ${semanticReceiptDeadlineMs}ms. Last state: ${lastStateSummary}`);
}
const port = await reserveLoopbackPort();
const evePort = await reserveLoopbackPort();
assert.notEqual(evePort, port, "Browser and Eve verification ports must be unique.");
const mcpPort = await reserveLoopbackPort();
const attackerPort = await reserveLoopbackPort();
assert.equal(new Set([port, evePort, mcpPort, attackerPort]).size, 4, "Every browser verification listener must use a unique port.");

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
childEnvironment.NODE_OPTIONS = `--require=${path.join(root, "scripts", "provider-free-egress-guard.cjs")}`;
childEnvironment.AGENT_OR_NOT_EGRESS_METRICS_DIR = metricsDirectory;
childEnvironment.AGENT_OR_NOT_EGRESS_METRICS_LABEL = "start";
childEnvironment.AGENT_OR_NOT_DATA_DIR = dataDirectory;
childEnvironment.AGENT_OR_NOT_FIXTURE_EVIDENCE_PATH = fixtureEvidencePath;
childEnvironment.AGENT_OR_NOT_FIXTURE_SCENARIO = "invalid-first-receipt";
childEnvironment.AGENT_OR_NOT_SESSION_NONCE = sessionNonce;
childEnvironment.NEXT_TELEMETRY_DISABLED = "1";
childEnvironment.NODE_ENV = "production";
childEnvironment.EVE_NEXT_PRODUCTION_PORT = String(evePort);
childEnvironment.AGENT_OR_NOT_MEMORY_MCP_URL = `http://127.0.0.1:${mcpPort}/mcp`;

const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");
const eveBin = path.join(root, "node_modules", "eve", "bin", "eve.js");
const mcpPython = path.join(root, "mcp_server", ".venv", "Scripts", "python.exe");
assert.ok(fs.existsSync(mcpPython), "Run `uv sync --project mcp_server --frozen` before browser verification.");
const eveBuild = spawnSync(process.execPath, [eveBin, "build"], {
  cwd: root,
  env: { ...childEnvironment, AGENT_OR_NOT_EGRESS_METRICS_LABEL: "build" },
  encoding: "utf8",
  timeout: 180_000,
  windowsHide: true,
});
assert.equal(eveBuild.status, 0, `Browser Eve build failed.\n${eveBuild.stdout}\n${eveBuild.stderr}`);
const browserBuild = spawnSync(process.execPath, [nextBin, "build", "--webpack"], {
  cwd: root,
  env: { ...childEnvironment, AGENT_OR_NOT_EGRESS_METRICS_LABEL: "build" },
  encoding: "utf8",
  timeout: 360_000,
  windowsHide: true,
});
assert.notEqual(browserBuild.error?.code, "ETIMEDOUT", `Unique-port browser production build timed out (ETIMEDOUT).\n${browserBuild.stdout}\n${browserBuild.stderr}`);
assert.equal(browserBuild.status, 0, `Unique-port browser production build failed.\n${browserBuild.stdout}\n${browserBuild.stderr}`);
const mcpEnvironment = { ...childEnvironment, PYTHONDONTWRITEBYTECODE: "1", PYTHONNOUSERSITE: "1" };
delete mcpEnvironment.NODE_OPTIONS;
const mcpServer = spawn(mcpPython, [path.join(root, "mcp_server", "server.py"), "--host", "127.0.0.1", "--port", String(mcpPort)], {
  cwd: root,
  env: mcpEnvironment,
  windowsHide: true,
  stdio: ["ignore", "pipe", "pipe"],
});
const eveServer = spawn(process.execPath, [eveBin, "start", "--host", "127.0.0.1", "--port", String(evePort)], {
  cwd: root,
  env: childEnvironment,
  windowsHide: true,
  stdio: ["ignore", "pipe", "pipe"],
});
const server = spawn(process.execPath, [nextBin, "start", "--hostname", "127.0.0.1", "--port", String(port)], {
  cwd: root,
  env: childEnvironment,
  windowsHide: true,
  stdio: ["ignore", "pipe", "pipe"],
});
const attackerServer = http.createServer((_request, response) => {
  response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  response.end("<!doctype html><title>Drive-by origin</title><p>Cross-origin test origin.</p>");
});
await new Promise((resolve, reject) => {
  attackerServer.once("error", reject);
  attackerServer.listen(attackerPort, "127.0.0.1", resolve);
});
let serverLog = "";
eveServer.stdout.on("data", (chunk) => { serverLog += chunk.toString(); });
eveServer.stderr.on("data", (chunk) => { serverLog += chunk.toString(); });
server.stdout.on("data", (chunk) => { serverLog += chunk.toString(); });
server.stderr.on("data", (chunk) => { serverLog += chunk.toString(); });
mcpServer.stdout.on("data", (chunk) => { serverLog += chunk.toString(); });
mcpServer.stderr.on("data", (chunk) => { serverLog += chunk.toString(); });

let browser;
const browserBlocked = [];
let rejectedApiStatus;
let rejectedRestoreStatus;
let rejectedProxyEveStatus;
let rejectedDirectEveStatus;
let exportEvidence;
let learningTransitionEvidence;
let recoveryEvidence;
let responsiveReceiptEvidence;
let backupRestoreEvidence;
try {
  const baseUrl = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 45_000;
  while (true) {
    try {
      const response = await fetch(`http://127.0.0.1:${mcpPort}/mcp`);
      if ([200, 400, 405, 406].includes(response.status)) break;
    } catch {}
    if (mcpServer.exitCode !== null) throw new Error(`Local MCP server stopped early.\n${serverLog}`);
    if (Date.now() > deadline) throw new Error(`Local MCP server did not become ready.\n${serverLog}`);
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  while (true) {
    try {
      const response = await fetch(`http://127.0.0.1:${evePort}/eve/v1/health`);
      const announcedBySpawn = serverLog.includes(`http://127.0.0.1:${evePort}`);
      if (response.ok && announcedBySpawn) break;
    } catch {}
    if (eveServer.exitCode !== null) throw new Error(`Local Eve server stopped early.\n${serverLog}`);
    if (Date.now() > deadline) throw new Error(`Local Eve server did not become ready.\n${serverLog}`);
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  assert.equal(eveServer.exitCode, null, "The uniquely spawned Eve process was not live after readiness.");
  while (true) {
    try {
      const response = await fetch(baseUrl);
      if (response.ok) break;
    } catch {}
    if (server.exitCode !== null) throw new Error(`Local server stopped early.\n${serverLog}`);
    if (Date.now() > deadline) throw new Error(`Local server did not become ready.\n${serverLog}`);
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  assert.equal(server.exitCode, null, "The uniquely spawned Next process was not live after readiness.");

  const rejectedApiResponse = await fetch(`${baseUrl}/api/events`, {
    method: "POST",
    headers: {
      "content-type": "text/plain",
      "origin": `http://127.0.0.1:${attackerPort}`,
      "sec-fetch-site": "cross-site",
    },
    body: JSON.stringify({ action: "delete-learning", candidateId: "candidate-drive-by", reason: "drive-by" }),
  });
  assert.equal(rejectedApiResponse.status, 403);
  rejectedApiStatus = rejectedApiResponse.status;
  const rejectedRestoreResponse = await fetch(`${baseUrl}/api/data/restore/validate`, {
    method: "POST",
    headers: {
      "content-type": "text/plain",
      "origin": `http://127.0.0.1:${attackerPort}`,
      "sec-fetch-site": "cross-site",
    },
    body: JSON.stringify({ backup: {} }),
  });
  assert.equal(rejectedRestoreResponse.status, 403);
  rejectedRestoreStatus = rejectedRestoreResponse.status;
  const rejectedProxyEveResponse = await fetch(`${baseUrl}/eve/v1/session`, {
    method: "POST",
    headers: {
      "content-type": "text/plain",
      "origin": `http://127.0.0.1:${attackerPort}`,
      "sec-fetch-site": "cross-site",
    },
    body: JSON.stringify({ message: "Create a drive-by session through the UI proxy.", mode: "task" }),
  });
  assert.equal(rejectedProxyEveResponse.status, 401);
  assert.equal(rejectedProxyEveResponse.headers.get("x-eve-session-id"), null);
  rejectedProxyEveStatus = rejectedProxyEveResponse.status;
  const rejectedDirectEveResponse = await fetch(`http://127.0.0.1:${evePort}/eve/v1/session`, {
    method: "POST",
    headers: {
      "content-type": "text/plain",
      "origin": `http://127.0.0.1:${attackerPort}`,
      "sec-fetch-site": "cross-site",
    },
    body: JSON.stringify({ message: "Create a drive-by session on the direct Eve port.", mode: "task" }),
  });
  assert.equal(rejectedDirectEveResponse.status, 401);
  assert.equal(rejectedDirectEveResponse.headers.get("x-eve-session-id"), null);
  rejectedDirectEveStatus = rejectedDirectEveResponse.status;
  assert.equal(fs.existsSync(path.join(dataDirectory, "events.ndjson")), false, "Rejected API request mutated the ledger.");
  assert.equal(fs.existsSync(fixtureEvidencePath), false, "Rejected proxied/direct Eve requests reached the model boundary.");

  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: "light" });
  let browserEveSessionRequests = 0;
  let delayedLearningSession = false;
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (["data:", "blob:", "about:"].includes(url.protocol) || ["127.0.0.1", "localhost", "::1"].includes(url.hostname)) {
      if (url.origin === baseUrl
        && url.pathname === "/eve/v1/session"
        && route.request().method() === "POST"
        && route.request().headers()["x-agent-or-not-session"] === sessionNonce) {
        browserEveSessionRequests += 1;
        if (browserEveSessionRequests === 3) {
          delayedLearningSession = true;
          await new Promise((resolve) => setTimeout(resolve, learningTransitionDelayMs));
        }
      }
      await route.continue();
      return;
    }
    browserBlocked.push(url.href);
    await route.abort("blockedbyclient");
  });
  const page = await context.newPage();
  const browserErrors = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") browserErrors.push(message.text()); });

  const attackerPage = await context.newPage();
  await attackerPage.goto(`http://127.0.0.1:${attackerPort}`, { waitUntil: "domcontentloaded" });
  await attackerPage.evaluate(async ({ applicationOrigin, directEveOrigin }) => {
    await Promise.allSettled([
      fetch(`${applicationOrigin}/api/events`, {
        method: "POST",
        mode: "no-cors",
        headers: { "content-type": "text/plain" },
        body: JSON.stringify({ action: "delete-learning", candidateId: "candidate-drive-by", reason: "drive-by" }),
      }),
      fetch(`${applicationOrigin}/api/data/restore/validate`, {
        method: "POST",
        mode: "no-cors",
        headers: { "content-type": "text/plain" },
        body: JSON.stringify({ backup: {} }),
      }),
      fetch(`${applicationOrigin}/eve/v1/session`, {
        method: "POST",
        mode: "no-cors",
        headers: { "content-type": "text/plain" },
        body: JSON.stringify({ message: "Create a drive-by session through the UI proxy.", mode: "task" }),
      }),
      fetch(`${directEveOrigin}/eve/v1/session`, {
        method: "POST",
        mode: "no-cors",
        headers: { "content-type": "text/plain" },
        body: JSON.stringify({ message: "Create a drive-by session on the direct Eve port.", mode: "task" }),
      }),
    ]);
  }, { applicationOrigin: baseUrl, directEveOrigin: `http://127.0.0.1:${evePort}` });
  await attackerPage.close();
  await new Promise((resolve) => setTimeout(resolve, 250));
  assert.equal(fs.existsSync(path.join(dataDirectory, "events.ndjson")), false, "No-CORS drive-by request mutated the ledger.");
  assert.equal(fs.existsSync(fixtureEvidencePath), false, "No-CORS drive-by request created an Eve model call.");

  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Delegation assessment" }).waitFor();
  assert.equal(await page.getByText(/Eve bounded guidance harness/u).count(), 1);
  await page.getByText(/Fixture mode: assessment processing stays on this computer/u).first().waitFor();
  await page.screenshot({ path: path.join(artifactDirectory, "assessment-desktop.png"), fullPage: true });

  const interactiveSizes = await page.locator("button:visible, a:visible, input[type=radio]:visible").evaluateAll((elements) => elements.map((element) => {
    const box = element.getBoundingClientRect();
    return { tag: element.tagName, text: element.textContent?.trim(), width: box.width, height: box.height };
  }));
  assert.ok(interactiveSizes.filter((item) => item.tag === "BUTTON" || item.tag === "A").every((item) => item.height >= 44));

  const factorAnchors = [
    ["1 — Negligible; quickly reversible", "5 — Critical; irreversible or safety-sensitive"],
    ["1 — One-off; every case is different", "5 — Highly repeatable; standard inputs and steps"],
    ["1 — Tacit; success cannot yet be stated", "5 — Fully specified; edge cases and tests are defined"],
    ["1 — Trivial; errors are immediately obvious", "5 — Extreme; reliable verification is impractical"],
    ["1 — Context-light; written inputs are sufficient", "5 — Deeply contextual; relationships and timing dominate"],
  ];
  for (let index = 0; index < factorAnchors.length; index += 1) {
    await page.getByText(factorAnchors[index][0], { exact: true }).waitFor();
    await page.getByText(factorAnchors[index][1], { exact: true }).waitFor();
    if (index < factorAnchors.length - 1) await page.getByRole("button", { name: /Continue/ }).click();
  }
  await page.getByRole("button", { name: /Generate receipt/ }).click();
  try {
    await page.getByText("Validated local result").waitFor({ timeout: 30_000 });
  } catch (error) {
    await page.screenshot({ path: path.join(artifactDirectory, "receipt-failure.png"), fullPage: true });
    throw new Error(`Receipt did not complete. Page: ${await page.locator("body").innerText()}\nBrowser errors: ${browserErrors.join(" | ")}\nServer: ${serverLog}`, { cause: error });
  }
  await page.getByRole("heading", { name: "Turn an outcome into reviewable learning." }).waitFor();
  await page.getByRole("button", { name: /^Decision/u }).waitFor();
  await page.getByText(/5 deterministic gates passed; 2 of 2 Eve sessions used/u).waitFor();
  await page.screenshot({ path: path.join(artifactDirectory, "receipt-decision-desktop.png"), fullPage: true });
  await page.getByRole("button", { name: /^Trust/u }).click();
  await page.getByRole("heading", { name: "Trust evidence" }).waitFor();
  await page.getByRole("heading", { name: "Capability provenance" }).waitFor();
  await page.getByRole("heading", { name: "Verification" }).waitFor();
  await page.getByText("5 gates passed", { exact: true }).waitFor();
  await page.getByText("2 of 2", { exact: true }).waitFor();
  await page.getByText("Inspect gates and replay fingerprints", { exact: true }).click();
  await page.getByText("strict-receipt-schema", { exact: true }).waitFor();
  await page.getByText("outcome-data-isolation", { exact: true }).waitFor();
  const displayedHashes = await page.locator(".verification-hashes code").evaluateAll((elements) => elements.map((element) => ({
    text: element.textContent,
    full: element.getAttribute("title"),
  })));
  assert.equal(displayedHashes.length, 3);
  assert.ok(displayedHashes.every((hash) => hash.text.length === 21 && /^[a-f0-9]{64}$/u.test(hash.full)));
  await page.getByText("delegation-guidance", { exact: true }).waitFor();
  const mcpDisclosure = page.locator(".capability-provenance details").last();
  await mcpDisclosure.locator("summary").click();
  await mcpDisclosure.locator("summary").getByText("governed-memory__lookup_approved_guidance", { exact: true }).waitFor();
  await mcpDisclosure.getByText(/Raw outcome notes crossed: no/u).waitFor();
  const retryEvidence = fs.readFileSync(fixtureEvidencePath, "utf8").trim().split(/\r?\n/u).map(JSON.parse);
  assert.equal(retryEvidence.length, 6, "requestEveReceipt must use three bounded model steps in each of two validation sessions.");
  assert.deepEqual(retryEvidence.map((call) => call.stage), ["prepare", "evidence", "final", "prepare", "evidence", "final"]);
  assert.deepEqual(retryEvidence.map((call) => call.outputKind), ["tool-calls", "tool-calls", "semantically-invalid", "tool-calls", "tool-calls", "valid"]);
  assert.deepEqual(retryEvidence.map((call) => call.correctionRequested), [false, false, false, true, true, true]);
  assert.ok(retryEvidence.every((call) => call.classification === "eve-bounded-guidance-harness-v1"));
  await new Promise((resolve) => setTimeout(resolve, 250));
  assert.equal(fs.readFileSync(fixtureEvidencePath, "utf8").trim().split(/\r?\n/u).length, 6, "requestEveReceipt opened an unexpected third session.");
  await page.screenshot({ path: path.join(artifactDirectory, "receipt-trust-desktop.png"), fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileReceiptLayout = await page.locator(".receipt").evaluate((element) => {
    const box = element.getBoundingClientRect();
    return { left: box.left, right: box.right, clientWidth: element.clientWidth, scrollWidth: element.scrollWidth };
  });
  const mobileReceiptTargets = await page.locator(".receipt-view-nav button").evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().height));
  assert.ok(mobileReceiptLayout.left >= 0 && mobileReceiptLayout.right <= 390 && mobileReceiptLayout.scrollWidth <= mobileReceiptLayout.clientWidth + 1);
  assert.ok(mobileReceiptTargets.length === 3 && mobileReceiptTargets.every((height) => height >= 44));
  await page.screenshot({ path: path.join(artifactDirectory, "receipt-trust-mobile.png"), fullPage: true });
  await page.getByRole("button", { name: /^Decision/u }).click();
  await page.screenshot({ path: path.join(artifactDirectory, "receipt-decision-mobile.png"), fullPage: true });
  responsiveReceiptEvidence = { desktopViews: 3, mobileViews: 3, noHorizontalOverflow: true, minimumTargetHeight: 44, shortenedHashes: 3 };
  await page.setViewportSize({ width: 1440, height: 1000 });

  await page.getByRole("button", { name: /^Work plan/u }).click();
  await page.getByRole("button", { name: "Edit locally" }).click();
  await page.getByLabel("Instruction").first().fill("Prepare a concise owner-edited recommendation with explicit trade-offs.");
  await page.getByRole("button", { name: "Save starter pack" }).click();
  await page.getByRole("button", { name: "Edit locally" }).waitFor();

  await page.getByRole("radio", { name: "2" }).click();
  await page.getByRole("button", { name: "Record outcome locally" }).click();
  await page.getByText("Inert until you approve.").waitFor();
  const proposedStateResponse = await page.request.get(`${baseUrl}/api/state`);
  assert.equal(proposedStateResponse.ok(), true);
  const proposedState = await proposedStateResponse.json();
  const approvedCandidateId = Object.keys(proposedState.projection.candidates)[0];
  assert.equal(proposedState.projection.candidates[approvedCandidateId].status, "proposed");
  await page.getByRole("button", { name: "New case" }).click();
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("link", { name: /History Review local learning/u }).click();
  await page.getByRole("heading", { name: "Learning history" }).waitFor();
  await page.getByText(approvedCandidateId, { exact: true }).waitFor();
  const resumeReviewButton = page.getByRole("button", { name: `Resume review ${approvedCandidateId}` });
  const resumeReviewBox = await resumeReviewButton.boundingBox();
  assert.ok(resumeReviewBox && resumeReviewBox.height >= 44, "Resume review must keep a minimum 44px target.");
  await resumeReviewButton.click();
  await page.getByRole("heading", { name: "Turn an outcome into reviewable learning." }).waitFor();
  await page.waitForFunction(() => document.activeElement?.id === "outcome-heading");
  await page.getByText("Inert until you approve.").waitFor();
  await page.screenshot({ path: path.join(artifactDirectory, "learning-resumed-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  const mobileReviewTargetHeights = await page.locator(".learning-panel .candidate-actions button").evaluateAll((elements) => (
    elements.map((element) => element.getBoundingClientRect().height)
  ));
  assert.ok(mobileReviewTargetHeights.length >= 3 && mobileReviewTargetHeights.every((height) => height >= 44));
  await page.screenshot({ path: path.join(artifactDirectory, "learning-resumed-mobile.png"), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Bounded rationale").fill("Owner revised this bounded rationale before approval.");
  await page.getByRole("button", { name: "Save new revision" }).click();
  await page.getByText("revision 2").first().waitFor();
  await page.getByRole("button", { name: "Approve learning" }).click();
  await page.getByText("This candidate is approved.").waitFor();
  await page.screenshot({ path: path.join(artifactDirectory, "learning-approved-desktop.png"), fullPage: true });

  const stateResponse = await page.request.get(`${baseUrl}/api/state`);
  assert.equal(stateResponse.ok(), true);
  const state = await stateResponse.json();
  assert.equal(Object.values(state.projection.candidates)[0].status, "approved");
  assert.equal(Object.values(state.projection.rules)[0].active, true);
  const approvedRule = Object.values(state.projection.rules)[0];
  const receiptIdsBeforeLearningTransition = new Set(Object.keys(state.projection.receipts));
  await page.getByRole("button", { name: "New case" }).click();
  await page.getByRole("link", { name: /History Review local learning/u }).click();
  await page.getByRole("heading", { name: "Learning history" }).waitFor();
  await page.getByText(approvedCandidateId, { exact: true }).waitFor();
  await page.getByRole("link", { name: /Assess Frame the decision/u }).click();
  await page.getByRole("button", { name: "Go to step 3" }).click();
  await page.getByRole("radio", { name: "2 — Ambiguous; major constraints are missing" }).click();
  await page.getByRole("button", { name: "Go to step 5" }).click();
  await page.getByRole("button", { name: /Generate receipt/ }).click();
  const semanticReceipt = await waitForAppliedLearningReceipt(page, baseUrl, {
    existingReceiptIds: receiptIdsBeforeLearningTransition,
    expectedCandidateId: approvedCandidateId,
    expectedRule: approvedRule,
  });
  assert.equal(delayedLearningSession, true, "The focused learning-transition race falsifier did not run.");
  assert.ok(semanticReceipt.elapsedMs >= learningTransitionDelayMs, "Semantic readiness returned before the injected slow transition completed.");
  await page.getByText("Human-led", { exact: true }).waitFor({ timeout: 10_000 });
  await page.getByRole("button", { name: /^Work plan/u }).click();
  await page.getByText("Approved lessons applied").waitFor({ timeout: 10_000 });
  learningTransitionEvidence = {
    delayedSessionMs: learningTransitionDelayMs,
    semanticReceipt,
    persistedBeforePresentationAssertion: true,
    uiProjectionConfirmed: true,
  };
  await page.screenshot({ path: path.join(artifactDirectory, "approved-rule-provenance.png"), fullPage: true });

  await page.getByRole("button", { name: "New case" }).click();
  await page.getByRole("link", { name: /History Review local learning/u }).click();
  await page.getByRole("heading", { name: "Learning history" }).waitFor();
  await page.getByRole("button", { name: "Expire now" }).click();
  await page.getByText("Expired — inactive", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Deactivate (keep tombstone)" }).click();
  await page.getByText("Deleted tombstone — inactive and retained", { exact: true }).waitFor();
  const deletedStateResponse = await page.request.get(`${baseUrl}/api/state`);
  assert.equal(deletedStateResponse.ok(), true);
  const deletedState = await deletedStateResponse.json();
  assert.equal(deletedState.projection.candidates[approvedCandidateId].status, "deleted");
  assert.equal(Object.values(deletedState.projection.rules)[0].active, false);
  const exportResponse = await page.request.get(`${baseUrl}/api/export`);
  assert.equal(exportResponse.ok(), true);
  const exportPayload = await exportResponse.json();
  assert.equal(exportPayload.projection.candidates[approvedCandidateId].status, "deleted");
  assert.equal(exportPayload.projection.candidates[approvedCandidateId].sourceOutcomeId, proposedState.projection.candidates[approvedCandidateId].sourceOutcomeId);
  const exportedVerifications = Object.values(exportPayload.projection.receiptVerifications);
  assert.equal(exportedVerifications.length, 2, "Each browser-created receipt must export replayable verification evidence.");
  assert.deepEqual(exportedVerifications.map((verification) => verification.sessionAttemptsUsed), [2, 1]);
  assert.ok(exportedVerifications.every((verification) => verification.gates.length === 5
    && verification.gates.every((gate) => gate.state === "passed")
    && /^[a-f0-9]{64}$/u.test(verification.assessmentInputHash)
    && /^[a-f0-9]{64}$/u.test(verification.capabilityTraceHash)
    && /^[a-f0-9]{64}$/u.test(verification.recordedReceiptHash)));
  const exportedCandidateEventTypes = exportPayload.events
    .filter((event) => event.candidate?.candidateId === approvedCandidateId || event.candidateId === approvedCandidateId)
    .map((event) => event.type);
  assert.deepEqual(exportedCandidateEventTypes, [
    "learning.proposed", "learning.edited", "learning.approved", "learning.expired", "learning.deleted",
  ]);
  const ledgerAtExport = fs.readFileSync(path.join(dataDirectory, "events.ndjson"), "utf8").trim().split(/\r?\n/u).map(JSON.parse);
  assert.deepEqual(exportPayload.events, ledgerAtExport, "Export must contain the complete event stream.");
  const forbiddenExportKeys = [];
  const exportValues = [exportPayload];
  while (exportValues.length > 0) {
    const current = exportValues.pop();
    if (!current || typeof current !== "object") continue;
    for (const [key, value] of Object.entries(current)) {
      if (/^(apiKey|authorization|openrouterApiKey|providerBody|providerResponse|rawProviderBody)$/iu.test(key)) forbiddenExportKeys.push(key);
      exportValues.push(value);
    }
  }
  assert.deepEqual(forbiddenExportKeys, [], "Export contains a provider credential or raw-provider-body field.");
  assert.doesNotMatch(JSON.stringify(exportPayload), /OPENROUTER_API_KEY|raw provider body/iu);
  exportEvidence = {
    retainedCandidateId: approvedCandidateId,
    tombstoneStatus: exportPayload.projection.candidates[approvedCandidateId].status,
    completeEventCount: exportPayload.events.length,
    candidateEventTypes: exportedCandidateEventTypes,
    forbiddenProviderFields: forbiddenExportKeys.length,
    replayVerifiedReceipts: exportedVerifications.length,
    deterministicGatesPerReceipt: 5,
  };

  const ledgerBeforeBackupValidation = fs.readFileSync(path.join(dataDirectory, "events.ndjson"), "utf8");
  await page.getByRole("link", { name: /Data Backup and restore/u }).click();
  await page.getByRole("heading", { name: "Backup & restore" }).waitFor();
  const [backupDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download validated backup" }).click(),
  ]);
  const downloadedBackupPath = await backupDownload.path();
  assert.ok(downloadedBackupPath, "The validated backup download did not produce a local file.");
  const backupEnvelope = JSON.parse(fs.readFileSync(downloadedBackupPath, "utf8"));
  assert.equal(backupEnvelope.schemaVersion, "agent-or-not-backup-v1");
  assert.equal(backupEnvelope.hashAlgorithm, "sha256-canonical-json-v1");
  assert.equal(backupEnvelope.content.eventCount, ledgerAtExport.length);
  assert.deepEqual(backupEnvelope.content.events, ledgerAtExport);
  assert.match(backupEnvelope.digest, /^[a-f0-9]{64}$/u);

  const backupInput = page.getByLabel("Backup file");
  await backupInput.setInputFiles({ name: "malformed-backup.json", mimeType: "application/json", buffer: Buffer.from("{") });
  await page.getByRole("button", { name: "Validate selected backup" }).click();
  await page.getByText("The selected backup is malformed JSON.").waitFor();
  assert.equal(await page.getByRole("button", { name: "Confirm and replace local ledger" }).count(), 0);

  const tamperedEnvelope = structuredClone(backupEnvelope);
  tamperedEnvelope.content.events[0].receipt.summary = "Tampered after the backup digest was created.";
  await backupInput.setInputFiles({
    name: "tampered-backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(tamperedEnvelope)),
  });
  await page.getByRole("button", { name: "Validate selected backup" }).click();
  await page.getByText(/backup digest does not match its canonical content/u).waitFor();
  assert.equal(await page.getByRole("button", { name: "Confirm and replace local ledger" }).count(), 0);
  assert.equal(fs.readFileSync(path.join(dataDirectory, "events.ndjson"), "utf8"), ledgerBeforeBackupValidation, "Tampered dry-run validation mutated the ledger.");

  await backupInput.setInputFiles({
    name: "validated-backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(backupEnvelope)),
  });
  await page.getByRole("button", { name: "Validate selected backup" }).click();
  await page.getByText(/Validation passed\. The local ledger was not changed/u).waitFor();
  const restoreButton = page.getByRole("button", { name: "Confirm and replace local ledger" });
  await restoreButton.waitFor();
  assert.equal(await restoreButton.isDisabled(), true, "Restore must require a separate explicit owner confirmation.");
  assert.equal(fs.readFileSync(path.join(dataDirectory, "events.ndjson"), "utf8"), ledgerBeforeBackupValidation, "Valid dry-run validation mutated the ledger.");
  await page.screenshot({ path: path.join(artifactDirectory, "backup-validation-desktop.png"), fullPage: true });

  await page.getByLabel("I approve replacing the complete local ledger with this exact validated backup.").check();
  await restoreButton.click();
  await page.getByText(/Restore completed atomically/u).waitFor();
  await page.getByRole("heading", { name: "Pre-restore recovery retained" }).waitFor();
  assert.equal(fs.readFileSync(path.join(dataDirectory, "events.ndjson"), "utf8"), ledgerBeforeBackupValidation, "Complete restore changed the validated event order or values.");
  const preRestoreFiles = fs.readdirSync(path.join(dataDirectory, "pre-restore"));
  assert.equal(preRestoreFiles.length, 1, "Confirmed restore must retain exactly one pre-restore recovery in this flow.");
  assert.equal(fs.readFileSync(path.join(dataDirectory, "pre-restore", preRestoreFiles[0]), "utf8"), ledgerBeforeBackupValidation);
  const [recoveryDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download pre-restore recovery" }).click(),
  ]);
  const downloadedRecoveryPath = await recoveryDownload.path();
  assert.ok(downloadedRecoveryPath);
  assert.equal(fs.readFileSync(downloadedRecoveryPath, "utf8"), ledgerBeforeBackupValidation);
  await page.setViewportSize({ width: 390, height: 844 });
  const dataPanelLayout = await page.locator("#data").evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
    left: element.getBoundingClientRect().left,
    right: element.getBoundingClientRect().right,
  }));
  assert.ok(dataPanelLayout.left >= 0 && dataPanelLayout.right <= 390 && dataPanelLayout.scrollWidth <= dataPanelLayout.clientWidth + 1);
  await page.screenshot({ path: path.join(artifactDirectory, "backup-restore-mobile.png"), fullPage: true });
  backupRestoreEvidence = {
    schemaVersion: backupEnvelope.schemaVersion,
    digestVerifiedBeforeConfirmation: true,
    dryRunLedgerMutations: 0,
    malformedRestoreActions: 0,
    tamperedRestoreActions: 0,
    explicitConfirmationRequired: true,
    restoredEventCount: ledgerAtExport.length,
    preRestoreBytesPreserved: Buffer.byteLength(ledgerBeforeBackupValidation, "utf8"),
    mobileNoHorizontalOverflow: true,
  };

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("link", { name: "Assess", exact: true }).click();
  await page.getByRole("heading", { name: "Delegation assessment" }).waitFor();
  await page.screenshot({ path: path.join(artifactDirectory, "assessment-mobile.png"), fullPage: true });

  assert.deepEqual(browserBlocked, []);
  assert.deepEqual(browserErrors, [], "The browser reported an error before the intentional ledger-tamper recovery check.");
  const ledgerPath = path.join(dataDirectory, "events.ndjson");
  const tamperedEvents = fs.readFileSync(ledgerPath, "utf8").trim().split(/\r?\n/u).map(JSON.parse);
  tamperedEvents[0].receipt.summary = "Schema-valid text changed after verification was recorded.";
  const tamperedLedger = `${tamperedEvents.map((event) => JSON.stringify(event)).join("\n")}\n`;
  fs.writeFileSync(ledgerPath, tamperedLedger, "utf8");
  const failedStateResponse = await page.request.get(`${baseUrl}/api/state`);
  assert.equal(failedStateResponse.status(), 409);
  const failedState = await failedStateResponse.json();
  assert.deepEqual(failedState, {
    code: "PRODUCT_LEDGER_INVALID",
    error: "The local ledger failed an integrity check. It was left untouched so you can inspect and recover it.",
    recoveryUrl: "/api/recovery",
  });
  const recoveryResponse = await page.request.get(`${baseUrl}/api/recovery`);
  assert.equal(recoveryResponse.ok(), true);
  assert.equal(await recoveryResponse.text(), tamperedLedger, "Recovery download must preserve the exact failed ledger bytes.");
  assert.match(recoveryResponse.headers()["x-content-sha256"], /^[a-f0-9]{64}$/u);
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "The ledger was preserved." }).waitFor();
  await page.getByRole("link", { name: "Download untouched ledger" }).waitFor();
  await page.screenshot({ path: path.join(artifactDirectory, "ledger-recovery-mobile.png"), fullPage: true });
  recoveryEvidence = { failedStateStatus: 409, rawLedgerBytesPreserved: Buffer.byteLength(tamperedLedger, "utf8"), recoverySha256Present: true, recoveryUiVisible: true };

  assert.deepEqual(browserBlocked, []);
  assert.ok(browserErrors.length >= 1, "The failed state read should remain visible as an intentional 409 response.");
  assert.ok(browserErrors.every((message) => /Failed to load resource:.*409 \(Conflict\)/u.test(message)), `Unexpected browser errors after the intentional recovery response: ${browserErrors.join(" | ")}`);
} finally {
  if (browser) await browser.close();
  await new Promise((resolve) => attackerServer.close(resolve));
  if (server.exitCode === null) server.kill("SIGTERM");
  if (eveServer.exitCode === null) eveServer.kill("SIGTERM");
  if (mcpServer.exitCode === null) mcpServer.kill("SIGTERM");
  await Promise.race([
    Promise.all([
      server.exitCode === null ? new Promise((resolve) => server.once("exit", resolve)) : Promise.resolve(),
      eveServer.exitCode === null ? new Promise((resolve) => eveServer.once("exit", resolve)) : Promise.resolve(),
      mcpServer.exitCode === null ? new Promise((resolve) => mcpServer.once("exit", resolve)) : Promise.resolve(),
    ]),
    new Promise((resolve) => setTimeout(resolve, 5_000)),
  ]);
}

const metrics = fs.readdirSync(metricsDirectory).filter((name) => name.endsWith(".json"))
  .map((name) => JSON.parse(fs.readFileSync(path.join(metricsDirectory, name), "utf8")));
assert.ok(metrics.length >= 2);
assert.ok(metrics.every((record) => record.attempted === 0 && record.blocked === 0));
const ledger = fs.readFileSync(path.join(dataDirectory, "events.ndjson"), "utf8").trim().split(/\r?\n/u).map(JSON.parse);
assert.deepEqual(ledger.map((event) => event.type), [
  "recommendation.recorded", "recommendation.edited", "outcome.recorded", "learning.proposed", "learning.edited", "learning.approved", "recommendation.recorded", "learning.expired", "learning.deleted",
]);
const fixtureEvidence = fs.readFileSync(fixtureEvidencePath, "utf8").trim().split(/\r?\n/u).map(JSON.parse);
assert.equal(fixtureEvidence.length, 9, "The browser flow must reconcile two three-step validation sessions plus one later three-step request.");
assert.ok(fixtureEvidence.every((call, index) => call.invocationCount === index + 1
  && call.classification === "eve-bounded-guidance-harness-v1"
  && call.toolDefinitionCount === (call.stage === "prepare" ? 4 : 5)
  && call.actionCapableToolDefinitionCount === (call.stage === "prepare" ? 1 : 2)
  && call.modelId === "agent-or-not-fixture"));
assert.deepEqual(fixtureEvidence.map((call) => [call.outputKind, call.correctionRequested]), [
  ["tool-calls", false], ["tool-calls", false], ["semantically-invalid", false],
  ["tool-calls", true], ["tool-calls", true], ["valid", true],
  ["tool-calls", false], ["tool-calls", false], ["valid", false],
]);
process.stdout.write(`${JSON.stringify({
  schemaVersion: "provider-free-browser-verification-v1",
  state: "passed",
  guardedProcesses: metrics.length,
  nonLoopbackAttempts: 0,
  browserNonLoopbackRequests: browserBlocked.length,
  uniquePorts: { web: port, eve: evePort, mcp: mcpPort, attacker: attackerPort },
  spawnedProcessesLiveAtReadiness: true,
  uniquePortProductionBuild: "passed",
  rejectedDriveBy: {
    apiStatus: rejectedApiStatus,
    restoreStatus: rejectedRestoreStatus,
    proxyEveStatus: rejectedProxyEveStatus,
    directEveStatus: rejectedDirectEveStatus,
    eveSessionIdentities: 0,
    ledgerMutations: 0,
    eveModelCalls: 0,
  },
  invalidFirstRetry: {
    sessionsBeforeNextExplicitRequest: 2,
    correctedSecondSessionAccepted: true,
    unexpectedThirdSession: false,
  },
  learningTransitionRace: learningTransitionEvidence,
  responsiveReceipt: responsiveReceiptEvidence,
  backupRestore: backupRestoreEvidence,
  ledgerRecovery: recoveryEvidence,
  exportEvidence,
  fixtureEvidence,
  eventTypes: ledger.map((event) => event.type),
  screenshots: ["assessment-desktop.png", "receipt-decision-desktop.png", "receipt-trust-desktop.png", "receipt-decision-mobile.png", "receipt-trust-mobile.png", "learning-resumed-desktop.png", "learning-resumed-mobile.png", "learning-approved-desktop.png", "approved-rule-provenance.png", "backup-validation-desktop.png", "backup-restore-mobile.png", "assessment-mobile.png", "ledger-recovery-mobile.png"],
})}\n`);
fs.rmSync(scratch, { recursive: true, force: true });
