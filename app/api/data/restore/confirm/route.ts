import { z } from "zod";
import { consumeStagedBackup } from "@/src/server/ledger-backup";
import { restoreProductEventsAtomically } from "@/src/server/event-store";
import { readLimitedJsonRequest, RequestBodyError } from "@/src/server/limited-json-request";
import {
  assertLocalMutationRequest,
  localRequestErrorResponse,
} from "@/src/server/local-request-security";

export const runtime = "nodejs";

const confirmationSchema = z.object({
  validationToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/u),
}).strict();
const MAX_CONFIRMATION_BYTES = 4_096;

export async function POST(request: Request) {
  try {
    assertLocalMutationRequest(request);
    const confirmation = confirmationSchema.parse(await readLimitedJsonRequest(request, MAX_CONFIRMATION_BYTES));
    const staged = consumeStagedBackup(confirmation.validationToken);
    const restored = restoreProductEventsAtomically(staged.events);
    return Response.json({
      schemaVersion: "backup-restore-response-v1",
      restoredDigest: staged.digest,
      restoredEventCount: staged.events.length,
      projection: restored.projection,
      preRestoreRecovery: restored.recovery,
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const securityResponse = localRequestErrorResponse(error);
    if (securityResponse) return securityResponse;
    if (error instanceof RequestBodyError) {
      return Response.json({ error: error.message }, { status: error.status, headers: { "cache-control": "no-store" } });
    }
    return Response.json({ error: error instanceof Error ? error.message : "The validated backup could not be restored." }, {
      status: 400,
      headers: { "cache-control": "no-store" },
    });
  }
}
