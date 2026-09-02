import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "agent-or-not-evaluation-ui-"));
const dataDirectory = path.join(scratch, "data");
const allowedEnvironmentNames = [
  "ALLUSERSPROFILE", "APPDATA", "ComSpec", "CommonProgramFiles", "CommonProgramFiles(x86)",
  "CommonProgramW6432", "HOMEDRIVE", "HOMEPATH", "LOCALAPPDATA", "NUMBER_OF_PROCESSORS",
  "OS", "Path", "PATHEXT", "PROCESSOR_ARCHITECTURE", "PROCESSOR_IDENTIFIER",
  "PROCESSOR_LEVEL", "PROCESSOR_REVISION", "ProgramData", "ProgramFiles", "ProgramFiles(x86)",
  "ProgramW6432", "PSModulePath", "PUBLIC", "SystemDrive", "SystemRoot", "TEMP", "TMP",
  "USERDOMAIN", "USERNAME", "USERPROFILE", "windir",
];

function reserveLoopbackPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      assert.ok(address && typeof address !== "string");
      server.close((error) => error ? reject(error) : resolve(address.port));
    });
  });
}

async function waitForServer(url, processOutput) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The loopback server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Evaluation server did not become ready.\n${processOutput()}`);
}

const port = await reserveLoopbackPort();
const baseUrl = `http://127.0.0.1:${port}`;
const environment = {};
for (const name of allowedEnvironmentNames) {
  if (process.env[name] !== undefined) environment[name] = process.env[name];
}
environment.AGENT_OR_NOT_PROVIDER_MODE = "fixture";
environment.AGENT_OR_NOT_DATA_DIR = dataDirectory;
environment.NEXT_TELEMETRY_DISABLED = "1";
environment.NODE_ENV = "production";
const forwardedCredentialVariables = Object.keys(environment).filter((name) => /(?:api.?key|credential|secret|token)/iu.test(name));
assert.deepEqual(forwardedCredentialVariables, []);

let serverOutput = "";
const server = spawn(process.execPath, [
  nextBin,
  "start",
  "--hostname",
  "127.0.0.1",
  "--port",
  String(port),
], {
  cwd: root,
  env: environment,
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true,
});
server.stdout.on("data", (chunk) => { serverOutput += chunk.toString(); });
server.stderr.on("data", (chunk) => { serverOutput += chunk.toString(); });

let browser;
try {
  await waitForServer(`${baseUrl}/evaluation`, () => serverOutput);
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const nonLoopbackRequests = [];
  const observedRequests = [];
  const browserErrors = [];
  page.on("request", (request) => {
    observedRequests.push({ method: request.method(), url: request.url() });
    const url = new URL(request.url());
    if ((url.protocol === "http:" || url.protocol === "https:")
      && url.hostname !== "127.0.0.1"
      && url.hostname !== "localhost") {
      nonLoopbackRequests.push(request.url());
    }
  });
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));

  await page.goto(`${baseUrl}/evaluation`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Test the boundaries, not the story." }).waitFor();
  await page.getByText("All expectations passed", { exact: true }).waitFor();
  await page.getByText("12 / 0", { exact: true }).waitFor();
  await page.getByText("not measured", { exact: true }).waitFor();
  assert.equal(await page.getByTestId("evaluation-scenario-list").locator(":scope > li").count(), 12);

  const comparison = page.getByTestId("evaluation-comparison");
  const comparisonSummary = comparison.locator(":scope > summary");
  await comparisonSummary.focus();
  await page.keyboard.press("Enter");
  assert.equal(await comparison.evaluate((element) => element.open), true, "Keyboard activation must open the optional comparison.");
  await page.getByRole("heading", { name: "Four bounded traces, one inspectable comparison" }).waitFor();
  await page.getByLabel("Comparison boundary").waitFor();
  await page.getByRole("img", { name: "Synthetic deterministic recommendation trace comparison" }).waitFor();
  assert.equal(await page.getByRole("list", { name: "Synthetic deterministic comparison traces" }).locator(":scope > li").count(), 4);
  await page.getByText("2 of 4 traces agree on ai-assisted; the remaining traces disagree.", { exact: true }).first().waitFor();

  const tableFallback = page.getByTestId("comparison-table-fallback");
  await tableFallback.locator(":scope > summary").focus();
  await page.keyboard.press("Enter");
  assert.equal(await tableFallback.evaluate((element) => element.open), true, "Keyboard activation must open the text-table fallback.");
  await page.getByRole("table", { name: "Text alternative for the synthetic deterministic comparison graph" }).waitFor();

  const desktopWidth = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  assert.ok(desktopWidth.scroll <= desktopWidth.client, `Desktop layout overflowed: ${JSON.stringify(desktopWidth)}`);
  const comparisonBeforeRerun = await comparison.innerText();
  await page.getByRole("button", { name: "Run deterministic suite" }).click();
  await page.getByText("All expectations passed", { exact: true }).waitFor();
  const comparisonAfterRerun = await comparison.innerText();
  assert.equal(comparisonAfterRerun, comparisonBeforeRerun, "The comparison projection changed across a deterministic rerun.");
  await page.screenshot({ path: path.join(scratch, "evaluation-comparison-desktop.png"), fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  const width = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  assert.ok(width.scroll <= width.client, `Mobile layout overflowed: ${JSON.stringify(width)}`);
  await page.getByText("On this viewport, the graph is represented by the stacked traces below.", { exact: true }).waitFor();
  await page.screenshot({ path: path.join(scratch, "evaluation-comparison-mobile.png"), fullPage: true });

  const mutationRequests = observedRequests.filter((request) => !["GET", "HEAD", "OPTIONS"].includes(request.method));
  const productFiles = fs.existsSync(dataDirectory) ? fs.readdirSync(dataDirectory, { recursive: true }) : [];
  assert.deepEqual(nonLoopbackRequests, []);
  assert.deepEqual(mutationRequests, [], "The read-only evaluation view made a network write.");
  assert.deepEqual(productFiles, [], "The read-only evaluation view mutated product storage.");
  assert.deepEqual(browserErrors, [], "The evaluation browser run reported console or page errors.");
  assert.ok(fs.statSync(path.join(scratch, "evaluation-comparison-desktop.png")).size > 0);
  assert.ok(fs.statSync(path.join(scratch, "evaluation-comparison-mobile.png")).size > 0);

  process.stdout.write(`${JSON.stringify({
    schemaVersion: "provider-free-evaluation-browser-v2",
    state: "passed",
    route: "/evaluation",
    scenarios: 12,
    passFail: "12/0",
    desktopViewport: "1440x1000",
    mobileViewport: "390x844",
    horizontalOverflow: false,
    comparisonTraces: 4,
    agreement: "2/4 ai-assisted with two divergent traces",
    keyboardReadable: true,
    accessibleGraphAndTableLabels: true,
    deterministicRerun: true,
    nonLoopbackRequests: 0,
    networkWrites: 0,
    productMutations: 0,
    browserErrors: 0,
    credentialVariablesForwarded: forwardedCredentialVariables.length,
    screenshotsCaptured: 2,
  })}\n`);
} finally {
  await browser?.close();
  if (!server.killed) server.kill();
  await Promise.race([
    once(server, "exit"),
    new Promise((resolve) => setTimeout(resolve, 2_000)),
  ]);
  fs.rmSync(scratch, { recursive: true, force: true });
}
