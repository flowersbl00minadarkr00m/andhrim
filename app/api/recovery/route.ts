import { createHash } from "node:crypto";
import { readRawProductLedger } from "@/src/server/event-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const ledger = readRawProductLedger();
    if (ledger.length === 0) return Response.json({ error: "No local event ledger exists to recover." }, { status: 404 });
    return new Response(ledger, {
      headers: {
        "cache-control": "no-store",
        "content-disposition": "attachment; filename=andhrim-agent-or-not-ledger-recovery.ndjson",
        "content-type": "application/x-ndjson; charset=utf-8",
        "x-content-sha256": createHash("sha256").update(ledger, "utf8").digest("hex"),
      },
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not read the original local ledger." }, { status: 500 });
  }
}
