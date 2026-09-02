import { describe, expect, it } from "vitest";
import { evaluationScenarioPack } from "../evaluation/fixtures";
import {
  evaluationScenarioSchema,
  runEvaluationSuite,
} from "./evaluation";

function deterministicClock() {
  let tick = 0;
  return () => {
    tick += 0.25;
    return tick;
  };
}

describe("provider-free Evaluation Lab", () => {
  it("covers every recommendation class and the required adversarial boundaries", () => {
    const ids = evaluationScenarioPack.map((scenario) => scenario.id);
    expect(ids).toEqual(expect.arrayContaining([
      "recommendation-human-led",
      "recommendation-ai-assisted",
      "recommendation-agent-delegated",
      "recommendation-automated",
      "recommendation-more-information",
      "malformed-output-rejected",
      "semantic-validation-rejected",
      "retry-recovers",
      "retry-exhausts",
      "stale-guidance-ignored",
      "expired-guidance-ignored",
      "corrupted-ledger-preserved",
    ]));
  });

  it("reports deterministic pass, retry, validation, latency, and cost evidence", () => {
    const report = runEvaluationSuite(evaluationScenarioPack, deterministicClock());

    expect(report).toMatchObject({
      schemaVersion: "evaluation-report-v1",
      providerMode: "fixture",
      dataSource: "deterministic local fixtures",
      runCount: 12,
      passed: 12,
      failed: 0,
      retries: 2,
      validationFailures: 6,
      cost: "not measured",
      productionTelemetry: false,
      liveProvider: { available: false, ownerInitiatedRequired: true },
    });
    expect(report.latency.totalMs).toBeGreaterThan(0);
    expect(report.latency.meanMs).toBeGreaterThan(0);
    expect(report.results.every((result) => result.latencyMs > 0)).toBe(true);
  });

  it("treats expected rejection and recovery as passing evaluation outcomes", () => {
    const report = runEvaluationSuite(evaluationScenarioPack, deterministicClock());
    const malformed = report.results.find((result) => result.id === "malformed-output-rejected");
    const exhausted = report.results.find((result) => result.id === "retry-exhausts");
    const recovery = report.results.find((result) => result.id === "corrupted-ledger-preserved");

    expect(malformed).toMatchObject({
      status: "passed",
      validationKinds: ["malformed-output"],
      validationFailures: 1,
    });
    expect(exhausted).toMatchObject({
      status: "passed",
      retries: 1,
      validationFailures: 2,
      validationKinds: ["malformed-output", "semantic-validation"],
    });
    expect(recovery).toMatchObject({
      status: "passed",
      validationKinds: ["ledger-validation"],
      validationFailures: 1,
    });
    expect(recovery?.observed).toMatch(/source bytes were preserved/u);
  });

  it("keeps stale and expired guidance inert at the real rule-application seam", () => {
    const report = runEvaluationSuite(evaluationScenarioPack, deterministicClock());
    const guidanceResults = report.results.filter((result) => result.category === "guidance-boundary");

    expect(guidanceResults).toHaveLength(2);
    expect(guidanceResults.every((result) => result.status === "passed")).toBe(true);
    expect(guidanceResults.every((result) => result.observed.startsWith("0 rules applied"))).toBe(true);
  });

  it("strictly rejects unknown scenario fields", () => {
    expect(() => evaluationScenarioSchema.parse({
      ...evaluationScenarioPack[0],
      implicitProviderAction: true,
    })).toThrow();
  });
});
