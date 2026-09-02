import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fixtureReceipt } from "../../agent/lib/fixture-receipt";
import { assessmentSchema, type ProductEvent } from "../domain/learning";
import {
  BACKUP_HASH_ALGORITHM,
  BACKUP_SCHEMA_VERSION,
  MAX_BACKUP_BYTES,
  MAX_BACKUP_EVENTS,
  createBackupEnvelope,
  digestBackupContent,
  parseBackupJson,
  serializeBackupEnvelope,
  stageBackupForRestore,
  consumeStagedBackup,
  validateBackupEnvelope,
} from "./ledger-backup";

let scratch: string | undefined;

afterEach(() => {
  vi.unstubAllEnvs();
  if (scratch) fs.rmSync(scratch, { recursive: true, force: true });
  scratch = undefined;
});

function recommendationEvent(suffix = "one"): ProductEvent {
  const assessmentId = `assessment-backup-${suffix}`;
  const receiptId = `receipt-backup-${suffix}`;
  const assessment = assessmentSchema.parse({
    schemaVersion: "assessment-v1",
    assessmentId,
    createdAt: "2026-09-02T16:00:00.000Z",
    title: "Validate local backup behavior",
    desiredOutcome: "A strict owner-controlled backup and restore dry run.",
    constraints: "Local fixture only; no provider or external action.",
    answers: { outcomeStakes: 3, repeatability: 4, specificationClarity: 4, verificationCost: 2, contextSensitivity: 3 },
  });
  return {
    eventId: `event-backup-${suffix}`,
    occurredAt: "2026-09-02T16:01:00.000Z",
    type: "recommendation.recorded",
    assessment,
    receipt: { ...fixtureReceipt, receiptId, assessmentId },
  };
}

function signedEnvelope(events: readonly unknown[], overrides: Record<string, unknown> = {}) {
  const content = {
    ledgerSchemaVersion: "product-event-ledger-v1",
    createdAt: "2026-09-02T16:02:00.000Z",
    application: "andhrim-agent-or-not-local-prototype",
    eventCount: events.length,
    events,
    ...overrides,
  };
  return {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    hashAlgorithm: BACKUP_HASH_ALGORITHM,
    content,
    digest: digestBackupContent(content),
  };
}

describe("validated ledger backup", () => {
  it("creates a versioned envelope whose digest covers canonical event content and safe metadata", () => {
    const envelope = createBackupEnvelope([recommendationEvent()], new Date("2026-09-02T16:02:00.000Z"));
    const report = validateBackupEnvelope(envelope);

    expect(envelope).toMatchObject({
      schemaVersion: "agent-or-not-backup-v1",
      hashAlgorithm: "sha256-canonical-json-v1",
      content: { ledgerSchemaVersion: "product-event-ledger-v1", eventCount: 1 },
    });
    expect(envelope.digest).toBe(digestBackupContent(envelope.content));
    expect(report).toMatchObject({
      supportedSchemaVersion: true,
      integrityStatus: "verified",
      eventCount: 1,
      projectionRebuildable: true,
      canRestore: true,
      projectedEntityCounts: { assessments: 1, receipts: 1 },
    });
    expect(report.recordCountsByEventType["recommendation.recorded"]).toBe(1);
    expect(JSON.stringify(envelope)).not.toMatch(/sessionNonce|authorization|apiKey|providerBody|hiddenPrompt/u);
  });

  it("performs dry-run validation and staging without any ledger filesystem mutation", () => {
    scratch = fs.mkdtempSync(path.join(os.tmpdir(), "agent-or-not-backup-dry-run-"));
    vi.stubEnv("AGENT_OR_NOT_DATA_DIR", scratch);
    const ledgerPath = path.join(scratch, "events.ndjson");
    const original = `${JSON.stringify(recommendationEvent("current"))}\n`;
    fs.writeFileSync(ledgerPath, original, "utf8");
    const before = fs.statSync(ledgerPath);

    const staged = stageBackupForRestore(createBackupEnvelope([recommendationEvent("imported")]));

    expect(staged.report.canRestore).toBe(true);
    expect(staged.validationToken).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    expect(fs.readFileSync(ledgerPath, "utf8")).toBe(original);
    expect(fs.statSync(ledgerPath).mtimeMs).toBe(before.mtimeMs);
    expect(fs.readdirSync(scratch)).toEqual(["events.ndjson"]);
  });

  it("binds confirmation to exact uploads while bounding staged multi-tab validations", () => {
    const staged = ["first", "second", "third", "fourth", "fifth"].map((suffix) => (
      stageBackupForRestore(createBackupEnvelope([recommendationEvent(suffix)]))
    ));

    expect(() => consumeStagedBackup(staged[0].validationToken)).toThrow(/expired|already used/u);
    for (const [index, result] of staged.slice(1).entries()) {
      const consumed = consumeStagedBackup(result.validationToken);
      expect(consumed.digest).toBe(result.report.computedDigest);
      expect(consumed.events.map((event) => event.eventId)).toEqual([`event-backup-${["second", "third", "fourth", "fifth"][index]}`]);
      expect(() => consumeStagedBackup(result.validationToken)).toThrow(/expired|already used/u);
    }
  });

  it("refuses to mint a backup that its own import limits cannot accept", () => {
    expect(() => createBackupEnvelope(Array.from({ length: MAX_BACKUP_EVENTS + 1 }, () => null))).toThrow(/event backup limit/u);
    const envelope = createBackupEnvelope([recommendationEvent()]);
    expect(() => serializeBackupEnvelope({
      ...envelope,
      content: { ...envelope.content, createdAt: "x".repeat(MAX_BACKUP_BYTES) },
    })).toThrow(/serialized backup exceeds/u);
  });

  it("rejects malformed JSON and every unsupported, tampered, unknown, duplicate, conflicting, or semantically invalid ledger", () => {
    expect(() => parseBackupJson("{")) .toThrow(/malformed JSON/u);
    const validEvent = recommendationEvent();
    const valid = createBackupEnvelope([validEvent]);

    expect(validateBackupEnvelope({ ...valid, schemaVersion: "agent-or-not-backup-v2" })).toMatchObject({
      supportedSchemaVersion: false,
      canRestore: false,
    });
    expect(validateBackupEnvelope({ ...valid, unexpected: true }).errors).toContain("The backup envelope has missing, unknown, or invalid fields.");

    const tampered = structuredClone(valid);
    tampered.content.events[0] = recommendationEvent("tampered");
    expect(validateBackupEnvelope(tampered)).toMatchObject({ integrityStatus: "failed", canRestore: false });

    const unknownEvent = { ...validEvent, hiddenPrompt: "must never pass" };
    expect(validateBackupEnvelope(signedEnvelope([unknownEvent]))).toMatchObject({ canRestore: false });

    const duplicate = validateBackupEnvelope(signedEnvelope([validEvent, validEvent]));
    expect(duplicate.duplicateEventIds).toEqual([validEvent.eventId]);
    expect(duplicate.canRestore).toBe(false);

    const conflicting = validateBackupEnvelope(signedEnvelope([
      validEvent,
      { ...validEvent, occurredAt: "2026-09-02T16:03:00.000Z" },
    ]));
    expect(conflicting.conflictingEventIds).toEqual([validEvent.eventId]);
    expect(conflicting.canRestore).toBe(false);

    const mismatchedIdentity = recommendationEvent("mismatch");
    if (mismatchedIdentity.type !== "recommendation.recorded") throw new Error("Fixture event type changed.");
    const semanticallyInvalid = {
      ...mismatchedIdentity,
      receipt: { ...mismatchedIdentity.receipt, assessmentId: "assessment-other" },
    };
    expect(validateBackupEnvelope(signedEnvelope([semanticallyInvalid])).errors).toContain(
      "A recorded recommendation does not match its assessment identity.",
    );

    const projectionFailure = {
      eventId: "event-orphan-outcome",
      occurredAt: "2026-09-02T16:04:00.000Z",
      type: "outcome.recorded",
      outcome: {
        schemaVersion: "outcome-v1",
        outcomeId: "outcome-orphan",
        receiptId: "receipt-missing",
        recordedAt: "2026-09-02T16:04:00.000Z",
        rating: 4,
        correctionNotes: "",
        notes: "Valid shape with an invalid ledger reference.",
      },
    };
    expect(validateBackupEnvelope(signedEnvelope([projectionFailure]))).toMatchObject({
      projectionRebuildable: false,
      canRestore: false,
      errors: ["The imported ledger cannot rebuild a strict ProductProjection."],
    });

    expect(validateBackupEnvelope(signedEnvelope([validEvent], { eventCount: 2 }))).toMatchObject({ canRestore: false });
  });

  it("warns explicitly before an otherwise valid empty-ledger replacement", () => {
    const report = validateBackupEnvelope(createBackupEnvelope([]));
    expect(report.canRestore).toBe(true);
    expect(report.warnings).toEqual([
      "This backup contains an empty ledger; restore will replace the current ledger with no events.",
    ]);
  });
});
