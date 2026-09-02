import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ProductLedgerReadError,
  eventLedgerPath,
  readProductEvents,
  readRawProductLedger,
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
