import type { AuthFn } from "eve/channels/auth";
import { eveChannel } from "eve/channels/eve";
import { assertLocalSessionRequest } from "../../src/server/local-request-security";

const localSessionAuth: AuthFn<Request> = (request) => {
  try {
    assertLocalSessionRequest(request);
  } catch {
    return null;
  }
  return {
    attributes: { boundary: "loopback-session-nonce" },
    authenticator: "agent-or-not-local-session",
    principalId: "local-owner",
    principalType: "user",
  };
};

export default eveChannel({
  auth: [localSessionAuth],
  uploadPolicy: "disabled",
});
