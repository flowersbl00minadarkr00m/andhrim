import { describe, expect, it } from "vitest";
import {
  assertLocalMutationRequest,
  getLocalSessionNonce,
  LocalRequestError,
} from "./local-request-security";

function mutationRequest(headers: Record<string, string>) {
  return new Request("http://127.0.0.1:3000/api/events", {
    method: "POST",
    headers,
    body: JSON.stringify({ action: "test" }),
  });
}

describe("local mutation request security", () => {
  it("accepts only a same-origin JSON request carrying the per-process nonce", () => {
    expect(() => assertLocalMutationRequest(mutationRequest({
      "content-type": "application/json",
      "origin": "http://127.0.0.1:3000",
      "sec-fetch-site": "same-origin",
      "x-agent-or-not-session": getLocalSessionNonce(),
    }))).not.toThrow();
  });

  it.each([
    ["cross-origin", { "content-type": "application/json", origin: "https://attacker.invalid", "sec-fetch-site": "cross-site", "x-agent-or-not-session": getLocalSessionNonce() }],
    ["no-CORS content type", { "content-type": "text/plain", origin: "http://127.0.0.1:3000", "sec-fetch-site": "same-origin", "x-agent-or-not-session": getLocalSessionNonce() }],
    ["missing nonce", { "content-type": "application/json", origin: "http://127.0.0.1:3000", "sec-fetch-site": "same-origin" }],
  ])("rejects %s requests", (_label, headers) => {
    expect(() => assertLocalMutationRequest(mutationRequest(headers))).toThrow(LocalRequestError);
  });
});
