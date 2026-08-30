"use client";

import { useEffect, useMemo, useState } from "react";
import { LearningHistory } from "./LearningHistory";
import { LearningPanel } from "./LearningPanel";
import { Receipt } from "./Receipt";
import { requestEveReceipt } from "@/src/client/eve";
import { postProductAction } from "@/src/client/events";
import { assessmentFactorCopy } from "@/src/domain/assessment-copy";
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
import type { ProviderMode } from "@/src/domain/runtime";

const questions = assessmentFactors.map((factor) => ({ factor, ...assessmentFactorCopy[factor] }));

type RuntimeStatus = {
  providerMode: ProviderMode;
  modelId: string | null;
  configured: boolean;
  sessionNonce: string;
  privacyDisclosure: string;
};

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

  useEffect(() => {
    setAssessment(newAssessment());
    fetch("/api/state", { cache: "no-store" })
      .then((response) => response.json())
      .then((value: { projection?: ProductProjection }) => value.projection && setProjection(value.projection))
      .catch(() => setError("The local event ledger could not be read."));
    fetch("/api/runtime", { cache: "no-store" })
      .then(async (response) => {
        const value = await response.json() as RuntimeStatus & { error?: string };
        if (!response.ok) throw new Error(value.error ?? "Invalid local model configuration.");
        setRuntimeStatus(value);
      })
      .catch(() => setError("The local model configuration could not be read."));
  }, []);

  const previewRecommendation = useMemo<RecommendationReceipt["recommendation"]>(() => {
    if (!assessment) return "ai-assisted";
    const answers = assessment.answers;
    if (answers.outcomeStakes >= 4 || answers.contextSensitivity >= 5) return "human-led";
    if (answers.specificationClarity <= 2) return "more-information-required";
    if (answers.repeatability >= 4 && answers.verificationCost <= 2) return "agent-delegated";
    return "ai-assisted";
  }, [assessment]);

  if (!assessment) return <main className="loading">Preparing the local assessment…</main>;
  const question = questions[step];

  const updateAnswer = (value: number) => {
    setAssessment((current) => current ? ({
      ...current,
      answers: { ...current.answers, [question.factor]: value },
    }) : current);
  };

  const generate = async () => {
    setBusy(true);
    setError("");
    try {
      const validatedAssessment = assessmentSchema.parse(assessment);
      if (!runtimeStatus?.configured || !runtimeStatus.modelId || !runtimeStatus.sessionNonce) {
        throw new Error("The selected local model or session boundary is not configured.");
      }
      const modelReceipt = await requestEveReceipt(validatedAssessment, {
        providerMode: runtimeStatus.providerMode,
        modelId: runtimeStatus.modelId,
        sessionNonce: runtimeStatus.sessionNonce,
      });
      const localReceipt = parseRecommendationReceipt({
        ...modelReceipt,
        receiptId: `receipt-${crypto.randomUUID()}`,
        assessmentId: assessment.assessmentId,
      });
      const nextProjection = await postProductAction({
        action: "record-recommendation",
        assessment: validatedAssessment,
        receipt: localReceipt,
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

  return (
    <main>
      <header className="app-header">
        <button type="button" className="wordmark" onClick={reset}>Andhrím <em>Agent or Not?</em></button>
        <nav aria-label="Primary">
          <button type="button" onClick={reset}>New case</button>
          {receipt ? <a href="#outcome-heading">Outcome</a> : null}
          <a href="#history">History</a>
          <a href="/api/export">Export</a>
          <a href="#about">About</a>
        </nav>
      </header>

      {!receipt ? (
        <div className="assessment-layout">
          <section className="assessment" aria-labelledby="assessment-title">
            <div className="assessment__topline">
              <h1 id="assessment-title">Delegation assessment</h1>
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
            {error ? <p className="error" role="alert">{error}</p> : null}
          </section>
          <aside className="receipt-pane"><Receipt previewRecommendation={previewRecommendation} step={step} privacyDisclosure={runtimeStatus?.privacyDisclosure} /></aside>
        </div>
      ) : (
        <div className="completed-layout">
          <section className="completed-receipt"><Receipt receipt={receipt} previewRecommendation={receipt.recommendation} step={4} onStarterPackSave={saveStarterPack} privacyDisclosure={runtimeStatus?.privacyDisclosure} /></section>
          <LearningPanel receipt={receipt} projection={projection} sessionNonce={runtimeStatus?.sessionNonce} onProjection={setProjection} onError={setError} />
          {error ? <p className="error completed-error" role="alert">{error}</p> : null}
        </div>
      )}

      <LearningHistory projection={projection} sessionNonce={runtimeStatus?.sessionNonce} onProjection={setProjection} onError={setError} />

      <footer className="app-footer" id="about">
        <p><b>Loopback application</b> · Eve session · No tools enabled · Local ledger</p>
        <p>{runtimeStatus ? `${runtimeStatus.providerMode === "fixture" ? "Fixture" : "OpenRouter"} · ${runtimeStatus.modelId ?? "model not selected"} · ${runtimeStatus.configured ? "configured" : "not configured"}` : "Reading local model status…"}</p>
        <p>{runtimeStatus?.privacyDisclosure ?? "Reading the runtime privacy boundary…"}</p>
      </footer>
    </main>
  );
}
