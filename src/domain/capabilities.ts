import { z } from "zod";

export const capabilityAssessmentFactors = [
  "outcomeStakes",
  "repeatability",
  "specificationClarity",
  "verificationCost",
  "contextSensitivity",
] as const;

export const capabilityAnswersSchema = z.object(Object.fromEntries(
  capabilityAssessmentFactors.map((factor) => [factor, z.number().int().min(1).max(5)]),
) as Record<(typeof capabilityAssessmentFactors)[number], z.ZodNumber>).strict();

const skillStepSchema = z.object({
  kind: z.literal("skill"),
  name: z.literal("delegation-guidance"),
  eveCapability: z.literal("load_skill"),
  executionBoundary: z.literal("Eve instruction context"),
  inputFields: z.tuple([z.literal("skill")]),
  outputSummary: z.literal("Instructions loaded on demand; no code or tool executed."),
}).strict();

const discoveryStepSchema = z.object({
  kind: z.literal("connection-discovery"),
  name: z.literal("connection_search"),
  eveCapability: z.literal("connection_search"),
  executionBoundary: z.literal("Eve connection registry"),
  inputFields: z.tuple([z.literal("connection"), z.literal("keywords"), z.literal("limit")]),
  discoveredTools: z.tuple([z.literal("governed-memory__lookup_approved_guidance")]),
  outputSummary: z.literal("One allowlisted MCP tool definition discovered; no memory data read."),
}).strict();

const authoredToolStepSchema = z.object({
  kind: z.literal("authored-tool"),
  name: z.literal("derive_delegation_evidence"),
  eveCapability: z.literal("defineTool"),
  executionBoundary: z.literal("local Eve application runtime"),
  inputFields: z.tuple(capabilityAssessmentFactors.map((factor) => z.literal(factor)) as [
    z.ZodLiteral<"outcomeStakes">,
    z.ZodLiteral<"repeatability">,
    z.ZodLiteral<"specificationClarity">,
    z.ZodLiteral<"verificationCost">,
    z.ZodLiteral<"contextSensitivity">,
  ]),
  answers: capabilityAnswersSchema,
  suggestedPosture: z.enum(["human-led", "ai-assisted", "agent-delegated", "more-information-required"]),
  readOnly: z.literal(true),
  outputSummary: z.literal("Deterministic delegation signals and guardrails returned."),
}).strict();

const mcpStepSchema = z.object({
  kind: z.literal("mcp-tool"),
  name: z.literal("governed-memory__lookup_approved_guidance"),
  eveCapability: z.literal("defineMcpClientConnection + Pydantic MCPServer"),
  executionBoundary: z.literal("127.0.0.1 Streamable HTTP"),
  inputFields: z.tuple(capabilityAssessmentFactors.map((factor) => z.literal(factor)) as [
    z.ZodLiteral<"outcomeStakes">,
    z.ZodLiteral<"repeatability">,
    z.ZodLiteral<"specificationClarity">,
    z.ZodLiteral<"verificationCost">,
    z.ZodLiteral<"contextSensitivity">,
  ]),
  answers: capabilityAnswersSchema,
  matchedRuleIds: z.array(z.string().regex(/^rule-[a-z0-9-]+$/u)).max(12),
  sourceOutcomeIds: z.array(z.string().regex(/^outcome-[a-z0-9-]+$/u)).max(12),
  readOnly: z.literal(true),
  historicalOutcomesRetrieved: z.literal(false),
  rawOutcomeNotesCrossed: z.literal(false),
  outputSummary: z.literal("Only matching approved-rule provenance returned; raw outcomes stayed behind the MCP boundary."),
}).strict();

export const capabilityTraceSchema = z.object({
  schemaVersion: z.literal("harness-capability-trace-v1"),
  steps: z.tuple([skillStepSchema, discoveryStepSchema, authoredToolStepSchema, mcpStepSchema]),
}).strict();

export type CapabilityTrace = z.infer<typeof capabilityTraceSchema>;
