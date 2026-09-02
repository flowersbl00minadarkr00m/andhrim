"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AssessmentSamples } from "./AssessmentSamples";
import { ConnectionHealth } from "./ConnectionHealth";
import { DataBackupRestore } from "./DataBackupRestore";
import { LearningHistory } from "./LearningHistory";
import { LearningPanel } from "./LearningPanel";
import { Receipt } from "./Receipt";
import { requestEveReceipt } from "@/src/client/eve";
import { postProductAction } from "@/src/client/events";
import { assessmentFactorCopy } from "@/src/domain/assessment-copy";
import {
  createAssessmentFromSample,
  previewRecommendationForAssessment,
  type AssessmentSampleId,
} from "@/src/domain/assessment-samples";
import {
  assessmentFactors,
  assessmentSchema,
  type Assessment,
  type ProductProjection,
} from "@/src/domain/learning";
import {
  parseRecommendationReceipt,
  type RecommendationReceipt,
} from "@/src/domain/recommendation";
import { runtimeStatusSchema, type RuntimeStatus } from "@/src/domain/runtime";

const questions = assessmentFactors.map((factor) => ({ factor, ...assessmentFactorCopy[factor] }));

type LedgerRecovery = {
  message: string;
  url: string;
};

type Workspace = "assess" | "history" | "data" | "system";

const workspaceMeta: Array<{
  id: Workspace;
  hash: string;
  label: string;
  description: string;
  headingId: string;
}> = [
  { id: "assess", hash: "#assessment", label: "Assess", description: "Frame the decision", headingId: "assessment-title" },
  { id: "history", hash: "#history", label: "History", description: "Review local learning", headingId: "history-heading" },
  { id: "data", hash: "#data", label: "Data", description: "Backup and restore", headingId: "data-heading" },
  { id: "system", hash: "#connection-health", label: "System", description: "Inspect runtime health", headingId: "connection-health-heading" },
];

function workspaceFromHash(hash: string): Workspace {
  if (hash === "#history") return "history";
  if (hash === "#data") return "data";
  if (hash === "#connection-health") return "system";
  return "assess";
}

function newAssessment(): Assessment {
  return assessmentSchema.parse({
    schemaVersion: "assessment-v1",
    assessmentId: `assessment-${crypto.randomUUID()}`,
    createdAt: new Date().toISOString(),
    title: "Draft a bounded internal project brief",
    desiredOutcome: "A concise brief with clear options, evidence, and review points.",
    constraints: "Internal only; under 700 words; no external action.",
    answers: { outcomeStakes: 3, repeatability: 4, specificationClarity: 4, verificationCost: 2, contextSensitivity: 3 },
  });
}

export function AgentOrNotApp() {
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [step, setStep] = useState(0);
  const [receipt, setReceipt] = useState<RecommendationReceipt>();
  const [projection, setProjection] = useState<ProductProjection>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [runtimeStatus, setRuntimeStatus] = useState<RuntimeStatus>();
  const [runtimeError, setRuntimeError] = useState("");
  const [runtimeChecking, setRuntimeChecking] = useState(true);
  const [ledgerRecovery, setLedgerRecovery] = useState<LedgerRecovery>();
  const [workspace, setWorkspace] = useState<Workspace>("assess");

  const refreshRuntime = useCallback(async () => {
    setRuntimeChecking(true);
    setRuntimeError("");
    try {
      const response = await fetch("/api/runtime", { cache: "no-store" });
      const value = await response.json() as { error?: string };
      if (!response.ok) throw new Error(value.error ?? "Invalid local model configuration.");
      const parsed = runtimeStatusSchema.safeParse(value);
      if (!parsed.success) throw new Error("The local runtime returned an invalid status response.");
      setRuntimeStatus(parsed.data);
    } catch (caught) {
      setRuntimeStatus(undefined);
      setRuntimeError(caught instanceof Error ? caught.message : "The local runtime diagnostic could not be read.");
    } finally {
      setRuntimeChecking(false);
    }
  }, []);

  useEffect(() => {
    setAssessment(newAssessment());
    fetch("/api/state", { cache: "no-store" })
      .then(async (response) => {
        const value = await response.json() as { projection?: ProductProjection; code?: string; error?: string; recoveryUrl?: string };
        if (response.ok && value.projection) {
          setProjection(value.projection);
          return;
        }
        if (value.code === "PRODUCT_LEDGER_INVALID" && value.recoveryUrl) {
          setLedgerRecovery({ message: value.error ?? "The local ledger failed an integrity check.", url: value.recoveryUrl });
          return;
        }
        throw new Error(value.error ?? "The local event ledger could not be read.");
      })
      .catch((caught) => setError(caught instanceof Error ? caught.message : "The local event ledger could not be read."));
    void refreshRuntime();
  }, [refreshRuntime]);

  useEffect(() => {
    const syncWorkspace = () => setWorkspace(workspaceFromHash(window.location.hash));
    syncWorkspace();
    window.addEventListener("hashchange", syncWorkspace);
    window.addEventListener("popstate", syncWorkspace);
    return () => {
      window.removeEventListener("hashchange", syncWorkspace);
      window.removeEventListener("popstate", syncWorkspace);
    };
  }, []);

  const previewRecommendation = useMemo<RecommendationReceipt["recommendation"]>(() => {
    if (!assessment) return "ai-assisted";
    return previewRecommendationForAssessment(assessment);
  }, [assessment]);

  if (!assessment) return <main className="loading">Preparing the local assessment…</main>;
  const question = questions[step];

  const updateAnswer = (value: number) => {
    setAssessment((current) => current ? ({
      ...current,
      answers: { ...current.answers, [question.factor]: value },
    }) : current);
  };

  const openWorkspace = (nextWorkspace: Workspace, hash: string, headingId: string) => {
    setWorkspace(nextWorkspace);
    if (window.location.hash !== hash) window.history.pushState(null, "", hash);
    window.requestAnimationFrame(() => document.getElementById(headingId)?.focus());
  };

  const loadSample = (sampleId: AssessmentSampleId) => {
    setAssessment(createAssessmentFromSample(sampleId));
    setStep(0);
    setReceipt(undefined);
    setError("");
    setWorkspace("assess");
    window.history.replaceState(null, "", "#assessment");
    window.requestAnimationFrame(() => document.getElementById("assessment-title")?.focus());
  };

  const generate = async () => {
    setBusy(true);
    setError("");
    try {
      const validatedAssessment = assessmentSchema.parse(assessment);
      if (!runtimeStatus?.configured || !runtimeStatus.modelId || !runtimeStatus.sessionNonce) {
        throw new Error("The selected local model or session boundary is not configured.");
      }
      const modelRun = await requestEveReceipt(validatedAssessment, {
        providerMode: runtimeStatus.providerMode,
        modelId: runtimeStatus.modelId,
        sessionNonce: runtimeStatus.sessionNonce,
      });
      const localReceipt = parseRecommendationReceipt({
        ...modelRun.receipt,
        receiptId: `receipt-${crypto.randomUUID()}`,
        assessmentId: assessment.assessmentId,
      });
      const nextProjection = await postProductAction({
        action: "record-recommendation",
        assessment: validatedAssessment,
        receipt: localReceipt,
        capabilityTrace: modelRun.capabilityTrace,
        verificationContext: modelRun.verificationContext,
      }, runtimeStatus.sessionNonce);
      setProjection(nextProjection);
      setReceipt(nextProjection.receipts[localReceipt.receiptId]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The local recommendation failed.");
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setAssessment(newAssessment());
    setStep(0);
    setReceipt(undefined);
    setError("");
    openWorkspace("assess", "#assessment", "assessment-title");
  };

  const saveStarterPack = async (nextReceipt: RecommendationReceipt) => {
    setError("");
    try {
      const nextProjection = await postProductAction(
        { action: "edit-receipt", receipt: nextReceipt },
        runtimeStatus?.sessionNonce ?? "",
      );
      setProjection(nextProjection);
      setReceipt(nextProjection.receipts[nextReceipt.receiptId]);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "The starter pack could not be saved.";
      setError(message);
      throw caught;
    }
  };

  const resumeLearningReview = (candidateId: string) => {
    const candidate = projection?.candidates[candidateId];
    if (!candidate || candidate.status !== "proposed") {
      setError("Only a proposed Learning Candidate can resume review.");
      return;
    }
    const sourceOutcome = projection?.outcomes[candidate.sourceOutcomeId];
    const sourceReceipt = sourceOutcome ? projection?.receipts[sourceOutcome.receiptId] : undefined;
    if (!sourceOutcome || !sourceReceipt) {
      setError("The candidate's source outcome or receipt is missing from the local projection.");
      return;
    }
    setReceipt(sourceReceipt);
    setError("");
    setWorkspace("assess");
    window.history.pushState(null, "", "#outcome-heading");
    window.requestAnimationFrame(() => document.getElementById("outcome-heading")?.focus());
  };

  return (
    <main className="app-shell-root">
      <header className="app-header">
        <button type="button" className="wordmark" onClick={reset}>Andhrím <em>Agent or Not?</em></button>
        <div className="header-actions">
          <a
            className="runtime-summary"
            data-state={runtimeStatus?.configured ? "ready" : runtimeError ? "unavailable" : "checking"}
            href="#connection-health"
            aria-label="Open system health"
            onClick={(event) => { event.preventDefault(); openWorkspace("system", "#connection-health", "connection-health-heading"); }}
          >
            <i aria-hidden="true" />
            <span><b>{runtimeStatus?.configured ? "Runtime ready" : runtimeError ? "Runtime unavailable" : "Checking runtime"}</b><small>{runtimeStatus ? `${runtimeStatus.providerMode === "fixture" ? "Fixture" : "OpenRouter"} · ${runtimeStatus.modelId ?? "No model"}` : "Local services"}</small></span>
          </a>
          <button className="header-new-case" type="button" onClick={reset}>New case</button>
        </div>
      </header>

      <div className="workspace-shell">
        <aside className="workspace-rail">
          <nav aria-label="Workspaces">
            {workspaceMeta.map((item) => (
              <a
                key={item.id}
                className="workspace-link"
                href={item.hash}
                aria-current={workspace === item.id ? "page" : undefined}
                onClick={(event) => { event.preventDefault(); openWorkspace(item.id, item.hash, item.headingId); }}
              >
                <b>{item.label}</b>
                <span>{item.description}</span>
              </a>
            ))}
            <a className="workspace-link" href="/evaluation"><b>Evaluation</b><span>Compare model runs</span></a>
          </nav>
          <p>One local decision path. Supporting tools stay in their own workspace.</p>
        </aside>

        <div className="workspace-main">
          {ledgerRecovery ? (
            <section className="recovery-notice" role="alert" aria-labelledby="recovery-heading">
              <div><p>Local data needs attention</p><h2 id="recovery-heading">The ledger was preserved.</h2><span>{ledgerRecovery.message} Download the unchanged NDJSON before attempting a manual repair.</span></div>
              <a className="button" href={ledgerRecovery.url}>Download untouched ledger</a>
            </section>
          ) : null}

          {error ? <p className="error global-error" role="alert">{error}</p> : null}

          <div className="workspace-view" data-workspace="assess" hidden={workspace !== "assess"}>
            {!receipt ? (
              <>
                <details className="sample-drawer">
                  <summary><span><b>Start from a sample</b><small>Load an editable case without generating a receipt</small></span><span aria-hidden="true">View cases</span></summary>
                  <AssessmentSamples onLoad={loadSample} />
                </details>
                <div className="assessment-layout">
                  <section className="assessment" aria-labelledby="assessment-title">
                    <div className="assessment__topline">
                      <h1 id="assessment-title" tabIndex={-1}>Delegation assessment</h1>
                      <span>Step {step + 1} of 5</span>
                    </div>
                    <div className="progress" aria-label="Assessment progress">
                      {questions.map((item, index) => (
                        <button key={item.factor} type="button" aria-label={`Go to step ${index + 1}`} aria-current={step === index ? "step" : undefined} className={index < step ? "is-complete" : step === index ? "is-current" : ""} onClick={() => setStep(index)}>{index < step ? "✓" : index + 1}</button>
                      ))}
                    </div>

                    <div className="case-context">
                      <label>Case title<input value={assessment.title} maxLength={120} onChange={(event) => setAssessment({ ...assessment, title: event.target.value })} /></label>
                      <label>Desired outcome<textarea value={assessment.desiredOutcome} maxLength={800} onChange={(event) => setAssessment({ ...assessment, desiredOutcome: event.target.value })} /></label>
                      <label>Constraints<textarea value={assessment.constraints} maxLength={800} onChange={(event) => setAssessment({ ...assessment, constraints: event.target.value })} /></label>
                    </div>

                    <fieldset className="question">
                      <legend>{question.title}</legend>
                      <p>{question.help}</p>
                      <div className="options">
                        {question.labels.map((label, index) => {
                          const value = index + 1;
                          return <label key={label}><input type="radio" name={question.factor} value={value} checked={assessment.answers[question.factor] === value} onChange={() => updateAnswer(value)} /><span>{label}</span></label>;
                        })}
                      </div>
                    </fieldset>

                    <div className="assessment__actions">
                      <button className="button" type="button" onClick={() => setStep((value) => Math.max(0, value - 1))} disabled={step === 0}>← Back</button>
                      {step < 4
                        ? <button className="button button--primary" type="button" onClick={() => setStep((value) => value + 1)}>Continue →</button>
                        : <button className="button button--primary" type="button" onClick={generate} disabled={busy}>{busy ? "Running local Eve…" : "Generate receipt →"}</button>}
                    </div>
                    <p className="keyboard-hint">Tab and Shift+Tab move. Space selects. {runtimeStatus?.privacyDisclosure ?? "Reading the runtime privacy boundary…"}</p>
                  </section>
                  <aside className="receipt-pane"><Receipt previewRecommendation={previewRecommendation} step={step} privacyDisclosure={runtimeStatus?.privacyDisclosure} /></aside>
                </div>
              </>
            ) : (
              <div className="completed-layout">
                <section className="completed-receipt"><Receipt receipt={receipt} capabilityTrace={projection?.capabilityTraces[receipt.receiptId]} verification={projection?.receiptVerifications[receipt.receiptId]} previewRecommendation={receipt.recommendation} step={4} onStarterPackSave={saveStarterPack} privacyDisclosure={runtimeStatus?.privacyDisclosure} /></section>
                <LearningPanel key={receipt.receiptId} receipt={receipt} projection={projection} sessionNonce={runtimeStatus?.sessionNonce} onProjection={setProjection} onError={setError} />
              </div>
            )}
          </div>

          <div className="workspace-view" data-workspace="history" hidden={workspace !== "history"}>
            <LearningHistory projection={projection} sessionNonce={runtimeStatus?.sessionNonce} onProjection={setProjection} onError={setError} onResumeReview={resumeLearningReview} />
          </div>

          <div className="workspace-view" data-workspace="data" hidden={workspace !== "data"}>
            <DataBackupRestore
              sessionNonce={runtimeStatus?.sessionNonce}
              onRestore={(restoredProjection) => {
                setProjection(restoredProjection);
                setReceipt(undefined);
                setLedgerRecovery(undefined);
                setError("");
              }}
            />
          </div>

          <div className="workspace-view" data-workspace="system" hidden={workspace !== "system"}>
            <ConnectionHealth
              status={runtimeStatus}
              error={runtimeError}
              checking={runtimeChecking}
              onRefresh={() => { void refreshRuntime(); }}
            />
          </div>
        </div>
      </div>

      <footer className="app-footer" id="about">
        <p><b>Loopback application</b> · Eve bounded guidance harness · Read-only skill/tool/MCP evidence · Local ledger</p>
        <p>{runtimeStatus ? `${runtimeStatus.providerMode === "fixture" ? "Fixture" : "OpenRouter"} · ${runtimeStatus.modelId ?? "model not selected"} · ${runtimeStatus.configured ? "configured" : "not configured"}` : "Reading local model status…"}</p>
        <p>{runtimeStatus?.privacyDisclosure ?? "Reading the runtime privacy boundary…"}</p>
      </footer>
    </main>
  );
}
