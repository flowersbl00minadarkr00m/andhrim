import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { runtimePrivacyDisclosure, type RuntimeStatus } from "../src/domain/runtime";
import { ConnectionHealth } from "./ConnectionHealth";

const status: RuntimeStatus = {
  schemaVersion: "runtime-status-v1",
  providerMode: "fixture",
  modelId: "agent-or-not-fixture",
  configured: true,
  sessionNonce: "a".repeat(43),
  privacyDisclosure: runtimePrivacyDisclosure("fixture", "agent-or-not-fixture"),
  lastDiagnosticAt: "2026-09-02T16:00:00.000Z",
  services: {
    app: { state: "healthy", detail: "The local application responded." },
    eve: { state: "healthy", detail: "The bounded recommendation runtime responded." },
    mcp: { state: "healthy", detail: "The read-only guidance service responded." },
  },
};

describe("ConnectionHealth", () => {
  it("places a masked OpenRouter setup flow beside runtime configuration", () => {
    const markup = renderToStaticMarkup(
      <ConnectionHealth status={status} checking={false} onRefresh={() => undefined} />,
    );

    expect(markup).toContain("Configure OpenRouter");
    expect(markup).toContain("Connect OpenRouter");
    expect(markup).toContain('type="password"');
    expect(markup).toContain("Local secret boundary");
    expect(markup).not.toContain("OPENROUTER_API_KEY=");
  });
});
