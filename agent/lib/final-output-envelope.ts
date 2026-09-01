export const FINAL_OUTPUT_TOOL_NAME = "final_output";
export const FINAL_OUTPUT_ENVELOPE_CLASSIFICATION = "eve-final-output-only-v1";

export type FinalOutputEnvelopeEvidence = {
  classification: typeof FINAL_OUTPUT_ENVELOPE_CLASSIFICATION;
  toolDefinitionCount: 1;
  toolNames: [typeof FINAL_OUTPUT_TOOL_NAME];
  actionCapableToolDefinitionCount: 0;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function assertFinalOutputOnlyEnvelope(tools: unknown): FinalOutputEnvelopeEvidence {
  if (!Array.isArray(tools) || tools.length !== 1) {
    throw new Error("MODEL_TOOL_ENVELOPE_INVALID");
  }
  const [tool] = tools;
  if (!isRecord(tool)
    || tool.type !== "function"
    || tool.name !== FINAL_OUTPUT_TOOL_NAME
    || tool.execute !== undefined
    || !isRecord(tool.inputSchema)) {
    throw new Error("MODEL_TOOL_ENVELOPE_INVALID");
  }
  return {
    classification: FINAL_OUTPUT_ENVELOPE_CLASSIFICATION,
    toolDefinitionCount: 1,
    toolNames: [FINAL_OUTPUT_TOOL_NAME],
    actionCapableToolDefinitionCount: 0,
  };
}
