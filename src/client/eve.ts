import type { Assessment } from "../domain/learning";
import {
  parseRecommendationReceipt,
  type RecommendationReceipt,
} from "../domain/recommendation";
import { assessmentForProvider, type ProviderMode } from "../domain/runtime";

type LocalRuntime = {
  providerMode: ProviderMode;
  modelId: string;
  sessionNonce: string;
};

export const RECEIPT_SESSION_BUDGET = 2;

export async function requestEveReceipt(assessment: Assessment, runtime: LocalRuntime): Promise<RecommendationReceipt> {
  let validationFailure = false;
  for (let attempt = 1; attempt <= RECEIPT_SESSION_BUDGET; attempt += 1) {
    try {
      return await requestAttempt(assessment, runtime, validationFailure);
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
): Promise<RecommendationReceipt> {
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
      message: `${correction ? "The previous response failed strict validation. " : ""}Return only one Recommendation Receipt JSON object for this bounded assessment. Runtime metadata must be ${JSON.stringify(runtime)}. The application will assign receipt and assessment identifiers after validation.\n${JSON.stringify(assessmentForProvider(assessment))}`,
    }),
  });
  if (createResponse.status !== 202) throw new Error("The local Eve session could not start.");
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
        if (event.type === "result.completed") {
          result = event.data?.result;
          resultObserved = true;
        }
        if (event.type === "session.failed") throw new Error(event.data?.code ?? "The local Eve session failed.");
        if (event.type === "session.completed") {
          await reader.cancel("terminal-observed");
          if (!resultObserved) throw new Error("The local Eve session completed without a structured receipt.");
          return parseEveReceiptResult(result, assessment.assessmentId, runtime);
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
  throw new Error("The local Eve stream ended before its terminal receipt.");
}
