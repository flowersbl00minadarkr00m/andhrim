import { runtimePrivacyDisclosure } from "@/src/domain/runtime";
import {
  assertLocalBootstrapRequest,
  getLocalSessionNonce,
  localRequestErrorResponse,
} from "@/src/server/local-request-security";

export const runtime = "nodejs";

export function GET(request: Request) {
  try {
    assertLocalBootstrapRequest(request);
    const providerMode = process.env.AGENT_OR_NOT_PROVIDER_MODE?.trim() || "fixture";
    if (providerMode === "fixture") {
      const modelId = "agent-or-not-fixture";
      return Response.json({
        providerMode,
        modelId,
        configured: true,
        sessionNonce: getLocalSessionNonce(),
        privacyDisclosure: runtimePrivacyDisclosure(providerMode, modelId),
      }, { headers: { "cache-control": "no-store" } });
    }
    if (providerMode !== "openrouter") return Response.json({ error: "Unsupported local provider mode." }, { status: 500 });
    const modelId = process.env.OPENROUTER_MODEL?.trim() || null;
    const configured = Boolean(modelId && process.env.OPENROUTER_API_KEY?.trim());
    return Response.json({
      providerMode,
      modelId,
      configured,
      sessionNonce: getLocalSessionNonce(),
      privacyDisclosure: runtimePrivacyDisclosure(providerMode, modelId),
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return localRequestErrorResponse(error)
      ?? Response.json({ error: error instanceof Error ? error.message : "Could not read local runtime." }, { status: 500 });
  }
}
