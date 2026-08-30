import assert from "node:assert/strict";
import { spawn } from "node:child_process";
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
const evePort = 4274;

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
childEnvironment.AGENT_OR_NOT_FIXTURE_EVIDENCE_PATH = path.join(scratch, "browser-model-call.ndjson");
childEnvironment.NEXT_TELEMETRY_DISABLED = "1";
childEnvironment.NODE_ENV = "production";
childEnvironment.EVE_NEXT_PRODUCTION_PORT = String(evePort);

const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");
const eveBin = path.join(root, "node_modules", "eve", "bin", "eve.js");
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
let serverLog = "";
eveServer.stdout.on("data", (chunk) => { serverLog += chunk.toString(); });
eveServer.stderr.on("data", (chunk) => { serverLog += chunk.toString(); });
server.stdout.on("data", (chunk) => { serverLog += chunk.toString(); });
server.stderr.on("data", (chunk) => { serverLog += chunk.toString(); });

let browser;
const browserBlocked = [];
try {
  const baseUrl = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 45_000;
  while (true) {
    try {
      const response = await fetch(`http://127.0.0.1:${evePort}/eve/v1/health`);
      if (response.ok) break;
    } catch {}
    if (eveServer.exitCode !== null) throw new Error(`Local Eve server stopped early.\n${serverLog}`);
    if (Date.now() > deadline) throw new Error(`Local Eve server did not become ready.\n${serverLog}`);
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  while (true) {
    try {
      const response = await fetch(baseUrl);
      if (response.ok) break;
    } catch {}
    if (server.exitCode !== null) throw new Error(`Local server stopped early.\n${serverLog}`);
    if (Date.now() > deadline) throw new Error(`Local server did not become ready.\n${serverLog}`);
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

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

  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Delegation assessment" }).waitFor();
  assert.equal(await page.getByText("No tools enabled").count(), 1);
  await page.screenshot({ path: path.join(artifactDirectory, "assessment-desktop.png"), fullPage: true });

  const interactiveSizes = await page.locator("button, a, input[type=radio]").evaluateAll((elements) => elements.map((element) => {
    const box = element.getBoundingClientRect();
    return { tag: element.tagName, text: element.textContent?.trim(), width: box.width, height: box.height };
  }));
  assert.ok(interactiveSizes.filter((item) => item.tag === "BUTTON" || item.tag === "A").every((item) => item.height >= 40));

  for (let index = 0; index < 4; index += 1) await page.getByRole("button", { name: /Continue/ }).click();
  await page.getByRole("button", { name: /Generate receipt/ }).click();
  try {
    await page.getByText("Validated local result").waitFor({ timeout: 30_000 });
  } catch (error) {
    await page.screenshot({ path: path.join(artifactDirectory, "receipt-failure.png"), fullPage: true });
    throw new Error(`Receipt did not complete. Page: ${await page.locator("body").innerText()}\nBrowser errors: ${browserErrors.join(" | ")}\nServer: ${serverLog}`, { cause: error });
  }
  await page.getByRole("heading", { name: "Turn an outcome into reviewable learning." }).waitFor();
  await page.screenshot({ path: path.join(artifactDirectory, "outcome-desktop.png"), fullPage: true });

  await page.getByRole("button", { name: "Record outcome locally" }).click();
  await page.getByText("Inert until you approve.").waitFor();
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

  await page.getByRole("button", { name: "New case" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("heading", { name: "Delegation assessment" }).waitFor();
  await page.screenshot({ path: path.join(artifactDirectory, "assessment-mobile.png"), fullPage: true });

  assert.deepEqual(browserBlocked, []);
  assert.deepEqual(browserErrors, []);
} finally {
  if (browser) await browser.close();
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
  "recommendation.recorded", "outcome.recorded", "learning.proposed", "learning.approved",
]);
process.stdout.write(`${JSON.stringify({
  schemaVersion: "provider-free-browser-verification-v1",
  state: "passed",
  guardedProcesses: metrics.length,
  nonLoopbackAttempts: 0,
  browserNonLoopbackRequests: browserBlocked.length,
  eventTypes: ledger.map((event) => event.type),
  screenshots: ["assessment-desktop.png", "outcome-desktop.png", "learning-approved-desktop.png", "assessment-mobile.png"],
})}\n`);
fs.rmSync(scratch, { recursive: true, force: true });
