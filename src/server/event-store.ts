import { randomUUID } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  productEventSchema,
  projectProductEvents,
  type ProductEvent,
  type ProductProjection,
} from "../domain/learning";
import { verifyRecommendationEvents } from "./receipt-verification";

function dataDirectory() {
  const configured = process.env.AGENT_OR_NOT_DATA_DIR;
  if (!configured) return path.join(process.cwd(), "data");
  if (!path.isAbsolute(configured)) throw new Error("AGENT_OR_NOT_DATA_DIR must be absolute.");
  return configured;
}

export function eventLedgerPath() {
  return path.join(dataDirectory(), "events.ndjson");
}

export function approvedGuidancePath() {
  return path.join(dataDirectory(), "approved-guidance.json");
}

function writeApprovedGuidanceProjection(projection: ProductProjection) {
  const directory = dataDirectory();
  mkdirSync(directory, { recursive: true });
  const destination = approvedGuidancePath();
  const temporary = `${destination}.${process.pid}.${randomUUID()}.tmp`;
  const rules = Object.values(projection.rules)
    .filter((rule) => rule.active)
    .sort((left, right) => left.ruleId.localeCompare(right.ruleId));
  try {
    writeFileSync(temporary, `${JSON.stringify({ schemaVersion: "approved-guidance-projection-v1", rules })}\n`, {
      encoding: "utf8",
      flag: "wx",
    });
    renameSync(temporary, destination);
  } finally {
    rmSync(temporary, { force: true });
  }
}

export function readProductEvents(): ProductEvent[] {
  const ledgerPath = eventLedgerPath();
  if (!existsSync(ledgerPath)) return [];
  const text = readFileSync(ledgerPath, "utf8");
  const events = text.split(/\r?\n/u)
    .filter((line) => line.trim().length > 0)
    .map((line, index) => {
      try {
        return productEventSchema.parse(JSON.parse(line));
      } catch (error) {
        throw new Error(`Local event ledger is invalid at line ${index + 1}.`, { cause: error });
      }
    });
  verifyRecommendationEvents(events);
  return events;
}

export function readProductProjection(): ProductProjection {
  const projection = projectProductEvents(readProductEvents());
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
