export const runtime = "nodejs";

export function GET() {
  const providerMode = process.env.AGENT_OR_NOT_PROVIDER_MODE?.trim() || "fixture";
  if (providerMode === "fixture") {
    return Response.json({ providerMode, modelId: "agent-or-not-fixture", configured: true });
  }
  if (providerMode !== "openrouter") return Response.json({ error: "Unsupported local provider mode." }, { status: 500 });
  const modelId = process.env.OPENROUTER_MODEL?.trim();
  const configured = Boolean(modelId && process.env.OPENROUTER_API_KEY?.trim());
  return Response.json({ providerMode, modelId: modelId || null, configured });
}
