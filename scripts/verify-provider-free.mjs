import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseRecommendationReceipt,
} from "../src/domain/recommendation.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const eveBin = path.join(root, "node_modules", "eve", "bin", "eve.js");
const guardPath = path.join(root, "scripts", "provider-free-egress-guard.cjs");
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "agent-or-not-provider-free-"));
const evidencePath = path.join(scratch, "model-call.json");
const metricsDirectory = path.join(scratch, "egress");
fs.mkdirSync(metricsDirectory);

const allowedEnvironmentNames = [
  "ALLUSERSPROFILE", "APPDATA", "ComSpec", "CommonProgramFiles", "CommonProgramFiles(x86)",
  "CommonProgramW6432", "HOMEDRIVE", "HOMEPATH", "LOCALAPPDATA", "NUMBER_OF_PROCESSORS",
  "OS", "Path", "PATHEXT", "PROCESSOR_ARCHITECTURE", "PROCESSOR_IDENTIFIER",
  "PROCESSOR_LEVEL", "PROCESSOR_REVISION", "ProgramData", "ProgramFiles", "ProgramFiles(x86)",
  "ProgramW6432", "PSModulePath", "PUBLIC", "SystemDrive", "SystemRoot", "TEMP", "TMP",
  "USERDOMAIN", "USERNAME", "USERPROFILE", "windir",
];

function safeEnvironment(label) {
  const environment = {};
  for (const name of allowedEnvironmentNames) {
    if (process.env[name] !== undefined) environment[name] = process.env[name];
  }
  environment.NODE_OPTIONS = `--require=${guardPath}`;
  environment.AGENT_OR_NOT_EGRESS_METRICS_DIR = metricsDirectory;
  environment.AGENT_OR_NOT_EGRESS_METRICS_LABEL = label;
  environment.AGENT_OR_NOT_FIXTURE_EVIDENCE_PATH = evidencePath;
  environment.NODE_ENV = "production";
  return environment;
}

function runBuild() {
  const result = spawnSync(process.execPath, [eveBin, "build"], {
    cwd: root,
    env: safeEnvironment("build"),
    encoding: "utf8",
    timeout: 120_000,
    windowsHide: true,
  });
  assert.equal(result.status, 0, `Eve build failed.\n${result.stdout}\n${result.stderr}`);
  return `${result.stdout}\n${result.stderr}`.trim();
}

function startServer() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [eveBin, "start", "--host", "127.0.0.1", "--port", "0"], {
      cwd: root,
      env: safeEnvironment("start"),
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let output = "";
    const timeout = setTimeout(() => reject(new Error(`Eve start timed out.\n${output}`)), 90_000);
    const observe = (chunk) => {
      output = `${output}${chunk}`.slice(-64 * 1024);
      const origin = output.match(/https?:\/\/(?:127\.0\.0\.1|localhost):\d+/u)?.[0];
      if (!origin) return;
      clearTimeout(timeout);
      resolve({ child, origin, output: () => output });
    };
    child.stdout.on("data", observe);
    child.stderr.on("data", observe);
    child.once("error", (error) => { clearTimeout(timeout); reject(error); });
    child.once("exit", (code) => { clearTimeout(timeout); reject(new Error(`Eve exited before readiness (${code}).\n${output}`)); });
  });
}

function readProcessIds(parentPid) {
  const command = `$all=Get-CimInstance Win32_Process; $frontier=@(${parentPid}); $seen=@(); while($frontier.Count -gt 0){$next=@(); foreach($pidValue in $frontier){foreach($child in $all|Where-Object ParentProcessId -eq $pidValue){if($seen -notcontains $child.ProcessId){$seen += $child.ProcessId; $next += $child.ProcessId}}}; $frontier=$next}; $seen -join ','`;
  const result = spawnSync("powershell", ["-NoProfile", "-Command", command], { encoding: "utf8", windowsHide: true });
  if (result.status !== 0) throw new Error(`Process-tree inspection failed: ${result.stderr}`);
  return result.stdout.trim().split(",").filter(Boolean).map(Number);
}

async function stopServer(child) {
  const tracked = [child.pid, ...readProcessIds(child.pid)];
  const exited = new Promise((resolve) => child.once("exit", resolve));
  child.kill();
  await Promise.race([exited, new Promise((_, reject) => setTimeout(() => reject(new Error("Eve shutdown timed out.")), 15_000))]);
  await new Promise((resolve) => setTimeout(resolve, 500));
  const stillRunning = tracked.filter((pid) => {
    try { process.kill(pid, 0); return true; } catch { return false; }
  });
  assert.deepEqual(stillRunning, [], `Residual Eve processes: ${stillRunning.join(", ")}`);
  return tracked;
}

async function readEventsUntil(body, terminalTypes, timeoutMs = 60_000) {
  assert.ok(body);
  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const events = [];
  let buffered = "";
  const deadline = performance.now() + timeoutMs;
  try {
    while (performance.now() < deadline) {
      let timer;
      const remaining = deadline - performance.now();
      const next = await Promise.race([
        reader.read(),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error("Eve stream terminal timed out.")), remaining);
        }),
      ]).finally(() => clearTimeout(timer));
      if (next.done) break;
      buffered += decoder.decode(next.value, { stream: true });
      let newline = buffered.indexOf("\n");
      while (newline >= 0) {
        const line = buffered.slice(0, newline).trim();
        buffered = buffered.slice(newline + 1);
        if (line) events.push(JSON.parse(line));
        newline = buffered.indexOf("\n");
      }
      if (events.some((event) => terminalTypes.has(event.type))) {
        await reader.cancel("terminal-observed");
        return events;
      }
    }
    throw new Error(`Eve stream ended without a terminal event: ${JSON.stringify(events)}`);
  } finally {
    reader.releaseLock();
  }
}

function readModelCalls() {
  if (!fs.existsSync(evidencePath)) return [];
  return fs.readFileSync(evidencePath, "utf8")
    .split(/\r?\n/u)
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line));
}

async function waitForModelCallCount(expectedCount, timeoutMs = 10_000) {
  const deadline = performance.now() + timeoutMs;
  while (performance.now() < deadline) {
    if (readModelCalls().length >= expectedCount) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for ${expectedCount} provider-free model calls.`);
}

function receiptFromEvents(events) {
  const resultEvent = events.find((event) => event.type === "result.completed");
  const result = resultEvent?.data?.result ?? resultEvent?.data?.value ?? resultEvent?.data;
  if (result && typeof result === "object") return result;
  const message = events.find((event) => event.type === "message.completed")?.data?.message;
  if (typeof message !== "string") {
    const projection = events.map((event) => ({
      type: event.type,
      dataKeys: event.data && typeof event.data === "object" ? Object.keys(event.data) : [],
      code: event.data?.error?.code ?? event.data?.code,
      message: event.type === "session.failed" ? event.data?.message : undefined,
      details: event.type === "session.failed" ? event.data?.details : undefined,
    }));
    throw new Error(`No receipt event was emitted: ${JSON.stringify(projection)}`);
  }
  return JSON.parse(message);
}

function assertCapabilityEnvelope(info) {
  const expectedDisabled = [
    "agent", "ask_question", "bash", "load_skill", "read_file", "task_cancel",
    "task_update", "todo", "web_fetch", "web_search", "write_file",
  ];
  const names = (info?.tools?.disabledFramework ?? []).map((value) => typeof value === "string" ? value : value.slug ?? value.name).sort();
  assert.deepEqual(names, expectedDisabled);
  const emptyCollections = {
    authoredTools: info?.tools?.authored,
    availableTools: info?.tools?.available,
    connections: info?.connections,
    schedules: info?.schedules,
    hooks: info?.hooks,
  };
  for (const [label, collection] of Object.entries(emptyCollections)) {
    assert.ok(Array.isArray(collection));
    assert.equal(collection.length, 0, `${label} was not empty: ${JSON.stringify(collection)}`);
  }
  assert.deepEqual(info?.tools?.dynamic, [{
    logicalPath: "eve:framework/connection-search-dynamic",
    sourceId: "eve:connection-search-dynamic",
    sourceKind: "module",
    eventNames: ["step.started"],
    origin: "framework",
    slug: "connection",
  }]);
  assert.ok(info?.subagents == null || info.subagents.total === 0);
}

function assertEgressMetrics() {
  const files = fs.readdirSync(metricsDirectory).filter((name) => name.endsWith(".json"));
  assert.ok(files.length >= 2, "Missing guarded build/start process evidence.");
  const records = files.map((name) => JSON.parse(fs.readFileSync(path.join(metricsDirectory, name), "utf8")));
  assert.ok(records.some((record) => record.label === "build"));
  assert.ok(records.some((record) => record.label === "start"));
  assert.ok(records.every((record) => record.attempted === 0 && record.blocked === 0));
  return records;
}

let server;
try {
  const buildOutput = runBuild();
  server = await startServer();
  const infoResponse = await fetch(`${server.origin}/eve/v1/info`, { redirect: "error" });
  assert.equal(infoResponse.status, 200);
  assertCapabilityEnvelope(await infoResponse.json());

  const createResponse = await fetch(`${server.origin}/eve/v1/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    redirect: "error",
    body: JSON.stringify({
      message: "Return one provider-free Recommendation Receipt for a well-specified, reviewable drafting task.",
      mode: "task",
    }),
  });
  assert.equal(createResponse.status, 202);
  const created = await createResponse.json();
  const sessionId = created.sessionId ?? createResponse.headers.get("x-eve-session-id");
  assert.ok(sessionId);

  const streamResponse = await fetch(`${server.origin}/eve/v1/session/${encodeURIComponent(sessionId)}/stream`, { redirect: "error" });
  assert.equal(streamResponse.status, 200);
  const events = await readEventsUntil(streamResponse.body, new Set(["session.completed", "session.failed"]));
  const receipt = parseRecommendationReceipt(receiptFromEvents(events));
  assert.equal(events.filter((event) => event.type === "session.completed").length, 1);
  const modelCall = readModelCalls()[0];
  assert.deepEqual(modelCall, {
    schemaVersion: "provider-free-model-call-v1",
    invocationCount: 1,
    toolDefinitionCount: 0,
    modelId: "agent-or-not-fixture",
  });

  const cancelCreateResponse = await fetch(`${server.origin}/eve/v1/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    redirect: "error",
    body: JSON.stringify({ message: "CANCEL_ME_PROVIDER_FREE", mode: "task" }),
  });
  assert.equal(cancelCreateResponse.status, 202);
  const cancelCreated = await cancelCreateResponse.json();
  const cancelSessionId = cancelCreated.sessionId ?? cancelCreateResponse.headers.get("x-eve-session-id");
  assert.ok(cancelSessionId);
  const cancelStreamResponse = await fetch(`${server.origin}/eve/v1/session/${encodeURIComponent(cancelSessionId)}/stream`, { redirect: "error" });
  assert.equal(cancelStreamResponse.status, 200);
  const cancelEventsPromise = readEventsUntil(cancelStreamResponse.body, new Set(["session.waiting", "session.failed"]));
  await waitForModelCallCount(2);
  const cancelResponse = await fetch(`${server.origin}/eve/v1/session/${encodeURIComponent(cancelSessionId)}/cancel`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    redirect: "error",
    body: "{}",
  });
  assert.ok([200, 202].includes(cancelResponse.status));
  const cancelPayload = await cancelResponse.json();
  assert.equal(cancelPayload.status, "accepted");
  const cancelEvents = await cancelEventsPromise;
  assert.equal(cancelEvents.filter((event) => event.type === "turn.cancelled").length, 1);
  assert.equal(cancelEvents.filter((event) => event.type === "session.waiting").length, 1);
  assert.equal(cancelEvents.filter((event) => event.type === "session.failed").length, 0);
  const cancellationModelCall = readModelCalls()[1];
  assert.deepEqual(cancellationModelCall, {
    schemaVersion: "provider-free-model-call-v1",
    invocationCount: 2,
    toolDefinitionCount: 0,
    modelId: "agent-or-not-fixture",
  });
  const stoppedProcessIds = await stopServer(server.child);
  server = undefined;
  const egress = assertEgressMetrics();
  process.stdout.write(`${JSON.stringify({
    schemaVersion: "provider-free-eve-verification-v1",
    state: "passed",
    build: "passed",
    origin: "loopback",
    recommendation: receipt.recommendation,
    receiptId: receipt.receiptId,
    modelCall,
    cancellationModelCall,
    cancellation: "turn.cancelled -> session.waiting",
    terminalEvent: "session.completed",
    guardedProcesses: egress.length,
    nonLoopbackAttempts: 0,
    stoppedProcessIds,
    buildOutput: buildOutput.split(/\r?\n/u).slice(-3),
  })}\n`);
} finally {
  if (server?.child && server.child.exitCode === null) server.child.kill();
  fs.rmSync(scratch, { recursive: true, force: true });
}
