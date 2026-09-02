import type { ActiveRule, Assessment } from "../domain/learning";
import type { EvaluationScenario } from "../domain/evaluation";
import type { RecommendationReceipt } from "../domain/recommendation";

const evaluatedAt = "2026-09-02T12:00:00.000Z";

function fixtureReceipt(
  recommendation: RecommendationReceipt["recommendation"],
  suffix: string,
): RecommendationReceipt {
  const actionable = recommendation !== "more-information-required";
  return {
    schemaVersion: "recommendation-receipt-v1",
    receiptId: `receipt-eval-${suffix}`,
    assessmentId: `assessment-eval-${suffix}`,
    recommendation,
    summary: `Deterministic ${recommendation} evaluation fixture.`,
    why: "The scenario supplies a fixed, local receipt so the strict validation boundary can be evaluated without a provider call.",
    evidence: ["The fixture input and expected terminal state are versioned in source."],
    assumptions: ["This scenario measures harness behavior, not recommendation quality."],
    confidence: {
      score: actionable ? 75 : 45,
      label: actionable ? "medium-high" : "low",
      uncertainty: "Fixture confidence is part of the schema case and is not an empirical reliability score.",
    },
    autonomyBoundary: {
      allowed: ["Evaluate the local fixture against deterministic rules."],
      prohibited: ["Do not call a provider, execute tools, or write product records."],
    },
    starterPack: actionable
      ? [{ id: "starter-1", label: "Review", content: "Confirm the result against the scenario expectation." }]
      : [],
    appliedRules: [],
    runtime: { providerMode: "fixture", modelId: "agent-or-not-fixture" },
  };
}

const recommendationFixtures = [
  ["human-led", "human-led"],
  ["ai-assisted", "ai-assisted"],
  ["agent-delegated", "agent-delegated"],
  ["automated", "automated"],
  ["more-information-required", "more-information"],
] as const;

const guidanceAssessment: Assessment = {
  schemaVersion: "assessment-v1",
  assessmentId: "assessment-eval-guidance",
  createdAt: evaluatedAt,
  title: "Evaluate guidance lifecycle boundaries",
  desiredOutcome: "Confirm inactive and expired rules cannot influence a receipt.",
  constraints: "Fixture-only evaluation with no product-ledger mutation.",
  answers: {
    outcomeStakes: 3,
    repeatability: 4,
    specificationClarity: 2,
    verificationCost: 2,
    contextSensitivity: 3,
  },
};

function guidanceRule(
  suffix: "stale" | "expired",
  active: boolean,
  expiresAt: string,
): ActiveRule {
  return {
    ruleId: `rule-eval-${suffix}`,
    version: 1,
    sourceOutcomeId: `outcome-eval-${suffix}`,
    explanation: `Deterministic ${suffix} guidance fixture.`,
    candidateId: `candidate-eval-${suffix}`,
    approvedAt: "2026-06-01T12:00:00.000Z",
    reviewAt: "2026-08-01T12:00:00.000Z",
    expiresAt,
    active,
    condition: { factor: "specificationClarity", operator: "lte", threshold: 3 },
    adjustment: { targetRecommendation: "human-led", weightDelta: -2 },
  };
}

const baseGuidanceReceipt = fixtureReceipt("ai-assisted", "guidance");
const semanticFailure = { ...fixtureReceipt("agent-delegated", "semantic"), starterPack: [] };
const retryRecoveryReceipt = fixtureReceipt("ai-assisted", "retry-recovery");

export const evaluationScenarioPack: EvaluationScenario[] = [
  ...recommendationFixtures.map(([recommendation, suffix]) => ({
    id: `recommendation-${suffix}`,
    title: `${recommendation} receipt`,
    category: "recommendation" as const,
    expectation: `Strict validation accepts the representative ${recommendation} fixture.`,
    kind: "receipt" as const,
    attempts: [fixtureReceipt(recommendation, suffix)],
    maxAttempts: 1,
    expectedTerminal: "accepted" as const,
    expectedRecommendation: recommendation,
  })),
  {
    id: "malformed-output-rejected",
    title: "Malformed output",
    category: "output-validation",
    expectation: "Invalid JSON is rejected before it can become a Recommendation Receipt.",
    kind: "receipt",
    attempts: ['{"schemaVersion":"recommendation-receipt-v1"'],
    maxAttempts: 1,
    expectedTerminal: "rejected",
  },
  {
    id: "semantic-validation-rejected",
    title: "Semantic validation failure",
    category: "output-validation",
    expectation: "An actionable receipt without a starter pack is rejected by semantic validation.",
    kind: "receipt",
    attempts: [semanticFailure],
    maxAttempts: 1,
    expectedTerminal: "rejected",
  },
  {
    id: "retry-recovers",
    title: "Retry recovery",
    category: "retry-control",
    expectation: "One invalid attempt is counted and a valid second attempt recovers within the fixed budget.",
    kind: "receipt",
    attempts: [semanticFailure, retryRecoveryReceipt],
    maxAttempts: 2,
    expectedTerminal: "accepted",
    expectedRecommendation: "ai-assisted",
  },
  {
    id: "retry-exhausts",
    title: "Retry exhaustion",
    category: "retry-control",
    expectation: "Two invalid attempts exhaust the fixture budget and fail closed without a receipt.",
    kind: "receipt",
    attempts: ['{"receiptId":', semanticFailure],
    maxAttempts: 2,
    expectedTerminal: "rejected",
  },
  {
    id: "stale-guidance-ignored",
    title: "Stale guidance",
    category: "guidance-boundary",
    expectation: "Inactive guidance is not applied even when its condition matches.",
    kind: "guidance",
    assessment: guidanceAssessment,
    receipt: baseGuidanceReceipt,
    rule: guidanceRule("stale", false, "2027-01-01T12:00:00.000Z"),
    evaluatedAt,
    expectedAppliedRuleCount: 0,
    expectedRecommendation: "ai-assisted",
  },
  {
    id: "expired-guidance-ignored",
    title: "Expired guidance",
    category: "guidance-boundary",
    expectation: "Expired guidance is not applied even when it remains marked active and matches.",
    kind: "guidance",
    assessment: guidanceAssessment,
    receipt: baseGuidanceReceipt,
    rule: guidanceRule("expired", true, "2026-09-01T12:00:00.000Z"),
    evaluatedAt,
    expectedAppliedRuleCount: 0,
    expectedRecommendation: "ai-assisted",
  },
  {
    id: "corrupted-ledger-preserved",
    title: "Corrupted-ledger recovery",
    category: "ledger-recovery",
    expectation: "A corrupted NDJSON source is rejected and returned byte-for-byte for owner-led recovery.",
    kind: "ledger",
    rawLedger: '{"eventId":"event-corrupt","occurredAt":"2026-09-02T12:00:00.000Z","type":"recommendation.recorded"\n',
    expectedTerminal: "recovery-preserves-source",
  },
];
