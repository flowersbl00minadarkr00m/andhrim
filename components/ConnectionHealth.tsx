"use client";

import { runtimeActionGuidance, type RuntimeServiceStatus, type RuntimeStatus } from "@/src/domain/runtime";
import styles from "./ConnectionHealth.module.css";

type Props = {
  status?: RuntimeStatus;
  error?: string;
  checking: boolean;
  onRefresh: () => void;
};

type DisplayState = RuntimeServiceStatus["state"] | "checking";

const stateCopy: Record<DisplayState, string> = {
  healthy: "Healthy",
  unavailable: "Unavailable",
  checking: "Checking",
};

function ServiceCard({
  group,
  name,
  description,
  state,
}: {
  group: string;
  name: string;
  description: string;
  state: DisplayState;
}) {
  return (
    <article className={styles.serviceCard} data-state={state}>
      <div className={styles.serviceTopline}>
        <span>{group}</span>
        <b className={styles.status} data-state={state}><i aria-hidden="true" />{stateCopy[state]}</b>
      </div>
      <h3>{name}</h3>
      <p>{description}</p>
    </article>
  );
}

export function ConnectionHealth({ status, error, checking, onRefresh }: Props) {
  const appState: DisplayState = status?.services.app.state ?? (error ? "unavailable" : "checking");
  const eveState: DisplayState = status?.services.eve.state ?? "checking";
  const mcpState: DisplayState = status?.services.mcp.state ?? "checking";
  const guidance = status
    ? runtimeActionGuidance(status)
    : [error ?? "Checking the three local service boundaries. No provider request is made by this diagnostic."];
  const lastDiagnostic = status
    ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "medium" }).format(new Date(status.lastDiagnosticAt))
    : "Not available yet";
  const configurationNote = !status
    ? "Reading the local runtime configuration."
    : status.providerMode === "fixture"
      ? "Deterministic fixture mode does not use a provider credential."
      : status.configured
        ? "OpenRouter is configured locally; this page never accepts or reveals the key."
        : "OpenRouter setup stays in .env.local; this page never accepts or reveals the key.";

  return (
    <section className={styles.panel} id="connection-health" aria-labelledby="connection-health-heading">
      <div className={styles.headingRow}>
        <div>
          <p className={styles.eyebrow}>Local runtime topology</p>
          <h2 id="connection-health-heading">Connection &amp; health</h2>
          <p className={styles.intro}>Your assessment app is separate from the two internal services it uses. Diagnostics stay on loopback.</p>
        </div>
        <button className={styles.refresh} type="button" onClick={onRefresh} disabled={checking}>
          {checking ? "Checking…" : "Run diagnostic"}
        </button>
      </div>

      <div className={styles.configuration} aria-label="Runtime configuration">
        <div><span>Mode</span><strong>{status ? (status.providerMode === "fixture" ? "Fixture" : "OpenRouter") : "Reading…"}</strong></div>
        <div><span>Selected model</span><strong>{status?.modelId ?? "Not selected"}</strong></div>
        <div><span>Configuration</span><strong data-ready={status?.configured ?? false}>{status ? (status.configured ? "Configured" : "Needs setup") : "Reading…"}</strong></div>
        <p>{configurationNote}</p>
      </div>

      <div className={styles.topology} aria-label="Application and internal service health">
        <div className={styles.appZone}>
          <ServiceCard
            group="Your app"
            name="Agent or Not?"
            description={status?.services.app.detail ?? error ?? "Waiting for the local application status endpoint."}
            state={appState}
          />
        </div>
        <div className={styles.connector} aria-hidden="true"><span>uses</span><i /></div>
        <div className={styles.internalZone}>
          <p>Internal services</p>
          <div>
            <ServiceCard
              group="Recommendation runtime"
              name="Eve"
              description={status?.services.eve.detail ?? "Waiting for the bounded Eve health endpoint."}
              state={eveState}
            />
            <ServiceCard
              group="Read-only guidance"
              name="MCP"
              description={status?.services.mcp.detail ?? "Waiting for the approved-guidance service."}
              state={mcpState}
            />
          </div>
        </div>
      </div>

      <div className={styles.guidance} aria-live="polite">
        <div><span>Last diagnostic</span><time dateTime={status?.lastDiagnosticAt}>{lastDiagnostic}</time></div>
        <ul>{guidance.map((item) => <li key={item}>{item}</li>)}</ul>
      </div>
    </section>
  );
}
