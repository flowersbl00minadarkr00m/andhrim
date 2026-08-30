import { spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { z } from "zod";

export const SMOKE_SESSION_BUDGET = 2;
export const SMOKE_REPORT_PATH = path.join("output", "openrouter-smoke-report.json");

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
  toolDefinitionCount: z.literal(0),
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
    "MODEL_TOOL_ENVELOPE_PRESENT",
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
    toolDefinitionCount: z.literal(0).nullable(),
    calls: z.array(smokeModelCallSchema).max(SMOKE_SESSION_BUDGET),
  }).strict(),
  browserNonLoopbackRequests: z.number().int().min(0),
  cleanup: z.object({
    scratchRemoved: z.boolean(),
    residualProcessCount: z.number().int().min(0),
    residualPortCount: z.number().int().min(0),
  }).strict(),
  error: safeErrorSchema.nullable(),
}).strict().superRefine((report, context) => {
  if (report.modelBoundary.modelCallCount !== report.modelBoundary.calls.length) {
    context.addIssue({ code: "custom", path: ["modelBoundary", "modelCallCount"], message: "Call count must match retained safe calls." });
  }
  if (report.modelBoundary.observed !== (report.modelBoundary.calls.length > 0)) {
    context.addIssue({ code: "custom", path: ["modelBoundary", "observed"], message: "Observed state must match retained safe calls." });
  }
  const toolCount = report.modelBoundary.calls.length === 0 ? null : 0;
  if (report.modelBoundary.toolDefinitionCount !== toolCount) {
    context.addIssue({ code: "custom", path: ["modelBoundary", "toolDefinitionCount"], message: "Tool count must reconcile safe calls." });
  }
  for (const [index, call] of report.modelBoundary.calls.entries()) {
    if (call.callIndex !== index + 1 || call.modelId !== report.modelId) {
      context.addIssue({ code: "custom", path: ["modelBoundary", "calls", index], message: "Calls must be ordered and match the selected model." });
    }
  }
  if (report.state === "passed") {
    if (!report.receiptValidated || !report.modelBoundary.observed || report.modelBoundary.toolDefinitionCount !== 0) {
      context.addIssue({ code: "custom", path: ["state"], message: "Passing reports require a validated zero-tool model boundary." });
    }
    if (report.sessionCount < 1 || report.sessionCount !== report.modelBoundary.modelCallCount || report.blockedSessionRequests !== 0) {
      context.addIssue({ code: "custom", path: ["sessionCount"], message: "Passing reports require one or two exactly reconciled sessions with no blocked third request." });
    }
    if (report.browserNonLoopbackRequests !== 0
      || !report.cleanup.scratchRemoved
      || report.cleanup.residualProcessCount !== 0
      || report.cleanup.residualPortCount !== 0
      || report.error !== null) {
      context.addIssue({ code: "custom", path: ["state"], message: "Passing reports require loopback-only execution and complete cleanup." });
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

export function providerFreeEnvironment(overrides = {}) {
  const forbiddenOverride = Object.keys(overrides).find((name) => /(?:API_KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|AUTHORIZATION)/iu.test(name));
  if (forbiddenOverride) throw new SmokeContractError("configuration", "LIVE_OPT_IN_INCOMPLETE");
  const environment = {};
  for (const name of providerFreeEnvironmentNames) {
    if (process.env[name] !== undefined) environment[name] = process.env[name];
  }
  return { ...environment, ...overrides };
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
    if (call.toolDefinitionCount !== 0) {
      throw new SmokeContractError("evidence", "MODEL_TOOL_ENVELOPE_PRESENT");
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
    toolDefinitionCount: calls.length === 0 ? null : 0,
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

function descendantProcessIds(rootPids) {
  if (process.platform !== "win32" || rootPids.length === 0) return [];
  const roots = rootPids.filter(Number.isInteger).join(",");
  const command = `$all=Get-CimInstance Win32_Process; $frontier=@(${roots}); $seen=@(); while($frontier.Count -gt 0){$next=@(); foreach($pidValue in $frontier){foreach($child in $all|Where-Object ParentProcessId -eq $pidValue){if($seen -notcontains $child.ProcessId){$seen += $child.ProcessId; $next += $child.ProcessId}}}; $frontier=$next}; $seen -join ','`;
  const result = spawnSync("powershell", ["-NoProfile", "-Command", command], {
    encoding: "utf8",
    env: providerFreeEnvironment(),
    windowsHide: true,
  });
  if (result.status !== 0) throw new SmokeContractError("cleanup", "CLEANUP_FAILED");
  return result.stdout.trim().split(",").filter(Boolean).map(Number).filter(Number.isInteger);
}

export async function terminateOwnedProcesses(children) {
  const roots = children.map((child) => child?.pid).filter(Number.isInteger);
  const tracked = new Set([...roots, ...descendantProcessIds(roots)]);
  for (const child of children) {
    if (child && child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
  }
  await Promise.race([
    Promise.all(children.map((child) => (
      !child || child.exitCode !== null || child.signalCode !== null
        ? Promise.resolve()
        : new Promise((resolve) => child.once("exit", resolve))
    ))),
    new Promise((resolve) => setTimeout(resolve, 8_000)),
  ]);
  const residualBeforeForce = [...tracked].filter(processIsAlive);
  for (const pid of residualBeforeForce) {
    if (process.platform === "win32") {
      spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], {
        env: providerFreeEnvironment(),
        stdio: "ignore",
        windowsHide: true,
      });
    } else {
      try { process.kill(pid, "SIGKILL"); } catch {}
    }
  }
  await new Promise((resolve) => setTimeout(resolve, 500));
  return {
    trackedProcessCount: tracked.size,
    residualProcessIds: [...tracked].filter(processIsAlive),
  };
}

async function loopbackPortIsReleased(port) {
  return await new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.listen(port, "127.0.0.1", () => server.close(() => resolve(true)));
  });
}

export async function residualLoopbackPorts(ports) {
  const residual = [];
  for (const port of ports) {
    if (!await loopbackPortIsReleased(port)) residual.push(port);
  }
  return residual;
}
