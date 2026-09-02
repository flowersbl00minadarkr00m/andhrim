"use client";

import { useEffect, useState } from "react";
import type { RecommendationReceipt } from "@/src/domain/recommendation";
import type { CapabilityTrace } from "@/src/domain/capabilities";
import type { ReceiptVerification } from "@/src/domain/verification";
import { ReceiptActions } from "./ReceiptActions";

const recommendationLabels: Record<RecommendationReceipt["recommendation"], string> = {
  "human-led": "Human-led",
  "ai-assisted": "AI-assisted",
  "agent-delegated": "Agent-delegated",
  automated: "Automated",
  "more-information-required": "More information required",
};

type ReceiptView = "decision" | "plan" | "trust";

const receiptViews: Array<{ id: ReceiptView; label: string; description: string }> = [
  { id: "decision", label: "Decision", description: "Recommendation and rationale" },
  { id: "plan", label: "Work plan", description: "Editable next steps" },
  { id: "trust", label: "Trust", description: "Verification and provenance" },
];

type Props = {
  receipt?: RecommendationReceipt;
  capabilityTrace?: CapabilityTrace;
  verification?: ReceiptVerification;
  previewRecommendation: RecommendationReceipt["recommendation"];
  step: number;
  privacyDisclosure?: string;
  onStarterPackSave?: (receipt: RecommendationReceipt) => Promise<void>;
};

function shortDigest(value: string): string {
  return `${value.slice(0, 12)}…${value.slice(-8)}`;
}

export function Receipt({ receipt, capabilityTrace, verification, previewRecommendation, step, privacyDisclosure, onStarterPackSave }: Props) {
  const recommendation = receipt?.recommendation ?? previewRecommendation;
  const [activeView, setActiveView] = useState<ReceiptView>("decision");
  const [editing, setEditing] = useState(false);
  const [starterPack, setStarterPack] = useState(receipt?.starterPack ?? []);

  useEffect(() => {
    setStarterPack(receipt?.starterPack ?? []);
    setEditing(false);
  }, [receipt]);
  useEffect(() => { setActiveView("decision"); }, [receipt?.receiptId]);

  const showDecision = !receipt || activeView === "decision";
  const showPlan = !receipt || activeView === "plan";
  const showTrust = Boolean(receipt) && activeView === "trust";

  return (
    <article className="receipt" aria-live="polite">
      <header className="receipt__header">
        <div>
          <h2>Recommendation Receipt</h2>
          <p>{receipt ? "Validated local result" : "Live preview — updates as you answer"}</p>
        </div>
        <span>Step {step + 1} of 5</span>
      </header>

      {receipt ? <ReceiptActions key={receipt.receiptId} receipt={receipt} capabilityTrace={capabilityTrace} verification={verification} /> : null}

      {receipt ? (
        <nav className="receipt-view-nav" aria-label="Receipt sections">
          {receiptViews.map((view) => (
            <button key={view.id} type="button" aria-current={activeView === view.id ? "page" : undefined} onClick={() => setActiveView(view.id)}>
              <b>{view.label}</b>
              <span>{view.description}</span>
            </button>
          ))}
        </nav>
      ) : null}

      {showDecision ? (
        <section className="receipt-panel receipt-panel--decision" aria-labelledby={receipt ? "receipt-decision-heading" : undefined}>
          {receipt ? <h3 className="visually-hidden" id="receipt-decision-heading">Decision</h3> : null}
          <dl className="receipt__fields">
            <div className="receipt__row receipt__row--lead">
              <dt>Recommendation</dt>
              <dd><strong>{recommendationLabels[recommendation]}</strong><small>{receipt?.summary ?? "Complete the assessment to produce a strict Eve receipt."}</small></dd>
            </div>
            <div className="receipt__row"><dt>Why</dt><dd>{receipt?.why ?? "The preview balances consequence, clarity, repeatability, review cost, and context."}</dd></div>
            <div className="receipt__row"><dt>Evidence</dt><dd><ul>{(receipt?.evidence ?? ["Your five bounded answers", "A bounded Eve skill, authored-tool, and loopback MCP evidence path"]).map((item) => <li key={item}>{item}</li>)}</ul></dd></div>
            <div className="receipt__row"><dt>Assumptions</dt><dd><ul>{(receipt?.assumptions ?? ["You remain accountable for the outcome", "No external action is authorized"]).map((item) => <li key={item}>{item}</li>)}</ul></dd></div>
            <div className="receipt__row">
              <dt>Confidence</dt>
              <dd>
                <div className="confidence" aria-label={`${receipt?.confidence.score ?? 60} percent confidence`}>
                  {[1, 2, 3, 4, 5].map((dot) => <span key={dot} className={dot <= Math.ceil((receipt?.confidence.score ?? 60) / 20) ? "is-filled" : ""} />)}
                  <b>{receipt ? `${receipt.confidence.label} (${receipt.confidence.score}%)` : "Preview"}</b>
                </div>
                <small>{receipt?.confidence.uncertainty}</small>
              </dd>
            </div>
            <div className="receipt__row">
              <dt>Autonomy boundary</dt>
              <dd><p><b>Allowed:</b> {receipt?.autonomyBoundary.allowed.join(" ") ?? "Suggest, draft, and prepare options."}</p><p><b>Prohibited:</b> {receipt?.autonomyBoundary.prohibited.join(" ") ?? "Do not decide, publish, purchase, or contact anyone."}</p></dd>
            </div>
          </dl>
          {receipt && verification ? (
            <button className="receipt-trust-link" type="button" onClick={() => setActiveView("trust")}>
              <span><b>Verified locally</b><small>{verification.gates.length} deterministic gates passed; {verification.sessionAttemptsUsed} of {verification.sessionAttemptBudget} Eve sessions used.</small></span>
              <span>View trust evidence →</span>
            </button>
          ) : null}
        </section>
      ) : null}

      {showPlan ? (
        <section className="receipt-panel receipt-panel--plan starter-pack" aria-labelledby="starter-pack-heading">
          <div className="section-title">
            <div><h3 id="starter-pack-heading">Work Starter Pack</h3><p>Use this as the bounded handoff, then edit it locally if needed.</p></div>
            {receipt && onStarterPackSave ? <button className="text-button" type="button" onClick={() => setEditing((value) => !value)}>{editing ? "Cancel edit" : "Edit locally"}</button> : <span>Editable after validation</span>}
          </div>
          {receipt?.starterPack.length ? (editing ? (
            <div className="starter-editor">
              {starterPack.map((item, index) => (
                <div key={item.id}>
                  <label>Label<input value={item.label} maxLength={80} onChange={(event) => setStarterPack((items) => items.map((entry, itemIndex) => itemIndex === index ? { ...entry, label: event.target.value } : entry))} /></label>
                  <label>Instruction<textarea value={item.content} maxLength={800} onChange={(event) => setStarterPack((items) => items.map((entry, itemIndex) => itemIndex === index ? { ...entry, content: event.target.value } : entry))} /></label>
                </div>
              ))}
              <button className="button button--primary" type="button" onClick={async () => { await onStarterPackSave?.({ ...receipt, starterPack }); setEditing(false); }}>Save starter pack</button>
            </div>
          ) : <ol>{receipt.starterPack.map((item) => <li key={item.id}><b>{item.label}:</b> {item.content}</li>)}</ol>) : <p>Generated only for an actionable validated recommendation.</p>}

          {receipt?.appliedRules.length ? (
            <section className="rule-provenance"><h3>Approved lessons applied</h3>{receipt.appliedRules.map((rule) => <p key={`${rule.ruleId}-${rule.version}`}><b>{rule.ruleId} v{rule.version}</b> — {rule.explanation} Source: {rule.sourceOutcomeId}.</p>)}</section>
          ) : null}
        </section>
      ) : null}

      {showTrust ? (
        <section className="receipt-panel receipt-panel--trust" aria-labelledby="receipt-trust-heading">
          <div className="trust-intro"><h3 id="receipt-trust-heading">Trust evidence</h3><p>Model confidence is a judgement. The checks below are deterministic evidence from this local run.</p></div>

          {verification ? (
            <section className="verification-evidence" aria-labelledby="verification-evidence-heading">
              <div className="section-title"><h3 id="verification-evidence-heading">Verification</h3><span>{verification.gates.length} gates passed</span></div>
              <div className="verification-summary">
                <div><b>{verification.sessionAttemptsUsed} of {verification.sessionAttemptBudget}</b><span>Eve sessions used</span></div>
                <div><b>{verification.gates.length} of {verification.gates.length}</b><span>Deterministic gates</span></div>
              </div>
              <details className="verification-details">
                <summary>Inspect gates and replay fingerprints</summary>
                <ol>{verification.gates.map((gate) => <li key={gate.id}><b>{gate.id}</b><span>{gate.evidence}</span></li>)}</ol>
                <dl className="verification-hashes">
                  <div><dt>Assessment input</dt><dd><code title={verification.assessmentInputHash}>{shortDigest(verification.assessmentInputHash)}</code></dd></div>
                  <div><dt>Capability trace</dt><dd><code title={verification.capabilityTraceHash}>{shortDigest(verification.capabilityTraceHash)}</code></dd></div>
                  <div><dt>Original receipt event</dt><dd><code title={verification.recordedReceiptHash}>{shortDigest(verification.recordedReceiptHash)}</code></dd></div>
                </dl>
                <p className="hash-note">Complete 64-character fingerprints remain available in the local export.</p>
              </details>
            </section>
          ) : <p>This legacy receipt has no replay verification record.</p>}

          <section className="capability-provenance" aria-labelledby="capability-provenance-heading">
            <div className="section-title"><h3 id="capability-provenance-heading">Capability provenance</h3><span>{capabilityTrace ? "Observed from Eve events" : "Legacy receipt"}</span></div>
            {capabilityTrace ? (
              <ol>
                {capabilityTrace.steps.map((capability) => (
                  <li key={capability.kind}>
                    <details>
                      <summary><span className="capability-name"><b>{capability.name}</b><small>{capability.eveCapability}</small></span><span className="capability-result">{capability.outputSummary}</span></summary>
                      <dl>
                        <div><dt>Boundary</dt><dd>{capability.executionBoundary}</dd></div>
                        <div><dt>Data crossed</dt><dd>{"answers" in capability ? capability.inputFields.map((field) => `${field}=${capability.answers[field]}`).join(", ") : capability.inputFields.join(", ")}</dd></div>
                        {capability.kind === "connection-discovery" ? <div><dt>Discovered</dt><dd>{capability.discoveredTools.join(", ")}</dd></div> : null}
                        {capability.kind === "authored-tool" ? <div><dt>Result</dt><dd>{capability.suggestedPosture}; read-only</dd></div> : null}
                        {capability.kind === "mcp-tool" ? <><div><dt>Matched rules</dt><dd>{capability.matchedRuleIds.join(", ") || "None"}</dd></div><div><dt>Privacy</dt><dd>Raw outcome notes crossed: no. Historical outcomes retrieved: no.</dd></div></> : null}
                      </dl>
                    </details>
                  </li>
                ))}
              </ol>
            ) : <p>This receipt predates capability tracing; no execution claim is inferred.</p>}
          </section>
        </section>
      ) : null}

      <footer className="receipt__note">{privacyDisclosure ?? "Reading the runtime privacy boundary…"} Eve exposes one load-on-demand instruction skill, one local read-only authored tool, one allowlisted loopback MCP read, and the final-output channel.</footer>
    </article>
  );
}
