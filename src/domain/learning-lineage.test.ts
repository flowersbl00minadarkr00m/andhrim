import { describe, expect, it } from "vitest";
import type { ProductProjection } from "./learning";
import type { RecommendationReceipt } from "./recommendation";
import { projectLearningLineages } from "./learning-lineage";

const createdAt = "2026-08-30T05:00:00.000Z";
const recordedAt = "2026-08-31T05:00:00.000Z";

function receipt(
  receiptId: string,
  assessmentId: string,
  appliedRules: RecommendationReceipt["appliedRules"] = [],
): RecommendationReceipt {
  return {
    schemaVersion: "recommendation-receipt-v1",
    receiptId,
    assessmentId,
    recommendation: appliedRules.length > 0 ? "human-led" : "ai-assisted",
    summary: "A bounded recommendation.",
    why: "The fixture evidence supports this posture.",
    evidence: ["Deterministic fixture evidence."],
    assumptions: ["The owner remains accountable."],
    confidence: { score: 72, label: "medium-high", uncertainty: "Local fixture only." },
    autonomyBoundary: { allowed: ["Draft locally."], prohibited: ["Take external action."] },
    starterPack: [{ id: "starter-1", label: "Review", content: "Review the bounded plan." }],
    appliedRules,
    runtime: { providerMode: "fixture", modelId: "agent-or-not-fixture" },
  };
}

function projection(status: ProductProjection["candidates"][string]["status"] = "approved"): ProductProjection {
  const sourceReceipt = receipt("receipt-source", "assessment-source");
  const laterReceipt = receipt("receipt-later", "assessment-later", [{
    ruleId: "rule-scope-check",
    version: 1,
    sourceOutcomeId: "outcome-source",
    explanation: "Approved candidate candidate-source matched specificationClarity lte 3.",
  }]);

  return {
    assessments: {
      "assessment-source": {
        schemaVersion: "assessment-v1",
        assessmentId: "assessment-source",
        createdAt,
        title: "Source case",
        desiredOutcome: "Choose a bounded posture.",
        constraints: "Stay local.",
        answers: { outcomeStakes: 3, repeatability: 4, specificationClarity: 2, verificationCost: 2, contextSensitivity: 3 },
      },
      "assessment-later": {
        schemaVersion: "assessment-v1",
        assessmentId: "assessment-later",
        createdAt: "2026-09-01T05:00:00.000Z",
        title: "Later case",
        desiredOutcome: "Reuse approved guidance.",
        constraints: "Stay local.",
        answers: { outcomeStakes: 3, repeatability: 4, specificationClarity: 2, verificationCost: 2, contextSensitivity: 3 },
      },
    },
    receipts: { [sourceReceipt.receiptId]: sourceReceipt, [laterReceipt.receiptId]: laterReceipt },
    capabilityTraces: {},
    receiptVerifications: {},
    outcomes: {
      "outcome-source": {
        schemaVersion: "outcome-v1",
        outcomeId: "outcome-source",
        receiptId: sourceReceipt.receiptId,
        recordedAt,
        rating: 2,
        correctionNotes: "PRIVATE CORRECTION",
        notes: "PRIVATE OUTCOME NOTE",
      },
    },
    candidates: {
      "candidate-source": {
        schemaVersion: "learning-candidate-v1",
        candidateId: "candidate-source",
        revision: 3,
        sourceOutcomeId: "outcome-source",
        createdAt: recordedAt,
        status,
        condition: { factor: "specificationClarity", operator: "lte", threshold: 3 },
        adjustment: { targetRecommendation: "human-led", weightDelta: -2 },
        rationale: "Require a stronger scope check.",
        evidenceRefs: ["outcome-source"],
        confidence: 70,
        reviewAt: "2026-09-14T05:00:00.000Z",
        expiresAt: "2026-11-29T05:00:00.000Z",
      },
    },
    rules: status === "proposed" || status === "rejected" ? {} : {
      "rule-scope-check": {
        ruleId: "rule-scope-check",
        version: 1,
        sourceOutcomeId: "outcome-source",
        explanation: "Owner-approved scope guidance.",
        candidateId: "candidate-source",
        approvedAt: "2026-08-31T06:00:00.000Z",
        reviewAt: "2026-09-14T05:00:00.000Z",
        expiresAt: "2026-11-29T05:00:00.000Z",
        active: status === "approved",
        condition: { factor: "specificationClarity", operator: "lte", threshold: 3 },
        adjustment: { targetRecommendation: "human-led", weightDelta: -2 },
      },
    },
  };
}

describe("projectLearningLineages", () => {
  it("joins source evidence to safe applied-rule provenance without private outcome notes", () => {
    const [lineage] = projectLearningLineages(projection(), { now: new Date("2026-09-02T05:00:00.000Z") });

    expect(lineage.sourceReceipt.receiptId).toBe("receipt-source");
    expect(lineage.outcome).toEqual({
      outcomeId: "outcome-source",
      receiptId: "receipt-source",
      recordedAt,
      rating: 2,
    });
    expect(lineage.candidate).toMatchObject({ revision: 3, status: "approved" });
    expect(lineage.rule).toMatchObject({ ruleId: "rule-scope-check", status: "approved", active: true });
    expect(lineage.affectedReceipts[0]).toMatchObject({
      receiptId: "receipt-later",
      provenance: [{ ruleId: "rule-scope-check", version: 1, sourceOutcomeId: "outcome-source" }],
    });
    expect(JSON.stringify(lineage)).not.toContain("PRIVATE CORRECTION");
    expect(JSON.stringify(lineage)).not.toContain("PRIVATE OUTCOME NOTE");
  });

  it.each([
    ["proposed", "proposed"],
    ["approved", "approved"],
    ["rejected", "rejected"],
    ["superseded", "superseded"],
    ["expired", "expired"],
    ["deleted", "deleted-tombstone"],
  ] as const)("maps %s candidate state to an explicit %s lineage state", (candidateStatus, lineageStatus) => {
    const [lineage] = projectLearningLineages(projection(candidateStatus), { now: new Date("2026-09-02T05:00:00.000Z") });
    expect(lineage.candidate.status).toBe(lineageStatus);
  });

  it("treats an approved rule past its expiry as expired even before projection cleanup", () => {
    const [lineage] = projectLearningLineages(projection(), { now: new Date("2026-12-01T05:00:00.000Z") });
    expect(lineage.rule).toMatchObject({ status: "expired", active: false });
  });

  it("focuses a later receipt on the source lineage that affected it", () => {
    const lineages = projectLearningLineages(projection(), {
      focusReceiptId: "receipt-later",
      now: new Date("2026-09-02T05:00:00.000Z"),
    });
    expect(lineages.map((lineage) => lineage.outcome.outcomeId)).toEqual(["outcome-source"]);
  });
});
