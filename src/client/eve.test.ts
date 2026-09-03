import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { fixtureReceipt } from "../../agent/lib/fixture-receipt";
import { resolveFixtureScenario } from "../../agent/lib/fixture-scenario";
import { RECEIPT_SESSION_BUDGET, localEveStartError, parseCapabilityTrace, parseEveReceiptResult } from "./eve";

const capabilityAnswers = { outcomeStakes: 3, repeatability: 4, specificationClarity: 4, verificationCost: 2, contextSensitivity: 3 };

function actionResult(callId: string, toolName: string, output: unknown, kind: "tool-result" | "load-skill-result" = "tool-result") {
  return {
    type: "action.result",
    data: {
      status: "completed",
      result: kind === "load-skill-result"
        ? { kind, callId, name: "delegation-guidance", output }
        : { kind, callId, toolName, output },
    },
  };
}

const capabilityEvents = [
  { type: "actions.requested", data: { actions: [
    { kind: "load-skill", callId: "skill", input: { skill: "delegation-guidance" } },
    { kind: "tool-call", callId: "search", toolName: "connection_search", input: { connection: "governed-memory", keywords: "approved guidance assessment factors", limit: 1 } },
  ] } },
  actionResult("skill", "load_skill", "Loaded skill instructions."),
  actionResult("search", "connection_search", [{ qualifiedName: "governed-memory__lookup_approved_guidance" }]),
  { type: "actions.requested", data: { actions: [
    { kind: "tool-call", callId: "local", toolName: "derive_delegation_evidence", input: { answers: capabilityAnswers } },
    { kind: "tool-call", callId: "mcp", toolName: "governed-memory__lookup_approved_guidance", input: { answers: capabilityAnswers } },
  ] } },
  actionResult("local", "derive_delegation_evidence", { schemaVersion: "delegation-evidence-v1", suggestedPosture: "agent-delegated", readOnly: true }),
  actionResult("mcp", "governed-memory__lookup_approved_guidance", { structuredContent: {
    schemaVersion: "approved-guidance-v1",
    readOnly: true,
    historicalOutcomesRetrieved: false,
    matchedRules: [{ ruleId: "rule-approved", sourceOutcomeId: "outcome-reviewed" }],
  } }),
];

describe("provider receipt contract", () => {
  it("limits validation correction to one retry and two total sessions", () => {
    expect(RECEIPT_SESSION_BUDGET).toBe(2);
  });

  it("classifies proxy and owner-boundary session-start failures without reflecting response bodies", () => {
    expect(localEveStartError(502)).toMatch(/proxy could not reach its loopback Eve service/u);
    expect(localEveStartError(403)).toMatch(/session boundary rejected/u);
    expect(localEveStartError(418)).toBe("The local Eve session could not start (HTTP 418).");
  });

  it("derives capability provenance from Eve lifecycle events rather than model claims", () => {
    const trace = parseCapabilityTrace(capabilityEvents, capabilityAnswers);
    expect(trace.steps.map((step) => step.kind)).toEqual(["skill", "connection-discovery", "authored-tool", "mcp-tool"]);
    expect(trace.steps[2]).toMatchObject({ suggestedPosture: "agent-delegated", answers: capabilityAnswers, readOnly: true });
    expect(trace.steps[3]).toMatchObject({
      matchedRuleIds: ["rule-approved"],
      sourceOutcomeIds: ["outcome-reviewed"],
      historicalOutcomesRetrieved: false,
      rawOutcomeNotesCrossed: false,
    });
  });

  it("deduplicates an identical replay of an Eve request event without treating it as another capability use", () => {
    const replayed = [capabilityEvents[0], ...capabilityEvents];
    expect(parseCapabilityTrace(replayed, capabilityAnswers).steps).toHaveLength(4);
  });

  it("rejects duplicated or unbounded capability sequences", () => {
    expect(() => parseCapabilityTrace([...capabilityEvents, actionResult("extra", "web_search", {})], capabilityAnswers))
      .toThrow(/exact bounded capability sequence/u);
  });

  it("rejects a lifecycle result whose tool identity does not match its request", () => {
    const mismatched = capabilityEvents.map((event) => structuredClone(event));
    const localResult = mismatched[5] as { data: { result: { toolName: string } } };
    localResult.data.result.toolName = "different_tool";
    expect(() => parseCapabilityTrace(mismatched, capabilityAnswers)).toThrow(/did not match its request/u);
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
