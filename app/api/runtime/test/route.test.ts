import { afterEach, describe, expect, it, vi } from "vitest";
import { getLocalSessionNonce } from "../../../../src/server/local-request-security";
import { testOpenRouterConnection } from "../../../../src/server/openrouter-connectivity";
import { readOpenRouterEnvironment } from "../../../../src/server/openrouter-configuration";
import { POST } from "./route";

vi.mock("../../../../src/server/openrouter-connectivity", () => ({
  testOpenRouterConnection: vi.fn(),
}));

vi.mock("../../../../src/server/openrouter-configuration", () => ({
  readOpenRouterEnvironment: vi.fn(),
}));

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

function request(sessionNonce = getLocalSessionNonce()) {
  return new Request("http://127.0.0.1:3000/api/runtime/test", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "origin": "http://127.0.0.1:3000",
      "sec-fetch-site": "same-origin",
      "x-agent-or-not-session": sessionNonce,
    },
    body: "{}",
  });
}

describe("OpenRouter connection-test route", () => {
  it("uses saved local configuration and returns only redacted metadata status", async () => {
    const apiKey = "x".repeat(32);
    vi.mocked(readOpenRouterEnvironment).mockResolvedValue({ modelId: "openai/gpt-4.1-mini", apiKey });
    vi.mocked(testOpenRouterConnection).mockResolvedValue({
      schemaVersion: "openrouter-connection-test-response-v1",
      state: "ready",
      modelId: "openai/gpt-4.1-mini",
      modelName: "GPT-4.1 Mini",
      authenticated: true,
      modelAvailable: true,
      inferenceRequested: false,
      assessmentShared: false,
      checkedAt: "2026-09-02T20:00:00.000Z",
      detail: "OpenRouter accepted the key and found GPT-4.1 Mini.",
    });

    const response = await POST(request());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(testOpenRouterConnection).toHaveBeenCalledWith({ modelId: "openai/gpt-4.1-mini", apiKey });
    expect(JSON.stringify(payload)).not.toContain(apiKey);
    expect(payload).toMatchObject({ state: "ready", inferenceRequested: false, assessmentShared: false });
  });

  it("requires saved or active configuration before external metadata checks", async () => {
    vi.mocked(readOpenRouterEnvironment).mockResolvedValue(null);

    const response = await POST(request());

    expect(response.status).toBe(400);
    expect(testOpenRouterConnection).not.toHaveBeenCalled();
  });

  it("rejects a drive-by request before reading local credentials", async () => {
    const response = await POST(request("invalid"));

    expect(response.status).toBe(403);
    expect(readOpenRouterEnvironment).not.toHaveBeenCalled();
    expect(testOpenRouterConnection).not.toHaveBeenCalled();
  });
});
