import { z } from "zod";
import {
  RECOMMENDATION_MODES,
  appliedRuleSchema,
  recommendationReceiptSchema,
  type RecommendationReceipt,
} from "./recommendation";

const boundedText = (maximum: number) => z.string().trim().min(1).max(maximum);
const recordId = (prefix: string) => z.string().regex(new RegExp(`^${prefix}-[a-z0-9-]+$`, "u"));

export const assessmentFactors = [
  "outcomeStakes",
  "repeatability",
  "specificationClarity",
  "verificationCost",
  "contextSensitivity",
] as const;

export const assessmentSchema = z.object({
  schemaVersion: z.literal("assessment-v1"),
  assessmentId: recordId("assessment"),
  createdAt: z.iso.datetime(),
  title: boundedText(120),
  desiredOutcome: boundedText(800),
  constraints: boundedText(800),
  answers: z.object(Object.fromEntries(
    assessmentFactors.map((factor) => [factor, z.number().int().min(1).max(5)]),
  ) as Record<(typeof assessmentFactors)[number], z.ZodNumber>).strict(),
}).strict();

export type Assessment = z.infer<typeof assessmentSchema>;

export const outcomeSchema = z.object({
  schemaVersion: z.literal("outcome-v1"),
  outcomeId: recordId("outcome"),
  receiptId: recordId("receipt"),
  recordedAt: z.iso.datetime(),
  rating: z.number().int().min(1).max(5),
  correctionNotes: z.string().trim().max(800),
  notes: z.string().trim().max(1200),
}).strict().superRefine((outcome, context) => {
  if (outcome.rating <= 2 && outcome.correctionNotes.length === 0) {
    context.addIssue({ code: "custom", path: ["correctionNotes"], message: "A low rating requires a correction." });
  }
});

export type Outcome = z.infer<typeof outcomeSchema>;

export const ruleConditionSchema = z.object({
  factor: z.enum(assessmentFactors),
  operator: z.enum(["gte", "lte", "eq"]),
  threshold: z.number().int().min(1).max(5),
}).strict();

export const ruleAdjustmentSchema = z.object({
  targetRecommendation: z.enum(RECOMMENDATION_MODES),
  weightDelta: z.number().int().min(-2).max(2).refine((value) => value !== 0, "Adjustment cannot be zero."),
}).strict();

export const learningCandidateSchema = z.object({
  schemaVersion: z.literal("learning-candidate-v1"),
  candidateId: recordId("candidate"),
  revision: z.number().int().positive(),
  sourceOutcomeId: recordId("outcome"),
  createdAt: z.iso.datetime(),
  status: z.enum(["proposed", "approved", "rejected", "superseded", "deleted", "expired"]),
  condition: ruleConditionSchema,
  adjustment: ruleAdjustmentSchema,
  rationale: boundedText(600),
  evidenceRefs: z.array(recordId("outcome")).min(1).max(8),
  confidence: z.number().int().min(0).max(100),
  reviewAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
}).strict().superRefine((candidate, context) => {
  if (!candidate.evidenceRefs.includes(candidate.sourceOutcomeId)) {
    context.addIssue({ code: "custom", path: ["evidenceRefs"], message: "Source outcome must be cited." });
  }
  if (Date.parse(candidate.expiresAt) <= Date.parse(candidate.createdAt)) {
    context.addIssue({ code: "custom", path: ["expiresAt"], message: "Expiry must follow creation." });
  }
});

export type LearningCandidate = z.infer<typeof learningCandidateSchema>;

export const activeRuleSchema = appliedRuleSchema.extend({
  candidateId: recordId("candidate"),
  approvedAt: z.iso.datetime(),
  reviewAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  active: z.boolean(),
  condition: ruleConditionSchema,
  adjustment: ruleAdjustmentSchema,
}).strict();

export type ActiveRule = z.infer<typeof activeRuleSchema>;

const eventBase = {
  eventId: recordId("event"),
  occurredAt: z.iso.datetime(),
};

export const productEventSchema = z.discriminatedUnion("type", [
  z.object({ ...eventBase, type: z.literal("recommendation.recorded"), assessment: assessmentSchema, receipt: recommendationReceiptSchema }).strict(),
  z.object({ ...eventBase, type: z.literal("recommendation.edited"), receipt: recommendationReceiptSchema }).strict(),
  z.object({ ...eventBase, type: z.literal("outcome.recorded"), outcome: outcomeSchema }).strict(),
  z.object({ ...eventBase, type: z.literal("learning.proposed"), candidate: learningCandidateSchema }).strict(),
  z.object({ ...eventBase, type: z.literal("learning.edited"), candidate: learningCandidateSchema }).strict(),
  z.object({ ...eventBase, type: z.literal("learning.approved"), candidateId: recordId("candidate"), rule: activeRuleSchema }).strict(),
  z.object({ ...eventBase, type: z.literal("learning.rejected"), candidateId: recordId("candidate"), reason: boundedText(400) }).strict(),
  z.object({ ...eventBase, type: z.literal("learning.superseded"), candidateId: recordId("candidate"), supersededBy: recordId("candidate") }).strict(),
  z.object({ ...eventBase, type: z.literal("learning.expired"), candidateId: recordId("candidate") }).strict(),
  z.object({ ...eventBase, type: z.literal("learning.deleted"), candidateId: recordId("candidate"), reason: boundedText(400) }).strict(),
]);

export type ProductEvent = z.infer<typeof productEventSchema>;

export type ProductProjection = {
  assessments: Record<string, Assessment>;
  receipts: Record<string, RecommendationReceipt>;
  outcomes: Record<string, Outcome>;
  candidates: Record<string, LearningCandidate>;
  rules: Record<string, ActiveRule>;
};

export function createEmptyProjection(): ProductProjection {
  return { assessments: {}, receipts: {}, outcomes: {}, candidates: {}, rules: {} };
}

function candidateWithStatus(candidate: LearningCandidate, status: LearningCandidate["status"]): LearningCandidate {
  return learningCandidateSchema.parse({ ...candidate, status });
}

export function projectProductEvents(values: readonly unknown[]): ProductProjection {
  const state = createEmptyProjection();
  for (const value of values) {
    const event = productEventSchema.parse(value);
    switch (event.type) {
      case "recommendation.recorded":
        state.assessments[event.assessment.assessmentId] = event.assessment;
        state.receipts[event.receipt.receiptId] = event.receipt;
        break;
      case "recommendation.edited": {
        const current = state.receipts[event.receipt.receiptId];
        if (!current) throw new Error("Cannot edit an unknown receipt.");
        state.receipts[event.receipt.receiptId] = validateReceiptStarterPackRevision(current, event.receipt);
        break;
      }
      case "outcome.recorded":
        if (!state.receipts[event.outcome.receiptId]) throw new Error("Outcome references an unknown receipt.");
        state.outcomes[event.outcome.outcomeId] = event.outcome;
        break;
      case "learning.proposed":
        if (!state.outcomes[event.candidate.sourceOutcomeId]) throw new Error("Candidate references an unknown outcome.");
        state.candidates[event.candidate.candidateId] = event.candidate;
        break;
      case "learning.edited": {
        const current = state.candidates[event.candidate.candidateId];
        if (!current) throw new Error("Cannot edit an unknown candidate.");
        state.candidates[event.candidate.candidateId] = validateLearningCandidateRevision(current, event.candidate);
        break;
      }
      case "learning.approved": {
        const candidate = state.candidates[event.candidateId];
        if (!candidate || candidate.status !== "proposed") throw new Error("Only a proposed candidate may be approved.");
        if (event.rule.candidateId !== candidate.candidateId || event.rule.sourceOutcomeId !== candidate.sourceOutcomeId) {
          throw new Error("Approved rule provenance does not match its candidate.");
        }
        if (JSON.stringify(event.rule.condition) !== JSON.stringify(candidate.condition)
          || JSON.stringify(event.rule.adjustment) !== JSON.stringify(candidate.adjustment)
          || event.rule.reviewAt !== candidate.reviewAt
          || event.rule.expiresAt !== candidate.expiresAt) {
          throw new Error("Approved rule behavior does not match its candidate.");
        }
        state.candidates[event.candidateId] = candidateWithStatus(candidate, "approved");
        state.rules[event.rule.ruleId] = event.rule;
        break;
      }
      case "learning.rejected": {
        const candidate = state.candidates[event.candidateId];
        if (!candidate || candidate.status !== "proposed") throw new Error("Only a proposed candidate may be rejected.");
        state.candidates[event.candidateId] = candidateWithStatus(candidate, "rejected");
        break;
      }
      case "learning.superseded": {
        const candidate = state.candidates[event.candidateId];
        if (!candidate || candidate.status !== "approved") throw new Error("Only an approved candidate may be superseded.");
        const replacement = state.candidates[event.supersededBy];
        if (!replacement || replacement.status !== "proposed") throw new Error("Supersession requires a proposed replacement candidate.");
        const currentRule = Object.values(state.rules).find((rule) => rule.candidateId === candidate.candidateId && rule.active);
        if (!currentRule || currentRule.condition.factor !== replacement.condition.factor) throw new Error("Supersession must replace a rule for the same factor.");
        state.candidates[event.candidateId] = candidateWithStatus(candidate, "superseded");
        for (const [ruleId, rule] of Object.entries(state.rules)) {
          if (rule.candidateId === event.candidateId) state.rules[ruleId] = { ...rule, active: false };
        }
        break;
      }
      case "learning.expired": {
        const candidate = state.candidates[event.candidateId];
        if (!candidate || candidate.status !== "approved") throw new Error("Only an approved candidate may expire.");
        state.candidates[event.candidateId] = candidateWithStatus(candidate, "expired");
        for (const [ruleId, rule] of Object.entries(state.rules)) {
          if (rule.candidateId === event.candidateId) state.rules[ruleId] = { ...rule, active: false };
        }
        break;
      }
      case "learning.deleted": {
        const candidate = state.candidates[event.candidateId];
        if (!candidate) throw new Error("Cannot delete an unknown candidate.");
        state.candidates[event.candidateId] = candidateWithStatus(candidate, "deleted");
        for (const [ruleId, rule] of Object.entries(state.rules)) {
          if (rule.candidateId === event.candidateId) state.rules[ruleId] = { ...rule, active: false };
        }
        break;
      }
    }
  }
  return state;
}

function conditionMatches(assessment: Assessment, condition: ActiveRule["condition"]) {
  const observed = assessment.answers[condition.factor];
  if (condition.operator === "gte") return observed >= condition.threshold;
  if (condition.operator === "lte") return observed <= condition.threshold;
  return observed === condition.threshold;
}

export function applyApprovedRules(
  assessment: Assessment,
  receipt: RecommendationReceipt,
  rules: readonly ActiveRule[],
  now = new Date(),
): RecommendationReceipt {
  const applied = rules
    .filter((rule) => rule.active && Date.parse(rule.expiresAt) > now.getTime() && conditionMatches(assessment, rule.condition))
    .sort((left, right) => left.ruleId.localeCompare(right.ruleId));
  if (applied.length === 0) return receipt;
  const strongest = applied.reduce((selected, rule) => (
    Math.abs(rule.adjustment.weightDelta) > Math.abs(selected.adjustment.weightDelta) ? rule : selected
  ));
  return recommendationReceiptSchema.parse({
    ...receipt,
    recommendation: strongest.adjustment.targetRecommendation,
    summary: `Owner-approved learning adjusted this receipt from ${receipt.recommendation} to ${strongest.adjustment.targetRecommendation}.`,
    why: `A bounded approved rule matched this assessment. Original model rationale: ${receipt.why}`.slice(0, 1200),
    starterPack: strongest.adjustment.targetRecommendation === "more-information-required" ? [] : receipt.starterPack,
    appliedRules: applied.map((rule) => ({
      ruleId: rule.ruleId,
      version: rule.version,
      sourceOutcomeId: rule.sourceOutcomeId,
      explanation: `Approved candidate ${rule.candidateId} matched ${rule.condition.factor} ${rule.condition.operator} ${rule.condition.threshold}.`,
    })),
  });
}

export function validateLearningCandidateRevision(current: LearningCandidate, value: unknown): LearningCandidate {
  const next = learningCandidateSchema.parse(value);
  if (current.status !== "proposed" || next.status !== "proposed") throw new Error("Only a proposed candidate may be edited.");
  if (next.revision !== current.revision + 1) throw new Error("Candidate revision must advance exactly once.");
  const immutable = ["candidateId", "sourceOutcomeId", "createdAt"] as const;
  for (const field of immutable) if (next[field] !== current[field]) throw new Error(`Candidate ${field} is immutable.`);
  if (JSON.stringify(next.evidenceRefs) !== JSON.stringify(current.evidenceRefs)) throw new Error("Candidate evidence provenance is immutable.");
  return next;
}

export function validateReceiptStarterPackRevision(current: RecommendationReceipt, value: unknown): RecommendationReceipt {
  const next = recommendationReceiptSchema.parse(value);
  const { starterPack: _currentStarterPack, ...currentInvariant } = current;
  const { starterPack: _nextStarterPack, ...nextInvariant } = next;
  if (JSON.stringify(currentInvariant) !== JSON.stringify(nextInvariant)) throw new Error("Only the Work Starter Pack may be edited.");
  return next;
}

export function proposeLearningCandidate(outcome: Outcome, now: Date): LearningCandidate {
  const createdAt = now.toISOString();
  const suffix = outcome.outcomeId.slice("outcome-".length);
  return learningCandidateSchema.parse({
    schemaVersion: "learning-candidate-v1",
    candidateId: `candidate-${suffix}`,
    revision: 1,
    sourceOutcomeId: outcome.outcomeId,
    createdAt,
    status: "proposed",
    condition: { factor: "specificationClarity", operator: "lte", threshold: 3 },
    adjustment: {
      targetRecommendation: outcome.rating <= 2 ? "human-led" : "ai-assisted",
      weightDelta: outcome.rating <= 2 ? -2 : -1,
    },
    rationale: outcome.correctionNotes || "Preserve the observed review need when specification clarity is limited.",
    evidenceRefs: [outcome.outcomeId],
    confidence: outcome.rating <= 2 ? 70 : 55,
    reviewAt: new Date(now.getTime() + 14 * 86_400_000).toISOString(),
    expiresAt: new Date(now.getTime() + 90 * 86_400_000).toISOString(),
  });
}
