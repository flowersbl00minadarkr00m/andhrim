import { defineTool } from "eve/tools";
import { z } from "zod";
import { capabilityBudget } from "../lib/capability-budget";

export const delegationAnswersSchema = z.object({
  outcomeStakes: z.number().int().min(1).max(5),
  repeatability: z.number().int().min(1).max(5),
  specificationClarity: z.number().int().min(1).max(5),
  verificationCost: z.number().int().min(1).max(5),
  contextSensitivity: z.number().int().min(1).max(5),
}).strict();

export type DelegationAnswers = z.infer<typeof delegationAnswersSchema>;

const evidenceOutputSchema = z.object({
  schemaVersion: z.literal("delegation-evidence-v1"),
  suggestedPosture: z.enum(["human-led", "ai-assisted", "agent-delegated", "more-information-required"]),
  signals: z.array(z.string().min(1).max(180)).min(2).max(5),
  guardrails: z.array(z.string().min(1).max(180)).min(2).max(4),
  readOnly: z.literal(true),
}).strict();

export function deriveDelegationEvidence(answers: DelegationAnswers): z.infer<typeof evidenceOutputSchema> {
  const parsed = delegationAnswersSchema.parse(answers);
  const suggestedPosture = parsed.outcomeStakes >= 4 || parsed.contextSensitivity >= 5
    ? "human-led"
    : parsed.specificationClarity <= 2
      ? "more-information-required"
      : parsed.repeatability >= 4 && parsed.verificationCost <= 2
        ? "agent-delegated"
        : "ai-assisted";
  return evidenceOutputSchema.parse({
    schemaVersion: "delegation-evidence-v1",
    suggestedPosture,
    signals: [
      `Outcome stakes are ${parsed.outcomeStakes}/5 and context sensitivity is ${parsed.contextSensitivity}/5.`,
      `Repeatability is ${parsed.repeatability}/5; specification clarity is ${parsed.specificationClarity}/5.`,
      `Verification cost is ${parsed.verificationCost}/5.`,
    ],
    guardrails: [
      "Treat this deterministic score as evidence, not as the final decision.",
      "Do not take external action or change memory from this tool.",
    ],
    readOnly: true,
  });
}

export default defineTool({
  description: "Derive bounded delegation evidence from the five 1–5 assessment factors. Read-only and deterministic; it does not access history or change memory.",
  inputSchema: z.object({ answers: delegationAnswersSchema }).strict(),
  outputSchema: evidenceOutputSchema,
  execute({ answers }) {
    const budget = capabilityBudget.get();
    if (budget.derivedEvidenceCalls >= 1) throw new Error("The delegation-evidence tool is limited to one call per Eve session.");
    capabilityBudget.update((current) => ({ ...current, derivedEvidenceCalls: current.derivedEvidenceCalls + 1 }));
    return deriveDelegationEvidence(answers);
  },
});
