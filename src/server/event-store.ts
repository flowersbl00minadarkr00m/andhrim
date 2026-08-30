import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  productEventSchema,
  projectProductEvents,
  type ProductEvent,
  type ProductProjection,
} from "../domain/learning";

function dataDirectory() {
  const configured = process.env.AGENT_OR_NOT_DATA_DIR;
  if (!configured) return path.join(process.cwd(), "data");
  if (!path.isAbsolute(configured)) throw new Error("AGENT_OR_NOT_DATA_DIR must be absolute.");
  return configured;
}

export function eventLedgerPath() {
  return path.join(dataDirectory(), "events.ndjson");
}

export function readProductEvents(): ProductEvent[] {
  const ledgerPath = eventLedgerPath();
  if (!existsSync(ledgerPath)) return [];
  const text = readFileSync(ledgerPath, "utf8");
  return text.split(/\r?\n/u)
    .filter((line) => line.trim().length > 0)
    .map((line, index) => {
      try {
        return productEventSchema.parse(JSON.parse(line));
      } catch (error) {
        throw new Error(`Local event ledger is invalid at line ${index + 1}.`, { cause: error });
      }
    });
}

export function readProductProjection(): ProductProjection {
  return projectProductEvents(readProductEvents());
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
  const directory = dataDirectory();
  mkdirSync(directory, { recursive: true });
  appendFileSync(eventLedgerPath(), events.map((event) => JSON.stringify(event)).join("\n") + "\n", { encoding: "utf8", flag: "a" });
  return projectProductEvents(next);
}
