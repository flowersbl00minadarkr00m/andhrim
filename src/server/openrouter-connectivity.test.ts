import { describe, expect, it, vi } from "vitest";
import { testOpenRouterConnection } from "./openrouter-connectivity";

const configuration = {
  modelId: "openai/gpt-4.1-mini",
  apiKey: "x".repeat(32),
};

describe("OpenRouter metadata connection test", () => {
  it("verifies the key and exact model without requesting inference or returning the key", async () => {
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = input.toString();
      if (url.endsWith("/api/v1/key")) return Response.json({ data: { label: "redacted" } });
      return Response.json({ data: { id: configuration.modelId, name: "GPT-4.1 Mini" } });
    });

    const result = await testOpenRouterConnection(configuration, fetcher);

    expect(result).toMatchObject({
      state: "ready",
      modelId: configuration.modelId,
      modelName: "GPT-4.1 Mini",
      authenticated: true,
      modelAvailable: true,
      inferenceRequested: false,
      assessmentShared: false,
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls.map(([url]) => String(url))).toEqual([
      "https://openrouter.ai/api/v1/key",
      "https://openrouter.ai/api/v1/model/openai/gpt-4.1-mini",
    ]);
    expect(JSON.stringify(result)).not.toContain(configuration.apiKey);
  });

  it("stops after OpenRouter rejects the saved key", async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 401 }));

    const result = await testOpenRouterConnection(configuration, fetcher);

    expect(result).toMatchObject({ state: "invalid-key", authenticated: false, modelAvailable: false });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("separates a valid key from an unavailable model identifier", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(Response.json({ data: {} }))
      .mockResolvedValueOnce(new Response(null, { status: 404 }));

    const result = await testOpenRouterConnection(configuration, fetcher);

    expect(result).toMatchObject({ state: "model-unavailable", authenticated: true, modelAvailable: false });
    expect(result.detail).toContain(configuration.modelId);
  });

  it("reports bounded network failure without exposing transport detail", async () => {
    const fetcher = vi.fn(async () => { throw new Error("secret-bearing transport detail"); });

    const result = await testOpenRouterConnection(configuration, fetcher);

    expect(result).toMatchObject({ state: "unavailable", inferenceRequested: false, assessmentShared: false });
    expect(JSON.stringify(result)).not.toContain("secret-bearing");
  });
});
