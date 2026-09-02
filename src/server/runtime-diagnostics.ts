import type { RuntimeServiceStatus } from "../domain/runtime";

type RuntimeProbe = {
  url: URL;
  acceptedStatuses: readonly number[];
  healthyDetail: string;
  unavailableDetail: string;
};

type Fetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export function assertLoopbackDiagnosticUrl(value: string, expectedPath: string): URL {
  const url = new URL(value);
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || !url.port) {
    throw new Error("Runtime diagnostics require an explicit loopback HTTP target and port.");
  }
  if (url.username || url.password) throw new Error("Runtime diagnostic URLs cannot contain credentials.");
  if (url.search) throw new Error("Runtime diagnostic URLs cannot contain query data.");
  if (url.hash) throw new Error("Runtime diagnostic URLs cannot contain a fragment.");
  if (url.pathname !== expectedPath) throw new Error(`Runtime diagnostic URL must use ${expectedPath}.`);
  return url;
}

export async function diagnoseLoopbackService(
  probe: RuntimeProbe,
  fetcher: Fetcher = fetch,
): Promise<RuntimeServiceStatus> {
  try {
    const response = await fetcher(probe.url, {
      method: "GET",
      cache: "no-store",
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(1_500),
    });
    await response.body?.cancel();
    if (probe.acceptedStatuses.includes(response.status)) {
      return { state: "healthy", detail: probe.healthyDetail };
    }
  } catch {
    // A diagnostic only reports the bounded state; transport details stay server-side.
  }
  return { state: "unavailable", detail: probe.unavailableDetail };
}
