import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  activeRuleSchema,
  applyApprovedRules,
  assessmentSchema,
  learningCandidateSchema,
  outcomeSchema,
  proposeLearningCandidate,
  validateLearningCandidateRevision,
  validateReceiptStarterPackRevision,
} from "@/src/domain/learning";
import { recommendationReceiptSchema } from "@/src/domain/recommendation";
import { capabilityTraceSchema } from "@/src/domain/capabilities";
import { receiptVerificationContextSchema } from "@/src/domain/verification";
import {
  appendProductEvent,
  appendProductEvents,
  readProductProjection,
} from "@/src/server/event-store";
import {
  assertLocalMutationRequest,
  localRequestErrorResponse,
} from "@/src/server/local-request-security";
import { createReceiptVerification } from "@/src/server/receipt-verification";

export const runtime = "nodejs";

const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("record-recommendation"),
    assessment: assessmentSchema,
    receipt: recommendationReceiptSchema,
    capabilityTrace: capabilityTraceSchema,
    verificationContext: receiptVerificationContextSchema,
  }).strict(),
  z.object({ action: z.literal("edit-receipt"), receipt: recommendationReceiptSchema }).strict(),
  z.object({ action: z.literal("record-outcome"), outcome: outcomeSchema }).strict(),
  z.object({ action: z.literal("edit-learning"), candidate: learningCandidateSchema }).strict(),
  z.object({ action: z.literal("approve-learning"), candidateId: z.string().regex(/^candidate-[a-z0-9-]+$/) }).strict(),
  z.object({ action: z.literal("reject-learning"), candidateId: z.string().regex(/^candidate-[a-z0-9-]+$/), reason: z.string().trim().min(1).max(400) }).strict(),
  z.object({ action: z.literal("delete-learning"), candidateId: z.string().regex(/^candidate-[a-z0-9-]+$/), reason: z.string().trim().min(1).max(400) }).strict(),
  z.object({ action: z.literal("expire-learning"), candidateId: z.string().regex(/^candidate-[a-z0-9-]+$/) }).strict(),
]);

function eventBase() {
  return { eventId: `event-${randomUUID()}`, occurredAt: new Date().toISOString() };
}

export async function POST(request: Request) {
  try {
    assertLocalMutationRequest(request);
    const action = actionSchema.parse(await request.json());
    const current = readProductProjection();
    let projection;
    switch (action.action) {
      case "record-recommendation": {
        if (action.receipt.assessmentId !== action.assessment.assessmentId) throw new Error("Receipt and assessment identities do not match.");
        if (current.receipts[action.receipt.receiptId]) throw new Error("Receipt is already recorded.");
        const receipt = applyApprovedRules(action.assessment, action.receipt, Object.values(current.rules));
        const verification = createReceiptVerification(action.assessment, receipt, action.capabilityTrace, action.verificationContext);
        projection = appendProductEvent({
          ...eventBase(),
          type: "recommendation.recorded",
          assessment: action.assessment,
          receipt,
          capabilityTrace: action.capabilityTrace,
          verification,
        });
        break;
      }
      case "edit-receipt": {
        const existing = current.receipts[action.receipt.receiptId];
        if (!existing) throw new Error("Cannot edit an unknown receipt.");
        const receipt = validateReceiptStarterPackRevision(existing, action.receipt);
        projection = appendProductEvent({ ...eventBase(), type: "recommendation.edited", receipt });
        break;
      }
      case "record-outcome": {
        if (current.outcomes[action.outcome.outcomeId]) throw new Error("Outcome is already recorded.");
        if (Object.values(current.outcomes).some((outcome) => outcome.receiptId === action.outcome.receiptId)) throw new Error("This receipt already has an outcome.");
        const candidate = proposeLearningCandidate(action.outcome, new Date());
        projection = appendProductEvents([
          { ...eventBase(), type: "outcome.recorded", outcome: action.outcome },
          { ...eventBase(), type: "learning.proposed", candidate },
        ]);
        break;
      }
      case "edit-learning": {
        const existing = current.candidates[action.candidate.candidateId];
        if (!existing) throw new Error("Cannot edit an unknown candidate.");
        const candidate = validateLearningCandidateRevision(existing, action.candidate);
        projection = appendProductEvent({ ...eventBase(), type: "learning.edited", candidate });
        break;
      }
      case "approve-learning": {
        const candidate = current.candidates[action.candidateId];
        if (!candidate || candidate.status !== "proposed") throw new Error("Only a proposed candidate may be approved.");
        const rule = activeRuleSchema.parse({
          ruleId: `rule-${candidate.candidateId.slice("candidate-".length)}`,
          version: 1,
          candidateId: candidate.candidateId,
          sourceOutcomeId: candidate.sourceOutcomeId,
          explanation: candidate.rationale,
          approvedAt: new Date().toISOString(),
          reviewAt: candidate.reviewAt,
          expiresAt: candidate.expiresAt,
          active: true,
          condition: candidate.condition,
          adjustment: candidate.adjustment,
        });
        const supersessions = Object.values(current.rules)
          .filter((active) => active.active && active.condition.factor === rule.condition.factor && active.candidateId !== candidate.candidateId)
          .map((active) => ({ ...eventBase(), type: "learning.superseded" as const, candidateId: active.candidateId, supersededBy: candidate.candidateId }));
        projection = appendProductEvents([
          ...supersessions,
          { ...eventBase(), type: "learning.approved", candidateId: candidate.candidateId, rule },
        ]);
        break;
      }
      case "reject-learning":
        projection = appendProductEvent({ ...eventBase(), type: "learning.rejected", candidateId: action.candidateId, reason: action.reason });
        break;
      case "delete-learning":
        projection = appendProductEvent({ ...eventBase(), type: "learning.deleted", candidateId: action.candidateId, reason: action.reason });
        break;
      case "expire-learning": {
        const candidate = current.candidates[action.candidateId];
        if (!candidate || candidate.status !== "approved") throw new Error("Only an approved candidate may expire.");
        projection = appendProductEvent({ ...eventBase(), type: "learning.expired", candidateId: action.candidateId });
        break;
      }
    }
    return Response.json({ schemaVersion: "product-state-v1", projection });
  } catch (error) {
    const securityResponse = localRequestErrorResponse(error);
    if (securityResponse) return securityResponse;
    const message = error instanceof Error ? error.message : "Invalid local event action.";
    return Response.json({ error: message }, { status: 400 });
  }
}
