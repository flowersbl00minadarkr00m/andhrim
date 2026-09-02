import { describe, expect, it } from "vitest";
import { fixtureReceipt } from "../../agent/lib/fixture-receipt";
import { capabilityTraceSchema, type CapabilityTrace } from "./capabilities";
import type { RecommendationReceipt } from "./recommendation";
import { receiptVerificationSchema, type ReceiptVerification } from "./verification";
import {
  createPortableReceiptPayload,
  createReceiptPrintDocument,
  formatReceiptDecisionBrief,
  receiptDownloadFilename,
  serializePortableReceipt,
} from "./receipt-portability";

const digest = "a".repeat(64);

const verification = receiptVerificationSchema.parse({
  schemaVersion: "receipt-verification-v1",
  hashAlgorithm: "sha256-canonical-json-v1",
  assessmentInputHash: digest,
  capabilityTraceHash: digest,
  recordedReceiptHash: digest,
  sessionAttemptsUsed: 1,
  sessionAttemptBudget: 2,
  gates: [
    { id: "strict-receipt-schema", state: "passed", evidence: "Strict schema accepted the receipt." },
    { id: "exact-capability-sequence", state: "passed", evidence: "The bounded sequence matched." },
    { id: "read-only-evidence-path", state: "passed", evidence: "The evidence path remained read-only." },
    { id: "outcome-data-isolation", state: "passed", evidence: "Outcome data stayed isolated." },
    { id: "bounded-session-retry", state: "passed", evidence: "The retry budget was respected." },
  ],
});

const capabilityTrace = capabilityTraceSchema.parse({
  schemaVersion: "harness-capability-trace-v1",
  steps: [
    { kind: "skill", name: "delegation-guidance", eveCapability: "load_skill", executionBoundary: "Eve instruction context", inputFields: ["skill"], outputSummary: "Instructions loaded on demand; no code or tool executed." },
    { kind: "connection-discovery", name: "connection_search", eveCapability: "connection_search", executionBoundary: "Eve connection registry", inputFields: ["connection", "keywords", "limit"], discoveredTools: ["governed-memory__lookup_approved_guidance"], outputSummary: "One allowlisted MCP tool definition discovered; no memory data read." },
    { kind: "authored-tool", name: "derive_delegation_evidence", eveCapability: "defineTool", executionBoundary: "local Eve application runtime", inputFields: ["outcomeStakes", "repeatability", "specificationClarity", "verificationCost", "contextSensitivity"], answers: { outcomeStakes: 3, repeatability: 4, specificationClarity: 4, verificationCost: 2, contextSensitivity: 3 }, suggestedPosture: "ai-assisted", readOnly: true, outputSummary: "Deterministic delegation signals and guardrails returned." },
    { kind: "mcp-tool", name: "governed-memory__lookup_approved_guidance", eveCapability: "defineMcpClientConnection + Pydantic MCPServer", executionBoundary: "127.0.0.1 Streamable HTTP", inputFields: ["outcomeStakes", "repeatability", "specificationClarity", "verificationCost", "contextSensitivity"], answers: { outcomeStakes: 3, repeatability: 4, specificationClarity: 4, verificationCost: 2, contextSensitivity: 3 }, matchedRuleIds: [], sourceOutcomeIds: [], readOnly: true, historicalOutcomesRetrieved: false, rawOutcomeNotesCrossed: false, outputSummary: "Only matching approved-rule provenance returned; raw outcomes stayed behind the MCP boundary." },
  ],
});

describe("receipt portability", () => {
  it("whitelists one receipt and safe verification/provenance fields", () => {
    const receipt = {
      ...fixtureReceipt,
      credentials: "do-not-export-credential",
      prompt: "do-not-export-prompt",
      sessionNonce: "do-not-export-nonce",
      rawPrivateNotes: "do-not-export-private-note",
      ledgerLearning: { outcome: "do-not-export-ledger-outcome" },
    } as RecommendationReceipt & Record<string, unknown>;
    const taintedVerification = {
      ...verification,
      providerBody: "do-not-export-provider-body",
    } as ReceiptVerification & Record<string, unknown>;
    const taintedTrace = {
      ...capabilityTrace,
      steps: capabilityTrace.steps.map((step) => ({
        ...step,
        rawPrivateNotes: "do-not-export-trace-note",
      })),
    } as unknown as CapabilityTrace;

    const payload = createPortableReceiptPayload({
      receipt,
      verification: taintedVerification,
      capabilityTrace: taintedTrace,
    });
    const serialized = serializePortableReceipt({
      receipt,
      verification: taintedVerification,
      capabilityTrace: taintedTrace,
    });

    expect(payload.schemaVersion).toBe("andhrim-portable-receipt-v1");
    expect(Object.keys(payload)).toEqual(["schemaVersion", "receipt", "verification", "provenance"]);
    expect(payload.receipt).toEqual(fixtureReceipt);
    expect(payload).not.toHaveProperty("assessment");
    expect(payload).not.toHaveProperty("outcomes");
    expect(payload).not.toHaveProperty("learning");
    expect(payload.provenance?.steps[2]).not.toHaveProperty("answers");
    expect(payload.provenance?.steps[3]).not.toHaveProperty("answers");
    expect(JSON.parse(serialized)).toEqual(payload);
    expect(serialized.endsWith("\n")).toBe(true);
    for (const prohibitedMarker of [
      "do-not-export-credential",
      "do-not-export-provider-body",
      "do-not-export-prompt",
      "do-not-export-nonce",
      "do-not-export-private-note",
      "do-not-export-ledger-outcome",
      "do-not-export-trace-note",
    ]) {
      expect(serialized).not.toContain(prohibitedMarker);
    }
  });

  it("formats a concise, document-ready decision brief", () => {
    const brief = formatReceiptDecisionBrief(fixtureReceipt);

    expect(brief).toContain("Recommendation: AI-assisted");
    expect(brief).toContain(fixtureReceipt.summary);
    expect(brief).toContain("Confidence: Medium-high (72%)");
    expect(brief).toContain("Allowed: Draft, compare, and prepare options.");
    expect(brief).toContain("Prohibited: Do not decide, publish, purchase, or contact anyone.");
    expect(brief).toContain(`Receipt: ${fixtureReceipt.receiptId}`);
    expect(brief).not.toContain("starter-1");
  });

  it("builds a responsive, semantic print document and escapes receipt text", () => {
    const receipt = {
      ...fixtureReceipt,
      summary: "Use <script>alert('unsafe')</script> only as text.",
    } satisfies RecommendationReceipt;
    const document = createReceiptPrintDocument({ receipt, verification, capabilityTrace });

    expect(document).toContain('<meta name="viewport" content="width=device-width, initial-scale=1">');
    expect(document).toContain('<main aria-labelledby="receipt-title">');
    expect(document).toContain('id="print-receipt"');
    expect(document).toContain("@media print");
    expect(document).toContain("Work plan");
    expect(document).toContain("Verification");
    expect(document).toContain("Capability provenance");
    expect(document).toContain("&lt;script&gt;alert(&#39;unsafe&#39;)&lt;/script&gt;");
    expect(document).not.toContain("<script>alert('unsafe')</script>");
  });

  it("derives a receipt-scoped JSON filename", () => {
    expect(receiptDownloadFilename(fixtureReceipt)).toBe("andhrim-receipt-provider-free-seam.json");
  });
});
