import { openRouterConfigurationInputSchema } from "../../../../src/domain/runtime";
import { testOpenRouterConnection } from "../../../../src/server/openrouter-connectivity";
import { readOpenRouterEnvironment } from "../../../../src/server/openrouter-configuration";
import {
  assertLocalMutationRequest,
  localRequestErrorResponse,
} from "../../../../src/server/local-request-security";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    assertLocalMutationRequest(request);
    const fromFile = await readOpenRouterEnvironment();
    const fromProcess = openRouterConfigurationInputSchema.safeParse({
      modelId: process.env.OPENROUTER_MODEL?.trim() ?? "",
      apiKey: process.env.OPENROUTER_API_KEY?.trim() ?? "",
    });
    const configuration = fromFile ?? (fromProcess.success ? fromProcess.data : null);
    if (!configuration) {
      return Response.json({ error: "Save an OpenRouter model and key before testing the connection." }, {
        status: 400,
        headers: { "cache-control": "no-store" },
      });
    }
    const result = await testOpenRouterConnection(configuration);
    return Response.json(result, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const securityResponse = localRequestErrorResponse(error);
    if (securityResponse) return securityResponse;
    return Response.json({ error: "Andhrím could not read the saved OpenRouter configuration." }, {
      status: 500,
      headers: { "cache-control": "no-store" },
    });
  }
}
