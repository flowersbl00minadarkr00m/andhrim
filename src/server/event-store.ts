import { createHash, randomUUID } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  productEventSchema,
  projectProductEvents,
  type ProductEvent,
  type ProductProjection,
} from "../domain/learning";
import { verifyRecommendationEvents } from "./receipt-verification";
import { validateProductLedgerEvents } from "./ledger-backup";

const MAX_PRE_RESTORE_RECOVERIES = 5;

export class ProductLedgerReadError extends Error {
  readonly code = "PRODUCT_LEDGER_INVALID";

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ProductLedgerReadError";
  }
}

function dataDirectory() {
  const configured = process.env.AGENT_OR_NOT_DATA_DIR;
  if (!configured) return path.join(process.cwd(), "data");
  if (!path.isAbsolute(configured)) throw new Error("AGENT_OR_NOT_DATA_DIR must be absolute.");
  return configured;
}

function atomicWriteText(destination: string, content: string) {
  mkdirSync(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.${process.pid}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, content, { encoding: "utf8", flag: "wx" });
    renameSync(temporary, destination);
  } finally {
    rmSync(temporary, { force: true });
  }
}

export function eventLedgerPath() {
  return path.join(dataDirectory(), "events.ndjson");
}

export function approvedGuidancePath() {
  return path.join(dataDirectory(), "approved-guidance.json");
}

export function readRawProductLedger(): string {
  const ledgerPath = eventLedgerPath();
  return existsSync(ledgerPath) ? readFileSync(ledgerPath, "utf8") : "";
}

function writeApprovedGuidanceProjection(projection: ProductProjection) {
  const directory = dataDirectory();
  mkdirSync(directory, { recursive: true });
  const destination = approvedGuidancePath();
  const rules = Object.values(projection.rules)
    .filter((rule) => rule.active)
    .sort((left, right) => left.ruleId.localeCompare(right.ruleId));
  atomicWriteText(destination, `${JSON.stringify({ schemaVersion: "approved-guidance-projection-v1", rules })}\n`);
}

export function readProductEvents(): ProductEvent[] {
  const ledgerPath = eventLedgerPath();
  if (!existsSync(ledgerPath)) return [];
  const text = readRawProductLedger();
  const events = text.split(/\r?\n/u)
    .filter((line) => line.trim().length > 0)
    .map((line, index) => {
      try {
        return productEventSchema.parse(JSON.parse(line));
      } catch (error) {
        throw new ProductLedgerReadError(`Local event ledger is invalid at line ${index + 1}.`, { cause: error });
      }
    });
  try {
    validateProductLedgerEvents(events);
  } catch (error) {
    throw new ProductLedgerReadError("Local event ledger failed strict validation or receipt verification replay.", { cause: error });
  }
  return events;
}

export function readProductProjection(): ProductProjection {
  let projection;
  try {
    projection = projectProductEvents(readProductEvents());
  } catch (error) {
    if (error instanceof ProductLedgerReadError) throw error;
    throw new ProductLedgerReadError("Local event ledger could not be projected safely.", { cause: error });
  }
  writeApprovedGuidanceProjection(projection);
  return projection;
}

export function appendProductEvent(value: unknown): ProductProjection {
  return appendProductEvents([value]);
}

export function appendProductEvents(values: readonly unknown[]): ProductProjection {
  const events = values.map((value) => productEventSchema.parse(value));
  const existing = readProductEvents();
  const ids = new Set(existing.map((event) => event.eventId));
  for (const event of events) {
    if (ids.has(event.eventId)) throw new Error("Duplicate event id.");
    ids.add(event.eventId);
  }
  const next = [...existing, ...events];
  projectProductEvents(next);
  verifyRecommendationEvents(next);
  const directory = dataDirectory();
  mkdirSync(directory, { recursive: true });
  appendFileSync(eventLedgerPath(), events.map((event) => JSON.stringify(event)).join("\n") + "\n", { encoding: "utf8", flag: "a" });
  const projection = projectProductEvents(next);
  writeApprovedGuidanceProjection(projection);
  return projection;
}

export type PreRestoreRecovery = {
  identifier: string;
  storageReference: string;
  downloadUrl: string;
  sha256: string;
  byteLength: number;
};

function assertPreRestoreIdentifier(identifier: string) {
  if (!/^pre-restore-[a-f0-9-]{36}$/u.test(identifier)) throw new Error("Invalid pre-restore recovery identifier.");
}

function preRestoreRecoveryPath(identifier: string) {
  assertPreRestoreIdentifier(identifier);
  return path.join(dataDirectory(), "pre-restore", `${identifier}.ndjson`);
}

function prunePreRestoreRecoveries(directory: string, retainedIdentifier: string) {
  const retainedFilename = `${retainedIdentifier}.ndjson`;
  const prior = readdirSync(directory)
    .filter((filename) => /^pre-restore-[a-f0-9-]{36}\.ndjson$/u.test(filename) && filename !== retainedFilename)
    .map((filename) => ({ filename, mtimeMs: statSync(path.join(directory, filename)).mtimeMs }))
    .sort((left, right) => right.mtimeMs - left.mtimeMs || right.filename.localeCompare(left.filename));
  for (const stale of prior.slice(MAX_PRE_RESTORE_RECOVERIES - 1)) {
    rmSync(path.join(directory, stale.filename), { force: true });
  }
}

export function createPreRestoreRecovery(): PreRestoreRecovery {
  const ledger = readRawProductLedger();
  const identifier = `pre-restore-${randomUUID()}`;
  const destination = preRestoreRecoveryPath(identifier);
  atomicWriteText(destination, ledger);
  prunePreRestoreRecoveries(path.dirname(destination), identifier);
  return {
    identifier,
    storageReference: `pre-restore/${identifier}.ndjson`,
    downloadUrl: `/api/data/pre-restore?id=${encodeURIComponent(identifier)}`,
    sha256: createHash("sha256").update(ledger, "utf8").digest("hex"),
    byteLength: Buffer.byteLength(ledger, "utf8"),
  };
}

export function readPreRestoreRecovery(identifier: string): string {
  const recoveryPath = preRestoreRecoveryPath(identifier);
  if (!existsSync(recoveryPath)) throw new Error("The pre-restore recovery backup was not found.");
  return readFileSync(recoveryPath, "utf8");
}

export function restoreProductEventsAtomically(values: readonly unknown[]): {
  projection: ProductProjection;
  recovery: PreRestoreRecovery;
} {
  const validated = validateProductLedgerEvents(values);
  const content = validated.events.length > 0
    ? `${validated.events.map((event) => JSON.stringify(event)).join("\n")}\n`
    : "";
  const recovery = createPreRestoreRecovery();
  atomicWriteText(eventLedgerPath(), content);
  writeApprovedGuidanceProjection(validated.projection);
  return { projection: validated.projection, recovery };
}
