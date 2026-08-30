import type { Assessment } from "./learning";

export type ProviderMode = "fixture" | "openrouter";

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
