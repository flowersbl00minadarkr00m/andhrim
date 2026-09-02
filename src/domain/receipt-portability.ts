import type { CapabilityTrace } from "./capabilities";
import type { RecommendationReceipt } from "./recommendation";
import type { ReceiptVerification } from "./verification";

const recommendationLabels: Record<RecommendationReceipt["recommendation"], string> = {
  "human-led": "Human-led",
  "ai-assisted": "AI-assisted",
  "agent-delegated": "Agent-delegated",
  automated: "Automated",
  "more-information-required": "More information required",
};

type ReceiptPortabilityInput = {
  receipt: RecommendationReceipt;
  verification?: ReceiptVerification;
  capabilityTrace?: CapabilityTrace;
};

type PortableCapabilityStep = {
  kind: CapabilityTrace["steps"][number]["kind"];
  name: string;
  eveCapability: string;
  executionBoundary: string;
  inputFields: string[];
  outputSummary: string;
  discoveredTools?: string[];
  suggestedPosture?: string;
  readOnly?: true;
  matchedRuleIds?: string[];
  sourceOutcomeIds?: string[];
  historicalOutcomesRetrieved?: false;
  rawOutcomeNotesCrossed?: false;
};

export type PortableReceiptPayload = {
  schemaVersion: "andhrim-portable-receipt-v1";
  receipt: RecommendationReceipt;
  verification?: ReceiptVerification;
  provenance?: {
    schemaVersion: CapabilityTrace["schemaVersion"];
    steps: PortableCapabilityStep[];
  };
};

function copyReceipt(receipt: RecommendationReceipt): RecommendationReceipt {
  return {
    schemaVersion: receipt.schemaVersion,
    receiptId: receipt.receiptId,
    assessmentId: receipt.assessmentId,
    recommendation: receipt.recommendation,
    summary: receipt.summary,
    why: receipt.why,
    evidence: [...receipt.evidence],
    assumptions: [...receipt.assumptions],
    confidence: { ...receipt.confidence },
    autonomyBoundary: {
      allowed: [...receipt.autonomyBoundary.allowed],
      prohibited: [...receipt.autonomyBoundary.prohibited],
    },
    starterPack: receipt.starterPack.map((item) => ({ ...item })),
    appliedRules: receipt.appliedRules.map((rule) => ({ ...rule })),
    runtime: { ...receipt.runtime },
  };
}

function copyVerification(verification: ReceiptVerification): ReceiptVerification {
  return {
    schemaVersion: verification.schemaVersion,
    hashAlgorithm: verification.hashAlgorithm,
    assessmentInputHash: verification.assessmentInputHash,
    capabilityTraceHash: verification.capabilityTraceHash,
    recordedReceiptHash: verification.recordedReceiptHash,
    sessionAttemptsUsed: verification.sessionAttemptsUsed,
    sessionAttemptBudget: verification.sessionAttemptBudget,
    gates: verification.gates.map((gate) => ({ ...gate })) as ReceiptVerification["gates"],
  };
}

function portableCapabilityStep(step: CapabilityTrace["steps"][number]): PortableCapabilityStep {
  const common = {
    kind: step.kind,
    name: step.name,
    eveCapability: step.eveCapability,
    executionBoundary: step.executionBoundary,
    inputFields: [...step.inputFields],
    outputSummary: step.outputSummary,
  };

  switch (step.kind) {
    case "skill":
      return common;
    case "connection-discovery":
      return { ...common, discoveredTools: [...step.discoveredTools] };
    case "authored-tool":
      return { ...common, suggestedPosture: step.suggestedPosture, readOnly: step.readOnly };
    case "mcp-tool":
      return {
        ...common,
        matchedRuleIds: [...step.matchedRuleIds],
        sourceOutcomeIds: [...step.sourceOutcomeIds],
        readOnly: step.readOnly,
        historicalOutcomesRetrieved: step.historicalOutcomesRetrieved,
        rawOutcomeNotesCrossed: step.rawOutcomeNotesCrossed,
      };
  }
}

export function createPortableReceiptPayload({
  receipt,
  verification,
  capabilityTrace,
}: ReceiptPortabilityInput): PortableReceiptPayload {
  return {
    schemaVersion: "andhrim-portable-receipt-v1",
    receipt: copyReceipt(receipt),
    ...(verification ? { verification: copyVerification(verification) } : {}),
    ...(capabilityTrace ? {
      provenance: {
        schemaVersion: capabilityTrace.schemaVersion,
        steps: capabilityTrace.steps.map(portableCapabilityStep),
      },
    } : {}),
  };
}

export function serializePortableReceipt(input: ReceiptPortabilityInput): string {
  return `${JSON.stringify(createPortableReceiptPayload(input), null, 2)}\n`;
}

export function receiptDownloadFilename(receipt: RecommendationReceipt): string {
  return `andhrim-${receipt.receiptId}.json`;
}

export function formatReceiptDecisionBrief(receipt: RecommendationReceipt): string {
  return [
    "Andhrím Recommendation Receipt",
    `Recommendation: ${recommendationLabels[receipt.recommendation]}`,
    `Summary: ${receipt.summary}`,
    `Why: ${receipt.why}`,
    `Confidence: ${receipt.confidence.label[0].toUpperCase()}${receipt.confidence.label.slice(1)} (${receipt.confidence.score}%)`,
    `Allowed: ${receipt.autonomyBoundary.allowed.join(" ")}`,
    `Prohibited: ${receipt.autonomyBoundary.prohibited.join(" ")}`,
    `Receipt: ${receipt.receiptId}`,
  ].join("\n");
}

const htmlCharacters: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escapeHtml(value: string | number | boolean): string {
  return String(value).replace(/[&<>"']/gu, (character) => htmlCharacters[character]);
}

function htmlList(items: readonly string[]): string {
  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function htmlDefinition(term: string, description: string | number | boolean): string {
  return `<div><dt>${escapeHtml(term)}</dt><dd>${escapeHtml(description)}</dd></div>`;
}

export function createReceiptPrintDocument(input: ReceiptPortabilityInput): string {
  const payload = createPortableReceiptPayload(input);
  const { receipt, verification, provenance } = payload;
  const workPlan = receipt.starterPack.length > 0
    ? `<ol>${receipt.starterPack.map((item) => `<li><b>${escapeHtml(item.label)}:</b> ${escapeHtml(item.content)}</li>`).join("")}</ol>`
    : "<p>No work starter pack was generated for this receipt.</p>";
  const appliedRules = receipt.appliedRules.length > 0
    ? `<ul>${receipt.appliedRules.map((rule) => `<li><b>${escapeHtml(`${rule.ruleId} v${rule.version}`)}</b> — ${escapeHtml(rule.explanation)} Source: ${escapeHtml(rule.sourceOutcomeId)}.</li>`).join("")}</ul>`
    : "<p>No owner-approved learning rules were applied.</p>";
  const verificationSection = verification ? `
    <section aria-labelledby="verification-heading">
      <h2 id="verification-heading">Verification</h2>
      <p>${escapeHtml(verification.gates.length)} deterministic gates passed; ${escapeHtml(verification.sessionAttemptsUsed)} of ${escapeHtml(verification.sessionAttemptBudget)} Eve sessions used.</p>
      <ol>${verification.gates.map((gate) => `<li><b>${escapeHtml(gate.id)}</b> — ${escapeHtml(gate.evidence)}</li>`).join("")}</ol>
      <dl class="technical">
        ${htmlDefinition("Hash algorithm", verification.hashAlgorithm)}
        ${htmlDefinition("Assessment input", verification.assessmentInputHash)}
        ${htmlDefinition("Capability trace", verification.capabilityTraceHash)}
        ${htmlDefinition("Original receipt event", verification.recordedReceiptHash)}
      </dl>
    </section>` : `
    <section aria-labelledby="verification-heading">
      <h2 id="verification-heading">Verification</h2>
      <p>This legacy receipt has no replay verification record.</p>
    </section>`;
  const provenanceSection = provenance ? `
    <section aria-labelledby="provenance-heading">
      <h2 id="provenance-heading">Capability provenance</h2>
      <ol class="provenance">${provenance.steps.map((step) => `
        <li>
          <h3>${escapeHtml(step.name)}</h3>
          <p>${escapeHtml(step.outputSummary)}</p>
          <dl>
            ${htmlDefinition("Eve capability", step.eveCapability)}
            ${htmlDefinition("Boundary", step.executionBoundary)}
            ${htmlDefinition("Input fields", step.inputFields.join(", "))}
            ${step.discoveredTools ? htmlDefinition("Discovered", step.discoveredTools.join(", ")) : ""}
            ${step.suggestedPosture ? htmlDefinition("Suggested posture", step.suggestedPosture) : ""}
            ${step.matchedRuleIds ? htmlDefinition("Matched rules", step.matchedRuleIds.join(", ") || "None") : ""}
            ${step.sourceOutcomeIds ? htmlDefinition("Source outcomes", step.sourceOutcomeIds.join(", ") || "None") : ""}
            ${step.readOnly !== undefined ? htmlDefinition("Read-only", step.readOnly) : ""}
            ${step.rawOutcomeNotesCrossed !== undefined ? htmlDefinition("Raw outcome notes crossed", step.rawOutcomeNotesCrossed) : ""}
          </dl>
        </li>`).join("")}</ol>
    </section>` : `
    <section aria-labelledby="provenance-heading">
      <h2 id="provenance-heading">Capability provenance</h2>
      <p>This legacy receipt has no capability trace.</p>
    </section>`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(`Recommendation Receipt — ${receipt.receiptId}`)}</title>
  <style>
    :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #172033; background: #eef2f7; }
    * { box-sizing: border-box; }
    body { margin: 0; font-size: 16px; line-height: 1.55; }
    main { width: min(100% - 2rem, 52rem); margin: 2rem auto; padding: clamp(1.25rem, 4vw, 3rem); background: white; border: 1px solid #cad3df; border-radius: .5rem; }
    header { padding-bottom: 1.25rem; border-bottom: 3px solid #2f6cf6; }
    h1 { margin: 0; font-size: clamp(1.9rem, 6vw, 3rem); line-height: 1.05; }
    h2 { margin: 2rem 0 .75rem; padding-bottom: .35rem; border-bottom: 1px solid #cad3df; font-size: 1.2rem; }
    h3 { margin: 0; font-size: 1rem; }
    p, ul, ol, dl { margin-top: .65rem; }
    li + li { margin-top: .4rem; }
    dl { margin-bottom: 0; }
    dl > div { display: grid; grid-template-columns: minmax(9rem, 28%) minmax(0, 1fr); gap: 1rem; padding: .45rem 0; border-top: 1px solid #e4e9f0; }
    dt { font-size: .75rem; font-weight: 750; letter-spacing: .05em; text-transform: uppercase; }
    dd { margin: 0; overflow-wrap: anywhere; }
    .recommendation { color: #2259d6; font-size: 1.35rem; font-weight: 750; }
    .provenance { padding-left: 1.4rem; }
    .provenance > li { break-inside: avoid; padding: .75rem 0; }
    .technical dd { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: .75rem; }
    .print-controls { display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin-bottom: 1rem; }
    .print-controls p { margin: 0; color: #536176; font-size: .85rem; }
    button { min-height: 2.75rem; border: 1px solid #2259d6; border-radius: .35rem; padding: .6rem 1rem; color: white; background: #2259d6; cursor: pointer; font: inherit; font-weight: 700; }
    button:focus-visible { outline: 3px solid #0b57d0; outline-offset: 3px; }
    footer { margin-top: 2rem; padding-top: 1rem; border-top: 1px solid #cad3df; color: #536176; font-size: .8rem; }
    @media (max-width: 40rem) {
      main { width: 100%; min-height: 100vh; margin: 0; border: 0; border-radius: 0; }
      .print-controls { align-items: stretch; flex-direction: column; }
      dl > div { grid-template-columns: 1fr; gap: .15rem; }
    }
    @media print {
      @page { margin: 14mm; }
      :root, body { background: white; }
      body { font-size: 10pt; }
      main { width: 100%; margin: 0; padding: 0; border: 0; }
      .print-controls { display: none; }
      h1 { font-size: 24pt; }
      h2 { break-after: avoid; margin-top: 1.4rem; }
      a { color: inherit; text-decoration: none; }
    }
  </style>
</head>
<body>
  <main aria-labelledby="receipt-title">
    <div class="print-controls">
      <p id="print-help">Print or save this selected receipt from your browser.</p>
      <button id="print-receipt" type="button" aria-describedby="print-help">Print this receipt</button>
    </div>
    <header>
      <p>Andhrím · selected receipt</p>
      <h1 id="receipt-title">Recommendation Receipt</h1>
      <p>${escapeHtml(receipt.receiptId)}</p>
    </header>
    <section aria-labelledby="decision-heading">
      <h2 id="decision-heading">Decision</h2>
      <p class="recommendation">${escapeHtml(recommendationLabels[receipt.recommendation])}</p>
      <p><b>${escapeHtml(receipt.summary)}</b></p>
      <p>${escapeHtml(receipt.why)}</p>
      <dl>
        ${htmlDefinition("Confidence", `${receipt.confidence.label} (${receipt.confidence.score}%)`)}
        ${htmlDefinition("Uncertainty", receipt.confidence.uncertainty)}
        ${htmlDefinition("Provider mode", receipt.runtime.providerMode)}
        ${htmlDefinition("Model", receipt.runtime.modelId)}
      </dl>
      <h3>Evidence</h3>${htmlList(receipt.evidence)}
      <h3>Assumptions</h3>${htmlList(receipt.assumptions)}
      <h3>Autonomy boundary</h3>
      <p><b>Allowed:</b> ${escapeHtml(receipt.autonomyBoundary.allowed.join(" "))}</p>
      <p><b>Prohibited:</b> ${escapeHtml(receipt.autonomyBoundary.prohibited.join(" "))}</p>
    </section>
    <section aria-labelledby="work-plan-heading">
      <h2 id="work-plan-heading">Work plan</h2>
      ${workPlan}
      <h3>Approved lessons applied</h3>
      ${appliedRules}
    </section>
    ${verificationSection}
    ${provenanceSection}
    <footer>This print view contains one selected receipt and its safe verification/provenance fields. It does not include the full local ledger, outcome notes, provider bodies, prompts, credentials, or the session nonce.</footer>
  </main>
</body>
</html>`;
}
