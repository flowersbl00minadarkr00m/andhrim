import { ZodError } from "zod";
import { openRouterConfigurationInputSchema } from "../../../../src/domain/runtime";
import { readLimitedJsonRequest, RequestBodyError } from "../../../../src/server/limited-json-request";
import {
  assertLocalMutationRequest,
  localRequestErrorResponse,
} from "../../../../src/server/local-request-security";
import {
  removeOpenRouterEnvironment,
  writeOpenRouterEnvironment,
} from "../../../../src/server/openrouter-configuration";

export const runtime = "nodejs";

const MAX_CONFIGURATION_BYTES = 2_048;

export async function POST(request: Request) {
  try {
    assertLocalMutationRequest(request);
    const configuration = openRouterConfigurationInputSchema.parse(
      await readLimitedJsonRequest(request, MAX_CONFIGURATION_BYTES),
    );
    await writeOpenRouterEnvironment(configuration);
    return Response.json({
      schemaVersion: "openrouter-configuration-response-v1",
      modelId: configuration.modelId,
      restartRequired: true,
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const securityResponse = localRequestErrorResponse(error);
    if (securityResponse) return securityResponse;
    if (error instanceof RequestBodyError) {
      const message = error.status === 413
        ? "The OpenRouter configuration request is too large."
        : "The OpenRouter configuration request is malformed JSON.";
      return Response.json({ error: message }, {
        status: error.status,
        headers: { "cache-control": "no-store" },
      });
    }
    if (error instanceof ZodError) {
      return Response.json({ error: "Enter an explicit provider/model identifier and a valid OpenRouter key." }, {
        status: 400,
        headers: { "cache-control": "no-store" },
      });
    }
    return Response.json({ error: "Andhrím could not save the local OpenRouter configuration." }, {
      status: 500,
      headers: { "cache-control": "no-store" },
    });
  }
}

export async function DELETE(request: Request) {
  try {
    assertLocalMutationRequest(request);
    await removeOpenRouterEnvironment();
    return Response.json({
      schemaVersion: "openrouter-configuration-clear-response-v1",
      providerMode: "fixture",
      restartRequired: true,
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const securityResponse = localRequestErrorResponse(error);
    if (securityResponse) return securityResponse;
    return Response.json({ error: "Andhrím could not remove the saved OpenRouter key." }, {
      status: 500,
      headers: { "cache-control": "no-store" },
    });
  }
}
