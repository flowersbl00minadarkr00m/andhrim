import { afterEach, describe, expect, it, vi } from "vitest";
import { runtimeStatusSchema } from "../../../src/domain/runtime";
import { GET } from "./route";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("runtime diagnostics route", () => {
  it("reports app, Eve, and MCP separately without returning internal URLs or credential material", async () => {
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(input instanceof Request ? input.url : input.toString());
      return new Response(null, { status: url.pathname === "/mcp" ? 406 : 200 });
    });
    vi.stubGlobal("fetch", fetcher);

    const response = await GET(new Request("http://127.0.0.1:3000/api/runtime", {
      headers: { "sec-fetch-site": "same-origin" },
    }));
    const value = runtimeStatusSchema.parse(await response.json());

    expect(response.status).toBe(200);
    expect(value.providerMode).toBe("fixture");
    expect(value.configured).toBe(true);
    expect(value.services).toEqual({
      app: { state: "healthy", detail: expect.any(String) },
      eve: { state: "healthy", detail: expect.any(String) },
      mcp: { state: "healthy", detail: expect.any(String) },
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(value)).not.toMatch(/127\.0\.0\.1:\d+|apiKey|credentialValue/u);
  });
});
