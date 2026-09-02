import type { ProductProjection } from "./learning";
import type { RecommendationReceipt } from "./recommendation";

export type LearningLineageStatus =
  | "proposed"
  | "approved"
  | "rejected"
  | "superseded"
  | "expired"
  | "deleted-tombstone";

type SafeReceipt = {
  receiptId: string;
  recommendation: RecommendationReceipt["recommendation"];
  createdAt?: string;
};

type SafeAppliedRule = RecommendationReceipt["appliedRules"][number];

export type LearningLineage = {
  lineageId: string;
  sourceReceipt: SafeReceipt;
  outcome: {
    outcomeId: string;
    receiptId: string;
    recordedAt: string;
    rating: number;
  };
  candidate: {
    candidateId: string;
    revision: number;
    status: LearningLineageStatus;
    createdAt: string;
    reviewAt: string;
    expiresAt: string;
    condition: ProductProjection["candidates"][string]["condition"];
    adjustment: ProductProjection["candidates"][string]["adjustment"];
    confidence: number;
  };
  rule?: {
    ruleId: string;
    version: number;
    status: Extract<LearningLineageStatus, "approved" | "superseded" | "expired" | "deleted-tombstone">;
    active: boolean;
    approvedAt: string;
    reviewAt: string;
    expiresAt: string;
  };
  affectedReceipts: Array<SafeReceipt & { provenance: SafeAppliedRule[] }>;
};

type ProjectionOptions = {
  focusReceiptId?: string;
  now?: Date;
};

function lineageStatus(status: ProductProjection["candidates"][string]["status"]): LearningLineageStatus {
  return status === "deleted" ? "deleted-tombstone" : status;
}

function safeReceipt(projection: ProductProjection, receipt: RecommendationReceipt): SafeReceipt {
  return {
    receiptId: receipt.receiptId,
    recommendation: receipt.recommendation,
    createdAt: projection.assessments[receipt.assessmentId]?.createdAt,
  };
}

function ruleStatus(
  candidateStatus: LearningLineageStatus,
  expiresAt: string,
  now: Date,
): Extract<LearningLineageStatus, "approved" | "superseded" | "expired" | "deleted-tombstone"> {
  if (candidateStatus === "deleted-tombstone") return "deleted-tombstone";
  if (candidateStatus === "superseded") return "superseded";
  if (candidateStatus === "expired" || Date.parse(expiresAt) <= now.getTime()) return "expired";
  return "approved";
}

/**
 * Joins the current local projection into a display-safe learning lineage.
 * Outcome correction notes and private notes are intentionally never copied.
 */
export function projectLearningLineages(
  projection: ProductProjection,
  { focusReceiptId, now = new Date() }: ProjectionOptions = {},
): LearningLineage[] {
  const lineages = Object.values(projection.candidates).flatMap<LearningLineage>((candidate) => {
    const outcome = projection.outcomes[candidate.sourceOutcomeId];
    const sourceReceipt = outcome ? projection.receipts[outcome.receiptId] : undefined;
    if (!outcome || !sourceReceipt) return [];

    const currentStatus = lineageStatus(candidate.status);
    const rule = Object.values(projection.rules)
      .filter((entry) => entry.candidateId === candidate.candidateId && entry.sourceOutcomeId === outcome.outcomeId)
      .sort((left, right) => left.ruleId.localeCompare(right.ruleId))[0];
    const currentRuleStatus = rule ? ruleStatus(currentStatus, rule.expiresAt, now) : undefined;

    const affectedReceipts = Object.values(projection.receipts)
      .filter((receipt) => receipt.receiptId !== sourceReceipt.receiptId)
      .map((receipt) => ({
        ...safeReceipt(projection, receipt),
        provenance: receipt.appliedRules.filter((appliedRule) => (
          appliedRule.sourceOutcomeId === outcome.outcomeId
          && (!rule || appliedRule.ruleId === rule.ruleId)
        )),
      }))
      .filter((receipt) => receipt.provenance.length > 0)
      .sort((left, right) => (left.createdAt ?? left.receiptId).localeCompare(right.createdAt ?? right.receiptId));

    return [{
      lineageId: candidate.candidateId,
      sourceReceipt: safeReceipt(projection, sourceReceipt),
      outcome: {
        outcomeId: outcome.outcomeId,
        receiptId: outcome.receiptId,
        recordedAt: outcome.recordedAt,
        rating: outcome.rating,
      },
      candidate: {
        candidateId: candidate.candidateId,
        revision: candidate.revision,
        status: currentStatus,
        createdAt: candidate.createdAt,
        reviewAt: candidate.reviewAt,
        expiresAt: candidate.expiresAt,
        condition: candidate.condition,
        adjustment: candidate.adjustment,
        confidence: candidate.confidence,
      },
      rule: rule && currentRuleStatus ? {
        ruleId: rule.ruleId,
        version: rule.version,
        status: currentRuleStatus,
        active: rule.active && currentRuleStatus === "approved",
        approvedAt: rule.approvedAt,
        reviewAt: rule.reviewAt,
        expiresAt: rule.expiresAt,
      } : undefined,
      affectedReceipts,
    }];
  });

  return lineages
    .filter((lineage) => !focusReceiptId
      || lineage.sourceReceipt.receiptId === focusReceiptId
      || lineage.affectedReceipts.some((receipt) => receipt.receiptId === focusReceiptId))
    .sort((left, right) => right.outcome.recordedAt.localeCompare(left.outcome.recordedAt));
}
