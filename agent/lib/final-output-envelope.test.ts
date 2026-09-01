import { describe, expect, it } from "vitest";
import {
  HARNESS_ENVELOPE_CLASSIFICATION,
  assertBoundedHarnessEnvelope,
} from "./final-output-envelope";

const tool = (name: string) => ({
  type: "function",
  name,
  inputSchema: { type: "object" },
});
const baseTools = ["connection_search", "derive_delegation_evidence", "final_output", "load_skill"].map(tool);

describe("model tool envelope", () => {
  it("classifies the bounded pre-discovery Eve harness", () => {
    expect(assertBoundedHarnessEnvelope(baseTools)).toEqual({
      classification: HARNESS_ENVELOPE_CLASSIFICATION,
      toolDefinitionCount: 4,
      toolNames: ["connection_search", "derive_delegation_evidence", "final_output", "load_skill"],
      instructionToolDefinitionCount: 1,
      discoveryToolDefinitionCount: 1,
      localReadOnlyToolDefinitionCount: 1,
      mcpReadOnlyToolDefinitionCount: 0,
      finalOutputToolDefinitionCount: 1,
      actionCapableToolDefinitionCount: 1,
    });
  });

  it("classifies the same harness after one allow-listed MCP tool is discovered", () => {
    expect(assertBoundedHarnessEnvelope([...baseTools, tool("governed-memory__lookup_approved_guidance")])).toMatchObject({
      toolDefinitionCount: 5,
      mcpReadOnlyToolDefinitionCount: 1,
      actionCapableToolDefinitionCount: 2,
    });
  });

  it.each([
    undefined,
    [],
    [tool("final_output")],
    [...baseTools, tool("read_file")],
    baseTools.map((entry) => entry.name === "final_output" ? { ...entry, type: "provider" } : entry),
    baseTools.map((entry) => entry.name === "final_output" ? { ...entry, execute: () => undefined } : entry),
  ])("rejects anything outside the bounded harness", (tools) => {
    expect(() => assertBoundedHarnessEnvelope(tools)).toThrow("MODEL_TOOL_ENVELOPE_INVALID");
  });
});
