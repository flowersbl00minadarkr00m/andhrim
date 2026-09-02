import { z } from "zod";
import {
  evaluationReportSchema,
  evaluationScenarioSchema,
  type EvaluationReport,
  type EvaluationScenario,
} from "./evaluation";
import { RECOMMENDATION_MODES } from "./recommendation";

const boundedText = (maximum: number) => z.string().trim().min(1).max(maximum);
const identifier = z.string().regex(/^[a-z0-9-]+$/u);
const recommendationSchema = z.enum(RECOMMENDATION_MODES);

const inputProvenanceSchema = z.object({
  source: z.literal("deterministic local fixture"),
  fixturePath: z.literal("src/evaluation/fixtures.ts"),
  fixtureId: identifier,
  summary: boundedText(240),
}).strict();

const evidenceProvenanceSchema = z.object({
  source: z.enum(["fixture-declaration", "evaluation-report"]),
  reference: boundedText(180),
  note: boundedText(240),
}).strict();

export const evaluationComparisonTraceFixtureSchema = z.object({
  traceId: identifier,
  order: z.number().int().min(1).max(12),
  perspective: boundedText(80),
  framing: boundedText(240),
  scenarioId: identifier,
  inputProvenance: inputProvenanceSchema,
  evidenceProvenance: z.array(evidenceProvenanceSchema).min(2).max(4),
}).strict().superRefine((trace, context) => {
  if (trace.inputProvenance.fixtureId !== trace.scenarioId) {
    context.addIssue({
      code: "custom",
      path: ["inputProvenance", "fixtureId"],
      message: "Input provenance must identify the referenced evaluation scenario.",
    });
  }
  for (const source of ["fixture-declaration", "evaluation-report"] as const) {
    if (!trace.evidenceProvenance.some((entry) => entry.source === source)) {
      context.addIssue({
        code: "custom",
        path: ["evidenceProvenance"],
        message: `Comparison traces require ${source} provenance.`,
      });
    }
  }
});

export const evaluationComparisonFixtureSchema = z.object({
  schemaVersion: z.literal("evaluation-comparison-fixture-v1"),
  comparisonId: identifier,
  title: boundedText(120),
  question: boundedText(240),
  traces: z.array(evaluationComparisonTraceFixtureSchema).min(2).max(6),
}).strict().superRefine((fixture, context) => {
  const traceIds = fixture.traces.map((trace) => trace.traceId);
  const orders = fixture.traces.map((trace) => trace.order);
  if (new Set(traceIds).size !== traceIds.length) {
    context.addIssue({ code: "custom", path: ["traces"], message: "Trace identifiers must be unique." });
  }
  if (new Set(orders).size !== orders.length) {
    context.addIssue({ code: "custom", path: ["traces"], message: "Trace ordering values must be unique." });
  }
});

const validationProjectionSchema = z.object({
  status: z.enum(["passed", "failed"]),
  observed: boundedText(500),
  retries: z.number().int().nonnegative(),
  validationFailures: z.number().int().nonnegative(),
  validationKinds: z.array(z.enum(["malformed-output", "semantic-validation", "ledger-validation"])),
}).strict();

export const evaluationComparisonTraceSchema = z.object({
  traceId: identifier,
  order: z.number().int().min(1).max(12),
  perspective: boundedText(80),
  framing: boundedText(240),
  scenarioId: identifier,
  inputProvenance: inputProvenanceSchema,
  evidenceProvenance: z.array(evidenceProvenanceSchema).min(2).max(4),
  validation: validationProjectionSchema,
  recommendation: recommendationSchema,
}).strict();

const recommendationGroupSchema = z.object({
  recommendation: recommendationSchema,
  count: z.number().int().positive(),
  traceIds: z.array(identifier).min(1),
}).strict();

export const evaluationComparisonProjectionSchema = z.object({
  schemaVersion: z.literal("evaluation-comparison-projection-v1"),
  comparisonId: identifier,
  title: boundedText(120),
  question: boundedText(240),
  boundary: z.object({
    origin: z.literal("synthetic deterministic comparison traces"),
    readOnly: z.literal(true),
    spawnedAgents: z.literal(false),
    liveModelOutputs: z.literal(false),
    productionTelemetry: z.literal(false),
  }).strict(),
  agreement: z.object({
    state: z.enum(["unanimous", "partial", "split"]),
    leadingRecommendation: recommendationSchema.nullable(),
    leadingCount: z.number().int().positive(),
    total: z.number().int().min(2).max(6),
    groups: z.array(recommendationGroupSchema).min(1),
    summary: boundedText(240),
  }).strict(),
  traces: z.array(evaluationComparisonTraceSchema).min(2).max(6),
}).strict();

export type EvaluationComparisonFixture = z.infer<typeof evaluationComparisonFixtureSchema>;
export type EvaluationComparisonProjection = z.infer<typeof evaluationComparisonProjectionSchema>;

function recommendationForScenario(scenario: EvaluationScenario) {
  if (scenario.kind === "receipt"
    && scenario.expectedTerminal === "accepted"
    && scenario.expectedRecommendation) {
    return scenario.expectedRecommendation;
  }
  if (scenario.kind === "guidance") return scenario.expectedRecommendation;
  throw new Error(`Scenario ${scenario.id} does not produce a bounded recommendation.`);
}

function createAgreement(traces: EvaluationComparisonProjection["traces"]) {
  const groups = RECOMMENDATION_MODES.map((recommendation) => {
    const matching = traces.filter((trace) => trace.recommendation === recommendation);
    return {
      recommendation,
      count: matching.length,
      traceIds: matching.map((trace) => trace.traceId),
    };
  }).filter((group) => group.count > 0);
  const leadingCount = Math.max(...groups.map((group) => group.count));
  const leaders = groups.filter((group) => group.count === leadingCount);
  const leadingRecommendation = leaders.length === 1 ? leaders[0].recommendation : null;
  const state = groups.length === 1 ? "unanimous" : leadingRecommendation && leadingCount > 1 ? "partial" : "split";
  const summary = state === "unanimous"
    ? `All ${traces.length} traces agree on ${leadingRecommendation}.`
    : state === "partial"
      ? `${leadingCount} of ${traces.length} traces agree on ${leadingRecommendation}; the remaining traces disagree.`
      : `The ${traces.length} traces split without a shared leading recommendation.`;
  return { state, leadingRecommendation, leadingCount, total: traces.length, groups, summary };
}

export function projectEvaluationComparison(
  reportValue: EvaluationReport,
  scenarioValues: readonly EvaluationScenario[],
  fixtureValue: EvaluationComparisonFixture,
): EvaluationComparisonProjection {
  const report = evaluationReportSchema.parse(reportValue);
  const scenarios = z.array(evaluationScenarioSchema).min(1).parse(scenarioValues);
  const fixture = evaluationComparisonFixtureSchema.parse(fixtureValue);
  const scenarioById = new Map(scenarios.map((scenario) => [scenario.id, scenario]));
  const resultById = new Map(report.results.map((result) => [result.id, result]));

  const traces = fixture.traces
    .map((trace) => {
      const scenario = scenarioById.get(trace.scenarioId);
      const result = resultById.get(trace.scenarioId);
      if (!scenario || !result) {
        throw new Error(`Comparison trace ${trace.traceId} references missing scenario evidence.`);
      }
      return evaluationComparisonTraceSchema.parse({
        ...trace,
        validation: {
          status: result.status,
          observed: result.observed,
          retries: result.retries,
          validationFailures: result.validationFailures,
          validationKinds: result.validationKinds,
        },
        recommendation: recommendationForScenario(scenario),
      });
    })
    .sort((left, right) => left.order - right.order || left.traceId.localeCompare(right.traceId));

  return evaluationComparisonProjectionSchema.parse({
    schemaVersion: "evaluation-comparison-projection-v1",
    comparisonId: fixture.comparisonId,
    title: fixture.title,
    question: fixture.question,
    boundary: {
      origin: "synthetic deterministic comparison traces",
      readOnly: true,
      spawnedAgents: false,
      liveModelOutputs: false,
      productionTelemetry: false,
    },
    agreement: createAgreement(traces),
    traces,
  });
}
