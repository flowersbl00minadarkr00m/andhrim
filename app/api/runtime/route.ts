import {
  providerModeSchema,
  runtimePrivacyDisclosure,
  runtimeStatusSchema,
} from "../../../src/domain/runtime";
import {
  assertLoopbackDiagnosticUrl,
  diagnoseLoopbackService,
} from "../../../src/server/runtime-diagnostics";
import {
  assertLocalBootstrapRequest,
  getLocalSessionNonce,
  localRequestErrorResponse,
} from "../../../src/server/local-request-security";

export const runtime = "nodejs";

function numericPort(value: string, name: string) {
  if (!/^\d{2,5}$/u.test(value)) throw new Error(`${name} must be a numeric loopback port.`);
  const port = Number(value);
  if (port < 1 || port > 65_535) throw new Error(`${name} must be a valid loopback port.`);
  return value;
}

export async function GET(request: Request) {
  try {
    assertLocalBootstrapRequest(request);
    const providerMode = providerModeSchema.parse(process.env.AGENT_OR_NOT_PROVIDER_MODE?.trim() || "fixture");
    const modelId = providerMode === "fixture"
      ? "agent-or-not-fixture"
      : process.env.OPENROUTER_MODEL?.trim() || null;
    const configured = providerMode === "fixture"
      || Boolean(modelId && process.env.OPENROUTER_API_KEY?.trim());
    const evePort = numericPort(process.env.EVE_NEXT_PRODUCTION_PORT?.trim() || "4274", "Eve port");
    const eveUrl = assertLoopbackDiagnosticUrl(`http://127.0.0.1:${evePort}/eve/v1/health`, "/eve/v1/health");
    const mcpUrl = assertLoopbackDiagnosticUrl(
      process.env.AGENT_OR_NOT_MEMORY_MCP_URL?.trim() || "http://127.0.0.1:4275/mcp",
      "/mcp",
    );
    const [eve, mcp] = await Promise.all([
      diagnoseLoopbackService({
        url: eveUrl,
        acceptedStatuses: [200],
        healthyDetail: "The bounded Eve recommendation runtime responded on loopback.",
        unavailableDetail: "The bounded Eve recommendation runtime did not respond on loopback.",
      }),
      diagnoseLoopbackService({
        url: mcpUrl,
        acceptedStatuses: [200, 400, 405, 406],
        healthyDetail: "The read-only approved-guidance service responded on loopback.",
        unavailableDetail: "The read-only approved-guidance service did not respond on loopback.",
      }),
    ]);
    const lastDiagnosticAt = new Date().toISOString();
    const status = runtimeStatusSchema.parse({
      schemaVersion: "runtime-status-v1",
      providerMode,
      modelId,
      configured,
      sessionNonce: getLocalSessionNonce(),
      privacyDisclosure: runtimePrivacyDisclosure(providerMode, modelId),
      lastDiagnosticAt,
      services: {
        app: { state: "healthy", detail: "This browser reached the local Andhrím application." },
        eve,
        mcp,
      },
    });
    return Response.json(status, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return localRequestErrorResponse(error)
      ?? Response.json({ error: "Could not read the local runtime configuration or diagnostics." }, {
        status: 500,
        headers: { "cache-control": "no-store" },
      });
  }
}
