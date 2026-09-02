import { createHash } from "node:crypto";
import {
  BackupLimitError,
  createBackupEnvelope,
  serializeBackupEnvelope,
} from "@/src/server/ledger-backup";
import { ProductLedgerReadError, readProductEvents } from "@/src/server/event-store";
import {
  assertLocalSessionRequest,
  localRequestErrorResponse,
} from "@/src/server/local-request-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    assertLocalSessionRequest(request);
    const envelope = createBackupEnvelope(readProductEvents());
    const body = serializeBackupEnvelope(envelope);
    return new Response(body, {
      headers: {
        "content-disposition": "attachment; filename=andhrim-agent-or-not-backup-v1.json",
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
        "x-content-sha256": createHash("sha256").update(body, "utf8").digest("hex"),
      },
    });
  } catch (error) {
    const securityResponse = localRequestErrorResponse(error);
    if (securityResponse) return securityResponse;
    if (error instanceof ProductLedgerReadError) {
      return Response.json({
        code: error.code,
        error: "A validated backup cannot be created because the local ledger failed an integrity check.",
        recoveryUrl: "/api/recovery",
      }, { status: 409, headers: { "cache-control": "no-store" } });
    }
    if (error instanceof BackupLimitError) {
      return Response.json({
        code: "BACKUP_LIMIT_EXCEEDED",
        error: `${error.message} Use the unchanged full-ledger export or archive older prototype data before retrying.`,
      }, { status: 413, headers: { "cache-control": "no-store" } });
    }
    return Response.json({ error: error instanceof Error ? error.message : "Could not create the local backup." }, {
      status: 500,
      headers: { "cache-control": "no-store" },
    });
  }
}
