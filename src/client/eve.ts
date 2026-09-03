import type { Assessment } from "../domain/learning";
import {
  capabilityAnswersSchema,
  capabilityAssessmentFactors,
  capabilityTraceSchema,
  type CapabilityTrace,
} from "../domain/capabilities";
import {
  parseRecommendationReceipt,
  type RecommendationReceipt,
} from "../domain/recommendation";
import { assessmentForProvider, type ProviderMode } from "../domain/runtime";
import { RECEIPT_SESSION_BUDGET, type ReceiptVerificationContext } from "../domain/verification";

type LocalRuntime = {
  providerMode: ProviderMode;
  modelId: string;
  sessionNonce: string;
};

export { RECEIPT_SESSION_BUDGET };

export type EveReceiptRun = {
  receipt: RecommendationReceipt;
  capabilityTrace: CapabilityTrace;
  verificationContext: ReceiptVerificationContext;
};

export function localEveStartError(status: number): string {
  if (status === 401 || status === 403) {
    return `The local Eve session boundary rejected the request (HTTP ${status}). Restart the local app to refresh its owner session.`;
  }
  if (status === 404) {
    return "The local Eve session route is missing (HTTP 404). Rebuild the Eve and Next.js production outputs together.";
  }
  if (status >= 500) {
    return `The local Eve session could not start (HTTP ${status}). The Next.js proxy could not reach its loopback Eve service; restart with the project launcher so Eve follows the port baked into this build.`;
  }
  return `The local Eve session could not start (HTTP ${status}).`;
}

export async function requestEveReceipt(assessment: Assessment, runtime: LocalRuntime): Promise<EveReceiptRun> {
  let validationFailure = false;
  for (let attempt = 1; attempt <= RECEIPT_SESSION_BUDGET; attempt += 1) {
    try {
      const run = await requestAttempt(assessment, runtime, validationFailure);
      return {
        ...run,
        verificationContext: {
          sessionAttemptsUsed: attempt,
          sessionAttemptBudget: RECEIPT_SESSION_BUDGET,
        },
      };
    } catch (error) {
      if (!(error instanceof ReceiptValidationError) || attempt === RECEIPT_SESSION_BUDGET) throw error;
      validationFailure = true;
    }
  }
  throw new Error("The local receipt failed bounded validation.");
}

class ReceiptValidationError extends Error {}

export function parseEveReceiptResult(
  value: unknown,
  assessmentId: Assessment["assessmentId"],
  runtime: RecommendationReceipt["runtime"],
): RecommendationReceipt {
  try {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new Error("The structured result was not an object.");
    }
    const modelValue = value as Record<string, unknown>;
    if (!Array.isArray(modelValue.appliedRules) || modelValue.appliedRules.length !== 0) {
      throw new Error("The model must not supply applied-rule provenance.");
    }
    return parseRecommendationReceipt({ ...modelValue, assessmentId, runtime });
  } catch (error) {
    throw new ReceiptValidationError("The model response failed strict receipt validation.", { cause: error });
  }
}

async function requestAttempt(
  assessment: Assessment,
  localRuntime: LocalRuntime,
  correction: boolean,
): Promise<Omit<EveReceiptRun, "verificationContext">> {
  const runtime: RecommendationReceipt["runtime"] = {
    providerMode: localRuntime.providerMode,
    modelId: localRuntime.modelId,
  };
  const createResponse = await fetch("/eve/v1/session", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-agent-or-not-session": localRuntime.sessionNonce,
    },
    body: JSON.stringify({
      mode: "task",
      message: `${correction ? "The previous response failed strict validation. Start a fresh bounded harness sequence. " : ""}Load the delegation-guidance skill, use the bounded read-only evidence and governed-memory capabilities exactly once, then return one Recommendation Receipt. Runtime metadata must be ${JSON.stringify(runtime)}. The application will assign receipt and assessment identifiers after validation.\nASSESSMENT_JSON:${JSON.stringify(assessmentForProvider(assessment))}`,
    }),
  });
  if (createResponse.status !== 202) throw new Error(localEveStartError(createResponse.status));
  const created = await createResponse.json() as { sessionId?: string };
  const sessionId = created.sessionId ?? createResponse.headers.get("x-eve-session-id");
  if (!sessionId) throw new Error("The local Eve session returned no identity.");

  const streamResponse = await fetch(`/eve/v1/session/${encodeURIComponent(sessionId)}/stream`, {
    headers: { "x-agent-or-not-session": localRuntime.sessionNonce },
  });
  if (!streamResponse.ok || !streamResponse.body) throw new Error("The local Eve receipt stream could not open.");
  const reader = streamResponse.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let buffered = "";
  let result: unknown;
  let resultObserved = false;
  const capabilityEvents: unknown[] = [];
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      buffered += decoder.decode(next.value, { stream: true });
      let newline = buffered.indexOf("\n");
      while (newline >= 0) {
        const line = buffered.slice(0, newline).trim();
        buffered = buffered.slice(newline + 1);
        newline = buffered.indexOf("\n");
        if (!line) continue;
        const event = JSON.parse(line) as { type?: string; data?: { result?: unknown; code?: string } };
        if (event.type === "actions.requested" || event.type === "action.result") capabilityEvents.push(event);
        if (event.type === "result.completed") {
          result = event.data?.result;
          resultObserved = true;
        }
        if (event.type === "session.failed") throw new Error(event.data?.code ?? "The local Eve session failed.");
        if (event.type === "session.completed") {
          await reader.cancel("terminal-observed");
          if (!resultObserved) throw new Error("The local Eve session completed without a structured receipt.");
          return {
            receipt: parseEveReceiptResult(result, assessment.assessmentId, runtime),
            capabilityTrace: parseCapabilityTrace(capabilityEvents, assessment.answers),
          };
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
  throw new Error("The local Eve stream ended before its terminal receipt.");
}

type ActionRequest = {
  callId: string;
  input: Record<string, unknown>;
  kind: "load-skill" | "tool-call";
  toolName?: string;
};

type ActionResult = {
  callId: string;
  kind: "load-skill-result" | "tool-result";
  name?: string;
  output: unknown;
  toolName?: string;
};

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function findObject(value: unknown, predicate: (candidate: Record<string, unknown>) => boolean): Record<string, unknown> | undefined {
  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = findObject(entry, predicate);
      if (found) return found;
    }
    return undefined;
  }
  const candidate = record(value);
  if (!candidate) return undefined;
  if (predicate(candidate)) return candidate;
  for (const entry of Object.values(candidate)) {
    const found = findObject(entry, predicate);
    if (found) return found;
  }
  return undefined;
}

function includesString(value: unknown, expected: string): boolean {
  if (typeof value === "string") return value.includes(expected);
  if (Array.isArray(value)) return value.some((entry) => includesString(entry, expected));
  const candidate = record(value);
  return candidate ? Object.values(candidate).some((entry) => includesString(entry, expected)) : false;
}

function parseActionRequest(value: unknown): ActionRequest {
  const candidate = record(value);
  const input = record(candidate?.input);
  if (!candidate || !input || typeof candidate.callId !== "string"
    || (candidate.kind !== "load-skill" && candidate.kind !== "tool-call")
    || (candidate.kind === "tool-call" && typeof candidate.toolName !== "string")) {
    throw new Error("The Eve capability request was malformed.");
  }
  return candidate as ActionRequest;
}

function parseActionResultEvent(value: unknown): ActionResult {
  const event = record(value);
  const data = record(event?.data);
  const result = record(data?.result);
  if (data?.status !== "completed" || !result || typeof result.callId !== "string"
    || (result.kind !== "load-skill-result" && result.kind !== "tool-result")) {
    throw new Error("An Eve capability did not complete successfully.");
  }
  return result as ActionResult;
}

export function parseCapabilityTrace(events: readonly unknown[], expectedAnswers: Assessment["answers"]): CapabilityTrace {
  const requests: ActionRequest[] = [];
  const requestsByCallId = new Map<string, ActionRequest>();
  const results = new Map<string, ActionResult>();
  for (const value of events) {
    const event = record(value);
    const data = record(event?.data);
    if (event?.type === "actions.requested") {
      if (!Array.isArray(data?.actions)) throw new Error("The Eve capability request batch was malformed.");
      for (const action of data.actions.map(parseActionRequest)) {
        const prior = requestsByCallId.get(action.callId);
        if (prior) {
          if (JSON.stringify(prior) !== JSON.stringify(action)) throw new Error("A capability request identity was reused with different data.");
          continue;
        }
        requestsByCallId.set(action.callId, action);
        requests.push(action);
      }
    } else if (event?.type === "action.result") {
      const result = parseActionResultEvent(value);
      if (results.has(result.callId)) throw new Error("A capability result was duplicated.");
      results.set(result.callId, result);
    }
  }

  const names = requests.map((request) => request.kind === "load-skill" ? "load_skill" : request.toolName);
  const expectedNames = [
    "load_skill",
    "connection_search",
    "derive_delegation_evidence",
    "governed-memory__lookup_approved_guidance",
  ];
  if (JSON.stringify(names) !== JSON.stringify(expectedNames) || results.size !== expectedNames.length) {
    throw new Error("The Eve session did not use the exact bounded capability sequence.");
  }
  const paired = requests.map((request) => {
    const result = results.get(request.callId);
    if (!result) throw new Error("An Eve capability result was missing.");
    return { request, result };
  });
  for (let index = 1; index < paired.length; index += 1) {
    if (paired[index]?.result.kind !== "tool-result" || paired[index]?.result.toolName !== expectedNames[index]) {
      throw new Error("An Eve capability result did not match its request.");
    }
  }

  const skillInput = paired[0]?.request.input;
  const skillResult = paired[0]?.result;
  if (skillInput?.skill !== "delegation-guidance" || !skillResult
    || (skillResult.kind !== "load-skill-result" && skillResult.toolName !== "load_skill")) {
    throw new Error("The delegation skill was not loaded through Eve.");
  }
  const discoveryInput = paired[1]?.request.input;
  if (discoveryInput?.connection !== "governed-memory" || discoveryInput.limit !== 1
    || typeof discoveryInput.keywords !== "string"
    || !includesString(paired[1]?.result.output, "governed-memory__lookup_approved_guidance")) {
    throw new Error("The governed-memory MCP tool was not discovered through Eve.");
  }

  const authoredAnswers = capabilityAnswersSchema.parse(record(paired[2]?.request.input.answers));
  const mcpAnswers = capabilityAnswersSchema.parse(record(paired[3]?.request.input.answers));
  const expected = capabilityAnswersSchema.parse(expectedAnswers);
  if (JSON.stringify(authoredAnswers) !== JSON.stringify(expected) || JSON.stringify(mcpAnswers) !== JSON.stringify(expected)) {
    throw new Error("A capability received assessment data that did not match the local form.");
  }
  const authoredOutput = findObject(paired[2]?.result.output, (candidate) => candidate.schemaVersion === "delegation-evidence-v1");
  if (!authoredOutput || authoredOutput.readOnly !== true || typeof authoredOutput.suggestedPosture !== "string") {
    throw new Error("The authored evidence tool returned an invalid boundary record.");
  }
  const mcpOutput = findObject(paired[3]?.result.output, (candidate) => candidate.schemaVersion === "approved-guidance-v1");
  if (!mcpOutput || mcpOutput.readOnly !== true || mcpOutput.historicalOutcomesRetrieved !== false
    || !Array.isArray(mcpOutput.matchedRules)) {
    throw new Error("The governed-memory MCP tool returned an invalid boundary record.");
  }
  const matchedRules = mcpOutput.matchedRules.map((value) => {
    const candidate = record(value);
    if (!candidate || typeof candidate.ruleId !== "string" || typeof candidate.sourceOutcomeId !== "string") {
      throw new Error("The governed-memory MCP provenance was malformed.");
    }
    return { ruleId: candidate.ruleId, sourceOutcomeId: candidate.sourceOutcomeId };
  });

  return capabilityTraceSchema.parse({
    schemaVersion: "harness-capability-trace-v1",
    steps: [
      {
        kind: "skill",
        name: "delegation-guidance",
        eveCapability: "load_skill",
        executionBoundary: "Eve instruction context",
        inputFields: ["skill"],
        outputSummary: "Instructions loaded on demand; no code or tool executed.",
      },
      {
        kind: "connection-discovery",
        name: "connection_search",
        eveCapability: "connection_search",
        executionBoundary: "Eve connection registry",
        inputFields: ["connection", "keywords", "limit"],
        discoveredTools: ["governed-memory__lookup_approved_guidance"],
        outputSummary: "One allowlisted MCP tool definition discovered; no memory data read.",
      },
      {
        kind: "authored-tool",
        name: "derive_delegation_evidence",
        eveCapability: "defineTool",
        executionBoundary: "local Eve application runtime",
        inputFields: [...capabilityAssessmentFactors],
        answers: authoredAnswers,
        suggestedPosture: authoredOutput.suggestedPosture,
        readOnly: true,
        outputSummary: "Deterministic delegation signals and guardrails returned.",
      },
      {
        kind: "mcp-tool",
        name: "governed-memory__lookup_approved_guidance",
        eveCapability: "defineMcpClientConnection + Pydantic MCPServer",
        executionBoundary: "127.0.0.1 Streamable HTTP",
        inputFields: [...capabilityAssessmentFactors],
        answers: mcpAnswers,
        matchedRuleIds: matchedRules.map((rule) => rule.ruleId),
        sourceOutcomeIds: matchedRules.map((rule) => rule.sourceOutcomeId),
        readOnly: true,
        historicalOutcomesRetrieved: false,
        rawOutcomeNotesCrossed: false,
        outputSummary: "Only matching approved-rule provenance returned; raw outcomes stayed behind the MCP boundary.",
      },
    ],
  });
}
