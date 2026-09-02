import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fixtureReceipt } from "../../agent/lib/fixture-receipt";
import { assessmentSchema, type ProductEvent } from "../domain/learning";
import {
  ProductLedgerReadError,
  eventLedgerPath,
  readProductEvents,
  readRawProductLedger,
  readPreRestoreRecovery,
  restoreProductEventsAtomically,
} from "./event-store";

let scratch: string | undefined;

afterEach(() => {
  vi.unstubAllEnvs();
  if (scratch) fs.rmSync(scratch, { recursive: true, force: true });
  scratch = undefined;
});

function writeInvalidLedger() {
  scratch = fs.mkdtempSync(path.join(os.tmpdir(), "agent-or-not-ledger-recovery-"));
  vi.stubEnv("AGENT_OR_NOT_DATA_DIR", scratch);
  const raw = "{\"schemaVersion\":\"unknown-event\"}\n";
  fs.writeFileSync(eventLedgerPath(), raw, "utf8");
  return raw;
}

function recommendationEvent(suffix: string): ProductEvent {
  const assessmentId = `assessment-restore-${suffix}`;
  return {
    eventId: `event-restore-${suffix}`,
    occurredAt: "2026-09-02T17:00:00.000Z",
    type: "recommendation.recorded",
    assessment: assessmentSchema.parse({
      schemaVersion: "assessment-v1",
      assessmentId,
      createdAt: "2026-09-02T16:59:00.000Z",
      title: "Exercise atomic restore",
      desiredOutcome: "Replace the validated ledger as one complete file.",
      constraints: "Keep the previous bytes as a bounded recovery artifact.",
      answers: { outcomeStakes: 3, repeatability: 3, specificationClarity: 4, verificationCost: 2, contextSensitivity: 3 },
    }),
    receipt: { ...fixtureReceipt, receiptId: `receipt-restore-${suffix}`, assessmentId },
  };
}

describe("ledger-preserving recovery", () => {
  it("fails projection and leaves the raw ledger unchanged for recovery", () => {
    const raw = writeInvalidLedger();

    expect(() => readProductEvents()).toThrow(ProductLedgerReadError);
    expect(readRawProductLedger()).toBe(raw);
  });

  it("does not invent recovery bytes when no ledger exists", () => {
    scratch = fs.mkdtempSync(path.join(os.tmpdir(), "agent-or-not-ledger-empty-"));
    vi.stubEnv("AGENT_OR_NOT_DATA_DIR", scratch);
    expect(readRawProductLedger()).toBe("");
  });
});

describe("atomic complete-ledger restore", () => {
  it("creates an exact pre-restore recovery then replaces the ledger through a temporary sibling", () => {
    scratch = fs.mkdtempSync(path.join(os.tmpdir(), "agent-or-not-ledger-restore-"));
    vi.stubEnv("AGENT_OR_NOT_DATA_DIR", scratch);
    const original = `${JSON.stringify(recommendationEvent("before"))}\n`;
    fs.writeFileSync(eventLedgerPath(), original, "utf8");

    const restoredEvent = recommendationEvent("after");
    const result = restoreProductEventsAtomically([restoredEvent]);

    expect(readRawProductLedger()).toBe(`${JSON.stringify(restoredEvent)}\n`);
    expect(result.projection.receipts["receipt-restore-after"]).toBeDefined();
    expect(result.recovery.identifier).toMatch(/^pre-restore-[a-f0-9-]{36}$/u);
    expect(result.recovery.storageReference).toBe(`pre-restore/${result.recovery.identifier}.ndjson`);
    expect(readPreRestoreRecovery(result.recovery.identifier)).toBe(original);
    expect(result.recovery.byteLength).toBe(Buffer.byteLength(original, "utf8"));
    expect(fs.readdirSync(scratch, { recursive: true }).filter((name) => String(name).endsWith(".tmp"))).toEqual([]);
  });

  it("validates before creating a recovery or changing any ledger byte", () => {
    scratch = fs.mkdtempSync(path.join(os.tmpdir(), "agent-or-not-ledger-restore-invalid-"));
    vi.stubEnv("AGENT_OR_NOT_DATA_DIR", scratch);
    const original = `${JSON.stringify(recommendationEvent("before"))}\n`;
    fs.writeFileSync(eventLedgerPath(), original, "utf8");

    expect(() => restoreProductEventsAtomically([{ type: "unknown" }])).toThrow();
    expect(readRawProductLedger()).toBe(original);
    expect(fs.existsSync(path.join(scratch, "pre-restore"))).toBe(false);
  });

  it("retains only the five newest bounded pre-restore recovery files", () => {
    scratch = fs.mkdtempSync(path.join(os.tmpdir(), "agent-or-not-ledger-restore-retention-"));
    vi.stubEnv("AGENT_OR_NOT_DATA_DIR", scratch);
    fs.writeFileSync(eventLedgerPath(), `${JSON.stringify(recommendationEvent("initial"))}\n`, "utf8");
    let newestIdentifier = "";
    for (let index = 0; index < 7; index += 1) {
      newestIdentifier = restoreProductEventsAtomically([recommendationEvent(`retained-${index}`)]).recovery.identifier;
    }

    const retained = fs.readdirSync(path.join(scratch, "pre-restore"));
    expect(retained).toHaveLength(5);
    expect(retained).toContain(`${newestIdentifier}.ndjson`);
  });
});
