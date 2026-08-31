import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const project = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const evidence = new Map(project.licenseEvidence.dependencies.map(([name, version, license]) => [name, { version, license }]));
const allowed = new Set(["Apache-2.0", "MIT"]);
for (const [name, expected] of evidence) {
  assert.ok(allowed.has(expected.license), `${name} has an unreviewed licence.`);
  const manifestPath = path.join(root, "node_modules", ...name.split("/"), "package.json");
  assert.ok(fs.existsSync(manifestPath), `${name} is not locally materialized for licence verification.`);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  assert.equal(manifest.version, expected.version, `${name} version differs from evidence.`);
  assert.equal(manifest.license, expected.license, `${name} licence differs from evidence.`);
}
assert.equal(project.licenseEvidence.projectLicense, "MIT");
process.stdout.write(`${JSON.stringify({ schemaVersion: "dependency-license-verification-v1", state: "passed", dependenciesRecorded: evidence.size, projectLicense: "MIT", publicationGate: "owner-required" })}\n`);
