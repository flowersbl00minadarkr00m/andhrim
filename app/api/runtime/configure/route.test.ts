import { afterEach, describe, expect, it, vi } from "vitest";
import { getLocalSessionNonce } from "../../../../src/server/local-request-security";
import { writeOpenRouterEnvironment } from "../../../../src/server/openrouter-configuration";
import { POST } from "./route";

vi.mock("../../../../src/server/openrouter-configuration", () => ({
  writeOpenRouterEnvironment: vi.fn(async () => undefined),
}));

afterEach(() => {
  vi.clearAllMocks();
});

function configurationRequest(body: unknown) {
  return new Request("http://127.0.0.1:3000/api/runtime/configure", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "origin": "http://127.0.0.1:3000",
      "sec-fetch-site": "same-origin",
      "x-agent-or-not-session": getLocalSessionNonce(),
    },
    body: JSON.stringify(body),
  });
}

describe("OpenRouter configuration route", () => {
  it("saves validated local configuration without returning the key", async () => {
    const apiKey = "x".repeat(32);
    const response = await POST(configurationRequest({ modelId: "openai/gpt-5.4-nano", apiKey }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(writeOpenRouterEnvironment).toHaveBeenCalledWith({ modelId: "openai/gpt-5.4-nano", apiKey });
    expect(payload).toEqual({
      schemaVersion: "openrouter-configuration-response-v1",
      modelId: "openai/gpt-5.4-nano",
      restartRequired: true,
    });
    expect(JSON.stringify(payload)).not.toContain(apiKey);
  });

  it("rejects invalid identifiers before touching the environment file", async () => {
    const response = await POST(configurationRequest({ modelId: "missing-prefix", apiKey: "x".repeat(32) }));

    expect(response.status).toBe(400);
    expect(writeOpenRouterEnvironment).not.toHaveBeenCalled();
  });

  it("rejects a drive-by request without the local session nonce", async () => {
    const response = await POST(new Request("http://127.0.0.1:3000/api/runtime/configure", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "origin": "http://127.0.0.1:3000",
        "sec-fetch-site": "same-origin",
      },
      body: JSON.stringify({ modelId: "openai/gpt-5.4-nano", apiKey: "x".repeat(32) }),
    }));

    expect(response.status).toBe(403);
    expect(writeOpenRouterEnvironment).not.toHaveBeenCalled();
  });
});
