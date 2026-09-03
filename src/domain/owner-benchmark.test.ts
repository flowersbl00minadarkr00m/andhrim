import { describe, expect, it } from "vitest";
import { createEmptyProjection, type ProductProjection } from "./learning";
import { projectOwnerBenchmark } from "./owner-benchmark";

function projection(): ProductProjection {
  const state = createEmptyProjection();
  state.assessments["assessment-benchmark"] = {
    schemaVersion: "assessment-v1",
    assessmentId: "assessment-benchmark",
    createdAt: "2026-09-02T19:00:00.000Z",
    title: "Prepare a public launch plan",
    desiredOutcome: "Choose the right delegation posture.",
    constraints: "Owner review required.",
    answers: { outcomeStakes: 4, repeatability: 3, specificationClarity: 4, verificationCost: 2, contextSensitivity: 3 },
  };
  state.receipts["receipt-benchmark"] = {
    schemaVersion: "recommendation-receipt-v1",
    receiptId: "receipt-benchmark",
    assessmentId: "assessment-benchmark",
    recommendation: "ai-assisted",
    summary: "Use AI with owner review.",
    why: "The decision is consequential but reviewable.",
    evidence: ["The owner can verify the launch plan."],
    assumptions: ["The owner approves publication."],
    confidence: { score: 78, label: "medium-high", uncertainty: "Audience response remains uncertain." },
    autonomyBoundary: { allowed: ["Draft the plan."], prohibited: ["Publish without approval."] },
    starterPack: [{ id: "starter-1", label: "Review", content: "Review the launch plan." }],
    appliedRules: [],
    runtime: { providerMode: "fixture", modelId: "agent-or-not-fixture" },
  };
  state.evaluationLabels["evaluation-label-benchmark"] = {
    schemaVersion: "owner-evaluation-label-v1",
    labelId: "evaluation-label-benchmark",
    receiptId: "receipt-benchmark",
    revision: 1,
    labelledAt: "2026-09-02T20:00:00.000Z",
    expectedRecommendation: "human-led",
    notes: "Publication authority should remain with the owner.",
  };
  return state;
}

describe("owner-labelled benchmark projection", () => {
  it("measures agreement against real locally recorded receipts without calling a provider", () => {
    const result = projectOwnerBenchmark(projection());

    expect(result).toMatchObject({
      receiptCount: 1,
      labelledCases: 1,
      unlabelledCases: 0,
      agreements: 0,
      disagreements: 1,
      agreementRate: 0,
    });
    expect(result.rows[0]).toMatchObject({
      title: "Prepare a public launch plan",
      actualRecommendation: "ai-assisted",
      expectedRecommendation: "human-led",
      agrees: false,
    });
  });

  it("reports an empty benchmark honestly", () => {
    expect(projectOwnerBenchmark(createEmptyProjection())).toMatchObject({
      receiptCount: 0,
      labelledCases: 0,
      agreementRate: null,
      rows: [],
    });
  });
});
