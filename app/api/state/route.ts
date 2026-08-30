import { readProductProjection } from "@/src/server/event-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json({
      schemaVersion: "product-state-v1",
      storage: "data/events.ndjson",
      projection: readProductProjection(),
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not read local state." }, { status: 500 });
  }
}
