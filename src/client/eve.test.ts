import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { fixtureReceipt } from "../../agent/lib/fixture-receipt";
import { resolveFixtureScenario } from "../../agent/lib/fixture-scenario";
import { RECEIPT_SESSION_BUDGET, parseEveReceiptResult } from "./eve";

describe("provider receipt contract", () => {
  it("limits validation correction to one retry and two total sessions", () => {
    expect(RECEIPT_SESSION_BUDGET).toBe(2);
  });

  it("keeps provider instructions aligned to the six-item strict maxima", () => {
    const instructions = readFileSync(new URL("../../agent/instructions.md", import.meta.url), "utf8");
    expect(instructions).toMatch(/`evidence`: one to six/u);
    expect(instructions).toMatch(/`assumptions`: one to six/u);
    expect(instructions).not.toMatch(/one to eight non-empty strings/u);
  });

  it("allows invalid-first evidence only in provider-free fixture mode", () => {
    expect(resolveFixtureScenario("fixture", "invalid-first-receipt")).toBe("invalid-first-receipt");
    expect(() => resolveFixtureScenario("openrouter", "invalid-first-receipt")).toThrow(/fixture-only/u);
  });

  it("overwrites local-only fields before applying the complete Zod receipt contract", () => {
    expect(parseEveReceiptResult({
      ...fixtureReceipt,
      assessmentId: "assessment-model-placeholder",
      runtime: { providerMode: "openrouter", modelId: "provider/model" },
    }, "assessment-local", {
      providerMode: "fixture",
      modelId: "agent-or-not-fixture",
    })).toMatchObject({
      assessmentId: "assessment-local",
      runtime: { providerMode: "fixture", modelId: "agent-or-not-fixture" },
    });
  });

  it("rejects a structurally valid final output that violates semantic starter-pack rules", () => {
    expect(() => parseEveReceiptResult({ ...fixtureReceipt, starterPack: [] }, fixtureReceipt.assessmentId, fixtureReceipt.runtime))
      .toThrow(/strict receipt validation/u);
  });

  it.each([
    [{ ruleId: "rule-model-authored", version: 1, sourceOutcomeId: "outcome-model", explanation: "Model-authored provenance." }],
    { ruleId: "rule-model-authored" },
    undefined,
  ])("rejects non-empty or malformed model-authored applied-rule provenance", (appliedRules) => {
    expect(() => parseEveReceiptResult({ ...fixtureReceipt, appliedRules }, fixtureReceipt.assessmentId, fixtureReceipt.runtime))
      .toThrow(/strict receipt validation/u);
  });
});
