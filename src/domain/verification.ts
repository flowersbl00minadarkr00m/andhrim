import { z } from "zod";

const digestSchema = z.string().regex(/^[a-f0-9]{64}$/u);
export const RECEIPT_SESSION_BUDGET = 2;

export const receiptVerificationContextSchema = z.object({
  sessionAttemptsUsed: z.number().int().positive().max(10),
  sessionAttemptBudget: z.literal(RECEIPT_SESSION_BUDGET),
}).strict().superRefine((context, refinement) => {
  if (context.sessionAttemptsUsed > context.sessionAttemptBudget) {
    refinement.addIssue({
      code: "custom",
      path: ["sessionAttemptsUsed"],
      message: "Session attempts cannot exceed the declared budget.",
    });
  }
});

const gateSchema = <Id extends string>(id: Id) => z.object({
  id: z.literal(id),
  state: z.literal("passed"),
  evidence: z.string().trim().min(1).max(240),
}).strict();

export const receiptVerificationSchema = z.object({
  schemaVersion: z.literal("receipt-verification-v1"),
  hashAlgorithm: z.literal("sha256-canonical-json-v1"),
  assessmentInputHash: digestSchema,
  capabilityTraceHash: digestSchema,
  recordedReceiptHash: digestSchema,
  sessionAttemptsUsed: z.number().int().positive().max(10),
  sessionAttemptBudget: z.literal(RECEIPT_SESSION_BUDGET),
  gates: z.tuple([
    gateSchema("strict-receipt-schema"),
    gateSchema("exact-capability-sequence"),
    gateSchema("read-only-evidence-path"),
    gateSchema("outcome-data-isolation"),
    gateSchema("bounded-session-retry"),
  ]),
}).strict().superRefine((verification, refinement) => {
  if (verification.sessionAttemptsUsed > verification.sessionAttemptBudget) {
    refinement.addIssue({
      code: "custom",
      path: ["sessionAttemptsUsed"],
      message: "Session attempts cannot exceed the declared budget.",
    });
  }
});

export type ReceiptVerification = z.infer<typeof receiptVerificationSchema>;
export type ReceiptVerificationContext = z.infer<typeof receiptVerificationContextSchema>;
