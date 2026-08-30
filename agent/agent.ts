import { appendFileSync } from "node:fs";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { defineAgent } from "eve";
import { fixtureReceipt } from "./lib/fixture-receipt";
import { resolveFixtureScenario } from "./lib/fixture-scenario";

let invocationCount = 0;
let openRouterInvocationCount = 0;

function toolDefinitionCount(options: { tools?: unknown }) {
  return options.tools === undefined ? 0 : Array.isArray(options.tools) ? options.tools.length : 1;
}

function recordSmokeModelCall(modelId: string, callIndex: number, options: { tools?: unknown }) {
  const evidencePath = process.env.AGENT_OR_NOT_SMOKE_EVIDENCE_PATH?.trim();
  if (!evidencePath) return;
  if (callIndex > 2) throw new Error("OPENROUTER_SMOKE_ATTEMPT_BUDGET_EXCEEDED");
  appendFileSync(evidencePath, `${JSON.stringify({
    timestamp: new Date().toISOString(),
    modelId,
    callIndex,
    toolDefinitionCount: toolDefinitionCount(options),
  })}\n`, { encoding: "utf8", flag: "a" });
}

function configuredFixtureScenario() {
  return resolveFixtureScenario("fixture", process.env.AGENT_OR_NOT_FIXTURE_SCENARIO?.trim());
}

function recordProviderFreeCall(options: { tools?: unknown }) {
  invocationCount += 1;
  recordSmokeModelCall("agent-or-not-fixture", invocationCount, options);
  const tools = toolDefinitionCount(options);
  if (tools !== 0) throw new Error("PROVIDER_FREE_TOOL_ENVELOPE_PRESENT");
  const fixtureScenario = configuredFixtureScenario();
  const outputKind = fixtureScenario === "invalid-first-receipt" && invocationCount === 1 ? "invalid" : "valid";
  const correctionRequested = JSON.stringify(options).includes("The previous response failed strict validation.");
  const evidencePath = process.env.AGENT_OR_NOT_FIXTURE_EVIDENCE_PATH;
  if (evidencePath) {
    appendFileSync(evidencePath, `${JSON.stringify({
      schemaVersion: "provider-free-model-call-v1",
      invocationCount,
      toolDefinitionCount: tools,
      modelId: "agent-or-not-fixture",
      fixtureScenario,
      outputKind,
      correctionRequested,
    })}\n`, { encoding: "utf8", flag: "a" });
  }
  return outputKind === "invalid"
    ? JSON.stringify({ schemaVersion: "recommendation-receipt-v1", invalidFixtureOutput: true })
    : JSON.stringify(fixtureReceipt);
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

function assertNoCallableTools(options: { tools?: unknown }) {
  const count = toolDefinitionCount(options);
  if (count !== 0) throw new Error("MODEL_TOOL_ENVELOPE_PRESENT");
}

function withoutCallableTools<T extends object>(model: T, modelId: string): T {
  return new Proxy(model, {
    get(target, property, receiver) {
      if (property === "doGenerate" || property === "doStream") {
        const operation = Reflect.get(target, property, receiver) as (options: { tools?: unknown }) => unknown;
        return (options: { tools?: unknown }) => {
          openRouterInvocationCount += 1;
          recordSmokeModelCall(modelId, openRouterInvocationCount, options);
          assertNoCallableTools(options);
          return operation.call(target, options);
        };
      }
      return Reflect.get(target, property, receiver);
    },
  });
}

function configuredModel() {
  const mode = process.env.AGENT_OR_NOT_PROVIDER_MODE?.trim() || "fixture";
  const fixtureScenario = process.env.AGENT_OR_NOT_FIXTURE_SCENARIO?.trim();
  resolveFixtureScenario(mode, fixtureScenario);
  if (mode === "fixture") {
    return fixtureModel;
  }
  if (mode !== "openrouter") throw new Error("AGENT_OR_NOT_PROVIDER_MODE must be fixture or openrouter.");
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  const modelId = process.env.OPENROUTER_MODEL?.trim();
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is required in openrouter mode.");
  if (!modelId || !/^[a-z0-9._-]+\/[a-z0-9._:-]+$/iu.test(modelId)) throw new Error("OPENROUTER_MODEL must be an explicit provider/model identifier.");
  const provider = createOpenRouter({ apiKey, appName: "Andhrim Agent or Not local prototype" });
  return withoutCallableTools(provider(modelId), modelId);
}

export default defineAgent({
  model: configuredModel() as never,
  modelContextWindowTokens: 128_000,
  limits: { maxInputTokensPerSession: 8_000, maxOutputTokensPerSession: 2_000, sessionTimeoutMs: 10 * 60 * 1_000 },
});
