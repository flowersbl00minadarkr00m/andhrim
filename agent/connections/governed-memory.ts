import { defineMcpClientConnection } from "eve/connections";
import { capabilityBudget } from "../lib/capability-budget";

function loopbackMcpUrl() {
  const configured = process.env.AGENT_OR_NOT_MEMORY_MCP_URL?.trim() || "http://127.0.0.1:4275/mcp";
  const url = new URL(configured);
  const port = Number(url.port);
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || url.pathname !== "/mcp"
    || url.username !== "" || url.password !== "" || url.search !== "" || url.hash !== ""
    || !Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("AGENT_OR_NOT_MEMORY_MCP_URL must be an http://127.0.0.1:<port>/mcp URL.");
  }
  return url.toString();
}

export default defineMcpClientConnection({
  url: loopbackMcpUrl(),
  description: "Owner-governed Andhrim memory: read-only lookup of active approved guidance that matches five bounded assessment factors. It never returns raw outcome notes.",
  tools: { allow: ["lookup_approved_guidance"] },
  approval: ({ toolName }) => {
    if (!toolName.endsWith("__lookup_approved_guidance")) return "denied";
    const budget = capabilityBudget.get();
    if (budget.governedMemoryCalls >= 1) return "denied";
    capabilityBudget.update((current) => ({ ...current, governedMemoryCalls: current.governedMemoryCalls + 1 }));
    return "not-applicable";
  },
});
