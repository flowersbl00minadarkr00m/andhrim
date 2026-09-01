"use client";

import { useEffect, useState } from "react";
import type { RecommendationReceipt } from "@/src/domain/recommendation";
import type { CapabilityTrace } from "@/src/domain/capabilities";

const recommendationLabels: Record<RecommendationReceipt["recommendation"], string> = {
  "human-led": "Human-led",
  "ai-assisted": "AI-assisted",
  "agent-delegated": "Agent-delegated",
  automated: "Automated",
  "more-information-required": "More information required",
};

type Props = {
  receipt?: RecommendationReceipt;
  capabilityTrace?: CapabilityTrace;
  previewRecommendation: RecommendationReceipt["recommendation"];
  step: number;
  privacyDisclosure?: string;
  onStarterPackSave?: (receipt: RecommendationReceipt) => Promise<void>;
};

export function Receipt({ receipt, capabilityTrace, previewRecommendation, step, privacyDisclosure, onStarterPackSave }: Props) {
  const recommendation = receipt?.recommendation ?? previewRecommendation;
  const [editing, setEditing] = useState(false);
  const [starterPack, setStarterPack] = useState(receipt?.starterPack ?? []);
  useEffect(() => { setStarterPack(receipt?.starterPack ?? []); setEditing(false); }, [receipt]);
  return (
    <article className="receipt" aria-live="polite">
      <header className="receipt__header">
        <div>
          <h2>Recommendation Receipt</h2>
          <p>{receipt ? "Validated local result" : "Live preview — updates as you answer"}</p>
        </div>
        <span>Step {step + 1} of 5</span>
      </header>

      <dl className="receipt__fields">
        <div className="receipt__row receipt__row--lead">
          <dt>Recommendation</dt>
          <dd>
            <strong>{recommendationLabels[recommendation]}</strong>
            <small>{receipt?.summary ?? "Complete the assessment to produce a strict Eve receipt."}</small>
          </dd>
        </div>
        <div className="receipt__row">
          <dt>Why</dt>
          <dd>{receipt?.why ?? "The preview balances consequence, clarity, repeatability, review cost, and context."}</dd>
        </div>
        <div className="receipt__row">
          <dt>Evidence</dt>
          <dd>
            <ul>{(receipt?.evidence ?? ["Your five bounded answers", "A bounded Eve skill, authored-tool, and loopback MCP evidence path"]).map((item) => <li key={item}>{item}</li>)}</ul>
          </dd>
        </div>
        <div className="receipt__row">
          <dt>Assumptions</dt>
          <dd>
            <ul>{(receipt?.assumptions ?? ["You remain accountable for the outcome", "No external action is authorized"]).map((item) => <li key={item}>{item}</li>)}</ul>
          </dd>
        </div>
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
          <dd>
            <p>{receipt?.autonomyBoundary.allowed.join(" ") ?? "Suggest, draft, and prepare options."}</p>
            <p>{receipt?.autonomyBoundary.prohibited.join(" ") ?? "Do not decide, publish, purchase, or contact anyone."}</p>
          </dd>
        </div>
      </dl>

      <section className="starter-pack">
        <div className="section-title"><h3>Work Starter Pack</h3>{receipt && onStarterPackSave ? <button className="text-button" type="button" onClick={() => setEditing((value) => !value)}>{editing ? "Cancel edit" : "Edit locally"}</button> : <span>Editable after validation</span>}</div>
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
        ) : (
          <ol>{receipt.starterPack.map((item) => <li key={item.id}><b>{item.label}:</b> {item.content}</li>)}</ol>
        )) : <p>Generated only for an actionable validated recommendation.</p>}
      </section>

      {receipt?.appliedRules.length ? (
        <section className="rule-provenance">
          <h3>Approved lessons applied</h3>
          {receipt.appliedRules.map((rule) => (
            <p key={`${rule.ruleId}-${rule.version}`}><b>{rule.ruleId} v{rule.version}</b> — {rule.explanation} Source: {rule.sourceOutcomeId}.</p>
          ))}
        </section>
      ) : null}

      {receipt ? (
        <section className="capability-provenance" aria-labelledby="capability-provenance-heading">
          <div className="section-title">
            <h3 id="capability-provenance-heading">Capability provenance</h3>
            <span>{capabilityTrace ? "Observed from Eve events" : "Legacy receipt"}</span>
          </div>
          {capabilityTrace ? (
            <ol>
              {capabilityTrace.steps.map((capability) => (
                <li key={capability.kind}>
                  <p><b>{capability.name}</b> <span>{capability.eveCapability}</span></p>
                  <p>{capability.outputSummary}</p>
                  <dl>
                    <div><dt>Boundary</dt><dd>{capability.executionBoundary}</dd></div>
                    <div><dt>Data crossed</dt><dd>{"answers" in capability
                      ? capability.inputFields.map((field) => `${field}=${capability.answers[field]}`).join(", ")
                      : capability.inputFields.join(", ")}</dd></div>
                    {capability.kind === "connection-discovery" ? <div><dt>Discovered</dt><dd>{capability.discoveredTools.join(", ")}</dd></div> : null}
                    {capability.kind === "authored-tool" ? <div><dt>Result</dt><dd>{capability.suggestedPosture}; read-only</dd></div> : null}
                    {capability.kind === "mcp-tool" ? <>
                      <div><dt>Matched rules</dt><dd>{capability.matchedRuleIds.join(", ") || "None"}</dd></div>
                      <div><dt>Privacy</dt><dd>Raw outcome notes crossed: no. Historical outcomes retrieved: no.</dd></div>
                    </> : null}
                  </dl>
                </li>
              ))}
            </ol>
          ) : <p>This receipt predates capability tracing; no execution claim is inferred.</p>}
        </section>
      ) : null}

      <footer className="receipt__note">{privacyDisclosure ?? "Reading the runtime privacy boundary…"} Eve exposes one load-on-demand instruction skill, one local read-only authored tool, one allowlisted loopback MCP read, and the final-output channel.</footer>
    </article>
  );
}
