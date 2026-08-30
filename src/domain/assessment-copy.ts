import type { assessmentFactors } from "./learning";

type AssessmentFactor = (typeof assessmentFactors)[number];

export const assessmentFactorCopy: Record<AssessmentFactor, {
  title: string;
  help: string;
  labels: readonly [string, string, string, string, string];
}> = {
  outcomeStakes: {
    title: "How costly would a wrong result be?",
    help: "Consider financial, legal, safety, reputational, and recovery impact.",
    labels: [
      "1 — Negligible; quickly reversible",
      "2 — Limited; easy to recover",
      "3 — Material; needs planned recovery",
      "4 — Serious; difficult to undo",
      "5 — Critical; irreversible or safety-sensitive",
    ],
  },
  repeatability: {
    title: "How repeatable is the work?",
    help: "Consider whether the same pattern and inputs recur.",
    labels: [
      "1 — One-off; every case is different",
      "2 — Rarely repeated; substantial variation",
      "3 — Sometimes repeated; a partial pattern exists",
      "4 — Often repeated; inputs are mostly consistent",
      "5 — Highly repeatable; standard inputs and steps",
    ],
  },
  specificationClarity: {
    title: "How clearly can the work be specified?",
    help: "Consider whether success, constraints, and edge cases can be written down.",
    labels: [
      "1 — Tacit; success cannot yet be stated",
      "2 — Ambiguous; major constraints are missing",
      "3 — Partial; the main path is described",
      "4 — Clear; success and constraints are explicit",
      "5 — Fully specified; edge cases and tests are defined",
    ],
  },
  verificationCost: {
    title: "How costly is it to verify the output?",
    help: "Consider the time and expertise needed to catch a plausible error.",
    labels: [
      "1 — Trivial; errors are immediately obvious",
      "2 — Low; a quick review is enough",
      "3 — Moderate; structured review is needed",
      "4 — High; specialist review is slow",
      "5 — Extreme; reliable verification is impractical",
    ],
  },
  contextSensitivity: {
    title: "How much tacit context does a good result need?",
    help: "Consider relationships, judgment, culture, timing, and unstated constraints.",
    labels: [
      "1 — Context-light; written inputs are sufficient",
      "2 — Limited; a few local details matter",
      "3 — Mixed; judgment supplements written context",
      "4 — Context-heavy; substantial tacit knowledge matters",
      "5 — Deeply contextual; relationships and timing dominate",
    ],
  },
};
