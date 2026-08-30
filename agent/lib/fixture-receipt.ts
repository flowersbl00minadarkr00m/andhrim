import type { RecommendationReceipt } from "../../src/domain/recommendation";

export const fixtureReceipt = {
  schemaVersion: "recommendation-receipt-v1",
  receiptId: "receipt-provider-free-seam",
  assessmentId: "assessment-provider-free-seam",
  recommendation: "ai-assisted",
  summary: "Use AI to draft and compare options while the owner retains the decision.",
  why: "The work is repeatable and well specified, but its consequences still benefit from accountable human review.",
  evidence: [
    "Success criteria can be stated before work begins.",
    "The output can be checked against a bounded review list.",
    "A wrong result would be noticeable before an external commitment.",
  ],
  assumptions: [
    "The owner will review external-facing output.",
    "Required context is available locally.",
  ],
  confidence: {
    score: 72,
    label: "medium-high",
    uncertainty: "The sensitivity of unstated context may change the recommendation.",
  },
  autonomyBoundary: {
    allowed: ["Draft, compare, and prepare options."],
    prohibited: ["Do not decide, publish, purchase, or contact anyone."],
  },
  starterPack: [
    { id: "starter-1", label: "Goal", content: "Prepare a concise recommendation with explicit trade-offs." },
    { id: "starter-2", label: "Review", content: "Check facts, assumptions, constraints, and external impact before use." },
  ],
  appliedRules: [],
  runtime: { providerMode: "fixture", modelId: "agent-or-not-fixture" },
} satisfies RecommendationReceipt;
