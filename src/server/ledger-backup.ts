import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { canonicalJson } from "../domain/canonical-json";
import {
  productEventSchema,
  projectProductEvents,
  type ProductEvent,
  type ProductProjection,
} from "../domain/learning";
import { verifyRecommendationEvents } from "./receipt-verification";

export const BACKUP_SCHEMA_VERSION = "agent-or-not-backup-v1" as const;
export const LEDGER_SCHEMA_VERSION = "product-event-ledger-v1" as const;
export const BACKUP_HASH_ALGORITHM = "sha256-canonical-json-v1" as const;
export const MAX_BACKUP_BYTES = 5 * 1024 * 1024;
export const MAX_BACKUP_REQUEST_BYTES = MAX_BACKUP_BYTES + 1_024;
export const MAX_BACKUP_EVENTS = 50_000;
const VALIDATION_TOKEN_TTL_MS = 5 * 60 * 1_000;
const MAX_STAGED_BACKUPS = 4;

export class BackupLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BackupLimitError";
  }
}

export const PRODUCT_EVENT_TYPES = [
  "recommendation.recorded",
  "recommendation.edited",
  "outcome.recorded",
  "learning.proposed",
  "learning.edited",
  "learning.approved",
  "learning.rejected",
  "learning.superseded",
  "learning.expired",
  "learning.deleted",
] as const satisfies readonly ProductEvent["type"][];

const backupEnvelopeShapeSchema = z.object({
  schemaVersion: z.string().trim().min(1).max(80),
  hashAlgorithm: z.literal(BACKUP_HASH_ALGORITHM),
  content: z.unknown(),
  digest: z.string().regex(/^[a-f0-9]{64}$/u),
}).strict();

const backupContentShapeSchema = z.object({
  ledgerSchemaVersion: z.string().trim().min(1).max(80),
  createdAt: z.iso.datetime(),
  application: z.literal("andhrim-agent-or-not-local-prototype"),
  eventCount: z.number().int().nonnegative().max(MAX_BACKUP_EVENTS),
  events: z.array(z.unknown()).max(MAX_BACKUP_EVENTS),
}).strict();

export type BackupContent = {
  ledgerSchemaVersion: typeof LEDGER_SCHEMA_VERSION;
  createdAt: string;
  application: "andhrim-agent-or-not-local-prototype";
  eventCount: number;
  events: ProductEvent[];
};

export type BackupEnvelope = {
  schemaVersion: typeof BACKUP_SCHEMA_VERSION;
  hashAlgorithm: typeof BACKUP_HASH_ALGORITHM;
  content: BackupContent;
  digest: string;
};

export type ProjectedEntityCounts = {
  assessments: number;
  receipts: number;
  capabilityTraces: number;
  receiptVerifications: number;
  outcomes: number;
  candidates: number;
  rules: number;
};

export type BackupValidationReport = {
  schemaVersion: string | null;
  supportedSchemaVersion: boolean;
  integrityStatus: "verified" | "failed" | "not-checked";
  hashAlgorithm: string | null;
  expectedDigest: string | null;
  computedDigest: string | null;
  eventCount: number | null;
  recordCountsByEventType: Record<ProductEvent["type"], number>;
  projectedEntityCounts: ProjectedEntityCounts | null;
  duplicateEventIds: string[];
  conflictingEventIds: string[];
  projectionRebuildable: boolean;
  warnings: string[];
  errors: string[];
  canRestore: boolean;
};

type BackupInspection = {
  report: BackupValidationReport;
  events?: ProductEvent[];
  projection?: ProductProjection;
};

type StagedBackup = {
  digest: string;
  events: ProductEvent[];
  expiresAtMs: number;
};

type ValidationStoreGlobal = typeof globalThis & {
  __agentOrNotValidatedBackupStoreV1?: Map<string, StagedBackup>;
};

function validationStore() {
  const shared = globalThis as ValidationStoreGlobal;
  shared.__agentOrNotValidatedBackupStoreV1 ??= new Map<string, StagedBackup>();
  return shared.__agentOrNotValidatedBackupStoreV1;
}

function emptyRecordCounts(): Record<ProductEvent["type"], number> {
  return Object.fromEntries(PRODUCT_EVENT_TYPES.map((type) => [type, 0])) as Record<ProductEvent["type"], number>;
}

function emptyReport(): BackupValidationReport {
  return {
    schemaVersion: null,
    supportedSchemaVersion: false,
    integrityStatus: "not-checked",
    hashAlgorithm: null,
    expectedDigest: null,
    computedDigest: null,
    eventCount: null,
    recordCountsByEventType: emptyRecordCounts(),
    projectedEntityCounts: null,
    duplicateEventIds: [],
    conflictingEventIds: [],
    projectionRebuildable: false,
    warnings: [],
    errors: [],
    canRestore: false,
  };
}

export function digestBackupContent(content: unknown): string {
  return createHash("sha256").update(canonicalJson(content), "utf8").digest("hex");
}

function countProjection(projection: ProductProjection): ProjectedEntityCounts {
  return {
    assessments: Object.keys(projection.assessments).length,
    receipts: Object.keys(projection.receipts).length,
    capabilityTraces: Object.keys(projection.capabilityTraces).length,
    receiptVerifications: Object.keys(projection.receiptVerifications).length,
    outcomes: Object.keys(projection.outcomes).length,
    candidates: Object.keys(projection.candidates).length,
    rules: Object.keys(projection.rules).length,
  };
}

function duplicateAndConflictingIds(values: readonly unknown[]) {
  const firstById = new Map<string, string>();
  const duplicateIds = new Set<string>();
  const conflictingIds = new Set<string>();
  for (const value of values) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const eventId = (value as Record<string, unknown>).eventId;
    if (typeof eventId !== "string") continue;
    let canonical: string;
    try {
      canonical = canonicalJson(value);
    } catch {
      continue;
    }
    const first = firstById.get(eventId);
    if (first === undefined) firstById.set(eventId, canonical);
    else if (first === canonical) duplicateIds.add(eventId);
    else conflictingIds.add(eventId);
  }
  return {
    duplicateEventIds: [...duplicateIds].sort(),
    conflictingEventIds: [...conflictingIds].sort(),
  };
}

function validateEntityCreationSemantics(events: readonly ProductEvent[]) {
  const assessmentIds = new Set<string>();
  const receiptIds = new Set<string>();
  const outcomeIds = new Set<string>();
  const outcomeReceiptIds = new Set<string>();
  const candidateIds = new Set<string>();
  const ruleIds = new Set<string>();
  for (const event of events) {
    switch (event.type) {
      case "recommendation.recorded":
        if (event.receipt.assessmentId !== event.assessment.assessmentId) {
          throw new Error("A recorded recommendation does not match its assessment identity.");
        }
        if (assessmentIds.has(event.assessment.assessmentId) || receiptIds.has(event.receipt.receiptId)) {
          throw new Error("A recommendation attempts to recreate an existing assessment or receipt.");
        }
        assessmentIds.add(event.assessment.assessmentId);
        receiptIds.add(event.receipt.receiptId);
        break;
      case "outcome.recorded":
        if (outcomeIds.has(event.outcome.outcomeId) || outcomeReceiptIds.has(event.outcome.receiptId)) {
          throw new Error("An outcome attempts to recreate an existing outcome or receipt association.");
        }
        outcomeIds.add(event.outcome.outcomeId);
        outcomeReceiptIds.add(event.outcome.receiptId);
        break;
      case "learning.proposed":
        if (candidateIds.has(event.candidate.candidateId)) throw new Error("A candidate is proposed more than once.");
        candidateIds.add(event.candidate.candidateId);
        break;
      case "learning.approved":
        if (ruleIds.has(event.rule.ruleId)) throw new Error("An approved rule is created more than once.");
        ruleIds.add(event.rule.ruleId);
        break;
      default:
        break;
    }
  }
}

export function validateProductLedgerEvents(values: readonly unknown[]): {
  events: ProductEvent[];
  projection: ProductProjection;
} {
  const ids = duplicateAndConflictingIds(values);
  if (ids.duplicateEventIds.length > 0 || ids.conflictingEventIds.length > 0) {
    throw new Error("The ledger contains duplicate or conflicting event IDs.");
  }
  const events = values.map((value) => productEventSchema.parse(value));
  validateEntityCreationSemantics(events);
  const projection = projectProductEvents(events);
  verifyRecommendationEvents(events);
  return { events, projection };
}

function inspectBackupEnvelope(value: unknown): BackupInspection {
  const report = emptyReport();
  const envelopeResult = backupEnvelopeShapeSchema.safeParse(value);
  if (!envelopeResult.success) {
    report.errors.push("The backup envelope has missing, unknown, or invalid fields.");
    return { report };
  }
  const envelope = envelopeResult.data;
  report.schemaVersion = envelope.schemaVersion;
  report.hashAlgorithm = envelope.hashAlgorithm;
  report.expectedDigest = envelope.digest;
  report.supportedSchemaVersion = envelope.schemaVersion === BACKUP_SCHEMA_VERSION;
  if (!report.supportedSchemaVersion) {
    report.errors.push(`Unsupported backup schema version: ${envelope.schemaVersion}.`);
    return { report };
  }

  const contentResult = backupContentShapeSchema.safeParse(envelope.content);
  if (!contentResult.success) {
    report.errors.push("The backup content has missing, unknown, or invalid fields.");
    return { report };
  }
  const content = contentResult.data;
  report.eventCount = content.events.length;
  if (content.ledgerSchemaVersion !== LEDGER_SCHEMA_VERSION) {
    report.errors.push(`Unsupported ledger schema version: ${content.ledgerSchemaVersion}.`);
    return { report };
  }

  report.computedDigest = digestBackupContent(content);
  report.integrityStatus = report.computedDigest === envelope.digest ? "verified" : "failed";
  if (report.integrityStatus !== "verified") {
    report.errors.push("The backup digest does not match its canonical content; the file may be tampered or damaged.");
    return { report };
  }
  if (content.eventCount !== content.events.length) {
    report.errors.push("The declared event count does not match the backup content.");
  }

  const ids = duplicateAndConflictingIds(content.events);
  report.duplicateEventIds = ids.duplicateEventIds;
  report.conflictingEventIds = ids.conflictingEventIds;
  if (ids.duplicateEventIds.length > 0) report.errors.push("Duplicate event IDs were found.");
  if (ids.conflictingEventIds.length > 0) report.errors.push("Conflicting records reuse the same event ID.");

  const parsedEvents: ProductEvent[] = [];
  content.events.forEach((event, index) => {
    const parsed = productEventSchema.safeParse(event);
    if (!parsed.success) report.errors.push(`Event ${index + 1} failed the strict product-event schema.`);
    else {
      parsedEvents.push(parsed.data);
      report.recordCountsByEventType[parsed.data.type] += 1;
    }
  });
  if (report.errors.length > 0) return { report };

  try {
    validateEntityCreationSemantics(parsedEvents);
  } catch (error) {
    report.errors.push(error instanceof Error ? error.message : "The event ledger failed semantic validation.");
    return { report };
  }

  let projection: ProductProjection;
  try {
    projection = projectProductEvents(parsedEvents);
    report.projectedEntityCounts = countProjection(projection);
    report.projectionRebuildable = true;
  } catch {
    report.errors.push("The imported ledger cannot rebuild a strict ProductProjection.");
    return { report };
  }

  try {
    verifyRecommendationEvents(parsedEvents);
  } catch {
    report.errors.push("The imported ledger failed deterministic receipt-verification replay.");
    report.projectionRebuildable = false;
    report.projectedEntityCounts = null;
    return { report };
  }

  if (parsedEvents.length === 0) {
    report.warnings.push("This backup contains an empty ledger; restore will replace the current ledger with no events.");
  }
  report.canRestore = true;
  return { report, events: parsedEvents, projection };
}

export function validateBackupEnvelope(value: unknown): BackupValidationReport {
  return inspectBackupEnvelope(value).report;
}

export function createBackupEnvelope(
  values: readonly unknown[],
  createdAt = new Date(),
): BackupEnvelope {
  if (values.length > MAX_BACKUP_EVENTS) {
    throw new BackupLimitError(`The ledger exceeds the ${MAX_BACKUP_EVENTS}-event backup limit.`);
  }
  const { events } = validateProductLedgerEvents(values);
  const content: BackupContent = {
    ledgerSchemaVersion: LEDGER_SCHEMA_VERSION,
    createdAt: createdAt.toISOString(),
    application: "andhrim-agent-or-not-local-prototype",
    eventCount: events.length,
    events,
  };
  const envelope: BackupEnvelope = {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    hashAlgorithm: BACKUP_HASH_ALGORITHM,
    content,
    digest: digestBackupContent(content),
  };
  serializeBackupEnvelope(envelope);
  return envelope;
}

export function serializeBackupEnvelope(envelope: BackupEnvelope): string {
  const serialized = `${JSON.stringify(envelope, null, 2)}\n`;
  if (Buffer.byteLength(serialized, "utf8") > MAX_BACKUP_BYTES) {
    throw new BackupLimitError(`The serialized backup exceeds the ${MAX_BACKUP_BYTES}-byte upload limit.`);
  }
  return serialized;
}

function removeExpiredTokens(nowMs: number) {
  for (const [token, staged] of validationStore()) {
    if (staged.expiresAtMs <= nowMs) validationStore().delete(token);
  }
}

export function stageBackupForRestore(value: unknown, now = new Date()): {
  report: BackupValidationReport;
  validationToken?: string;
  expiresAt?: string;
} {
  const inspected = inspectBackupEnvelope(value);
  if (!inspected.report.canRestore || !inspected.events || !inspected.report.computedDigest) {
    return { report: inspected.report };
  }
  removeExpiredTokens(now.getTime());
  while (validationStore().size >= MAX_STAGED_BACKUPS) {
    const oldestHandle = validationStore().keys().next().value as string | undefined;
    if (!oldestHandle) break;
    validationStore().delete(oldestHandle);
  }
  const restoreHandle = randomBytes(32).toString("base64url");
  const expiresAtMs = now.getTime() + VALIDATION_TOKEN_TTL_MS;
  validationStore().set(restoreHandle, {
    digest: inspected.report.computedDigest,
    events: structuredClone(inspected.events),
    expiresAtMs,
  });
  return { report: inspected.report, validationToken: restoreHandle, expiresAt: new Date(expiresAtMs).toISOString() };
}

export function consumeStagedBackup(validationToken: unknown, now = new Date()): {
  digest: string;
  events: ProductEvent[];
} {
  if (typeof validationToken !== "string" || !/^[A-Za-z0-9_-]{43}$/u.test(validationToken)) {
    throw new Error("The restore validation token is missing or invalid.");
  }
  removeExpiredTokens(now.getTime());
  const staged = validationStore().get(validationToken);
  if (!staged) throw new Error("The restore validation expired or was already used. Validate the backup again.");
  validationStore().delete(validationToken);
  return { digest: staged.digest, events: structuredClone(staged.events) };
}

export function parseBackupJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error("The selected backup is malformed JSON.");
  }
}
