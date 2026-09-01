import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const listed = spawnSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { cwd: root, encoding: "utf8", windowsHide: true });
assert.equal(listed.status, 0, listed.stderr);
const files = listed.stdout.split("\0").filter(Boolean);
const patterns = [
  { name: "OpenRouter key", value: /sk-or-v1-[A-Za-z0-9_-]{16,}/gu },
  { name: "private key", value: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/gu },
  { name: "assigned provider credential", value: /(?:OPENROUTER_API_KEY|API_KEY|TOKEN|SECRET)\s*=\s*["']?[^\s"'#]{12,}/giu },
];
const findings = [];
let filesScanned = 0;
for (const relative of files) {
  const absolute = path.join(root, relative);
  if (!fs.existsSync(absolute)) continue;
  if (!fs.statSync(absolute).isFile()) continue;
  filesScanned += 1;
  const bytes = fs.readFileSync(absolute);
  if (bytes.includes(0)) continue;
  const content = bytes.toString("utf8");
  for (const pattern of patterns) {
    pattern.value.lastIndex = 0;
    if (pattern.value.test(content)) findings.push({ file: relative, pattern: pattern.name });
  }
}
assert.deepEqual(findings, [], `Credential-shaped source found: ${JSON.stringify(findings)}`);
assert.ok(!files.some((file) => /^\.env(?:\.|$)/u.test(file) && file !== ".env.example"), "A non-example environment file is trackable.");
process.stdout.write(`${JSON.stringify({ schemaVersion: "source-secret-scan-v1", state: "passed", filesScanned, findings: 0 })}\n`);
