import { describe, expect, it, vi } from "vitest";
import {
  assertLoopbackDiagnosticUrl,
  diagnoseLoopbackService,
} from "./runtime-diagnostics";

describe("runtime service diagnostics", () => {
  it("accepts only explicit loopback HTTP targets without URL credentials or query data", () => {
    expect(assertLoopbackDiagnosticUrl("http://127.0.0.1:4275/mcp", "/mcp").href)
      .toBe("http://127.0.0.1:4275/mcp");
    expect(() => assertLoopbackDiagnosticUrl("https://example.com/mcp", "/mcp")).toThrow(/loopback HTTP/u);
    expect(() => assertLoopbackDiagnosticUrl("http://user:pass@127.0.0.1:4275/mcp", "/mcp")).toThrow(/credentials/u);
    expect(() => assertLoopbackDiagnosticUrl("http://127.0.0.1:4275/mcp?detail=all", "/mcp")).toThrow(/query/u);
  });

  it("maps only allowlisted response statuses to healthy without returning response content", async () => {
    const fetcher = vi.fn(async () => new Response("private body", { status: 406 }));
    const result = await diagnoseLoopbackService({
      url: new URL("http://127.0.0.1:4275/mcp"),
      acceptedStatuses: [200, 400, 405, 406],
      healthyDetail: "Read-only guidance responded.",
      unavailableDetail: "Read-only guidance did not respond.",
    }, fetcher);

    expect(result).toEqual({ state: "healthy", detail: "Read-only guidance responded." });
    expect(JSON.stringify(result)).not.toContain("private body");
  });

  it("fails closed to an unavailable state when the loopback probe rejects", async () => {
    const result = await diagnoseLoopbackService({
      url: new URL("http://127.0.0.1:4274/eve/v1/health"),
      acceptedStatuses: [200],
      healthyDetail: "Eve responded.",
      unavailableDetail: "Eve did not respond.",
    }, vi.fn(async () => { throw new Error("internal connection detail"); }));

    expect(result).toEqual({ state: "unavailable", detail: "Eve did not respond." });
    expect(JSON.stringify(result)).not.toContain("internal connection detail");
  });
});
