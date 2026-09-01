export const FINAL_OUTPUT_TOOL_NAME = "final_output";
export const HARNESS_ENVELOPE_CLASSIFICATION = "eve-bounded-guidance-harness-v1";

const BASE_TOOL_NAMES = [
  "connection_search",
  "derive_delegation_evidence",
  FINAL_OUTPUT_TOOL_NAME,
  "load_skill",
] as const;
const MCP_TOOL_NAME = "governed-memory__lookup_approved_guidance";

export type FinalOutputEnvelopeEvidence = {
  classification: typeof HARNESS_ENVELOPE_CLASSIFICATION;
  toolDefinitionCount: 4 | 5;
  toolNames: string[];
  instructionToolDefinitionCount: 1;
  discoveryToolDefinitionCount: 1;
  localReadOnlyToolDefinitionCount: 1;
  mcpReadOnlyToolDefinitionCount: 0 | 1;
  finalOutputToolDefinitionCount: 1;
  actionCapableToolDefinitionCount: 1 | 2;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function assertBoundedHarnessEnvelope(tools: unknown): FinalOutputEnvelopeEvidence {
  if (!Array.isArray(tools)) {
    throw new Error("MODEL_TOOL_ENVELOPE_INVALID");
  }
  const toolNames = tools.map((tool) => {
    if (!isRecord(tool)
      || tool.type !== "function"
      || typeof tool.name !== "string"
      || tool.execute !== undefined
      || !isRecord(tool.inputSchema)) {
      throw new Error("MODEL_TOOL_ENVELOPE_INVALID");
    }
    return tool.name;
  }).sort();
  const base = [...BASE_TOOL_NAMES].sort();
  const withMcp = [...base, MCP_TOOL_NAME].sort();
  if (JSON.stringify(toolNames) !== JSON.stringify(base)
    && JSON.stringify(toolNames) !== JSON.stringify(withMcp)) {
    throw new Error("MODEL_TOOL_ENVELOPE_INVALID");
  }
  const mcpReadOnlyToolDefinitionCount = toolNames.includes(MCP_TOOL_NAME) ? 1 : 0;
  return {
    classification: HARNESS_ENVELOPE_CLASSIFICATION,
    toolDefinitionCount: toolNames.length as 4 | 5,
    toolNames,
    instructionToolDefinitionCount: 1,
    discoveryToolDefinitionCount: 1,
    localReadOnlyToolDefinitionCount: 1,
    mcpReadOnlyToolDefinitionCount,
    finalOutputToolDefinitionCount: 1,
    actionCapableToolDefinitionCount: (1 + mcpReadOnlyToolDefinitionCount) as 1 | 2,
  };
}
