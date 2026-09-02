import type { EvaluationComparisonFixture } from "../domain/evaluation-comparison";

export const evaluationComparisonFixture: EvaluationComparisonFixture = {
  schemaVersion: "evaluation-comparison-fixture-v1",
  comparisonId: "bounded-perspective-comparison",
  title: "Four bounded traces, one inspectable comparison",
  question: "How do deterministic recommendation traces align when their declared evaluation framing differs?",
  traces: [
    {
      traceId: "safeguard-lens",
      order: 1,
      perspective: "Safeguard lens",
      framing: "Keeps high-accountability work visibly owner-led.",
      scenarioId: "recommendation-human-led",
      inputProvenance: {
        source: "deterministic local fixture",
        fixturePath: "src/evaluation/fixtures.ts",
        fixtureId: "recommendation-human-led",
        summary: "Strict human-led Recommendation Receipt fixture.",
      },
      evidenceProvenance: [
        {
          source: "fixture-declaration",
          reference: "evaluationScenarioPack/recommendation-human-led",
          note: "The expected terminal state and recommendation are versioned in source.",
        },
        {
          source: "evaluation-report",
          reference: "evaluation-report-v1/results/recommendation-human-led",
          note: "Validation and observed outcome come from the current deterministic local run.",
        },
      ],
    },
    {
      traceId: "assist-lens",
      order: 2,
      perspective: "Assist lens",
      framing: "Keeps the owner in control while using AI for bounded support.",
      scenarioId: "recommendation-ai-assisted",
      inputProvenance: {
        source: "deterministic local fixture",
        fixturePath: "src/evaluation/fixtures.ts",
        fixtureId: "recommendation-ai-assisted",
        summary: "Strict AI-assisted Recommendation Receipt fixture.",
      },
      evidenceProvenance: [
        {
          source: "fixture-declaration",
          reference: "evaluationScenarioPack/recommendation-ai-assisted",
          note: "The expected terminal state and recommendation are versioned in source.",
        },
        {
          source: "evaluation-report",
          reference: "evaluation-report-v1/results/recommendation-ai-assisted",
          note: "Validation and observed outcome come from the current deterministic local run.",
        },
      ],
    },
    {
      traceId: "retry-aware-lens",
      order: 3,
      perspective: "Retry-aware lens",
      framing: "Accepts the bounded result only after strict validation recovers within budget.",
      scenarioId: "retry-recovers",
      inputProvenance: {
        source: "deterministic local fixture",
        fixturePath: "src/evaluation/fixtures.ts",
        fixtureId: "retry-recovers",
        summary: "Semantic failure followed by a valid AI-assisted receipt within two attempts.",
      },
      evidenceProvenance: [
        {
          source: "fixture-declaration",
          reference: "evaluationScenarioPack/retry-recovers",
          note: "Both attempts and the fixed retry budget are versioned in source.",
        },
        {
          source: "evaluation-report",
          reference: "evaluation-report-v1/results/retry-recovers",
          note: "Retry and validation outcomes come from the current deterministic local run.",
        },
      ],
    },
    {
      traceId: "delegation-lens",
      order: 4,
      perspective: "Delegation lens",
      framing: "Surfaces the bounded fixture path that recommends agent delegation.",
      scenarioId: "recommendation-agent-delegated",
      inputProvenance: {
        source: "deterministic local fixture",
        fixturePath: "src/evaluation/fixtures.ts",
        fixtureId: "recommendation-agent-delegated",
        summary: "Strict agent-delegated Recommendation Receipt fixture.",
      },
      evidenceProvenance: [
        {
          source: "fixture-declaration",
          reference: "evaluationScenarioPack/recommendation-agent-delegated",
          note: "The expected terminal state and recommendation are versioned in source.",
        },
        {
          source: "evaluation-report",
          reference: "evaluation-report-v1/results/recommendation-agent-delegated",
          note: "Validation and observed outcome come from the current deterministic local run.",
        },
      ],
    },
  ],
};
