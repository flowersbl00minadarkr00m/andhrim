import { ProductLedgerReadError, readProductProjection } from "@/src/server/event-store";

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
    if (error instanceof ProductLedgerReadError) {
      return Response.json({
        code: error.code,
        error: "The local ledger failed an integrity check. It was left untouched so you can inspect and recover it.",
        recoveryUrl: "/api/recovery",
      }, { status: 409 });
    }
    return Response.json({ error: error instanceof Error ? error.message : "Could not read local state." }, { status: 500 });
  }
}
