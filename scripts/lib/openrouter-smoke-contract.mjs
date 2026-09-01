import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { z } from "zod";

export const SMOKE_SESSION_BUDGET = 2;
export const SMOKE_REPORT_PATH = path.join("output", "openrouter-smoke-report.json");
export const PROCESS_INSPECTION_TIMEOUT_MS = 5_000;
export const FINAL_OUTPUT_ENVELOPE_CLASSIFICATION = "eve-final-output-only-v1";

const explicitModelIdSchema = z.string().regex(/^[a-z0-9._-]+\/[a-z0-9._:-]+$/iu).max(120);
const runtimeModelIdSchema = z.union([explicitModelIdSchema, z.literal("agent-or-not-fixture")]);
const timestampSchema = z.string().datetime({ offset: true });

export class SmokeContractError extends Error {
  constructor(errorClass, code) {
    super(code);
    this.name = "SmokeContractError";
    this.errorClass = errorClass;
    this.code = code;
  }
}

export const smokeModelCallSchema = z.object({
  timestamp: timestampSchema,
  modelId: runtimeModelIdSchema,
  callIndex: z.number().int().min(1).max(SMOKE_SESSION_BUDGET),
  classification: z.literal(FINAL_OUTPUT_ENVELOPE_CLASSIFICATION),
  toolDefinitionCount: z.literal(1),
  toolNames: z.tuple([z.literal("final_output")]),
  actionCapableToolDefinitionCount: z.literal(0),
}).strict();

const safeErrorSchema = z.object({
  class: z.enum(["configuration", "build", "service", "browser", "validation", "evidence", "cleanup", "internal"]),
  code: z.enum([
    "LIVE_OPT_IN_INCOMPLETE",
    "OPENROUTER_MODE_REQUIRED",
    "EXPLICIT_MODEL_REQUIRED",
    "UNKNOWN_ARGUMENT",
    "BUILD_FAILED",
    "SERVICE_START_FAILED",
    "BROWSER_FAILED",
    "RECEIPT_NOT_OBSERVED",
    "ATTEMPT_BUDGET_EXCEEDED",
    "MODEL_BOUNDARY_NOT_OBSERVED",
    "MODEL_TOOL_ENVELOPE_INVALID",
    "DEPENDENCY_INTEGRITY_CHANGED",
    "EVIDENCE_INVALID",
    "CLEANUP_FAILED",
    "INTERNAL_ERROR",
  ]),
}).strict();

export const smokeReportSchema = z.object({
  schemaVersion: z.literal("openrouter-owner-smoke-report-v1"),
  state: z.enum(["passed", "failed"]),
  timestamp: timestampSchema,
  modelId: runtimeModelIdSchema.nullable(),
  loopbackPorts: z.object({
    web: z.number().int().min(1).max(65_535),
    eve: z.number().int().min(1).max(65_535),
  }).strict().nullable(),
  receiptValidated: z.boolean(),
  sessionCount: z.number().int().min(0).max(SMOKE_SESSION_BUDGET),
  blockedSessionRequests: z.number().int().min(0),
  modelBoundary: z.object({
    observed: z.boolean(),
    modelCallCount: z.number().int().min(0).max(SMOKE_SESSION_BUDGET),
    toolDefinitionCount: z.literal(1).nullable(),
    toolEnvelope: z.literal(FINAL_OUTPUT_ENVELOPE_CLASSIFICATION).nullable(),
    calls: z.array(smokeModelCallSchema).max(SMOKE_SESSION_BUDGET),
  }).strict(),
  browserNonLoopbackRequests: z.number().int().min(0),
  liveEveEnvironmentAllowlistVerified: z.boolean().nullable(),
  cleanup: z.object({
    scratchRemoved: z.boolean(),
    residualProcessCount: z.number().int().min(0),
    residualPortCount: z.number().int().min(0),
    processInspectionComplete: z.boolean(),
    sharedDependencyIntegrityVerified: z.boolean(),
  }).strict(),
  error: safeErrorSchema.nullable(),
}).strict().superRefine((report, context) => {
  if (report.modelBoundary.modelCallCount !== report.modelBoundary.calls.length) {
    context.addIssue({ code: "custom", path: ["modelBoundary", "modelCallCount"], message: "Call count must match retained safe calls." });
  }
  if (report.modelBoundary.observed !== (report.modelBoundary.calls.length > 0)) {
    context.addIssue({ code: "custom", path: ["modelBoundary", "observed"], message: "Observed state must match retained safe calls." });
  }
  const toolCount = report.modelBoundary.calls.length === 0 ? null : 1;
  if (report.modelBoundary.toolDefinitionCount !== toolCount) {
    context.addIssue({ code: "custom", path: ["modelBoundary", "toolDefinitionCount"], message: "Tool count must reconcile safe calls." });
  }
  const toolEnvelope = report.modelBoundary.calls.length === 0 ? null : FINAL_OUTPUT_ENVELOPE_CLASSIFICATION;
  if (report.modelBoundary.toolEnvelope !== toolEnvelope) {
    context.addIssue({ code: "custom", path: ["modelBoundary", "toolEnvelope"], message: "Tool classification must reconcile safe calls." });
  }
  for (const [index, call] of report.modelBoundary.calls.entries()) {
    if (call.callIndex !== index + 1 || call.modelId !== report.modelId) {
      context.addIssue({ code: "custom", path: ["modelBoundary", "calls", index], message: "Calls must be ordered and match the selected model." });
    }
  }
  if (report.state === "passed") {
    if (!report.receiptValidated
      || !report.modelBoundary.observed
      || report.modelBoundary.toolDefinitionCount !== 1
      || report.modelBoundary.toolEnvelope !== FINAL_OUTPUT_ENVELOPE_CLASSIFICATION) {
      context.addIssue({ code: "custom", path: ["state"], message: "Passing reports require a validated final-output-only model boundary." });
    }
    if (report.sessionCount < 1 || report.sessionCount !== report.modelBoundary.modelCallCount || report.blockedSessionRequests !== 0) {
      context.addIssue({ code: "custom", path: ["sessionCount"], message: "Passing reports require one or two exactly reconciled sessions with no blocked third request." });
    }
    if (report.browserNonLoopbackRequests !== 0
      || !report.cleanup.scratchRemoved
      || report.cleanup.residualProcessCount !== 0
      || report.cleanup.residualPortCount !== 0
      || !report.cleanup.processInspectionComplete
      || !report.cleanup.sharedDependencyIntegrityVerified
      || report.error !== null) {
      context.addIssue({ code: "custom", path: ["state"], message: "Passing reports require loopback-only execution and complete cleanup." });
    }
    if (report.modelId === "agent-or-not-fixture" && report.liveEveEnvironmentAllowlistVerified !== null) {
      context.addIssue({ code: "custom", path: ["liveEveEnvironmentAllowlistVerified"], message: "Fixture reports must not claim live Eve environment evidence." });
    }
    if (report.modelId !== "agent-or-not-fixture" && report.liveEveEnvironmentAllowlistVerified !== true) {
      context.addIssue({ code: "custom", path: ["liveEveEnvironmentAllowlistVerified"], message: "Passing live reports require allowlisted Eve environment evidence." });
    }
  } else if (report.error === null) {
    context.addIssue({ code: "custom", path: ["error"], message: "Failing reports require a safe error classification." });
  }
});

export function parseSmokeInvocation(args) {
  if (args.length === 0 || (args.length === 1 && args[0] === "--preflight")) return { kind: "preflight" };
  const expectedFlags = new Set(["--live-openrouter", "--confirm-provider-data-transfer", "--provider", "--model"]);
  const values = new Map();
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (!expectedFlags.has(argument) || values.has(argument)) {
      throw new SmokeContractError("configuration", "UNKNOWN_ARGUMENT");
    }
    if (argument === "--live-openrouter" || argument === "--confirm-provider-data-transfer") {
      values.set(argument, true);
      continue;
    }
    const value = args[index + 1];
    if (!value || value.startsWith("--")) {
      throw new SmokeContractError("configuration", argument === "--model" ? "EXPLICIT_MODEL_REQUIRED" : "OPENROUTER_MODE_REQUIRED");
    }
    values.set(argument, value);
    index += 1;
  }
  if (values.get("--live-openrouter") !== true || values.get("--confirm-provider-data-transfer") !== true) {
    throw new SmokeContractError("configuration", "LIVE_OPT_IN_INCOMPLETE");
  }
  if (values.get("--provider") !== "openrouter") {
    throw new SmokeContractError("configuration", "OPENROUTER_MODE_REQUIRED");
  }
  const modelResult = explicitModelIdSchema.safeParse(values.get("--model"));
  if (!modelResult.success) throw new SmokeContractError("configuration", "EXPLICIT_MODEL_REQUIRED");
  return { kind: "live", modelId: modelResult.data };
}

const providerFreeEnvironmentNames = [
  "ALLUSERSPROFILE", "APPDATA", "ComSpec", "CommonProgramFiles", "CommonProgramFiles(x86)",
  "CommonProgramW6432", "HOMEDRIVE", "HOMEPATH", "LOCALAPPDATA", "NUMBER_OF_PROCESSORS",
  "OS", "Path", "PATHEXT", "PROCESSOR_ARCHITECTURE", "PROCESSOR_IDENTIFIER", "PROCESSOR_LEVEL",
  "PROCESSOR_REVISION", "ProgramData", "ProgramFiles", "ProgramFiles(x86)", "ProgramW6432",
  "PSModulePath", "PUBLIC", "SystemDrive", "SystemRoot", "TEMP", "TMP", "USERDOMAIN",
  "USERNAME", "USERPROFILE", "windir",
];

export const liveEveInheritedEnvironmentNames = Object.freeze([
  "ComSpec",
  "OPENROUTER_API_KEY",
  "OS",
  "Path",
  "PATHEXT",
  "PROCESSOR_ARCHITECTURE",
  "SystemDrive",
  "SystemRoot",
  "TEMP",
  "TMP",
  "windir",
]);

export const liveEveRuntimeEnvironmentNames = Object.freeze([
  "AGENT_OR_NOT_DATA_DIR",
  "AGENT_OR_NOT_PROVIDER_MODE",
  "AGENT_OR_NOT_SESSION_NONCE",
  "AGENT_OR_NOT_SMOKE_EVIDENCE_PATH",
  "EVE_NEXT_PRODUCTION_PORT",
  "NODE_ENV",
  "OPENROUTER_MODEL",
]);

export function assertLiveEveEnvironmentNames(names) {
  const allowed = new Set([...liveEveInheritedEnvironmentNames, ...liveEveRuntimeEnvironmentNames]);
  const observed = [...new Set(names)].sort();
  if (!observed.includes("OPENROUTER_API_KEY")
    || liveEveRuntimeEnvironmentNames.some((name) => !observed.includes(name))
    || observed.some((name) => !allowed.has(name))) {
    throw new SmokeContractError("configuration", "LIVE_OPT_IN_INCOMPLETE");
  }
  return observed;
}

export function providerFreeEnvironment(overrides = {}) {
  const forbiddenOverride = Object.keys(overrides).find((name) => /(?:API_KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|AUTHORIZATION)/iu.test(name));
  if (forbiddenOverride) throw new SmokeContractError("configuration", "LIVE_OPT_IN_INCOMPLETE");
  const environment = {};
  for (const name of providerFreeEnvironmentNames) {
    if (process.env[name] !== undefined) environment[name] = process.env[name];
  }
  return { ...environment, ...overrides };
}

function hashFileBytes(filePath) {
  const digest = crypto.createHash("sha256");
  const descriptor = fs.openSync(filePath, "r");
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  try {
    let offset = 0;
    while (true) {
      const bytesRead = fs.readSync(descriptor, buffer, 0, buffer.length, offset);
      if (bytesRead === 0) break;
      digest.update(buffer.subarray(0, bytesRead));
      offset += bytesRead;
    }
  } finally {
    fs.closeSync(descriptor);
  }
  return digest.digest("hex");
}

export function captureSharedDependencyIntegrity(sharedRoots) {
  const entries = [];
  const visitedDirectories = new Set();
  const walk = (rootLabel, aliasPath, candidatePath) => {
    const canonicalPath = fs.realpathSync(candidatePath);
    const stat = fs.statSync(canonicalPath);
    if (stat.isDirectory()) {
      const directoryKey = canonicalPath.toLowerCase();
      if (visitedDirectories.has(directoryKey)) return;
      visitedDirectories.add(directoryKey);
      for (const name of fs.readdirSync(canonicalPath).sort()) {
        walk(rootLabel, path.posix.join(aliasPath, name), path.join(canonicalPath, name));
      }
      return;
    }
    if (!stat.isFile()) return;
    entries.push({
      rootLabel,
      aliasPath,
      canonicalPath: canonicalPath.toLowerCase(),
      byteLength: stat.size,
      sha256: hashFileBytes(canonicalPath),
    });
  };

  for (const rootEntry of [...sharedRoots].sort((left, right) => left.label.localeCompare(right.label))) {
    walk(rootEntry.label, ".", rootEntry.target);
  }
  entries.sort((left, right) => `${left.rootLabel}\0${left.aliasPath}`.localeCompare(`${right.rootLabel}\0${right.aliasPath}`));
  const manifestDigest = crypto.createHash("sha256");
  let totalBytes = 0;
  for (const entry of entries) {
    totalBytes += entry.byteLength;
    manifestDigest.update(`${entry.rootLabel}\0${entry.aliasPath}\0${entry.canonicalPath}\0${entry.byteLength}\0${entry.sha256}\n`);
  }
  return {
    algorithm: "sha256",
    fileCount: entries.length,
    totalBytes,
    digest: manifestDigest.digest("hex"),
  };
}

export function reconcileSharedDependencyIntegrity(before, after) {
  if (before.algorithm !== "sha256"
    || after.algorithm !== "sha256"
    || before.fileCount !== after.fileCount
    || before.totalBytes !== after.totalBytes
    || before.digest !== after.digest) {
    throw new SmokeContractError("cleanup", "DEPENDENCY_INTEGRITY_CHANGED");
  }
  return { verified: true, ...after };
}

export function readSmokeModelCalls(evidencePath) {
  if (!fs.existsSync(evidencePath)) return [];
  return fs.readFileSync(evidencePath, "utf8")
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => smokeModelCallSchema.parse(JSON.parse(line)));
}

export function reconcileBoundaryEvidence(calls, expectedModelId, sessionCount, receiptValidated) {
  if (sessionCount > SMOKE_SESSION_BUDGET || calls.length > SMOKE_SESSION_BUDGET) {
    throw new SmokeContractError("evidence", "ATTEMPT_BUDGET_EXCEEDED");
  }
  for (const [index, call] of calls.entries()) {
    if (call.callIndex !== index + 1 || call.modelId !== expectedModelId) {
      throw new SmokeContractError("evidence", "EVIDENCE_INVALID");
    }
    if (call.classification !== FINAL_OUTPUT_ENVELOPE_CLASSIFICATION
      || call.toolDefinitionCount !== 1
      || call.actionCapableToolDefinitionCount !== 0
      || !Array.isArray(call.toolNames)
      || call.toolNames.length !== 1
      || call.toolNames[0] !== "final_output") {
      throw new SmokeContractError("evidence", "MODEL_TOOL_ENVELOPE_INVALID");
    }
  }
  if (receiptValidated && calls.length === 0) {
    throw new SmokeContractError("evidence", "MODEL_BOUNDARY_NOT_OBSERVED");
  }
  if (receiptValidated && calls.length !== sessionCount) {
    throw new SmokeContractError("evidence", "EVIDENCE_INVALID");
  }
  return {
    observed: calls.length > 0,
    modelCallCount: calls.length,
    toolDefinitionCount: calls.length === 0 ? null : 1,
    toolEnvelope: calls.length === 0 ? null : FINAL_OUTPUT_ENVELOPE_CLASSIFICATION,
    calls,
  };
}

export function writeSmokeReport(root, report) {
  const parsed = smokeReportSchema.parse(report);
  const destination = path.join(root, SMOKE_REPORT_PATH);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(parsed, null, 2)}\n`, { encoding: "utf8", flag: "w" });
  fs.renameSync(temporary, destination);
  return destination;
}

export async function reserveLoopbackPort() {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address !== "object") {
        server.close();
        reject(new SmokeContractError("service", "SERVICE_START_FAILED"));
        return;
      }
      server.close(() => resolve(address.port));
    });
  });
}

function processIsAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export async function settleOperationWithin(operation, timeoutMs) {
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1) {
    return {
      status: "rejected",
      error: new SmokeContractError("cleanup", "CLEANUP_FAILED"),
    };
  }

  return await new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const timer = setTimeout(() => finish({ status: "timed-out" }), timeoutMs);
    Promise.resolve()
      .then(operation)
      .then(
        (value) => finish({ status: "fulfilled", value }),
        (error) => finish({ status: "rejected", error }),
      );
  });
}

function descendantProcessIds(rootPids, timeoutMs = PROCESS_INSPECTION_TIMEOUT_MS) {
  if (process.platform !== "win32" || rootPids.length === 0) return [];
  const roots = rootPids.filter(Number.isInteger).join(",");
  const command = `$all=Get-CimInstance Win32_Process; $frontier=@(${roots}); $seen=@(); while($frontier.Count -gt 0){$next=@(); foreach($pidValue in $frontier){foreach($child in $all|Where-Object ParentProcessId -eq $pidValue){if($seen -notcontains $child.ProcessId){$seen += $child.ProcessId; $next += $child.ProcessId}}}; $frontier=$next}; $seen -join ','`;
  const result = spawnSync("powershell", ["-NoProfile", "-Command", command], {
    encoding: "utf8",
    env: providerFreeEnvironment(),
    timeout: timeoutMs,
    killSignal: "SIGKILL",
    windowsHide: true,
  });
  if (result.error?.code === "ETIMEDOUT") {
    const error = new SmokeContractError("cleanup", "CLEANUP_FAILED");
    error.inspectionTimedOut = true;
    throw error;
  }
  if (result.status !== 0) throw new SmokeContractError("cleanup", "CLEANUP_FAILED");
  return result.stdout.trim().split(",").filter(Boolean).map(Number).filter(Number.isInteger);
}

function forceKillProcessTree(pid) {
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], {
      env: providerFreeEnvironment(),
      stdio: "ignore",
      timeout: PROCESS_INSPECTION_TIMEOUT_MS,
      killSignal: "SIGKILL",
      windowsHide: true,
    });
    return;
  }
  try { process.kill(pid, "SIGKILL"); } catch {}
}

export async function terminateOwnedProcesses(children, options = {}) {
  const roots = children.map((child) => child?.pid).filter(Number.isInteger);
  const inspectDescendants = options.inspectDescendants ?? descendantProcessIds;
  const graceMs = options.graceMs ?? 8_000;
  const inspectionTimeoutMs = options.inspectionTimeoutMs ?? PROCESS_INSPECTION_TIMEOUT_MS;
  const tracked = new Set(roots);
  let inspectionComplete = true;
  let inspectionTimedOut = false;
  const inspect = async () => {
    const result = await settleOperationWithin(
      () => inspectDescendants(roots, inspectionTimeoutMs),
      inspectionTimeoutMs,
    );
    if (result.status !== "fulfilled") {
      inspectionComplete = false;
      inspectionTimedOut ||= result.status === "timed-out" || result.error?.inspectionTimedOut === true;
      return;
    }
    for (const pid of result.value) tracked.add(pid);
  };
  await inspect();
  for (const child of children) {
    if (child && child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
  }
  const activeChildren = children.filter((child) => child && child.exitCode === null && child.signalCode === null);
  if (activeChildren.length > 0) {
    await new Promise((resolve) => {
      let pending = activeChildren.length;
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(finish, graceMs);
      for (const child of activeChildren) {
        if (child.exitCode !== null || child.signalCode !== null) {
          pending -= 1;
          if (pending === 0) finish();
          continue;
        }
        child.once("exit", () => {
          pending -= 1;
          if (pending === 0) finish();
        });
      }
    });
  }
  await inspect();
  const residualBeforeForce = [...tracked].filter(processIsAlive);
  for (const pid of residualBeforeForce) forceKillProcessTree(pid);
  await new Promise((resolve) => setTimeout(resolve, 500));
  await inspect();
  const lateResiduals = [...tracked].filter(processIsAlive);
  for (const pid of lateResiduals) forceKillProcessTree(pid);
  if (lateResiduals.length > 0) await new Promise((resolve) => setTimeout(resolve, 500));
  const residualProcessIds = [...tracked].filter(processIsAlive);
  return {
    trackedProcessCount: tracked.size,
    rootProcessCount: roots.length,
    inspectionComplete,
    inspectionTimedOut,
    processTreeProofComplete: inspectionComplete && residualProcessIds.length === 0,
    residualProcessIds,
  };
}

async function loopbackPortIsReleased(portEntry) {
  const port = typeof portEntry === "number" ? portEntry : portEntry.port;
  const host = typeof portEntry === "number" ? "127.0.0.1" : portEntry.host;
  return await new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.listen(port, host, () => server.close(() => resolve(true)));
  });
}

export async function residualLoopbackPorts(ports) {
  const residual = [];
  for (const portEntry of ports) {
    if (!await loopbackPortIsReleased(portEntry)) residual.push(portEntry);
  }
  return residual;
}
