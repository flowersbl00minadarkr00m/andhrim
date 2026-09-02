"use client";

import {
  assessmentSamples,
  type AssessmentSampleId,
} from "@/src/domain/assessment-samples";
import styles from "./AssessmentSamples.module.css";

type Props = {
  onLoad: (sampleId: AssessmentSampleId) => void;
};

const recommendationLabels = {
  "human-led": "Human-led",
  "ai-assisted": "AI-assisted",
  "agent-delegated": "Agent-delegated",
  automated: "Automated",
  "more-information-required": "More information",
} as const;

export function AssessmentSamples({ onLoad }: Props) {
  return (
    <section className={styles.samples} aria-labelledby="sample-assessments-heading">
      <div className={styles.heading}>
        <div>
          <h2 id="sample-assessments-heading">Choose a starting point</h2>
        </div>
        <span>Loads an editable draft · never generates a receipt</span>
      </div>
      <div className={styles.grid}>
        {assessmentSamples.map((sample) => (
          <button key={sample.id} type="button" onClick={() => onLoad(sample.id)} aria-label={`Load ${sample.title} sample`}>
            <span className={styles.posture} data-posture={sample.expectedRecommendation}>{recommendationLabels[sample.expectedRecommendation]}</span>
            <strong>{sample.title}</strong>
            <small>{sample.description}</small>
            <b>Load editable draft <span aria-hidden="true">→</span></b>
          </button>
        ))}
      </div>
    </section>
  );
}
