import type { Assessment } from "../domain/learning";
import {
  parseRecommendationReceipt,
  type RecommendationReceipt,
} from "../domain/recommendation";

export async function requestEveReceipt(assessment: Assessment): Promise<RecommendationReceipt> {
  const runtimeResponse = await fetch("/api/runtime", { cache: "no-store" });
  const runtime = await runtimeResponse.json() as { providerMode?: "fixture" | "openrouter"; modelId?: string | null; configured?: boolean; error?: string };
  if (!runtimeResponse.ok || !runtime.configured || !runtime.providerMode || !runtime.modelId) {
    throw new Error(runtime.error ?? "The selected local model is not configured.");
  }
  let validationFailure = false;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      return await requestAttempt(assessment, { providerMode: runtime.providerMode, modelId: runtime.modelId }, validationFailure);
    } catch (error) {
      if (!(error instanceof ReceiptValidationError) || attempt === 2) throw error;
      validationFailure = true;
    }
  }
  throw new Error("The local receipt failed bounded validation.");
}

class ReceiptValidationError extends Error {}

async function requestAttempt(
  assessment: Assessment,
  runtime: RecommendationReceipt["runtime"],
  correction: boolean,
): Promise<RecommendationReceipt> {
  const createResponse = await fetch("/eve/v1/session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      mode: "task",
      message: `${correction ? "The previous response failed strict validation. " : ""}Return only one Recommendation Receipt JSON object for this bounded assessment. Runtime metadata must be ${JSON.stringify(runtime)}.\n${JSON.stringify(assessment)}`,
    }),
  });
  if (createResponse.status !== 202) throw new Error("The local Eve session could not start.");
  const created = await createResponse.json() as { sessionId?: string };
  const sessionId = created.sessionId ?? createResponse.headers.get("x-eve-session-id");
  if (!sessionId) throw new Error("The local Eve session returned no identity.");

  const streamResponse = await fetch(`/eve/v1/session/${encodeURIComponent(sessionId)}/stream`);
  if (!streamResponse.ok || !streamResponse.body) throw new Error("The local Eve receipt stream could not open.");
  const reader = streamResponse.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let buffered = "";
  let message: string | undefined;
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
        const event = JSON.parse(line) as { type?: string; data?: { message?: string; code?: string } };
        if (event.type === "message.completed") message = event.data?.message;
        if (event.type === "session.failed") throw new Error(event.data?.code ?? "The local Eve session failed.");
        if (event.type === "session.completed") {
          await reader.cancel("terminal-observed");
          if (!message) throw new Error("The local Eve session completed without a receipt.");
          try {
            const value = JSON.parse(message) as Record<string, unknown>;
            return parseRecommendationReceipt({ ...value, assessmentId: assessment.assessmentId, runtime });
          } catch (error) {
            throw new ReceiptValidationError("The model response failed strict receipt validation.", { cause: error });
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
  throw new Error("The local Eve stream ended before its terminal receipt.");
}
