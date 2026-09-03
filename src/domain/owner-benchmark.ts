import { z } from "zod";
import type { ProductProjection } from "./learning";
import { RECOMMENDATION_MODES } from "./recommendation";

export const ownerBenchmarkRowSchema = z.object({
  labelId: z.string().regex(/^evaluation-label-[a-z0-9-]+$/u),
  receiptId: z.string().regex(/^receipt-[a-z0-9-]+$/u),
  title: z.string().trim().min(1).max(120),
  actualRecommendation: z.enum(RECOMMENDATION_MODES),
  expectedRecommendation: z.enum(RECOMMENDATION_MODES),
  agrees: z.boolean(),
  modelId: z.string().trim().min(1).max(120),
  labelledAt: z.iso.datetime(),
  notes: z.string().trim().max(800),
}).strict();

export const ownerBenchmarkProjectionSchema = z.object({
  schemaVersion: z.literal("owner-benchmark-projection-v1"),
  receiptCount: z.number().int().nonnegative(),
  labelledCases: z.number().int().nonnegative(),
  unlabelledCases: z.number().int().nonnegative(),
  agreements: z.number().int().nonnegative(),
  disagreements: z.number().int().nonnegative(),
  agreementRate: z.number().min(0).max(100).nullable(),
  rows: z.array(ownerBenchmarkRowSchema),
}).strict();

export type OwnerBenchmarkProjection = z.infer<typeof ownerBenchmarkProjectionSchema>;

export function projectOwnerBenchmark(projection: ProductProjection): OwnerBenchmarkProjection {
  const receipts = Object.values(projection.receipts);
  const rows = Object.values(projection.evaluationLabels).map((label) => {
    const receipt = projection.receipts[label.receiptId];
    const assessment = receipt ? projection.assessments[receipt.assessmentId] : undefined;
    if (!receipt || !assessment) throw new Error("An owner evaluation label is missing its receipt or assessment.");
    return ownerBenchmarkRowSchema.parse({
      labelId: label.labelId,
      receiptId: receipt.receiptId,
      title: assessment.title,
      actualRecommendation: receipt.recommendation,
      expectedRecommendation: label.expectedRecommendation,
      agrees: receipt.recommendation === label.expectedRecommendation,
      modelId: receipt.runtime.modelId,
      labelledAt: label.labelledAt,
      notes: label.notes,
    });
  }).sort((left, right) => right.labelledAt.localeCompare(left.labelledAt) || left.receiptId.localeCompare(right.receiptId));
  const agreements = rows.filter((row) => row.agrees).length;
  return ownerBenchmarkProjectionSchema.parse({
    schemaVersion: "owner-benchmark-projection-v1",
    receiptCount: receipts.length,
    labelledCases: rows.length,
    unlabelledCases: Math.max(0, receipts.length - rows.length),
    agreements,
    disagreements: rows.length - agreements,
    agreementRate: rows.length > 0 ? Number(((agreements / rows.length) * 100).toFixed(1)) : null,
    rows,
  });
}
