import { z } from "zod";

export const RECOMMENDATION_MODES = [
  "human-led",
  "ai-assisted",
  "agent-delegated",
  "automated",
  "more-information-required",
] as const;

const boundedText = (maximum: number) => z.string().trim().min(1).max(maximum);

export const workStarterItemSchema = z.object({
  id: z.string().regex(/^starter-[1-9][0-9]*$/),
  label: boundedText(80),
  content: boundedText(800),
}).strict();

export const appliedRuleSchema = z.object({
  ruleId: z.string().regex(/^rule-[a-z0-9-]+$/),
  version: z.number().int().positive(),
  sourceOutcomeId: z.string().regex(/^outcome-[a-z0-9-]+$/),
  explanation: boundedText(240),
}).strict();

export const recommendationReceiptSchema = z.object({
  schemaVersion: z.literal("recommendation-receipt-v1"),
  receiptId: z.string().regex(/^receipt-[a-z0-9-]+$/),
  recommendation: z.enum(RECOMMENDATION_MODES),
  summary: boundedText(240),
  why: boundedText(1200),
  evidence: z.array(boundedText(240)).min(1).max(6),
  assumptions: z.array(boundedText(240)).min(1).max(6),
  confidence: z.object({
    score: z.number().int().min(0).max(100),
    label: z.enum(["low", "medium", "medium-high", "high"]),
    uncertainty: boundedText(240),
  }).strict(),
  autonomyBoundary: z.object({
    allowed: z.array(boundedText(180)).min(1).max(5),
    prohibited: z.array(boundedText(180)).min(1).max(5),
  }).strict(),
  starterPack: z.array(workStarterItemSchema).max(8),
  appliedRules: z.array(appliedRuleSchema).max(12),
  runtime: z.object({
    providerMode: z.enum(["fixture", "openrouter"]),
    modelId: boundedText(120),
  }).strict(),
}).strict().superRefine((receipt, context) => {
  const needsMoreInformation = receipt.recommendation === "more-information-required";
  if (needsMoreInformation && receipt.starterPack.length !== 0) {
    context.addIssue({ code: "custom", path: ["starterPack"], message: "More-information receipts cannot include a starter pack." });
  }
  if (!needsMoreInformation && receipt.starterPack.length === 0) {
    context.addIssue({ code: "custom", path: ["starterPack"], message: "Actionable receipts require a starter pack." });
  }
  if (receipt.runtime.providerMode === "fixture" && receipt.runtime.modelId !== "agent-or-not-fixture") {
    context.addIssue({ code: "custom", path: ["runtime", "modelId"], message: "Fixture receipts must identify the fixture model." });
  }
});

export type RecommendationReceipt = z.infer<typeof recommendationReceiptSchema>;

export const recommendationReceiptJsonSchema = z.toJSONSchema(recommendationReceiptSchema);

export function parseRecommendationReceipt(value: unknown): RecommendationReceipt {
  return recommendationReceiptSchema.parse(value);
}
