export const fixtureScenarios = ["valid", "invalid-first-receipt"] as const;
export type FixtureScenario = (typeof fixtureScenarios)[number];

export function resolveFixtureScenario(providerMode: string, configuredScenario?: string): FixtureScenario {
  if (providerMode !== "fixture" && configuredScenario) {
    throw new Error("AGENT_OR_NOT_FIXTURE_SCENARIO is fixture-only and cannot be used in openrouter mode.");
  }
  const scenario = configuredScenario || "valid";
  if (!fixtureScenarios.includes(scenario as FixtureScenario)) {
    throw new Error("AGENT_OR_NOT_FIXTURE_SCENARIO must be valid or invalid-first-receipt.");
  }
  return scenario as FixtureScenario;
}
