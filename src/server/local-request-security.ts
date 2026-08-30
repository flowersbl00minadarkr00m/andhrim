import { randomBytes, timingSafeEqual } from "node:crypto";

const NONCE_ENVIRONMENT_NAME = "AGENT_OR_NOT_SESSION_NONCE";
const SESSION_HEADER_NAME = "x-agent-or-not-session";

function createSessionNonce() {
  return randomBytes(32).toString("base64url");
}

const localSessionNonce = (() => {
  const configured = process.env[NONCE_ENVIRONMENT_NAME]?.trim();
  if (configured) {
    if (!/^[A-Za-z0-9_-]{43,128}$/u.test(configured)) {
      throw new Error(`${NONCE_ENVIRONMENT_NAME} must be an unpredictable base64url value.`);
    }
    return configured;
  }
  const generated = createSessionNonce();
  process.env[NONCE_ENVIRONMENT_NAME] = generated;
  return generated;
})();

export class LocalRequestError extends Error {
  constructor(message: string, readonly status: 403 | 415 = 403) {
    super(message);
    this.name = "LocalRequestError";
  }
}

function isLoopbackHostname(hostname: string) {
  return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "[::1]" || hostname === "::1";
}

function assertLoopbackRequestUrl(request: Request) {
  const requestUrl = new URL(request.url);
  if (!isLoopbackHostname(requestUrl.hostname)) throw new LocalRequestError("Only loopback requests are accepted.");
}

function assertSameOriginFetchMetadata(request: Request, requireOrigin: boolean) {
  if (request.headers.get("sec-fetch-site") !== "same-origin") {
    throw new LocalRequestError("A same-origin browser request is required.");
  }
  const origin = request.headers.get("origin");
  if (!origin) {
    if (requireOrigin) throw new LocalRequestError("A loopback Origin header is required.");
    return;
  }
  let originUrl: URL;
  try {
    originUrl = new URL(origin);
  } catch {
    throw new LocalRequestError("The request Origin is invalid.");
  }
  if (!isLoopbackHostname(originUrl.hostname) || originUrl.protocol !== "http:") {
    throw new LocalRequestError("The request Origin must be a loopback HTTP origin.");
  }
}

function nonceMatches(candidate: string | null) {
  if (!candidate) return false;
  const expected = Buffer.from(localSessionNonce, "utf8");
  const received = Buffer.from(candidate, "utf8");
  return expected.length === received.length && timingSafeEqual(expected, received);
}

function assertJsonContentType(request: Request) {
  const mediaType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (mediaType !== "application/json") throw new LocalRequestError("Mutating requests require application/json.", 415);
}

export function getLocalSessionNonce() {
  return localSessionNonce;
}

export function assertLocalBootstrapRequest(request: Request) {
  assertLoopbackRequestUrl(request);
  assertSameOriginFetchMetadata(request, false);
}

export function assertLocalSessionRequest(request: Request) {
  const mutating = !["GET", "HEAD", "OPTIONS"].includes(request.method.toUpperCase());
  assertLoopbackRequestUrl(request);
  assertSameOriginFetchMetadata(request, mutating);
  if (mutating) assertJsonContentType(request);
  if (!nonceMatches(request.headers.get(SESSION_HEADER_NAME))) {
    throw new LocalRequestError("The local session nonce is missing or invalid.");
  }
}

export function assertLocalMutationRequest(request: Request) {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method.toUpperCase())) {
    throw new LocalRequestError("A mutating request method is required.");
  }
  assertLocalSessionRequest(request);
}

export function localRequestErrorResponse(error: unknown) {
  if (error instanceof LocalRequestError) {
    return Response.json({ error: error.message }, {
      status: error.status,
      headers: { "cache-control": "no-store" },
    });
  }
  return undefined;
}
