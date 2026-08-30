import { describe, expect, it } from "vitest";
import { assessmentFactorCopy } from "./assessment-copy";
import { assessmentFactors } from "./learning";

describe("assessment factor copy", () => {
  it("defines five visible, factor-specific 1–5 anchors for every factor", () => {
    expect(Object.keys(assessmentFactorCopy)).toEqual(assessmentFactors);
    for (const factor of assessmentFactors) {
      const labels = assessmentFactorCopy[factor].labels;
      expect(labels).toHaveLength(5);
      expect(new Set(labels).size).toBe(5);
      expect(labels[0]).toMatch(/^1 —/u);
      expect(labels[4]).toMatch(/^5 —/u);
    }
    expect(new Set(assessmentFactors.map((factor) => assessmentFactorCopy[factor].labels.join("|"))).size).toBe(5);
  });
});
