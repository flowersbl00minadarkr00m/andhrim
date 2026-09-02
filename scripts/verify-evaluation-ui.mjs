import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");
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
environment.NEXT_TELEMETRY_DISABLED = "1";
environment.NODE_ENV = "production";

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
  page.on("request", (request) => {
    const url = new URL(request.url());
    if ((url.protocol === "http:" || url.protocol === "https:")
      && url.hostname !== "127.0.0.1"
      && url.hostname !== "localhost") {
      nonLoopbackRequests.push(request.url());
    }
  });

  await page.goto(`${baseUrl}/evaluation`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Test the boundaries, not the story." }).waitFor();
  await page.getByText("All expectations passed", { exact: true }).waitFor();
  await page.getByText("12 / 0", { exact: true }).waitFor();
  await page.getByText("not measured", { exact: true }).waitFor();
  assert.equal(await page.locator("ol > li").count(), 12);

  await page.getByRole("button", { name: "Run deterministic suite" }).click();
  await page.getByText("All expectations passed", { exact: true }).waitFor();

  await page.setViewportSize({ width: 390, height: 844 });
  const width = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  assert.ok(width.scroll <= width.client, `Mobile layout overflowed: ${JSON.stringify(width)}`);
  assert.deepEqual(nonLoopbackRequests, []);

  process.stdout.write(`${JSON.stringify({
    schemaVersion: "provider-free-evaluation-browser-v1",
    state: "passed",
    route: "/evaluation",
    scenarios: 12,
    passFail: "12/0",
    desktopViewport: "1440x1000",
    mobileViewport: "390x844",
    horizontalOverflow: false,
    nonLoopbackRequests: 0,
    credentialVariablesForwarded: 0,
  })}\n`);
} finally {
  await browser?.close();
  if (!server.killed) server.kill();
  await Promise.race([
    once(server, "exit"),
    new Promise((resolve) => setTimeout(resolve, 2_000)),
  ]);
}
