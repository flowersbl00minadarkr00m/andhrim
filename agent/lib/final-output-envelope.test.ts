import { describe, expect, it } from "vitest";
import {
  FINAL_OUTPUT_ENVELOPE_CLASSIFICATION,
  assertFinalOutputOnlyEnvelope,
} from "./final-output-envelope";

const finalOutputTool = {
  type: "function",
  name: "final_output",
  inputSchema: { type: "object" },
};

describe("model tool envelope", () => {
  it("classifies exactly one non-executing Eve final-output tool", () => {
    expect(assertFinalOutputOnlyEnvelope([finalOutputTool])).toEqual({
      classification: FINAL_OUTPUT_ENVELOPE_CLASSIFICATION,
      toolDefinitionCount: 1,
      toolNames: ["final_output"],
      actionCapableToolDefinitionCount: 0,
    });
  });

  it.each([
    undefined,
    [],
    [{ ...finalOutputTool, name: "web_search" }],
    [{ ...finalOutputTool, type: "provider" }],
    [{ ...finalOutputTool, execute: () => undefined }],
    [finalOutputTool, { type: "function", name: "read_file", inputSchema: { type: "object" } }],
  ])("rejects every envelope except final-output-only", (tools) => {
    expect(() => assertFinalOutputOnlyEnvelope(tools)).toThrow("MODEL_TOOL_ENVELOPE_INVALID");
  });
});
