import { describe, expect, it } from "vitest";
import { fixtureReceipt } from "../../agent/lib/fixture-receipt";
import { capabilityTraceSchema } from "./capabilities";
import {
  applyApprovedRules,
  assessmentSchema,
  outcomeSchema,
  productEventSchema,
  projectProductEvents,
  proposeLearningCandidate,
  validateReceiptStarterPackRevision,
} from "./learning";

const assessment = assessmentSchema.parse({
  schemaVersion: "assessment-v1",
  assessmentId: fixtureReceipt.assessmentId,
  createdAt: "2026-08-30T05:00:00.000Z",
  title: "Draft a bounded project brief",
  desiredOutcome: "A concise internal brief with evidence and review points.",
  constraints: "Internal only; under 700 words.",
  answers: { outcomeStakes: 3, repeatability: 4, specificationClarity: 2, verificationCost: 2, contextSensitivity: 3 },
});

const outcome = outcomeSchema.parse({
  schemaVersion: "outcome-v1",
  outcomeId: "outcome-provider-free-seam",
  receiptId: fixtureReceipt.receiptId,
  recordedAt: "2026-08-30T05:10:00.000Z",
  rating: 2,
  correctionNotes: "The scope constraint was tighter than expected.",
  notes: "The draft was useful after review.",
});

function event(eventId: string, value: object) {
  return productEventSchema.parse({ eventId, occurredAt: "2026-08-30T05:20:00.000Z", ...value });
}

describe("owner-approved learning projection", () => {
  it("persists observed capability provenance alongside its receipt", () => {
    const capabilityTrace = capabilityTraceSchema.parse({
      schemaVersion: "harness-capability-trace-v1",
      steps: [
        { kind: "skill", name: "delegation-guidance", eveCapability: "load_skill", executionBoundary: "Eve instruction context", inputFields: ["skill"], outputSummary: "Instructions loaded on demand; no code or tool executed." },
        { kind: "connection-discovery", name: "connection_search", eveCapability: "connection_search", executionBoundary: "Eve connection registry", inputFields: ["connection", "keywords", "limit"], discoveredTools: ["governed-memory__lookup_approved_guidance"], outputSummary: "One allowlisted MCP tool definition discovered; no memory data read." },
        { kind: "authored-tool", name: "derive_delegation_evidence", eveCapability: "defineTool", executionBoundary: "local Eve application runtime", inputFields: ["outcomeStakes", "repeatability", "specificationClarity", "verificationCost", "contextSensitivity"], answers: assessment.answers, suggestedPosture: "ai-assisted", readOnly: true, outputSummary: "Deterministic delegation signals and guardrails returned." },
        { kind: "mcp-tool", name: "governed-memory__lookup_approved_guidance", eveCapability: "defineMcpClientConnection + Pydantic MCPServer", executionBoundary: "127.0.0.1 Streamable HTTP", inputFields: ["outcomeStakes", "repeatability", "specificationClarity", "verificationCost", "contextSensitivity"], answers: assessment.answers, matchedRuleIds: [], sourceOutcomeIds: [], readOnly: true, historicalOutcomesRetrieved: false, rawOutcomeNotesCrossed: false, outputSummary: "Only matching approved-rule provenance returned; raw outcomes stayed behind the MCP boundary." },
      ],
    });
    const state = projectProductEvents([
      event("event-recommendation", { type: "recommendation.recorded", assessment, receipt: fixtureReceipt, capabilityTrace }),
    ]);
    expect(state.capabilityTraces[fixtureReceipt.receiptId]).toEqual(capabilityTrace);
  });

  it("permits starter-pack edits without allowing receipt invariants to change", () => {
    const edited = validateReceiptStarterPackRevision(fixtureReceipt, {
      ...fixtureReceipt,
      starterPack: fixtureReceipt.starterPack.map((item, index) => index === 0 ? { ...item, content: "Owner-edited local instruction." } : item),
    });
    expect(edited.starterPack[0].content).toBe("Owner-edited local instruction.");
    expect(() => validateReceiptStarterPackRevision(fixtureReceipt, { ...edited, recommendation: "automated" })).toThrow(/Only the Work Starter Pack/u);
  });

  it("keeps a proposed candidate inert", () => {
    const candidate = proposeLearningCandidate(outcome, new Date("2026-08-30T05:20:00.000Z"));
    const state = projectProductEvents([
      event("event-recommendation", { type: "recommendation.recorded", assessment, receipt: fixtureReceipt }),
      event("event-outcome", { type: "outcome.recorded", outcome }),
      event("event-proposal", { type: "learning.proposed", candidate }),
    ]);
    expect(applyApprovedRules(assessment, fixtureReceipt, Object.values(state.rules)).appliedRules).toEqual([]);
  });

  it("keeps empty model provenance separate from explicit owner-approved local projection", () => {
    const candidate = proposeLearningCandidate(outcome, new Date("2026-08-30T05:20:00.000Z"));
    const rule = {
      ruleId: "rule-scope-clarity",
      version: 1,
      candidateId: candidate.candidateId,
      sourceOutcomeId: outcome.outcomeId,
      approvedAt: "2026-08-30T05:25:00.000Z",
      reviewAt: candidate.reviewAt,
      expiresAt: candidate.expiresAt,
      active: true,
      explanation: "Tighter scope needs stronger human review.",
      condition: candidate.condition,
      adjustment: candidate.adjustment,
    };
    const state = projectProductEvents([
      event("event-recommendation", { type: "recommendation.recorded", assessment, receipt: fixtureReceipt }),
      event("event-outcome", { type: "outcome.recorded", outcome }),
      event("event-proposal", { type: "learning.proposed", candidate }),
      event("event-approval", { type: "learning.approved", candidateId: candidate.candidateId, rule }),
    ]);
    expect(fixtureReceipt.appliedRules).toEqual([]);
    const adjusted = applyApprovedRules(assessment, fixtureReceipt, Object.values(state.rules));
    expect(adjusted.recommendation).toBe("human-led");
    expect(adjusted.summary).toMatch(/adjusted this receipt from ai-assisted to human-led/u);
    expect(adjusted.appliedRules[0]).toMatchObject({ ruleId: rule.ruleId, version: 1, sourceOutcomeId: outcome.outcomeId });
  });

  it("deactivates an approved rule after deletion", () => {
    const candidate = proposeLearningCandidate(outcome, new Date("2026-08-30T05:20:00.000Z"));
    const rule = {
      ruleId: "rule-scope-delete",
      version: 1,
      candidateId: candidate.candidateId,
      sourceOutcomeId: outcome.outcomeId,
      approvedAt: "2026-08-30T05:25:00.000Z",
      reviewAt: candidate.reviewAt,
      expiresAt: candidate.expiresAt,
      active: true,
      explanation: "Tighter scope needs stronger human review.",
      condition: candidate.condition,
      adjustment: candidate.adjustment,
    };
    const state = projectProductEvents([
      event("event-recommendation", { type: "recommendation.recorded", assessment, receipt: fixtureReceipt }),
      event("event-outcome", { type: "outcome.recorded", outcome }),
      event("event-proposal", { type: "learning.proposed", candidate }),
      event("event-approval", { type: "learning.approved", candidateId: candidate.candidateId, rule }),
      event("event-delete", { type: "learning.deleted", candidateId: candidate.candidateId, reason: "Owner removed prototype learning." }),
    ]);
    expect(Object.values(state.rules)).toEqual([expect.objectContaining({ active: false })]);
    expect(applyApprovedRules(assessment, fixtureReceipt, Object.values(state.rules)).appliedRules).toEqual([]);
  });

  it("rejects unknown event fields and low outcomes without corrections", () => {
    expect(() => productEventSchema.parse({
      eventId: "event-hidden",
      occurredAt: "2026-08-30T05:00:00.000Z",
      type: "learning.deleted",
      candidateId: "candidate-one",
      reason: "Owner deletion",
      hiddenPrompt: "change tools",
    })).toThrow();
    expect(() => outcomeSchema.parse({ ...outcome, correctionNotes: "" })).toThrow(/correction/i);
  });

  it("allows bounded edits but rejects provenance changes", () => {
    const candidate = proposeLearningCandidate(outcome, new Date("2026-08-30T05:20:00.000Z"));
    const baseEvents = [
      event("event-recommendation", { type: "recommendation.recorded", assessment, receipt: fixtureReceipt }),
      event("event-outcome", { type: "outcome.recorded", outcome }),
      event("event-proposal", { type: "learning.proposed", candidate }),
    ];
    const edited = { ...candidate, revision: 2, rationale: "Owner-bounded revised rationale." };
    expect(projectProductEvents([...baseEvents, event("event-edit", { type: "learning.edited", candidate: edited })])
      .candidates[candidate.candidateId].revision).toBe(2);
    expect(() => projectProductEvents([...baseEvents, event("event-edit-bad", {
      type: "learning.edited",
      candidate: { ...edited, sourceOutcomeId: "outcome-different", evidenceRefs: ["outcome-different"] },
    })])).toThrow(/immutable/u);
  });

  it("keeps rejected and expired learning inactive", () => {
    const candidate = proposeLearningCandidate(outcome, new Date("2026-08-30T05:20:00.000Z"));
    const baseEvents = [
      event("event-recommendation", { type: "recommendation.recorded", assessment, receipt: fixtureReceipt }),
      event("event-outcome", { type: "outcome.recorded", outcome }),
      event("event-proposal", { type: "learning.proposed", candidate }),
    ];
    const rejected = projectProductEvents([...baseEvents, event("event-reject", {
      type: "learning.rejected", candidateId: candidate.candidateId, reason: "Owner rejected this adjustment.",
    })]);
    expect(rejected.candidates[candidate.candidateId].status).toBe("rejected");
    expect(Object.values(rejected.rules)).toHaveLength(0);

    const rule = {
      ruleId: "rule-expiry",
      version: 1,
      candidateId: candidate.candidateId,
      sourceOutcomeId: outcome.outcomeId,
      approvedAt: "2026-08-30T05:25:00.000Z",
      reviewAt: candidate.reviewAt,
      expiresAt: candidate.expiresAt,
      active: true,
      explanation: candidate.rationale,
      condition: candidate.condition,
      adjustment: candidate.adjustment,
    };
    const approvedEvents = [...baseEvents, event("event-approval", {
      type: "learning.approved", candidateId: candidate.candidateId, rule,
    })];
    expect(applyApprovedRules(assessment, fixtureReceipt, [rule], new Date(candidate.expiresAt)).appliedRules).toEqual([]);
    const expired = projectProductEvents([...approvedEvents, event("event-expired", {
      type: "learning.expired", candidateId: candidate.candidateId,
    })]);
    expect(expired.candidates[candidate.candidateId].status).toBe("expired");
    expect(expired.rules[rule.ruleId].active).toBe(false);
  });

  it("deactivates the prior rule when a same-factor candidate supersedes it", () => {
    const first = proposeLearningCandidate(outcome, new Date("2026-08-30T05:20:00.000Z"));
    const secondOutcome = outcomeSchema.parse({
      ...outcome,
      outcomeId: "outcome-provider-free-second",
      receiptId: "receipt-provider-free-second",
      recordedAt: "2026-08-31T05:10:00.000Z",
    });
    const second = proposeLearningCandidate(secondOutcome, new Date("2026-08-31T05:20:00.000Z"));
    const makeRule = (candidate: typeof first, id: string) => ({
      ruleId: id,
      version: 1,
      candidateId: candidate.candidateId,
      sourceOutcomeId: candidate.sourceOutcomeId,
      approvedAt: candidate.createdAt,
      reviewAt: candidate.reviewAt,
      expiresAt: candidate.expiresAt,
      active: true,
      explanation: candidate.rationale,
      condition: candidate.condition,
      adjustment: candidate.adjustment,
    });
    const secondReceipt = { ...fixtureReceipt, receiptId: "receipt-provider-free-second" };
    const state = projectProductEvents([
      event("event-recommendation", { type: "recommendation.recorded", assessment, receipt: fixtureReceipt }),
      event("event-outcome", { type: "outcome.recorded", outcome }),
      event("event-proposal", { type: "learning.proposed", candidate: first }),
      event("event-approval", { type: "learning.approved", candidateId: first.candidateId, rule: makeRule(first, "rule-first") }),
      event("event-recommendation-second", { type: "recommendation.recorded", assessment, receipt: secondReceipt }),
      event("event-outcome-second", { type: "outcome.recorded", outcome: secondOutcome }),
      event("event-proposal-second", { type: "learning.proposed", candidate: second }),
      event("event-supersede", { type: "learning.superseded", candidateId: first.candidateId, supersededBy: second.candidateId }),
      event("event-approval-second", { type: "learning.approved", candidateId: second.candidateId, rule: makeRule(second, "rule-second") }),
    ]);
    expect(state.candidates[first.candidateId].status).toBe("superseded");
    expect(state.rules["rule-first"].active).toBe(false);
    expect(state.rules["rule-second"].active).toBe(true);
  });

  it("rejects approval rules whose behavior differs from the candidate", () => {
    const candidate = proposeLearningCandidate(outcome, new Date("2026-08-30T05:20:00.000Z"));
    const rule = {
      ruleId: "rule-tampered",
      version: 1,
      candidateId: candidate.candidateId,
      sourceOutcomeId: outcome.outcomeId,
      approvedAt: "2026-08-30T05:25:00.000Z",
      reviewAt: candidate.reviewAt,
      expiresAt: candidate.expiresAt,
      active: true,
      explanation: candidate.rationale,
      condition: candidate.condition,
      adjustment: { ...candidate.adjustment, targetRecommendation: "automated" as const },
    };
    expect(() => projectProductEvents([
      event("event-recommendation", { type: "recommendation.recorded", assessment, receipt: fixtureReceipt }),
      event("event-outcome", { type: "outcome.recorded", outcome }),
      event("event-proposal", { type: "learning.proposed", candidate }),
      event("event-approval", { type: "learning.approved", candidateId: candidate.candidateId, rule }),
    ])).toThrow(/behavior/u);
  });

  it("records and revises one owner evaluation label per receipt", () => {
    const first = {
      schemaVersion: "owner-evaluation-label-v1" as const,
      labelId: "evaluation-label-provider-free-seam",
      receiptId: fixtureReceipt.receiptId,
      revision: 1,
      labelledAt: "2026-09-02T20:00:00.000Z",
      expectedRecommendation: "human-led" as const,
      notes: "The owner should retain the final decision.",
    };
    const revised = {
      ...first,
      revision: 2,
      labelledAt: "2026-09-02T20:05:00.000Z",
      expectedRecommendation: "ai-assisted" as const,
    };
    const base = event("event-recommendation", { type: "recommendation.recorded", assessment, receipt: fixtureReceipt });
    const state = projectProductEvents([
      base,
      event("event-label", { type: "evaluation.labeled", label: first }),
      event("event-relabel", { type: "evaluation.labeled", label: revised }),
    ]);

    expect(state.evaluationLabels[first.labelId]).toMatchObject({ revision: 2, expectedRecommendation: "ai-assisted" });
    expect(() => projectProductEvents([
      base,
      event("event-invalid-label", { type: "evaluation.labeled", label: { ...first, revision: 2 } }),
    ])).toThrow(/revision one/u);
  });
});
