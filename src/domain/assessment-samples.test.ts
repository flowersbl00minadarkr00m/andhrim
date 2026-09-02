import { describe, expect, it } from "vitest";
import { assessmentSchema } from "./learning";
import {
  assessmentSamples,
  createAssessmentFromSample,
  previewRecommendationForAssessment,
} from "./assessment-samples";

describe("first-run assessment samples", () => {
  it("covers the three requested delegation postures with strict valid assessments", () => {
    expect(assessmentSamples.map((sample) => sample.expectedRecommendation)).toEqual([
      "human-led",
      "ai-assisted",
      "agent-delegated",
    ]);

    for (const sample of assessmentSamples) {
      const assessment = createAssessmentFromSample(sample.id, {
        assessmentId: `assessment-${sample.id}`,
        createdAt: "2026-09-02T16:00:00.000Z",
      });
      expect(assessmentSchema.parse(assessment)).toEqual(assessment);
      expect(previewRecommendationForAssessment(assessment)).toBe(sample.expectedRecommendation);
      expect("receipt" in assessment).toBe(false);
    }
  });

  it("returns an editable draft instead of a receipt or persisted record", () => {
    const assessment = createAssessmentFromSample("ai-assisted", {
      assessmentId: "assessment-editable-sample",
      createdAt: "2026-09-02T16:00:00.000Z",
    });
    const edited = assessmentSchema.parse({ ...assessment, title: "Owner-edited sample title" });

    expect(edited.title).toBe("Owner-edited sample title");
    expect(edited.assessmentId).toBe(assessment.assessmentId);
  });
});
