import { z } from "zod";
import {
  openRouterConnectionTestResponseSchema,
  type OpenRouterConfigurationInput,
  type OpenRouterConnectionTestResponse,
} from "../domain/runtime";

const OPENROUTER_ORIGIN = "https://openrouter.ai";
const RESPONSE_LIMIT_BYTES = 256_000;

const modelResponseSchema = z.object({
  data: z.object({
    id: z.string().trim().min(1).max(160),
    name: z.string().trim().min(1).max(160),
  }).passthrough(),
}).passthrough();

function result(
  values: Omit<OpenRouterConnectionTestResponse, "schemaVersion" | "checkedAt" | "inferenceRequested" | "assessmentShared">,
): OpenRouterConnectionTestResponse {
  return openRouterConnectionTestResponseSchema.parse({
    schemaVersion: "openrouter-connection-test-response-v1",
    checkedAt: new Date().toISOString(),
    inferenceRequested: false,
    assessmentShared: false,
    ...values,
  });
}

async function boundedJson(response: Response) {
  const declaredLength = response.headers.get("content-length");
  if (declaredLength && Number(declaredLength) > RESPONSE_LIMIT_BYTES) {
    throw new Error("OpenRouter returned an unexpectedly large metadata response.");
  }
  const text = await response.text();
  if (Buffer.byteLength(text, "utf8") > RESPONSE_LIMIT_BYTES) {
    throw new Error("OpenRouter returned an unexpectedly large metadata response.");
  }
  return JSON.parse(text) as unknown;
}

function requestHeaders(apiKey: string) {
  return {
    accept: "application/json",
    authorization: `Bearer ${apiKey}`,
  };
}

export async function testOpenRouterConnection(
  configuration: OpenRouterConfigurationInput,
  fetcher: typeof fetch = fetch,
): Promise<OpenRouterConnectionTestResponse> {
  const request = (url: string) => fetcher(url, {
    method: "GET",
    headers: requestHeaders(configuration.apiKey),
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(8_000),
  });

  try {
    const keyResponse = await request(`${OPENROUTER_ORIGIN}/api/v1/key`);
    if (keyResponse.status === 401 || keyResponse.status === 403) {
      return result({
        state: "invalid-key",
        modelId: configuration.modelId,
        modelName: null,
        authenticated: false,
        modelAvailable: false,
        detail: "OpenRouter rejected the saved key. Replace it, then run this check again.",
      });
    }
    if (!keyResponse.ok) {
      return result({
        state: "unavailable",
        modelId: configuration.modelId,
        modelName: null,
        authenticated: false,
        modelAvailable: false,
        detail: `OpenRouter key verification returned HTTP ${keyResponse.status}. No inference was requested.`,
      });
    }

    const [author, slug] = configuration.modelId.split("/", 2);
    const modelUrl = `${OPENROUTER_ORIGIN}/api/v1/model/${encodeURIComponent(author ?? "")}/${encodeURIComponent(slug ?? "")}`;
    const modelResponse = await request(modelUrl);
    if (modelResponse.status === 404) {
      return result({
        state: "model-unavailable",
        modelId: configuration.modelId,
        modelName: null,
        authenticated: true,
        modelAvailable: false,
        detail: `The key is valid, but ${configuration.modelId} is not an available OpenRouter model identifier.`,
      });
    }
    if (!modelResponse.ok) {
      return result({
        state: "unavailable",
        modelId: configuration.modelId,
        modelName: null,
        authenticated: true,
        modelAvailable: false,
        detail: `OpenRouter model verification returned HTTP ${modelResponse.status}. No inference was requested.`,
      });
    }

    const model = modelResponseSchema.parse(await boundedJson(modelResponse)).data;
    if (model.id !== configuration.modelId) {
      return result({
        state: "model-unavailable",
        modelId: configuration.modelId,
        modelName: model.name,
        authenticated: true,
        modelAvailable: false,
        detail: `OpenRouter resolved a different model identifier (${model.id}). Save that exact identifier if you intend to use it.`,
      });
    }
    return result({
      state: "ready",
      modelId: configuration.modelId,
      modelName: model.name,
      authenticated: true,
      modelAvailable: true,
      detail: `OpenRouter accepted the key and found ${model.name}. Restart Andhrím to use it for receipts.`,
    });
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === "TimeoutError";
    return result({
      state: "unavailable",
      modelId: configuration.modelId,
      modelName: null,
      authenticated: false,
      modelAvailable: false,
      detail: timedOut
        ? "OpenRouter did not answer within 8 seconds. No inference was requested."
        : "OpenRouter metadata could not be verified. Check the network and try again; no inference was requested.",
    });
  }
}
