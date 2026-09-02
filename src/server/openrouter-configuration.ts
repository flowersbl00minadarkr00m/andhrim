import { lstat, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { OpenRouterConfigurationInput } from "../domain/runtime";

const managedEnvironment = [
  "AGENT_OR_NOT_PROVIDER_MODE",
  "OPENROUTER_MODEL",
  "OPENROUTER_API_KEY",
] as const;

const environmentAssignmentPattern = /^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=/u;

export function updateOpenRouterEnvironment(
  source: string,
  configuration: OpenRouterConfigurationInput,
) {
  const newline = source.includes("\r\n") ? "\r\n" : "\n";
  const values = new Map<string, string>([
    ["AGENT_OR_NOT_PROVIDER_MODE", "openrouter"],
    ["OPENROUTER_MODEL", configuration.modelId],
    ["OPENROUTER_API_KEY", configuration.apiKey],
  ]);
  const written = new Set<string>();
  const lines = source.split(/\r?\n/u).flatMap((line) => {
    const name = environmentAssignmentPattern.exec(line)?.[1];
    if (!name || !values.has(name)) return [line];
    if (written.has(name)) return [];
    written.add(name);
    return [`${name}=${values.get(name)}`];
  });

  while (lines.length > 0 && lines.at(-1) === "") lines.pop();
  if (lines.length > 0) lines.push("");
  for (const name of managedEnvironment) {
    if (!written.has(name)) lines.push(`${name}=${values.get(name)}`);
  }
  return `${lines.join(newline)}${newline}`;
}

export async function writeOpenRouterEnvironment(
  configuration: OpenRouterConfigurationInput,
  environmentPath = path.resolve(process.cwd(), ".env.local"),
) {
  let source = "";
  let exists = false;
  try {
    const status = await lstat(environmentPath);
    if (!status.isFile() || status.isSymbolicLink()) {
      throw new Error("The local environment target must be a regular file.");
    }
    source = await readFile(environmentPath, "utf8");
    exists = true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  const updated = updateOpenRouterEnvironment(source, configuration);
  await writeFile(environmentPath, updated, {
    encoding: "utf8",
    flag: exists ? "w" : "wx",
    mode: 0o600,
  });
}
