import type { ProductProjection } from "../domain/learning";

export async function postProductAction(body: unknown, sessionNonce: string): Promise<ProductProjection> {
  const response = await fetch("/api/events", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-agent-or-not-session": sessionNonce,
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json() as { projection?: ProductProjection; error?: string };
  if (!response.ok || !payload.projection) throw new Error(payload.error ?? "The local event could not be recorded.");
  return payload.projection;
}
