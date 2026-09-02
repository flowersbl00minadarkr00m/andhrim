import { z } from "zod";
import type { Assessment } from "./learning";

export const providerModeSchema = z.enum(["fixture", "openrouter"]);
export type ProviderMode = z.infer<typeof providerModeSchema>;

export const runtimeServiceStatusSchema = z.object({
  state: z.enum(["healthy", "unavailable"]),
  detail: z.string().trim().min(1).max(180),
}).strict();

export type RuntimeServiceStatus = z.infer<typeof runtimeServiceStatusSchema>;

export const runtimeStatusSchema = z.object({
  schemaVersion: z.literal("runtime-status-v1"),
  providerMode: providerModeSchema,
  modelId: z.string().trim().min(1).max(160).nullable(),
  configured: z.boolean(),
  sessionNonce: z.string().regex(/^[A-Za-z0-9_-]{43,128}$/u),
  privacyDisclosure: z.string().trim().min(1).max(1_200),
  lastDiagnosticAt: z.iso.datetime(),
  services: z.object({
    app: runtimeServiceStatusSchema,
    eve: runtimeServiceStatusSchema,
    mcp: runtimeServiceStatusSchema,
  }).strict(),
}).strict();

export type RuntimeStatus = z.infer<typeof runtimeStatusSchema>;

export type ProviderAssessment = Pick<Assessment, "title" | "desiredOutcome" | "constraints" | "answers">;

export function assessmentForProvider(assessment: Assessment): ProviderAssessment {
  return {
    title: assessment.title,
    desiredOutcome: assessment.desiredOutcome,
    constraints: assessment.constraints,
    answers: assessment.answers,
  };
}

export function runtimePrivacyDisclosure(providerMode: ProviderMode, modelId: string | null) {
  if (providerMode === "fixture") {
    return "Fixture mode: assessment processing stays on this computer; no model provider receives the assessment. Local records remain in the local ledger.";
  }
  return `OpenRouter mode: the case title, desired outcome, constraints, and five 1–5 factor answers are sent through OpenRouter to the selected model ${modelId ?? "(not selected)"}. The assessment ID and timestamp, local outcomes and learning history, and API key are not included in assessment content; the key is never sent in assessment content. OpenRouter and the selected model provider handle submitted content under each provider's policy.`;
}

export function runtimeActionGuidance(status: RuntimeStatus): string[] {
  const guidance: string[] = [];
  if (status.providerMode === "openrouter" && !status.configured) {
    guidance.push("Add OPENROUTER_MODEL and OPENROUTER_API_KEY to .env.local, then restart the local app. This page never accepts or reveals the key.");
  }
  if (status.services.eve.state === "unavailable") {
    guidance.push("Restart with pnpm start so Eve uses the loopback port baked into the current Next.js build.");
  }
  if (status.services.mcp.state === "unavailable") {
    guidance.push("Run uv sync --project mcp_server --frozen, then restart with pnpm start to restore the read-only guidance service.");
  }
  if (status.services.app.state === "unavailable") {
    guidance.push("Restart the local app and reload this page from http://127.0.0.1:3000.");
  }
  if (guidance.length === 0) {
    guidance.push("All required local services responded. No restart is needed.");
  }
  return guidance;
}
