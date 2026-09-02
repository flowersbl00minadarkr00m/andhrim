import { describe, expect, it } from "vitest";
import { evaluationComparisonFixture } from "../evaluation/comparison-fixtures";
import { evaluationScenarioPack } from "../evaluation/fixtures";
import {
  evaluationComparisonFixtureSchema,
  evaluationComparisonProjectionSchema,
  projectEvaluationComparison,
} from "./evaluation-comparison";
import { runEvaluationSuite } from "./evaluation";

function deterministicClock() {
  let tick = 0;
  return () => {
    tick += 0.25;
    return tick;
  };
}

function report() {
  return runEvaluationSuite(evaluationScenarioPack, deterministicClock());
}

describe("read-only evaluation comparison projection", () => {
  it("projects agreement and disagreement from deterministic report evidence", () => {
    const projection = projectEvaluationComparison(report(), evaluationScenarioPack, evaluationComparisonFixture);

    expect(projection.agreement).toMatchObject({
      state: "partial",
      leadingRecommendation: "ai-assisted",
      leadingCount: 2,
      total: 4,
    });
    expect(projection.agreement.groups).toEqual([
      { recommendation: "human-led", count: 1, traceIds: ["safeguard-lens"] },
      { recommendation: "ai-assisted", count: 2, traceIds: ["assist-lens", "retry-aware-lens"] },
      { recommendation: "agent-delegated", count: 1, traceIds: ["delegation-lens"] },
    ]);
  });

  it("detects unanimous agreement without inventing another evidence source", () => {
    const fixture = {
      ...evaluationComparisonFixture,
      comparisonId: "unanimous-comparison",
      traces: evaluationComparisonFixture.traces.slice(0, 3).map((trace, index) => ({
        ...trace,
        traceId: `unanimous-trace-${index + 1}`,
        order: index + 1,
        scenarioId: "recommendation-ai-assisted",
        inputProvenance: {
          ...trace.inputProvenance,
          fixtureId: "recommendation-ai-assisted",
        },
      })),
    };

    const projection = projectEvaluationComparison(report(), evaluationScenarioPack, fixture);
    expect(projection.agreement).toMatchObject({
      state: "unanimous",
      leadingRecommendation: "ai-assisted",
      leadingCount: 3,
      total: 3,
    });
  });

  it("preserves declared provenance and applies stable order", () => {
    const reversed = {
      ...evaluationComparisonFixture,
      traces: [...evaluationComparisonFixture.traces].reverse(),
    };
    const projection = projectEvaluationComparison(report(), evaluationScenarioPack, reversed);

    expect(projection.traces.map((trace) => trace.traceId)).toEqual([
      "safeguard-lens",
      "assist-lens",
      "retry-aware-lens",
      "delegation-lens",
    ]);
    for (const trace of projection.traces) {
      const source = evaluationComparisonFixture.traces.find((candidate) => candidate.traceId === trace.traceId);
      expect(trace.inputProvenance).toEqual(source?.inputProvenance);
      expect(trace.evidenceProvenance).toEqual(source?.evidenceProvenance);
    }
  });

  it("keeps comparison classification explicitly synthetic and read-only", () => {
    const projection = projectEvaluationComparison(report(), evaluationScenarioPack, evaluationComparisonFixture);
    expect(projection.boundary).toEqual({
      origin: "synthetic deterministic comparison traces",
      readOnly: true,
      spawnedAgents: false,
      liveModelOutputs: false,
      productionTelemetry: false,
    });
    expect(projection.traces.find((trace) => trace.traceId === "retry-aware-lens")?.validation).toMatchObject({
      status: "passed",
      retries: 1,
      validationFailures: 1,
      validationKinds: ["semantic-validation"],
    });
  });

  it("strictly rejects unknown fixture and projection fields", () => {
    expect(() => evaluationComparisonFixtureSchema.parse({
      ...evaluationComparisonFixture,
      implicitProviderFallback: true,
    })).toThrow();
    expect(() => evaluationComparisonFixtureSchema.parse({
      ...evaluationComparisonFixture,
      traces: [
        { ...evaluationComparisonFixture.traces[0], hiddenToolAction: true },
        ...evaluationComparisonFixture.traces.slice(1),
      ],
    })).toThrow();

    const projection = projectEvaluationComparison(report(), evaluationScenarioPack, evaluationComparisonFixture);
    expect(() => evaluationComparisonProjectionSchema.parse({
      ...projection,
      hiddenTelemetry: true,
    })).toThrow();
  });
});
