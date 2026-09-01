import { appendFileSync } from "node:fs";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { defineAgent } from "eve";
import { recommendationReceiptSchema } from "../src/domain/recommendation";
import {
  assertBoundedHarnessEnvelope,
  type FinalOutputEnvelopeEvidence,
} from "./lib/final-output-envelope";
import { fixtureReceipt } from "./lib/fixture-receipt";
import { resolveFixtureScenario } from "./lib/fixture-scenario";

let invocationCount = 0;
let openRouterInvocationCount = 0;
let fixtureReceiptCount = 0;

type HarnessStage = "prepare" | "evidence" | "final" | "cancel-probe";

function recordSmokeModelCall(modelId: string, callIndex: number, envelope: FinalOutputEnvelopeEvidence, stage: HarnessStage) {
  const evidencePath = process.env.AGENT_OR_NOT_SMOKE_EVIDENCE_PATH?.trim();
  if (!evidencePath) return;
  if (callIndex > 6) throw new Error("OPENROUTER_SMOKE_ATTEMPT_BUDGET_EXCEEDED");
  appendFileSync(evidencePath, `${JSON.stringify({
    timestamp: new Date().toISOString(),
    modelId,
    callIndex,
    stage,
    ...envelope,
  })}\n`, { encoding: "utf8", flag: "a" });
}

function configuredFixtureScenario() {
  return resolveFixtureScenario("fixture", process.env.AGENT_OR_NOT_FIXTURE_SCENARIO?.trim());
}

function recordProviderFreeCall(
  options: { tools?: unknown },
  stage: HarnessStage,
  outputKind: "tool-calls" | "valid" | "semantically-invalid" | "cancelled",
) {
  invocationCount += 1;
  const callIndex = invocationCount;
  const envelope = assertBoundedHarnessEnvelope(options.tools);
  recordSmokeModelCall("agent-or-not-fixture", callIndex, envelope, stage);
  const fixtureScenario = configuredFixtureScenario();
  const correctionRequested = JSON.stringify(options).includes("The previous response failed strict validation.");
  const evidencePath = process.env.AGENT_OR_NOT_FIXTURE_EVIDENCE_PATH;
  if (evidencePath) {
    appendFileSync(evidencePath, `${JSON.stringify({
      schemaVersion: "provider-free-model-call-v3",
      invocationCount: callIndex,
      stage,
      ...envelope,
      modelId: "agent-or-not-fixture",
      fixtureScenario,
      outputKind,
      correctionRequested,
    })}\n`, { encoding: "utf8", flag: "a" });
  }
  return { callIndex };
}

function isCancellationProbe(options: unknown) {
  return JSON.stringify(options).includes("CANCEL_ME_PROVIDER_FREE");
}

function collectToolResultNames(value: unknown, names = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const entry of value) collectToolResultNames(entry, names);
    return names;
  }
  if (typeof value !== "object" || value === null) return names;
  const record = value as Record<string, unknown>;
  if (record.type === "tool-result" && typeof record.toolName === "string") names.add(record.toolName);
  for (const entry of Object.values(record)) collectToolResultNames(entry, names);
  return names;
}

function harnessStage(options: unknown): Exclude<HarnessStage, "cancel-probe"> {
  const names = collectToolResultNames(options);
  const prepared = names.has("load_skill") && names.has("connection_search");
  const evidenced = names.has("derive_delegation_evidence")
    && names.has("governed-memory__lookup_approved_guidance");
  if (!prepared && !evidenced) return "prepare";
  if (prepared && !evidenced) return "evidence";
  if (prepared && evidenced) return "final";
  throw new Error("FIXTURE_HARNESS_SEQUENCE_INVALID");
}

function collectStrings(value: unknown, strings: string[] = []): string[] {
  if (typeof value === "string") strings.push(value);
  else if (Array.isArray(value)) for (const entry of value) collectStrings(entry, strings);
  else if (typeof value === "object" && value !== null) {
    for (const entry of Object.values(value as Record<string, unknown>)) collectStrings(entry, strings);
  }
  return strings;
}

function assessmentAnswers(options: unknown) {
  const marker = "ASSESSMENT_JSON:";
  const source = collectStrings(options).find((value) => value.includes(marker));
  if (!source) throw new Error("FIXTURE_ASSESSMENT_MISSING");
  const assessment = JSON.parse(source.slice(source.indexOf(marker) + marker.length)) as { answers?: Record<string, unknown> };
  const factors = ["outcomeStakes", "repeatability", "specificationClarity", "verificationCost", "contextSensitivity"] as const;
  const answers = Object.fromEntries(factors.map((factor) => {
    const value = assessment.answers?.[factor];
    if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > 5) {
      throw new Error("FIXTURE_ASSESSMENT_INVALID");
    }
    return [factor, value];
  }));
  return answers;
}

function fixtureToolCalls(options: { tools?: unknown }) {
  const stage = harnessStage(options);
  if (stage === "prepare") {
    const { callIndex } = recordProviderFreeCall(options, stage, "tool-calls");
    return [
      { type: "tool-call", toolCallId: `call-load-skill-${callIndex}`, toolName: "load_skill", input: JSON.stringify({ skill: "delegation-guidance" }) },
      { type: "tool-call", toolCallId: `call-connection-search-${callIndex}`, toolName: "connection_search", input: JSON.stringify({ connection: "governed-memory", keywords: "approved guidance assessment factors", limit: 1 }) },
    ];
  }
  if (stage === "evidence") {
    const { callIndex } = recordProviderFreeCall(options, stage, "tool-calls");
    const answers = assessmentAnswers(options);
    return [
      { type: "tool-call", toolCallId: `call-derived-evidence-${callIndex}`, toolName: "derive_delegation_evidence", input: JSON.stringify({ answers }) },
      { type: "tool-call", toolCallId: `call-governed-memory-${callIndex}`, toolName: "governed-memory__lookup_approved_guidance", input: JSON.stringify({ answers }) },
    ];
  }
  fixtureReceiptCount += 1;
  const outputKind = configuredFixtureScenario() === "invalid-first-receipt" && fixtureReceiptCount === 1
    ? "semantically-invalid"
    : "valid";
  const { callIndex } = recordProviderFreeCall(options, stage, outputKind);
  const receipt = outputKind === "semantically-invalid" ? { ...fixtureReceipt, starterPack: [] } : fixtureReceipt;
  return [{
    type: "tool-call",
    toolCallId: `call-final-output-${callIndex}`,
    toolName: "final_output",
    input: JSON.stringify(receipt),
  }];
}

function fixtureUsage() {
  return {
    inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
    outputTokens: { total: 1, text: 1, reasoning: 0 },
  };
}

const fixtureModel = {
  specificationVersion: "v4",
  provider: "agent-or-not.fixture",
  modelId: "agent-or-not-fixture",
  supportedUrls: {},
  async doGenerate(options: { tools?: unknown }) {
    const content = fixtureToolCalls(options);
    return {
      content,
      finishReason: { unified: "tool-calls", raw: "tool-calls" },
      usage: fixtureUsage(),
      warnings: [],
    };
  },
  async doStream(options: { tools?: unknown; abortSignal?: AbortSignal }) {
    if (isCancellationProbe(options)) {
      recordProviderFreeCall(options, "cancel-probe", "cancelled");
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
    const content = fixtureToolCalls(options);
    return {
      stream: new ReadableStream({
        start(controller) {
          for (const item of content) controller.enqueue(item);
          controller.enqueue({
            type: "finish",
            finishReason: { unified: "tool-calls", raw: "tool-calls" },
            usage: fixtureUsage(),
          });
          controller.close();
        },
      }),
      warnings: [],
    };
  },
};

function withBoundedHarness<T extends object>(model: T, modelId: string): T {
  return new Proxy(model, {
    get(target, property, receiver) {
      if (property === "doGenerate" || property === "doStream") {
        const operation = Reflect.get(target, property, receiver) as (options: { tools?: unknown }) => unknown;
        return (options: { tools?: unknown }) => {
          openRouterInvocationCount += 1;
          const envelope = assertBoundedHarnessEnvelope(options.tools);
          recordSmokeModelCall(modelId, openRouterInvocationCount, envelope, harnessStage(options));
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
  return withBoundedHarness(provider(modelId), modelId);
}

export default defineAgent({
  model: configuredModel() as never,
  modelContextWindowTokens: 128_000,
  limits: { maxInputTokensPerSession: 8_000, maxOutputTokensPerSession: 2_000, sessionTimeoutMs: 10 * 60 * 1_000 },
  outputSchema: recommendationReceiptSchema,
});
