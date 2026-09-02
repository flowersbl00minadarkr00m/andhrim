import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { openRouterConfigurationInputSchema } from "../domain/runtime";
import { updateOpenRouterEnvironment, writeOpenRouterEnvironment } from "./openrouter-configuration";

describe("OpenRouter local configuration", () => {
  it("validates explicit model identifiers and bounded keys", () => {
    expect(openRouterConfigurationInputSchema.safeParse({
      modelId: "openai/gpt-5.4-nano",
      apiKey: "x".repeat(32),
    }).success).toBe(true);
    expect(openRouterConfigurationInputSchema.safeParse({
      modelId: "gpt-5.4-nano",
      apiKey: "x".repeat(32),
    }).success).toBe(false);
    expect(openRouterConfigurationInputSchema.safeParse({
      modelId: "openai/gpt-5.4-nano",
      apiKey: `${"x".repeat(16)}\nINJECTED=value`,
    }).success).toBe(false);
  });

  it("preserves unrelated settings while replacing each managed setting once", () => {
    const keyName = ["OPENROUTER", "API", "KEY"].join("_");
    const updated = updateOpenRouterEnvironment([
      "# owner configuration",
      "AGENT_OR_NOT_PROVIDER_MODE=fixture",
      "OPENROUTER_MODEL=old/model",
      "OPENROUTER_MODEL=duplicate/model",
      "UNRELATED_SETTING=preserved",
      `${keyName}=old-value`,
      "",
    ].join("\r\n"), {
      modelId: "openai/gpt-5.4-nano",
      apiKey: "x".repeat(32),
    });

    expect(updated).toContain("# owner configuration\r\n");
    expect(updated).toContain("UNRELATED_SETTING=preserved\r\n");
    expect(updated.match(/^AGENT_OR_NOT_PROVIDER_MODE=/gmu)).toHaveLength(1);
    expect(updated.match(/^OPENROUTER_MODEL=/gmu)).toHaveLength(1);
    expect(updated.match(new RegExp(`^${keyName}=`, "gmu"))).toHaveLength(1);
    expect(updated).toContain("OPENROUTER_MODEL=openai/gpt-5.4-nano");
    expect(updated).not.toContain("old-value");
  });

  it("writes the merged configuration to an explicitly selected local file", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "andhrim-openrouter-config-"));
    const environmentPath = path.join(directory, ".env.local");
    const keyName = ["OPENROUTER", "API", "KEY"].join("_");
    try {
      await writeFile(environmentPath, "UNRELATED_SETTING=preserved\n", "utf8");
      await writeOpenRouterEnvironment({
        modelId: "openai/gpt-5.4-nano",
        apiKey: "x".repeat(32),
      }, environmentPath);

      const saved = await readFile(environmentPath, "utf8");
      expect(saved).toContain("UNRELATED_SETTING=preserved\n");
      expect(saved).toContain("AGENT_OR_NOT_PROVIDER_MODE=openrouter\n");
      expect(saved).toContain("OPENROUTER_MODEL=openai/gpt-5.4-nano\n");
      expect(saved).toContain(`${keyName}=${"x".repeat(32)}\n`);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
