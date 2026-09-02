import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "agent-or-not-atmosphere-"));
const metricsDirectory = path.join(scratch, "metrics");
const dataDirectory = path.join(scratch, "data");
fs.mkdirSync(metricsDirectory);
fs.mkdirSync(dataDirectory);

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
  throw new Error(`Atmosphere verification server did not become ready.\n${processOutput()}`);
}

function isAllowedBrowserUrl(value) {
  const url = new URL(value);
  return ["data:", "blob:", "about:"].includes(url.protocol)
    || ["127.0.0.1", "localhost", "::1"].includes(url.hostname);
}

assert.ok(
  fs.existsSync(path.join(root, ".next", "BUILD_ID")),
  "Run `pnpm build` before the visual-atmosphere regression check.",
);

const port = await reserveLoopbackPort();
const baseUrl = `http://127.0.0.1:${port}`;
const environment = {};
for (const name of allowedEnvironmentNames) {
  if (process.env[name] !== undefined) environment[name] = process.env[name];
}
environment.AGENT_OR_NOT_DATA_DIR = dataDirectory;
environment.AGENT_OR_NOT_EGRESS_METRICS_DIR = metricsDirectory;
environment.AGENT_OR_NOT_EGRESS_METRICS_LABEL = "verify";
environment.AGENT_OR_NOT_PROVIDER_MODE = "fixture";
environment.AGENT_OR_NOT_SESSION_NONCE = randomBytes(32).toString("base64url");
environment.NEXT_TELEMETRY_DISABLED = "1";
environment.NODE_ENV = "production";
environment.NODE_OPTIONS = `--require=${path.join(root, "scripts", "provider-free-egress-guard.cjs")}`;

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

const viewports = [
  { name: "desktop", width: 1440, height: 1000 },
  { name: "mobile", width: 390, height: 844 },
];
const routes = ["/", "/evaluation"];
const motionPreferences = ["no-preference", "reduce"];
const scenarioEvidence = [];
let browser;
let verificationError;

try {
  await waitForServer(baseUrl, () => serverOutput);
  browser = await chromium.launch({ headless: true });

  for (const viewport of viewports) {
    for (const reducedMotion of motionPreferences) {
      for (const routePath of routes) {
        const context = await browser.newContext({
          viewport: { width: viewport.width, height: viewport.height },
          reducedMotion,
        });
        const nonLoopbackRequests = [];
        await context.route("**/*", async (route) => {
          const requestUrl = route.request().url();
          if (isAllowedBrowserUrl(requestUrl)) {
            await route.continue();
            return;
          }
          nonLoopbackRequests.push(requestUrl);
          await route.abort("blockedbyclient");
        });

        const page = await context.newPage();
        await page.goto(`${baseUrl}${routePath}`, { waitUntil: "networkidle" });
        await page.locator('.visual-atmosphere[data-renderer="local-css"]').waitFor();
        await page.waitForTimeout(250);

        const atmosphere = page.locator(".visual-atmosphere");
        assert.equal(await atmosphere.getAttribute("aria-hidden"), "true");
        assert.equal(await atmosphere.locator("iframe").count(), 0, "The atmosphere must not render an iframe.");
        assert.equal(await page.locator("iframe").count(), 0, `${routePath} rendered an unexpected iframe.`);

        const presentation = await atmosphere.evaluate((element) => {
          const style = getComputedStyle(element);
          return { pointerEvents: style.pointerEvents, position: style.position };
        });
        assert.deepEqual(presentation, { pointerEvents: "none", position: "fixed" });

        const animationNames = await atmosphere.locator(":scope > div").evaluateAll((elements) => (
          elements.map((element) => getComputedStyle(element).animationName)
        ));
        if (reducedMotion === "reduce") {
          assert.ok(animationNames.every((name) => name === "none"), "Reduced motion left an atmosphere animation active.");
        } else {
          assert.ok(animationNames.some((name) => name !== "none"), "Ordinary motion did not render the local atmosphere motion.");
        }

        const width = await page.evaluate(() => ({
          client: document.documentElement.clientWidth,
          scroll: document.documentElement.scrollWidth,
        }));
        assert.ok(width.scroll <= width.client, `${routePath} overflowed ${viewport.name}: ${JSON.stringify(width)}`);
        assert.deepEqual(nonLoopbackRequests, [], `${routePath} attempted non-loopback browser requests.`);

        scenarioEvidence.push({
          route: routePath,
          viewport: `${viewport.width}x${viewport.height}`,
          motion: reducedMotion,
          nonLoopbackRequests: nonLoopbackRequests.length,
          iframes: 0,
          horizontalOverflow: false,
        });
        await context.close();
      }
    }
  }
} catch (error) {
  verificationError = error;
} finally {
  await browser?.close();
  if (!server.killed) server.kill();
  await Promise.race([
    server.exitCode === null ? once(server, "exit") : Promise.resolve(),
    new Promise((resolve) => setTimeout(resolve, 2_000)),
  ]);
}

try {
  if (verificationError) throw verificationError;
  const metrics = fs.readdirSync(metricsDirectory)
    .filter((name) => name.endsWith(".json"))
    .map((name) => JSON.parse(fs.readFileSync(path.join(metricsDirectory, name), "utf8")));
  assert.ok(metrics.length >= 1, "The guarded production server did not emit egress metrics.");
  assert.ok(metrics.every((record) => record.attempted === 0 && record.blocked === 0));
  assert.equal(scenarioEvidence.length, 8);
  process.stdout.write(`${JSON.stringify({
    schemaVersion: "local-visual-atmosphere-verification-v1",
    state: "passed",
    renderer: "local-css",
    scenarios: scenarioEvidence,
    browserNonLoopbackRequests: 0,
    serverNonLoopbackAttempts: 0,
    remoteLoadingIframes: 0,
    credentialVariablesForwarded: 0,
  })}\n`);
} finally {
  fs.rmSync(scratch, { recursive: true, force: true });
}
