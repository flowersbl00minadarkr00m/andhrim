import { createHash } from "node:crypto";
import { readPreRestoreRecovery } from "@/src/server/event-store";
import {
  assertLocalSessionRequest,
  localRequestErrorResponse,
} from "@/src/server/local-request-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    assertLocalSessionRequest(request);
    const identifier = new URL(request.url).searchParams.get("id") ?? "";
    const ledger = readPreRestoreRecovery(identifier);
    return new Response(ledger, {
      headers: {
        "content-disposition": `attachment; filename=${identifier}.ndjson`,
        "content-type": "application/x-ndjson; charset=utf-8",
        "cache-control": "no-store",
        "x-content-sha256": createHash("sha256").update(ledger, "utf8").digest("hex"),
      },
    });
  } catch (error) {
    const securityResponse = localRequestErrorResponse(error);
    if (securityResponse) return securityResponse;
    return Response.json({ error: error instanceof Error ? error.message : "The pre-restore recovery backup could not be read." }, {
      status: 404,
      headers: { "cache-control": "no-store" },
    });
  }
}
