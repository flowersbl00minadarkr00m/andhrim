import { describe, expect, it } from "vitest";
import { readLimitedJsonRequest } from "./limited-json-request";

describe("bounded JSON request reader", () => {
  it("rejects an oversized streamed confirmation body before parsing", async () => {
    const request = new Request("http://127.0.0.1:3000/api/data/restore/confirm", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ validationToken: "a".repeat(43), padding: "x".repeat(5_000) }),
    });

    await expect(readLimitedJsonRequest(request, 4_096)).rejects.toMatchObject({
      status: 413,
      message: expect.stringMatching(/4096-byte limit/u),
    });
  });

  it("rejects malformed JSON within the byte limit", async () => {
    await expect(readLimitedJsonRequest(new Request("http://127.0.0.1:3000/api/data/restore/confirm", {
      method: "POST",
      body: "{",
    }), 4_096)).rejects.toMatchObject({
      status: 400,
      message: "The selected backup is malformed JSON.",
    });
  });

  it("uses boundary-specific labels without exposing request contents", async () => {
    await expect(readLimitedJsonRequest(new Request("http://127.0.0.1:3000/api/events", {
      method: "POST",
      headers: { "content-length": "300000" },
      body: "{}",
    }), 262_144, { overflow: "local event action", malformed: "local event action" })).rejects.toMatchObject({
      status: 413,
      message: "The local event action exceeds the 262144-byte limit.",
    });
  });
});
