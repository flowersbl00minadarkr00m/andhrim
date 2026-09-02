"use client";

import { useRef, useState, type FormEvent } from "react";
import {
  openRouterConfigurationInputSchema,
  openRouterConfigurationResponseSchema,
  runtimeActionGuidance,
  type RuntimeServiceStatus,
  type RuntimeStatus,
} from "../src/domain/runtime";
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

function firstValidationMessage(modelId: string, apiKey: string) {
  const result = openRouterConfigurationInputSchema.safeParse({ modelId, apiKey });
  return result.success ? undefined : result.error.issues[0]?.message;
}

export function ConnectionHealth({ status, error, checking, onRefresh }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const modelInputRef = useRef<HTMLInputElement>(null);
  const [modelId, setModelId] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [configurationError, setConfigurationError] = useState("");
  const [savedModel, setSavedModel] = useState<string>();
  const [showSavedState, setShowSavedState] = useState(false);
  const appState: DisplayState = status?.services.app.state ?? (error ? "unavailable" : "checking");
  const eveState: DisplayState = status?.services.eve.state ?? "checking";
  const mcpState: DisplayState = status?.services.mcp.state ?? "checking";
  const guidance = savedModel
    ? [`Restart Andhrím with pnpm start to activate ${savedModel}.`]
    : status
      ? runtimeActionGuidance(status)
      : [error ?? "Checking the three local service boundaries. No provider request is made by this diagnostic."];
  const lastDiagnostic = status
    ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "medium" }).format(new Date(status.lastDiagnosticAt))
    : "Not available yet";
  const configurationNote = savedModel
    ? "The OpenRouter setup is saved locally. Restart once to activate it."
    : !status
    ? "Reading the local runtime configuration."
    : status.providerMode === "fixture"
      ? "Fixture mode stays local and uses no provider. Configure OpenRouter here when you want live model output."
      : status.configured
        ? "OpenRouter is active. You can replace its local model or key here."
        : "OpenRouter needs a model and key before it can run.";

  function openConfiguration() {
    setModelId(savedModel ?? (status?.providerMode === "openrouter" ? status.modelId ?? "" : ""));
    setApiKey("");
    setConfigurationError("");
    setShowSavedState(false);
    dialogRef.current?.showModal();
    requestAnimationFrame(() => modelInputRef.current?.focus());
  }

  function closeConfiguration() {
    if (saving) return;
    setApiKey("");
    dialogRef.current?.close();
  }

  async function saveConfiguration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validationMessage = firstValidationMessage(modelId, apiKey);
    if (validationMessage) {
      setConfigurationError(validationMessage);
      return;
    }
    if (!status?.sessionNonce) {
      setConfigurationError("Run the diagnostic, then try saving again.");
      return;
    }

    setSaving(true);
    setConfigurationError("");
    try {
      const response = await fetch("/api/runtime/configure", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-agent-or-not-session": status.sessionNonce,
        },
        body: JSON.stringify({ modelId: modelId.trim(), apiKey: apiKey.trim() }),
      });
      const payload = await response.json() as unknown;
      if (!response.ok) {
        const apiError = payload && typeof payload === "object" && "error" in payload
          ? String(payload.error)
          : "Andhrím could not save the local OpenRouter configuration.";
        throw new Error(apiError);
      }
      const saved = openRouterConfigurationResponseSchema.parse(payload);
      setApiKey("");
      setSavedModel(saved.modelId);
      setShowSavedState(true);
    } catch (caught) {
      setConfigurationError(caught instanceof Error ? caught.message : "Andhrím could not save the local OpenRouter configuration.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className={styles.panel} id="connection-health" aria-labelledby="connection-health-heading">
      <div className={styles.headingRow}>
        <div>
          <h2 id="connection-health-heading" tabIndex={-1}>Connection &amp; health</h2>
          <p className={styles.intro}>Your assessment app is separate from the two internal services it uses. Diagnostics stay on loopback.</p>
        </div>
        <button className={styles.refresh} type="button" onClick={onRefresh} disabled={checking}>
          {checking ? "Checking…" : "Run diagnostic"}
        </button>
      </div>

      <div className={styles.configuration} aria-label="Runtime configuration">
        <div><span>Mode</span><strong>{savedModel ? "OpenRouter after restart" : status ? (status.providerMode === "fixture" ? "Fixture" : "OpenRouter") : "Reading…"}</strong></div>
        <div><span>Selected model</span><strong>{savedModel ?? status?.modelId ?? "Not selected"}</strong></div>
        <div><span>Configuration</span><strong data-ready={!savedModel && (status?.configured ?? false)}>{savedModel ? "Restart required" : status ? (status.configured ? "Configured" : "Needs setup") : "Reading…"}</strong></div>
        <div className={styles.configurationAction}>
          <p>{configurationNote}</p>
          <button type="button" onClick={openConfiguration} disabled={!status?.sessionNonce}>
            {savedModel ? "Change saved setup" : status?.providerMode === "openrouter" && status.configured ? "Edit OpenRouter setup" : "Configure OpenRouter"}
          </button>
        </div>
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

      <dialog
        className={styles.dialog}
        ref={dialogRef}
        aria-labelledby="openrouter-configuration-heading"
        onCancel={(event) => {
          if (saving) event.preventDefault();
          else setApiKey("");
        }}
        onClose={() => setApiKey("")}
      >
        <form onSubmit={(event) => { void saveConfiguration(event); }}>
          <div className={styles.dialogHeading}>
            <div>
              <h3 id="openrouter-configuration-heading">Connect OpenRouter</h3>
              <p>Choose the exact model Andhrím should use for new receipts.</p>
            </div>
            <button className={styles.closeButton} type="button" onClick={closeConfiguration} disabled={saving} aria-label="Close OpenRouter setup">
              <svg aria-hidden="true" viewBox="0 0 24 24">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>

          {showSavedState && savedModel ? (
            <div className={styles.savedState} role="status">
              <strong>Configuration saved locally</strong>
              <p><b>{savedModel}</b> will become active after you stop the current server and run <code>pnpm start</code> again.</p>
              <button className={styles.primaryAction} type="button" onClick={closeConfiguration}>Done</button>
            </div>
          ) : (
            <>
              <div className={styles.formFields}>
                <label>
                  <span>Model identifier</span>
                  <input
                    name="modelId"
                    ref={modelInputRef}
                    autoFocus
                    aria-describedby="openrouter-model-hint"
                    value={modelId}
                    onChange={(event) => setModelId(event.target.value)}
                    placeholder="provider/model"
                    maxLength={160}
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    disabled={saving}
                  />
                  <small id="openrouter-model-hint">Use the exact OpenRouter identifier, including the provider prefix.</small>
                </label>
                <label>
                  <span>OpenRouter API key</span>
                  <input
                    name="apiKey"
                    type="password"
                    aria-describedby="openrouter-key-hint"
                    value={apiKey}
                    onChange={(event) => setApiKey(event.target.value)}
                    placeholder="Paste your key"
                    maxLength={512}
                    autoCapitalize="none"
                    autoCorrect="off"
                    autoComplete="new-password"
                    spellCheck={false}
                    disabled={saving}
                  />
                  <small id="openrouter-key-hint">Sent only to this loopback app and written to its Git-ignored <code>.env.local</code> file.</small>
                </label>
              </div>

              <div className={styles.securityNote}>
                <strong>Local secret boundary</strong>
                <p>The key is never returned by the API or added to receipts, prompts, learning history, exports, or browser storage.</p>
              </div>

              {configurationError ? <p className={styles.formError} role="alert">{configurationError}</p> : null}

              <div className={styles.dialogActions}>
                <button type="button" onClick={closeConfiguration} disabled={saving}>Cancel</button>
                <button className={styles.primaryAction} type="submit" disabled={saving}>
                  {saving ? "Saving locally…" : "Save configuration"}
                </button>
              </div>
            </>
          )}
        </form>
      </dialog>
    </section>
  );
}
