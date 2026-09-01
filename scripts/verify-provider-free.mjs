import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
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
const sessionNonce = randomBytes(32).toString("base64url");
const mcpPython = path.join(root, "mcp_server", ".venv", "Scripts", "python.exe");
fs.mkdirSync(metricsDirectory);
assert.ok(fs.existsSync(mcpPython), "Run `uv sync --project mcp_server --frozen` before provider-free verification.");

function reserveLoopbackPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") return reject(new Error("Could not reserve a loopback port."));
      server.close((error) => error ? reject(error) : resolve(address.port));
    });
  });
}

const mcpPort = await reserveLoopbackPort();
const mcpUrl = `http://127.0.0.1:${mcpPort}/mcp`;
const assessmentAnswers = { outcomeStakes: 3, repeatability: 4, specificationClarity: 4, verificationCost: 2, contextSensitivity: 3 };

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
  environment.AGENT_OR_NOT_SESSION_NONCE = sessionNonce;
  environment.AGENT_OR_NOT_DATA_DIR = scratch;
  environment.AGENT_OR_NOT_MEMORY_MCP_URL = mcpUrl;
  environment.NODE_ENV = "production";
  return environment;
}

async function startMcpServer() {
  const environment = safeEnvironment("mcp");
  delete environment.NODE_OPTIONS;
  const child = spawn(mcpPython, [path.join(root, "mcp_server", "server.py"), "--host", "127.0.0.1", "--port", String(mcpPort)], {
    cwd: root,
    env: { ...environment, PYTHONDONTWRITEBYTECODE: "1", PYTHONNOUSERSITE: "1" },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  let output = "";
  child.stdout.on("data", (chunk) => { output = `${output}${chunk}`.slice(-64 * 1024); });
  child.stderr.on("data", (chunk) => { output = `${output}${chunk}`.slice(-64 * 1024); });
  const deadline = performance.now() + 30_000;
  while (performance.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`MCP server exited before readiness (${child.exitCode}).\n${output}`);
    try {
      const response = await fetch(mcpUrl, { method: "GET", redirect: "error" });
      if ([200, 400, 405, 406].includes(response.status)) return { child, output: () => output };
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  child.kill();
  throw new Error(`MCP server readiness timed out.\n${output}`);
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
  const result = resultEvent?.data?.result;
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    const projection = events.map((event) => ({
      type: event.type,
      dataKeys: event.data && typeof event.data === "object" ? Object.keys(event.data) : [],
      code: event.data?.error?.code ?? event.data?.code,
      message: event.type === "session.failed" ? event.data?.message : undefined,
      details: event.type === "session.failed" ? event.data?.details : undefined,
    }));
    throw new Error(`No structured receipt result was emitted: ${JSON.stringify(projection)}`);
  }
  return result;
}

function assertCapabilityEnvelope(info) {
  const expectedDisabled = [
    "agent", "ask_question", "bash", "read_file", "task_cancel",
    "task_update", "todo", "web_fetch", "web_search", "write_file",
  ];
  const names = (info?.tools?.disabledFramework ?? []).map((value) => typeof value === "string" ? value : value.slug ?? value.name).sort();
  assert.deepEqual(names, expectedDisabled);
  const emptyCollections = {
    schedules: info?.schedules,
    hooks: info?.hooks,
  };
  for (const [label, collection] of Object.entries(emptyCollections)) {
    assert.ok(Array.isArray(collection));
    assert.equal(collection.length, 0, `${label} was not empty: ${JSON.stringify(collection)}`);
  }
  assert.ok(JSON.stringify(info?.tools?.authored).includes("derive_delegation_evidence"), `Missing authored evidence tool: ${JSON.stringify(info?.tools?.authored)}`);
  assert.ok(JSON.stringify(info?.tools?.available).includes("load_skill"), `Missing load_skill: ${JSON.stringify(info?.tools?.available)}`);
  assert.ok(JSON.stringify(info?.connections).includes("governed-memory"), `Missing governed-memory connection: ${JSON.stringify(info?.connections)}`);
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

function expectedHarnessEnvelope(callIndex, stage, fixtureScenario, outputKind, correctionRequested) {
  const discovered = stage === "evidence" || stage === "final";
  const toolNames = ["connection_search", "derive_delegation_evidence", "final_output", "load_skill"];
  if (discovered) toolNames.push("governed-memory__lookup_approved_guidance");
  toolNames.sort();
  return {
    schemaVersion: "provider-free-model-call-v3",
    invocationCount: callIndex,
    stage,
    classification: "eve-bounded-guidance-harness-v1",
    toolDefinitionCount: discovered ? 5 : 4,
    toolNames,
    instructionToolDefinitionCount: 1,
    discoveryToolDefinitionCount: 1,
    localReadOnlyToolDefinitionCount: 1,
    mcpReadOnlyToolDefinitionCount: discovered ? 1 : 0,
    finalOutputToolDefinitionCount: 1,
    actionCapableToolDefinitionCount: discovered ? 2 : 1,
    modelId: "agent-or-not-fixture",
    fixtureScenario,
    outputKind,
    correctionRequested,
  };
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

function sessionHeaders(origin, json = false) {
  return {
    ...(json ? { "content-type": "application/json" } : {}),
    "origin": origin,
    "sec-fetch-site": "same-origin",
    "x-agent-or-not-session": sessionNonce,
  };
}

let server;
let mcpServer;
try {
  const buildOutput = runBuild();
  mcpServer = await startMcpServer();
  server = await startServer();
  assert.equal(server.child.exitCode, null, "The spawned Eve process was not live at readiness.");
  const rejectedDriveBy = await fetch(`${server.origin}/eve/v1/session`, {
    method: "POST",
    headers: {
      "content-type": "text/plain",
      "origin": "https://attacker.invalid",
      "sec-fetch-site": "cross-site",
    },
    redirect: "error",
    body: JSON.stringify({ message: "Create a drive-by session.", mode: "task" }),
  });
  assert.equal(rejectedDriveBy.status, 401);
  assert.equal(readModelCalls().length, 0, "A rejected drive-by request reached the model boundary.");
  assert.equal(server.child.exitCode, null, "The spawned Eve process stopped during rejection verification.");

  const infoResponse = await fetch(`${server.origin}/eve/v1/info`, {
    headers: sessionHeaders(server.origin),
    redirect: "error",
  });
  assert.equal(infoResponse.status, 200);
  assertCapabilityEnvelope(await infoResponse.json());

  const createResponse = await fetch(`${server.origin}/eve/v1/session`, {
    method: "POST",
    headers: sessionHeaders(server.origin, true),
    redirect: "error",
    body: JSON.stringify({
      message: `Load the delegation-guidance skill, use the bounded read-only evidence and governed-memory capabilities exactly once, then return one Recommendation Receipt. Runtime metadata must be ${JSON.stringify({ providerMode: "fixture", modelId: "agent-or-not-fixture" })}. The application will assign receipt and assessment identifiers after validation.\nASSESSMENT_JSON:${JSON.stringify({ answers: assessmentAnswers })}`,
      mode: "task",
    }),
  });
  assert.equal(createResponse.status, 202);
  const created = await createResponse.json();
  const sessionId = created.sessionId ?? createResponse.headers.get("x-eve-session-id");
  assert.ok(sessionId);

  const streamResponse = await fetch(`${server.origin}/eve/v1/session/${encodeURIComponent(sessionId)}/stream`, {
    headers: sessionHeaders(server.origin),
    redirect: "error",
  });
  assert.equal(streamResponse.status, 200);
  const events = await readEventsUntil(streamResponse.body, new Set(["session.completed", "session.failed"]));
  const receipt = parseRecommendationReceipt(receiptFromEvents(events));
  const actionNames = events.flatMap((event) => event.type === "actions.requested"
    ? event.data.actions.map((action) => action.kind === "load-skill" ? "load_skill" : action.toolName)
    : []);
  assert.deepEqual(actionNames, ["load_skill", "connection_search", "derive_delegation_evidence", "governed-memory__lookup_approved_guidance"]);
  assert.equal(events.filter((event) => event.type === "action.result" && event.data.status === "completed").length, 4);
  const actionLifecycle = events.filter((event) => event.type === "actions.requested" || event.type === "action.result").map((event) => event.type === "actions.requested"
    ? { type: event.type, actions: event.data.actions.map((action) => ({ callId: action.callId, kind: action.kind, toolName: action.toolName, inputKeys: Object.keys(action.input ?? {}) })) }
    : { type: event.type, status: event.data.status, callId: event.data.result.callId, kind: event.data.result.kind, name: event.data.result.name, toolName: event.data.result.toolName });
  assert.equal(events.filter((event) => event.type === "session.completed").length, 1);
  const modelCalls = readModelCalls().slice(0, 3);
  assert.deepEqual(modelCalls, [
    expectedHarnessEnvelope(1, "prepare", "valid", "tool-calls", false),
    expectedHarnessEnvelope(2, "evidence", "valid", "tool-calls", false),
    expectedHarnessEnvelope(3, "final", "valid", "valid", false),
  ]);

  const cancelCreateResponse = await fetch(`${server.origin}/eve/v1/session`, {
    method: "POST",
    headers: sessionHeaders(server.origin, true),
    redirect: "error",
    body: JSON.stringify({ message: "CANCEL_ME_PROVIDER_FREE", mode: "task" }),
  });
  assert.equal(cancelCreateResponse.status, 202);
  const cancelCreated = await cancelCreateResponse.json();
  const cancelSessionId = cancelCreated.sessionId ?? cancelCreateResponse.headers.get("x-eve-session-id");
  assert.ok(cancelSessionId);
  const cancelStreamResponse = await fetch(`${server.origin}/eve/v1/session/${encodeURIComponent(cancelSessionId)}/stream`, {
    headers: sessionHeaders(server.origin),
    redirect: "error",
  });
  assert.equal(cancelStreamResponse.status, 200);
  const cancelEventsPromise = readEventsUntil(cancelStreamResponse.body, new Set(["session.waiting", "session.failed"]));
  await waitForModelCallCount(4);
  const cancelResponse = await fetch(`${server.origin}/eve/v1/session/${encodeURIComponent(cancelSessionId)}/cancel`, {
    method: "POST",
    headers: sessionHeaders(server.origin, true),
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
  const cancellationModelCall = readModelCalls()[3];
  assert.deepEqual(cancellationModelCall, expectedHarnessEnvelope(4, "cancel-probe", "valid", "cancelled", false));
  const stoppedProcessIds = await stopServer(server.child);
  server = undefined;
  const stoppedMcpProcessIds = await stopServer(mcpServer.child);
  mcpServer = undefined;
  const egress = assertEgressMetrics();
  process.stdout.write(`${JSON.stringify({
    schemaVersion: "provider-free-eve-verification-v1",
    state: "passed",
    build: "passed",
    origin: "loopback",
    rejectedDriveByStatus: rejectedDriveBy.status,
    rejectedDriveByModelCalls: 0,
    recommendation: receipt.recommendation,
    capabilityActionNames: actionNames,
    actionLifecycle,
    receiptId: receipt.receiptId,
    modelCalls,
    cancellationModelCall,
    cancellation: "turn.cancelled -> session.waiting",
    structuredResultEvent: "result.completed",
    terminalEvent: "session.completed",
    guardedProcesses: egress.length,
    nonLoopbackAttempts: 0,
    stoppedProcessIds,
    stoppedMcpProcessIds,
    buildOutput: buildOutput.split(/\r?\n/u).slice(-3),
  })}\n`);
} finally {
  if (server?.child && server.child.exitCode === null) server.child.kill();
  if (mcpServer?.child && mcpServer.child.exitCode === null) mcpServer.child.kill();
  fs.rmSync(scratch, { recursive: true, force: true });
}
