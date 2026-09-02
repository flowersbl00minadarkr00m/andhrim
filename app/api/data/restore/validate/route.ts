import { z } from "zod";
import {
  MAX_BACKUP_REQUEST_BYTES,
  stageBackupForRestore,
} from "@/src/server/ledger-backup";
import { readLimitedJsonRequest, RequestBodyError } from "@/src/server/limited-json-request";
import {
  assertLocalMutationRequest,
  localRequestErrorResponse,
} from "@/src/server/local-request-security";

export const runtime = "nodejs";

const validationRequestSchema = z.object({ backup: z.unknown() }).strict();

export async function POST(request: Request) {
  try {
    assertLocalMutationRequest(request);
    const body = validationRequestSchema.parse(await readLimitedJsonRequest(request, MAX_BACKUP_REQUEST_BYTES));
    const result = stageBackupForRestore(body.backup);
    return Response.json({ schemaVersion: "backup-validation-response-v1", ...result }, {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    const securityResponse = localRequestErrorResponse(error);
    if (securityResponse) return securityResponse;
    if (error instanceof RequestBodyError) {
      return Response.json({ error: error.message }, { status: error.status, headers: { "cache-control": "no-store" } });
    }
    return Response.json({ error: error instanceof Error ? error.message : "The backup could not be validated." }, {
      status: 400,
      headers: { "cache-control": "no-store" },
    });
  }
}
