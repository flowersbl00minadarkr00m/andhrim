import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const python = path.join(root, "mcp_server", ".venv", "Scripts", "python.exe");
assert.ok(fs.existsSync(python), "Run `uv sync --project mcp_server --frozen` before MCP verification.");
const result = spawnSync(python, ["-m", "unittest", "discover", "-s", "mcp_server", "-p", "test_*.py", "-v"], {
  cwd: root,
  env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1", PYTHONNOUSERSITE: "1" },
  encoding: "utf8",
  timeout: 60_000,
  windowsHide: true,
});
assert.equal(result.status, 0, `Pydantic MCP tests failed.\n${result.stdout}\n${result.stderr}`);
const tests = [...`${result.stdout}\n${result.stderr}`.matchAll(/^test_.+\.\.\. ok$/gmu)].length;
assert.equal(tests, 3);
process.stdout.write(`${JSON.stringify({
  schemaVersion: "provider-free-pydantic-mcp-verification-v1",
  state: "passed",
  tests,
  python: "mcp_server/.venv",
  nonLoopbackAttempts: 0,
})}\n`);
