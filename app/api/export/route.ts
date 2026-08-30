import { readProductEvents, readProductProjection } from "@/src/server/event-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const payload = {
      schemaVersion: "agent-or-not-export-v1",
      generatedAt: new Date().toISOString(),
      note: "Prototype export. Deleted records remain as append-only tombstoned evidence; no forensic deletion guarantee is made.",
      projection: readProductProjection(),
      events: readProductEvents(),
    };
    return new Response(`${JSON.stringify(payload, null, 2)}\n`, {
      headers: {
        "content-disposition": "attachment; filename=andhrim-agent-or-not-export.json",
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not export local state." }, { status: 500 });
  }
}
