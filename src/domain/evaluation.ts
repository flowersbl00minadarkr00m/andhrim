import { z } from "zod";
import {
  activeRuleSchema,
  applyApprovedRules,
  assessmentSchema,
  productEventSchema,
  projectProductEvents,
} from "./learning";
import {
  RECOMMENDATION_MODES,
  recommendationReceiptSchema,
} from "./recommendation";

const scenarioBase = {
  id: z.string().regex(/^[a-z0-9-]+$/u),
  title: z.string().trim().min(1).max(100),
  category: z.enum([
    "recommendation",
    "output-validation",
    "retry-control",
    "guidance-boundary",
    "ledger-recovery",
  ]),
  expectation: z.string().trim().min(1).max(240),
};

const receiptScenarioSchema = z.object({
  ...scenarioBase,
  kind: z.literal("receipt"),
  attempts: z.array(z.unknown()).min(1).max(3),
  maxAttempts: z.number().int().min(1).max(3),
  expectedTerminal: z.enum(["accepted", "rejected"]),
  expectedRecommendation: z.enum(RECOMMENDATION_MODES).optional(),
}).strict();

const guidanceScenarioSchema = z.object({
  ...scenarioBase,
  kind: z.literal("guidance"),
  assessment: assessmentSchema,
  receipt: recommendationReceiptSchema,
  rule: activeRuleSchema,
  evaluatedAt: z.iso.datetime(),
  expectedAppliedRuleCount: z.number().int().nonnegative().max(1),
  expectedRecommendation: z.enum(RECOMMENDATION_MODES),
}).strict();

const ledgerScenarioSchema = z.object({
  ...scenarioBase,
  kind: z.literal("ledger"),
  rawLedger: z.string().min(1).max(20_000),
  expectedTerminal: z.literal("recovery-preserves-source"),
}).strict();

export const evaluationScenarioSchema = z.discriminatedUnion("kind", [
  receiptScenarioSchema,
  guidanceScenarioSchema,
  ledgerScenarioSchema,
]).superRefine((scenario, context) => {
  if (scenario.kind === "receipt" && scenario.maxAttempts > scenario.attempts.length) {
    context.addIssue({
      code: "custom",
      path: ["maxAttempts"],
      message: "The retry budget cannot exceed the supplied deterministic attempts.",
    });
  }
  if (scenario.kind === "receipt"
    && scenario.expectedTerminal === "accepted"
    && !scenario.expectedRecommendation) {
    context.addIssue({
      code: "custom",
      path: ["expectedRecommendation"],
      message: "Accepted receipt scenarios must name the expected recommendation.",
    });
  }
});

export type EvaluationScenario = z.infer<typeof evaluationScenarioSchema>;

const validationKindSchema = z.enum(["malformed-output", "semantic-validation", "ledger-validation"]);

export const evaluationScenarioResultSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/u),
  title: z.string().min(1),
  category: z.enum([
    "recommendation",
    "output-validation",
    "retry-control",
    "guidance-boundary",
    "ledger-recovery",
  ]),
  expectation: z.string().min(1),
  status: z.enum(["passed", "failed"]),
  observed: z.string().min(1),
  retries: z.number().int().nonnegative(),
  validationFailures: z.number().int().nonnegative(),
  validationKinds: z.array(validationKindSchema),
  latencyMs: z.number().nonnegative(),
}).strict();

export const evaluationReportSchema = z.object({
  schemaVersion: z.literal("evaluation-report-v1"),
  providerMode: z.literal("fixture"),
  dataSource: z.literal("deterministic local fixtures"),
  runCount: z.number().int().positive(),
  passed: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  retries: z.number().int().nonnegative(),
  validationFailures: z.number().int().nonnegative(),
  latency: z.object({
    totalMs: z.number().nonnegative(),
    meanMs: z.number().nonnegative(),
    basis: z.literal("measured local execution"),
  }).strict(),
  cost: z.literal("not measured"),
  productionTelemetry: z.literal(false),
  liveProvider: z.object({
    available: z.literal(false),
    ownerInitiatedRequired: z.literal(true),
    note: z.string().min(1),
  }).strict(),
  results: z.array(evaluationScenarioResultSchema).min(1),
}).strict();

export type EvaluationReport = z.infer<typeof evaluationReportSchema>;
export type EvaluationClock = () => number;

type AttemptFailure = {
  kind: z.infer<typeof validationKindSchema>;
  detail: string;
};

function roundedDuration(start: number, end: number) {
  return Number(Math.max(0, end - start).toFixed(3));
}

function firstIssue(error: z.ZodError) {
  const issue = error.issues[0];
  const location = issue?.path.length ? `${issue.path.join(".")}: ` : "";
  return `${location}${issue?.message ?? "Receipt failed strict validation."}`;
}

function parseReceiptAttempt(value: unknown):
  | { success: true; receipt: z.infer<typeof recommendationReceiptSchema> }
  | { success: false; failure: AttemptFailure } {
  let candidate = value;
  if (typeof candidate === "string") {
    try {
      candidate = JSON.parse(candidate) as unknown;
    } catch {
      return {
        success: false,
        failure: { kind: "malformed-output", detail: "Output was not valid JSON." },
      };
    }
  }
  const parsed = recommendationReceiptSchema.safeParse(candidate);
  if (!parsed.success) {
    return {
      success: false,
      failure: { kind: "semantic-validation", detail: firstIssue(parsed.error) },
    };
  }
  return { success: true, receipt: parsed.data };
}

function runReceiptScenario(
  scenario: z.infer<typeof receiptScenarioSchema>,
): Omit<z.infer<typeof evaluationScenarioResultSchema>, "latencyMs"> {
  let accepted: z.infer<typeof recommendationReceiptSchema> | undefined;
  const failures: AttemptFailure[] = [];
  let attemptsUsed = 0;

  for (const candidate of scenario.attempts.slice(0, scenario.maxAttempts)) {
    attemptsUsed += 1;
    const parsed = parseReceiptAttempt(candidate);
    if (parsed.success) {
      accepted = parsed.receipt;
      break;
    }
    failures.push(parsed.failure);
  }

  const terminal = accepted ? "accepted" : "rejected";
  const recommendationMatches = !accepted
    || !scenario.expectedRecommendation
    || accepted.recommendation === scenario.expectedRecommendation;
  const passed = terminal === scenario.expectedTerminal && recommendationMatches;
  const observed = accepted
    ? `Accepted ${accepted.recommendation} after ${attemptsUsed} attempt${attemptsUsed === 1 ? "" : "s"}.`
    : `Rejected after ${attemptsUsed} attempt${attemptsUsed === 1 ? "" : "s"}; no invalid receipt escaped validation.`;

  return {
    id: scenario.id,
    title: scenario.title,
    category: scenario.category,
    expectation: scenario.expectation,
    status: passed ? "passed" : "failed",
    observed,
    retries: Math.max(0, attemptsUsed - 1),
    validationFailures: failures.length,
    validationKinds: [...new Set(failures.map((failure) => failure.kind))],
  };
}

function runGuidanceScenario(
  scenario: z.infer<typeof guidanceScenarioSchema>,
): Omit<z.infer<typeof evaluationScenarioResultSchema>, "latencyMs"> {
  const receipt = applyApprovedRules(
    scenario.assessment,
    scenario.receipt,
    [scenario.rule],
    new Date(scenario.evaluatedAt),
  );
  const appliedCount = receipt.appliedRules.length;
  const passed = appliedCount === scenario.expectedAppliedRuleCount
    && receipt.recommendation === scenario.expectedRecommendation;

  return {
    id: scenario.id,
    title: scenario.title,
    category: scenario.category,
    expectation: scenario.expectation,
    status: passed ? "passed" : "failed",
    observed: `${appliedCount} rule${appliedCount === 1 ? "" : "s"} applied; recommendation remained ${receipt.recommendation}.`,
    retries: 0,
    validationFailures: 0,
    validationKinds: [],
  };
}

function inspectLedgerWithoutMutation(rawLedger: string) {
  try {
    const events = rawLedger
      .split(/\r?\n/u)
      .filter((line) => line.trim().length > 0)
      .map((line) => productEventSchema.parse(JSON.parse(line) as unknown));
    projectProductEvents(events);
    return { accepted: true, recoveryBytes: "" };
  } catch {
    return { accepted: false, recoveryBytes: rawLedger };
  }
}

function runLedgerScenario(
  scenario: z.infer<typeof ledgerScenarioSchema>,
): Omit<z.infer<typeof evaluationScenarioResultSchema>, "latencyMs"> {
  const inspection = inspectLedgerWithoutMutation(scenario.rawLedger);
  const sourcePreserved = inspection.recoveryBytes === scenario.rawLedger;
  const passed = !inspection.accepted && sourcePreserved;

  return {
    id: scenario.id,
    title: scenario.title,
    category: scenario.category,
    expectation: scenario.expectation,
    status: passed ? "passed" : "failed",
    observed: passed
      ? `Corruption was rejected and all ${scenario.rawLedger.length} source bytes were preserved for owner-led recovery.`
      : "The corrupted source did not reach the required fail-closed recovery state.",
    retries: 0,
    validationFailures: inspection.accepted ? 0 : 1,
    validationKinds: inspection.accepted ? [] : ["ledger-validation"],
  };
}

function runScenario(scenario: EvaluationScenario, clock: EvaluationClock) {
  const startedAt = clock();
  let result: Omit<z.infer<typeof evaluationScenarioResultSchema>, "latencyMs">;
  switch (scenario.kind) {
    case "receipt":
      result = runReceiptScenario(scenario);
      break;
    case "guidance":
      result = runGuidanceScenario(scenario);
      break;
    case "ledger":
      result = runLedgerScenario(scenario);
      break;
  }
  return evaluationScenarioResultSchema.parse({
    ...result,
    latencyMs: roundedDuration(startedAt, clock()),
  });
}

export function runEvaluationSuite(
  values: readonly unknown[],
  clock: EvaluationClock = () => performance.now(),
): EvaluationReport {
  const scenarios = z.array(evaluationScenarioSchema).min(1).parse(values);
  const startedAt = clock();
  const results = scenarios.map((scenario) => runScenario(scenario, clock));
  const totalMs = roundedDuration(startedAt, clock());
  const passed = results.filter((result) => result.status === "passed").length;

  return evaluationReportSchema.parse({
    schemaVersion: "evaluation-report-v1",
    providerMode: "fixture",
    dataSource: "deterministic local fixtures",
    runCount: results.length,
    passed,
    failed: results.length - passed,
    retries: results.reduce((total, result) => total + result.retries, 0),
    validationFailures: results.reduce((total, result) => total + result.validationFailures, 0),
    latency: {
      totalMs,
      meanMs: Number((totalMs / results.length).toFixed(3)),
      basis: "measured local execution",
    },
    cost: "not measured",
    productionTelemetry: false,
    liveProvider: {
      available: false,
      ownerInitiatedRequired: true,
      note: "This lab has no live-provider action. Any future live measurement must be an explicit, cost-bearing owner action through the existing guarded boundary.",
    },
    results,
  });
}
