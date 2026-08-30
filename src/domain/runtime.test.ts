import { describe, expect, it } from "vitest";
import { runtimePrivacyDisclosure } from "./runtime";

describe("runtime privacy disclosure", () => {
  it("states that fixture assessment processing stays local", () => {
    expect(runtimePrivacyDisclosure("fixture", "agent-or-not-fixture")).toMatch(/stays on this computer/u);
  });

  it("names the exact OpenRouter assessment fields and provider-policy boundary without mentioning a key value", () => {
    const copy = runtimePrivacyDisclosure("openrouter", "provider/model");
    expect(copy).toMatch(/case title, desired outcome, constraints, and five 1–5 factor answers/u);
    expect(copy).toMatch(/provider\/model/u);
    expect(copy).toMatch(/provider's policy/u);
    expect(copy).toMatch(/key is never sent in assessment content/u);
  });
});
