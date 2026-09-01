import { defineState } from "eve/context";

export const capabilityBudget = defineState("andhrim.guidance-capability-budget.v1", () => ({
  derivedEvidenceCalls: 0,
  governedMemoryCalls: 0,
}));
