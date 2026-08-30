import { appendFileSync } from "node:fs";
import { defineAgent } from "eve";
import { fixtureReceipt } from "./lib/fixture-receipt";

let invocationCount = 0;

function recordProviderFreeCall(options: { tools?: unknown }) {
  invocationCount += 1;
  const toolDefinitionCount = options.tools === undefined
    ? 0
    : Array.isArray(options.tools)
      ? options.tools.length
      : 1;
  if (toolDefinitionCount !== 0) throw new Error("PROVIDER_FREE_TOOL_ENVELOPE_PRESENT");
  const evidencePath = process.env.AGENT_OR_NOT_FIXTURE_EVIDENCE_PATH;
  if (!evidencePath) throw new Error("PROVIDER_FREE_EVIDENCE_PATH_REQUIRED");
  appendFileSync(evidencePath, `${JSON.stringify({
    schemaVersion: "provider-free-model-call-v1",
    invocationCount,
    toolDefinitionCount,
    modelId: "agent-or-not-fixture",
  })}\n`, { encoding: "utf8", flag: "a" });
  return JSON.stringify(fixtureReceipt);
}

function isCancellationProbe(options: unknown) {
  return JSON.stringify(options).includes("CANCEL_ME_PROVIDER_FREE");
}

const fixtureModel = {
  specificationVersion: "v4",
  provider: "agent-or-not.fixture",
  modelId: "agent-or-not-fixture",
  supportedUrls: {},
  async doGenerate(options: { tools?: unknown }) {
    const text = recordProviderFreeCall(options);
    return {
      content: [{ type: "text", text }],
      finishReason: { unified: "stop", raw: "stop" },
      usage: {
        inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
        outputTokens: { total: 1, text: 1, reasoning: 0 },
      },
      warnings: [],
    };
  },
  async doStream(options: { tools?: unknown; abortSignal?: AbortSignal }) {
    const text = recordProviderFreeCall(options);
    if (isCancellationProbe(options)) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      let abort: (() => void) | undefined;
      return {
        stream: new ReadableStream({
          start(controller) {
            controller.enqueue({ type: "text-start", id: "fixture-cancellation" });
            abort = () => {
              if (timer) clearTimeout(timer);
              controller.error(new DOMException("Provider-free cancellation probe aborted.", "AbortError"));
            };
            options.abortSignal?.addEventListener("abort", abort, { once: true });
            timer = setTimeout(() => controller.error(new Error("PROVIDER_FREE_CANCELLATION_NOT_RECEIVED")), 60_000);
          },
          cancel() {
            if (timer) clearTimeout(timer);
            if (abort) options.abortSignal?.removeEventListener("abort", abort);
          },
        }),
        warnings: [],
      };
    }
    return {
      stream: new ReadableStream({
        start(controller) {
          controller.enqueue({ type: "text-start", id: "fixture-receipt" });
          controller.enqueue({ type: "text-delta", id: "fixture-receipt", delta: text });
          controller.enqueue({ type: "text-end", id: "fixture-receipt" });
          controller.enqueue({
            type: "finish",
            finishReason: { unified: "stop", raw: "stop" },
            usage: {
              inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
              outputTokens: { total: 1, text: 1, reasoning: 0 },
            },
          });
          controller.close();
        },
      }),
      warnings: [],
    };
  },
};

export default defineAgent({
  model: fixtureModel as never,
  modelContextWindowTokens: 128_000,
  limits: { maxInputTokensPerSession: 8_000, maxOutputTokensPerSession: 2_000, sessionTimeoutMs: 10 * 60 * 1_000 },
});
