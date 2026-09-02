import type { RecommendationReceipt } from "./recommendation";
import { assessmentSchema, type Assessment } from "./learning";

const sampleIds = ["human-led", "ai-assisted", "agent-delegated"] as const;
export type AssessmentSampleId = (typeof sampleIds)[number];

type AssessmentSample = {
  id: AssessmentSampleId;
  title: string;
  description: string;
  expectedRecommendation: RecommendationReceipt["recommendation"];
  desiredOutcome: string;
  constraints: string;
  answers: Assessment["answers"];
};

export const assessmentSamples: readonly AssessmentSample[] = [
  {
    id: "human-led",
    title: "Sensitive partner decision",
    description: "High stakes and relationship context keep judgement with the owner.",
    expectedRecommendation: "human-led",
    desiredOutcome: "Decide whether and how to end a strategic supplier relationship without damaging critical partnerships.",
    constraints: "The owner must weigh confidential history, reputational risk, and recovery options. No external action is authorized.",
    answers: { outcomeStakes: 5, repeatability: 1, specificationClarity: 3, verificationCost: 4, contextSensitivity: 5 },
  },
  {
    id: "ai-assisted",
    title: "Research synthesis",
    description: "A useful AI draft still benefits from contextual human interpretation.",
    expectedRecommendation: "ai-assisted",
    desiredOutcome: "Synthesize a set of internal interview notes into themes, open questions, and a review-ready briefing.",
    constraints: "Keep source nuance visible, cite every theme to supplied notes, and let the owner make the final interpretation.",
    answers: { outcomeStakes: 3, repeatability: 3, specificationClarity: 4, verificationCost: 3, contextSensitivity: 3 },
  },
  {
    id: "agent-delegated",
    title: "Weekly status digest",
    description: "Clear inputs, repetition, and cheap review support bounded delegation.",
    expectedRecommendation: "agent-delegated",
    desiredOutcome: "Prepare a weekly internal status digest from a fixed set of approved project updates.",
    constraints: "Use only supplied updates, follow the standard template, flag missing inputs, and take no external action.",
    answers: { outcomeStakes: 2, repeatability: 5, specificationClarity: 5, verificationCost: 1, contextSensitivity: 2 },
  },
];

type SampleIdentity = Pick<Assessment, "assessmentId" | "createdAt">;

export function createAssessmentFromSample(
  id: AssessmentSampleId,
  identity: SampleIdentity = {
    assessmentId: `assessment-${crypto.randomUUID()}`,
    createdAt: new Date().toISOString(),
  },
): Assessment {
  const sample = assessmentSamples.find((candidate) => candidate.id === id);
  if (!sample) throw new Error("Unknown assessment sample.");
  return assessmentSchema.parse({
    schemaVersion: "assessment-v1",
    ...identity,
    title: sample.title,
    desiredOutcome: sample.desiredOutcome,
    constraints: sample.constraints,
    answers: sample.answers,
  });
}

export function previewRecommendationForAssessment(
  assessment: Pick<Assessment, "answers">,
): RecommendationReceipt["recommendation"] {
  const answers = assessment.answers;
  if (answers.outcomeStakes >= 4 || answers.contextSensitivity >= 5) return "human-led";
  if (answers.specificationClarity <= 2) return "more-information-required";
  if (answers.repeatability >= 4 && answers.verificationCost <= 2) return "agent-delegated";
  return "ai-assisted";
}
