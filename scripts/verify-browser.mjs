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
const port = await reserveLoopbackPort();
const evePort = await reserveLoopbackPort();
assert.notEqual(evePort, port, "Browser and Eve verification ports must be unique.");
const attackerPort = await reserveLoopbackPort();
assert.equal(new Set([port, evePort, attackerPort]).size, 3, "Every browser verification listener must use a unique port.");

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
childEnvironment.AGENT_OR_NOT_SESSION_NONCE = sessionNonce;
childEnvironment.NEXT_TELEMETRY_DISABLED = "1";
childEnvironment.NODE_ENV = "production";
childEnvironment.EVE_NEXT_PRODUCTION_PORT = String(evePort);

const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");
const eveBin = path.join(root, "node_modules", "eve", "bin", "eve.js");
const browserBuild = spawnSync(process.execPath, [nextBin, "build", "--webpack"], {
  cwd: root,
  env: { ...childEnvironment, AGENT_OR_NOT_EGRESS_METRICS_LABEL: "build" },
  encoding: "utf8",
  timeout: 180_000,
  windowsHide: true,
});
assert.equal(browserBuild.status, 0, `Unique-port browser production build failed.\n${browserBuild.stdout}\n${browserBuild.stderr}`);
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

let browser;
const browserBlocked = [];
let rejectedApiStatus;
let rejectedEveStatus;
try {
  const baseUrl = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 45_000;
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
  const rejectedEveResponse = await fetch(`http://127.0.0.1:${evePort}/eve/v1/session`, {
    method: "POST",
    headers: {
      "content-type": "text/plain",
      "origin": `http://127.0.0.1:${attackerPort}`,
      "sec-fetch-site": "cross-site",
    },
    body: JSON.stringify({ message: "Create a drive-by session.", mode: "task" }),
  });
  assert.equal(rejectedEveResponse.status, 401);
  rejectedEveStatus = rejectedEveResponse.status;
  assert.equal(fs.existsSync(path.join(dataDirectory, "events.ndjson")), false, "Rejected API request mutated the ledger.");
  assert.equal(fs.existsSync(fixtureEvidencePath), false, "Rejected Eve request reached the model boundary.");

  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: "light" });
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (["data:", "blob:", "about:"].includes(url.protocol) || ["127.0.0.1", "localhost", "::1"].includes(url.hostname)) {
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
  await attackerPage.evaluate(async ({ applicationOrigin, eveOrigin }) => {
    await Promise.allSettled([
      fetch(`${applicationOrigin}/api/events`, {
        method: "POST",
        mode: "no-cors",
        headers: { "content-type": "text/plain" },
        body: JSON.stringify({ action: "delete-learning", candidateId: "candidate-drive-by", reason: "drive-by" }),
      }),
      fetch(`${eveOrigin}/eve/v1/session`, {
        method: "POST",
        mode: "no-cors",
        headers: { "content-type": "text/plain" },
        body: JSON.stringify({ message: "Create a drive-by session.", mode: "task" }),
      }),
    ]);
  }, { applicationOrigin: baseUrl, eveOrigin: `http://127.0.0.1:${evePort}` });
  await attackerPage.close();
  await new Promise((resolve) => setTimeout(resolve, 250));
  assert.equal(fs.existsSync(path.join(dataDirectory, "events.ndjson")), false, "No-CORS drive-by request mutated the ledger.");
  assert.equal(fs.existsSync(fixtureEvidencePath), false, "No-CORS drive-by request created an Eve model call.");

  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Delegation assessment" }).waitFor();
  assert.equal(await page.getByText("No tools enabled").count(), 1);
  await page.getByText(/Fixture mode: assessment processing stays on this computer/u).first().waitFor();
  await page.screenshot({ path: path.join(artifactDirectory, "assessment-desktop.png"), fullPage: true });

  const interactiveSizes = await page.locator("button, a, input[type=radio]").evaluateAll((elements) => elements.map((element) => {
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
  await page.screenshot({ path: path.join(artifactDirectory, "outcome-desktop.png"), fullPage: true });

  await page.getByRole("button", { name: "Edit locally" }).click();
  await page.getByLabel("Instruction").first().fill("Prepare a concise owner-edited recommendation with explicit trade-offs.");
  await page.getByRole("button", { name: "Save starter pack" }).click();
  await page.getByRole("button", { name: "Edit locally" }).waitFor();

  await page.getByRole("radio", { name: "2" }).click();
  await page.getByRole("button", { name: "Record outcome locally" }).click();
  await page.getByText("Inert until you approve.").waitFor();
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
  const exportResponse = await page.request.get(`${baseUrl}/api/export`);
  assert.equal(exportResponse.ok(), true);
  assert.match(await exportResponse.text(), /learning\.approved/u);

  const approvedCandidateId = Object.keys(state.projection.candidates)[0];
  await page.getByRole("button", { name: "New case" }).click();
  await page.getByRole("heading", { name: "Learning history" }).waitFor();
  await page.getByText(approvedCandidateId, { exact: true }).waitFor();
  await page.getByRole("button", { name: "Go to step 3" }).click();
  await page.getByRole("radio", { name: "2 — Ambiguous; major constraints are missing" }).click();
  await page.getByRole("button", { name: "Go to step 5" }).click();
  await page.getByRole("button", { name: /Generate receipt/ }).click();
  await page.getByText("Approved lessons applied").waitFor({ timeout: 30_000 });
  await page.getByText("Human-led", { exact: true }).waitFor();
  await page.screenshot({ path: path.join(artifactDirectory, "approved-rule-provenance.png"), fullPage: true });

  await page.getByRole("button", { name: "New case" }).click();
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
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("heading", { name: "Delegation assessment" }).waitFor();
  await page.screenshot({ path: path.join(artifactDirectory, "assessment-mobile.png"), fullPage: true });

  assert.deepEqual(browserBlocked, []);
  assert.deepEqual(browserErrors, []);
} finally {
  if (browser) await browser.close();
  await new Promise((resolve) => attackerServer.close(resolve));
  if (server.exitCode === null) server.kill("SIGTERM");
  if (eveServer.exitCode === null) eveServer.kill("SIGTERM");
  await Promise.race([
    Promise.all([
      server.exitCode === null ? new Promise((resolve) => server.once("exit", resolve)) : Promise.resolve(),
      eveServer.exitCode === null ? new Promise((resolve) => eveServer.once("exit", resolve)) : Promise.resolve(),
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
assert.equal(fixtureEvidence.length, 2, "The browser flow must reconcile exactly two fixture calls.");
assert.ok(fixtureEvidence.every((call, index) => call.invocationCount === index + 1
  && call.toolDefinitionCount === 0
  && call.modelId === "agent-or-not-fixture"));
process.stdout.write(`${JSON.stringify({
  schemaVersion: "provider-free-browser-verification-v1",
  state: "passed",
  guardedProcesses: metrics.length,
  nonLoopbackAttempts: 0,
  browserNonLoopbackRequests: browserBlocked.length,
  uniquePorts: { web: port, eve: evePort, attacker: attackerPort },
  spawnedProcessesLiveAtReadiness: true,
  uniquePortProductionBuild: "passed",
  rejectedDriveBy: { apiStatus: rejectedApiStatus, eveStatus: rejectedEveStatus, ledgerMutations: 0, eveModelCalls: 0 },
  fixtureEvidence,
  eventTypes: ledger.map((event) => event.type),
  screenshots: ["assessment-desktop.png", "outcome-desktop.png", "learning-approved-desktop.png", "approved-rule-provenance.png", "assessment-mobile.png"],
})}\n`);
fs.rmSync(scratch, { recursive: true, force: true });
