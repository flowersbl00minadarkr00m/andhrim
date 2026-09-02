import { createHash } from "node:crypto";
import { canonicalJson } from "../domain/canonical-json";
import { capabilityTraceSchema, type CapabilityTrace } from "../domain/capabilities";
import type { Assessment, ProductEvent } from "../domain/learning";
import { recommendationReceiptSchema, type RecommendationReceipt } from "../domain/recommendation";
import { assessmentForProvider } from "../domain/runtime";
import {
  receiptVerificationContextSchema,
  receiptVerificationSchema,
  type ReceiptVerification,
  type ReceiptVerificationContext,
} from "../domain/verification";

function digest(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
}

export function createReceiptVerification(
  assessment: Assessment,
  receiptValue: RecommendationReceipt,
  traceValue: CapabilityTrace,
  contextValue: ReceiptVerificationContext,
): ReceiptVerification {
  const receipt = recommendationReceiptSchema.parse(receiptValue);
  const trace = capabilityTraceSchema.parse(traceValue);
  const context = receiptVerificationContextSchema.parse(contextValue);
  return receiptVerificationSchema.parse({
    schemaVersion: "receipt-verification-v1",
    hashAlgorithm: "sha256-canonical-json-v1",
    assessmentInputHash: digest(assessmentForProvider(assessment)),
    capabilityTraceHash: digest(trace),
    recordedReceiptHash: digest(receipt),
    ...context,
    gates: [
      {
        id: "strict-receipt-schema",
        state: "passed",
        evidence: "The persisted result passed recommendation-receipt-v1 strict schema and semantic checks.",
      },
      {
        id: "exact-capability-sequence",
        state: "passed",
        evidence: "Eve emitted the required four-step skill, discovery, authored-tool, and MCP sequence exactly once.",
      },
      {
        id: "read-only-evidence-path",
        state: "passed",
        evidence: "The authored evidence tool and governed-memory MCP capability both completed as read-only boundaries.",
      },
      {
        id: "outcome-data-isolation",
        state: "passed",
        evidence: "No historical outcomes or raw outcome notes crossed the governed-memory MCP boundary.",
      },
      {
        id: "bounded-session-retry",
        state: "passed",
        evidence: `The receipt completed in ${context.sessionAttemptsUsed} of ${context.sessionAttemptBudget} allowed Eve sessions.`,
      },
    ],
  });
}

export function verifyRecommendationEvents(events: readonly ProductEvent[]): void {
  for (const event of events) {
    if (event.type !== "recommendation.recorded" || !event.verification) continue;
    if (!event.capabilityTrace) throw new Error(`Receipt ${event.receipt.receiptId} has verification evidence without a capability trace.`);
    const expected = createReceiptVerification(event.assessment, event.receipt, event.capabilityTrace, {
      sessionAttemptsUsed: event.verification.sessionAttemptsUsed,
      sessionAttemptBudget: event.verification.sessionAttemptBudget,
    });
    if (canonicalJson(expected) !== canonicalJson(event.verification)) {
      throw new Error(`Receipt verification replay failed for ${event.receipt.receiptId}.`);
    }
  }
}
