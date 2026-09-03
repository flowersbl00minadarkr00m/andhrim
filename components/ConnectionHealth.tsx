"use client";

import { useRef, useState, type FormEvent } from "react";
import {
  openRouterConfigurationClearResponseSchema,
  openRouterConfigurationInputSchema,
  openRouterConfigurationResponseSchema,
  openRouterConnectionTestResponseSchema,
  runtimeActionGuidance,
  type OpenRouterConnectionTestResponse,
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
  const [clearPending, setClearPending] = useState(false);
  const [confirmingRemoval, setConfirmingRemoval] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [connectionTest, setConnectionTest] = useState<OpenRouterConnectionTestResponse>();
  const appState: DisplayState = status?.services.app.state ?? (error ? "unavailable" : "checking");
  const eveState: DisplayState = status?.services.eve.state ?? "checking";
  const mcpState: DisplayState = status?.services.mcp.state ?? "checking";
  const guidance = clearPending
    ? ["Restart Andhrím with pnpm start to finish returning to fixture mode."]
    : savedModel
    ? [`Restart Andhrím with pnpm start to activate ${savedModel}.`]
    : status
      ? runtimeActionGuidance(status)
      : [error ?? "Checking the three local service boundaries. No provider request is made by this diagnostic."];
  const lastDiagnostic = status
    ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "medium" }).format(new Date(status.lastDiagnosticAt))
    : "Not available yet";
  const configurationNote = clearPending
    ? "The saved key was removed. Restart once to return to fixture mode."
    : savedModel
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
    setConfirmingRemoval(false);
    dialogRef.current?.showModal();
    requestAnimationFrame(() => modelInputRef.current?.focus());
  }

  function closeConfiguration() {
    if (saving || removing || testing) return;
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
      setClearPending(false);
      setShowSavedState(true);
      setConnectionTest(undefined);
    } catch (caught) {
      setConfigurationError(caught instanceof Error ? caught.message : "Andhrím could not save the local OpenRouter configuration.");
    } finally {
      setSaving(false);
    }
  }

  async function testConnection() {
    if (!status?.sessionNonce) {
      setConfigurationError("Run the diagnostic, then try the connection check again.");
      return;
    }
    setTesting(true);
    setConfigurationError("");
    setConnectionTest(undefined);
    try {
      const response = await fetch("/api/runtime/test", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-agent-or-not-session": status.sessionNonce,
        },
        body: "{}",
      });
      const payload = await response.json() as unknown;
      if (!response.ok) {
        const apiError = payload && typeof payload === "object" && "error" in payload
          ? String(payload.error)
          : "Andhrím could not test the saved OpenRouter setup.";
        throw new Error(apiError);
      }
      setConnectionTest(openRouterConnectionTestResponseSchema.parse(payload));
    } catch (caught) {
      setConfigurationError(caught instanceof Error ? caught.message : "Andhrím could not test the saved OpenRouter setup.");
    } finally {
      setTesting(false);
    }
  }

  async function removeConfiguration() {
    if (!status?.sessionNonce) {
      setConfigurationError("Run the diagnostic, then try removing the saved key again.");
      return;
    }
    setRemoving(true);
    setConfigurationError("");
    try {
      const response = await fetch("/api/runtime/configure", {
        method: "DELETE",
        headers: {
          "content-type": "application/json",
          "x-agent-or-not-session": status.sessionNonce,
        },
        body: "{}",
      });
      const payload = await response.json() as unknown;
      if (!response.ok) {
        const apiError = payload && typeof payload === "object" && "error" in payload
          ? String(payload.error)
          : "Andhrím could not remove the saved OpenRouter key.";
        throw new Error(apiError);
      }
      openRouterConfigurationClearResponseSchema.parse(payload);
      setSavedModel(undefined);
      setClearPending(true);
      setShowSavedState(false);
      setConfirmingRemoval(false);
      setConnectionTest(undefined);
      dialogRef.current?.close();
    } catch (caught) {
      setConfigurationError(caught instanceof Error ? caught.message : "Andhrím could not remove the saved OpenRouter key.");
    } finally {
      setRemoving(false);
    }
  }

  const hasOpenRouterConfiguration = !clearPending && Boolean(
    savedModel || (status?.providerMode === "openrouter" && status.configured),
  );

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
        <div><span>Mode</span><strong>{clearPending ? "Fixture after restart" : savedModel ? "OpenRouter after restart" : status ? (status.providerMode === "fixture" ? "Fixture" : "OpenRouter") : "Reading…"}</strong></div>
        <div><span>Selected model</span><strong>{clearPending ? "None after restart" : savedModel ?? status?.modelId ?? "Not selected"}</strong></div>
        <div><span>Configuration</span><strong data-ready={!savedModel && !clearPending && (status?.configured ?? false)}>{savedModel || clearPending ? "Restart required" : status ? (status.configured ? "Configured" : "Needs setup") : "Reading…"}</strong></div>
        <div className={styles.configurationAction}>
          <p>{configurationNote}</p>
          <div className={styles.configurationButtons}>
            {hasOpenRouterConfiguration ? (
              <button type="button" onClick={() => { void testConnection(); }} disabled={!status?.sessionNonce || testing}>
                {testing ? "Testing…" : "Test connection"}
              </button>
            ) : null}
            <button type="button" onClick={openConfiguration} disabled={!status?.sessionNonce}>
              {savedModel ? "Change saved setup" : status?.providerMode === "openrouter" && status.configured ? "Edit OpenRouter setup" : "Configure OpenRouter"}
            </button>
          </div>
        </div>
      </div>

      {connectionTest ? (
        <div className={styles.connectionResult} data-state={connectionTest.state} role="status">
          <div>
            <span>{connectionTest.state === "ready" ? "Connection ready" : "Connection needs attention"}</span>
            <strong>{connectionTest.modelName ?? connectionTest.modelId ?? "OpenRouter"}</strong>
          </div>
          <p>{connectionTest.detail}</p>
          <small>No assessment was shared and no inference was requested.</small>
        </div>
      ) : null}

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
          if (saving || removing || testing) event.preventDefault();
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
              <p>The optional connection check reads OpenRouter key and model metadata only. It sends no assessment and requests no inference.</p>
              {connectionTest ? <p className={styles.inlineTestResult} data-state={connectionTest.state}>{connectionTest.detail}</p> : null}
              {configurationError ? <p className={styles.formError} role="alert">{configurationError}</p> : null}
              <div className={styles.savedActions}>
                <button type="button" onClick={() => { void testConnection(); }} disabled={testing}>{testing ? "Testing…" : "Test connection"}</button>
                <button className={styles.primaryAction} type="button" onClick={closeConfiguration} disabled={testing}>Done</button>
              </div>
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
                <p>Saving only updates local configuration. No connection test or provider request runs automatically.</p>
              </div>

              {hasOpenRouterConfiguration ? (
                <div className={styles.removeConfiguration}>
                  {confirmingRemoval ? (
                    <div>
                      <p>Remove the saved key and return to fixture mode after the next restart?</p>
                      <div>
                        <button type="button" onClick={() => setConfirmingRemoval(false)} disabled={removing}>Keep key</button>
                        <button className={styles.dangerAction} type="button" onClick={() => { void removeConfiguration(); }} disabled={removing}>
                          {removing ? "Removing…" : "Remove saved key"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button type="button" onClick={() => setConfirmingRemoval(true)}>Remove saved key</button>
                  )}
                </div>
              ) : null}

              {configurationError ? <p className={styles.formError} role="alert">{configurationError}</p> : null}

              <div className={styles.dialogActions}>
                <button type="button" onClick={closeConfiguration} disabled={saving || removing}>Cancel</button>
                <button className={styles.primaryAction} type="submit" disabled={saving || removing}>
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
