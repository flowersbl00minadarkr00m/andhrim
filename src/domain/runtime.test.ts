import { describe, expect, it } from "vitest";
import {
  runtimeActionGuidance,
  runtimePrivacyDisclosure,
  runtimeStatusSchema,
} from "./runtime";

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

  it("strictly validates a redacted health response and returns actionable recovery guidance", () => {
    const status = runtimeStatusSchema.parse({
      schemaVersion: "runtime-status-v1",
      providerMode: "openrouter",
      modelId: null,
      configured: false,
      sessionNonce: "a".repeat(43),
      privacyDisclosure: runtimePrivacyDisclosure("openrouter", null),
      lastDiagnosticAt: "2026-09-02T16:00:00.000Z",
      services: {
        app: { state: "healthy", detail: "The local application responded." },
        eve: { state: "unavailable", detail: "The bounded recommendation runtime did not respond." },
        mcp: { state: "healthy", detail: "The read-only guidance service responded." },
      },
    });

    expect(JSON.stringify(status)).not.toMatch(/apiKey|credentialValue/u);
    expect(runtimeActionGuidance(status)).toEqual(expect.arrayContaining([
      expect.stringMatching(/Configure OpenRouter/u),
      expect.stringMatching(/pnpm start/u),
    ]));
  });
});
