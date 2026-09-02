import { describe, expect, it } from "vitest";
import { fixtureReceipt } from "../../agent/lib/fixture-receipt";
import { canonicalJson } from "../domain/canonical-json";
import { capabilityTraceSchema } from "../domain/capabilities";
import { assessmentSchema, productEventSchema, projectProductEvents } from "../domain/learning";
import { createReceiptVerification, verifyRecommendationEvents } from "./receipt-verification";

const assessment = assessmentSchema.parse({
  schemaVersion: "assessment-v1",
  assessmentId: fixtureReceipt.assessmentId,
  createdAt: "2026-09-01T18:00:00.000Z",
  title: "Draft a bounded internal project brief",
  desiredOutcome: "A concise brief with clear options, evidence, and review points.",
  constraints: "Internal only; under 700 words; no external action.",
  answers: { outcomeStakes: 3, repeatability: 4, specificationClarity: 2, verificationCost: 2, contextSensitivity: 3 },
});

const capabilityTrace = capabilityTraceSchema.parse({
  schemaVersion: "harness-capability-trace-v1",
  steps: [
    { kind: "skill", name: "delegation-guidance", eveCapability: "load_skill", executionBoundary: "Eve instruction context", inputFields: ["skill"], outputSummary: "Instructions loaded on demand; no code or tool executed." },
    { kind: "connection-discovery", name: "connection_search", eveCapability: "connection_search", executionBoundary: "Eve connection registry", inputFields: ["connection", "keywords", "limit"], discoveredTools: ["governed-memory__lookup_approved_guidance"], outputSummary: "One allowlisted MCP tool definition discovered; no memory data read." },
    { kind: "authored-tool", name: "derive_delegation_evidence", eveCapability: "defineTool", executionBoundary: "local Eve application runtime", inputFields: ["outcomeStakes", "repeatability", "specificationClarity", "verificationCost", "contextSensitivity"], answers: assessment.answers, suggestedPosture: "ai-assisted", readOnly: true, outputSummary: "Deterministic delegation signals and guardrails returned." },
    { kind: "mcp-tool", name: "governed-memory__lookup_approved_guidance", eveCapability: "defineMcpClientConnection + Pydantic MCPServer", executionBoundary: "127.0.0.1 Streamable HTTP", inputFields: ["outcomeStakes", "repeatability", "specificationClarity", "verificationCost", "contextSensitivity"], answers: assessment.answers, matchedRuleIds: [], sourceOutcomeIds: [], readOnly: true, historicalOutcomesRetrieved: false, rawOutcomeNotesCrossed: false, outputSummary: "Only matching approved-rule provenance returned; raw outcomes stayed behind the MCP boundary." },
  ],
});

describe("receipt verification replay", () => {
  it("persists five deterministic gates and stable canonical hashes", () => {
    const verification = createReceiptVerification(assessment, fixtureReceipt, capabilityTrace, {
      sessionAttemptsUsed: 2,
      sessionAttemptBudget: 2,
    });
    const event = productEventSchema.parse({
      eventId: "event-verification",
      occurredAt: "2026-09-01T18:01:00.000Z",
      type: "recommendation.recorded",
      assessment,
      receipt: fixtureReceipt,
      capabilityTrace,
      verification,
    });

    expect(() => verifyRecommendationEvents([event])).not.toThrow();
    expect(verification.gates).toHaveLength(5);
    expect(verification.assessmentInputHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(verification.recordedReceiptHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(projectProductEvents([event]).receiptVerifications[fixtureReceipt.receiptId]).toEqual(verification);
    expect(canonicalJson({ b: 2, a: { d: 4, c: 3 } })).toBe(canonicalJson({ a: { c: 3, d: 4 }, b: 2 }));
  });

  it("fails replay after a valid receipt is changed without regenerating evidence", () => {
    const verification = createReceiptVerification(assessment, fixtureReceipt, capabilityTrace, {
      sessionAttemptsUsed: 1,
      sessionAttemptBudget: 2,
    });
    const tampered = productEventSchema.parse({
      eventId: "event-tampered",
      occurredAt: "2026-09-01T18:01:00.000Z",
      type: "recommendation.recorded",
      assessment,
      receipt: { ...fixtureReceipt, summary: "A different but schema-valid summary." },
      capabilityTrace,
      verification,
    });

    expect(() => verifyRecommendationEvents([tampered])).toThrow(/verification replay failed/u);
  });

  it("rejects attempts beyond the declared retry budget", () => {
    expect(() => createReceiptVerification(assessment, fixtureReceipt, capabilityTrace, {
      sessionAttemptsUsed: 3,
      sessionAttemptBudget: 2,
    })).toThrow(/cannot exceed/u);
  });
});
