import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { resolveFixtureScenario } from "../../agent/lib/fixture-scenario";
import { RECEIPT_SESSION_BUDGET } from "./eve";

describe("provider receipt contract", () => {
  it("limits validation correction to one retry and two total sessions", () => {
    expect(RECEIPT_SESSION_BUDGET).toBe(2);
  });

  it("keeps provider instructions aligned to the six-item strict maxima", () => {
    const instructions = readFileSync(new URL("../../agent/instructions.md", import.meta.url), "utf8");
    expect(instructions).toMatch(/`evidence`: one to six/u);
    expect(instructions).toMatch(/`assumptions`: one to six/u);
    expect(instructions).not.toMatch(/one to eight non-empty strings/u);
  });

  it("allows invalid-first evidence only in provider-free fixture mode", () => {
    expect(resolveFixtureScenario("fixture", "invalid-first-receipt")).toBe("invalid-first-receipt");
    expect(() => resolveFixtureScenario("openrouter", "invalid-first-receipt")).toThrow(/fixture-only/u);
  });
});
