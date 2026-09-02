import type { ProductProjection } from "@/src/domain/learning";
import {
  projectLearningLineages,
  type LearningLineageStatus,
} from "@/src/domain/learning-lineage";
import styles from "./LearningLineage.module.css";

type Props = {
  projection?: ProductProjection;
  focusReceiptId?: string;
  idPrefix: string;
  compact?: boolean;
};

const statusCopy: Record<LearningLineageStatus, { label: string; detail: string }> = {
  proposed: { label: "Proposed", detail: "Inert until the owner approves it." },
  approved: { label: "Approved", detail: "May affect matching later receipts while active." },
  rejected: { label: "Rejected", detail: "Cannot affect later receipts." },
  superseded: { label: "Superseded", detail: "Replaced by a newer owner-reviewed candidate." },
  expired: { label: "Expired", detail: "No longer eligible to affect receipts." },
  "deleted-tombstone": { label: "Deleted tombstone", detail: "Inactive; append-only provenance remains." },
};

const factorCopy: Record<string, string> = {
  outcomeStakes: "Outcome stakes",
  repeatability: "Repeatability",
  specificationClarity: "Specification clarity",
  verificationCost: "Verification cost",
  contextSensitivity: "Context sensitivity",
};

const operatorCopy: Record<string, string> = { gte: "at least", lte: "at most", eq: "equal to" };

function formatDate(value?: string) {
  return value ? new Date(value).toLocaleDateString(undefined, { dateStyle: "medium" }) : "Date unavailable";
}

function Status({ value }: { value: LearningLineageStatus }) {
  return (
    <span className={styles.status} data-state={value}>
      <span aria-hidden="true">●</span> {statusCopy[value].label}
    </span>
  );
}

export function LearningLineage({ projection, focusReceiptId, idPrefix, compact = false }: Props) {
  if (!projection) return null;
  const lineages = projectLearningLineages(projection, { focusReceiptId });
  if (lineages.length === 0) return null;
  const headingId = `${idPrefix}-heading`;

  return (
    <section className={`${styles.lineage} ${compact ? styles.compact : ""}`} aria-labelledby={headingId}>
      <div className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Owner-controlled learning lineage</p>
          <h3 id={headingId}>{focusReceiptId ? "How this receipt connects" : "From outcome to later receipts"}</h3>
        </div>
        <p className={styles.boundary}>Only safe record IDs, states, rule conditions, and provenance appear here. Private outcome notes stay outside this view.</p>
      </div>

      <div className={styles.lineageList}>
        {lineages.map((lineage) => {
          const chainId = `${idPrefix}-${lineage.lineageId}`;
          const outcomeId = `${chainId}-outcome`;
          const currentRevision = lineage.candidate.revision;
          const state = statusCopy[lineage.candidate.status];
          return (
            <article className={styles.lineageGroup} key={lineage.lineageId} aria-labelledby={`${chainId}-title`}>
              <div className={styles.groupHeading}>
                <div>
                  <p>Lineage</p>
                  <h4 id={`${chainId}-title`}>Candidate · {lineage.candidate.candidateId}</h4>
                </div>
                <Status value={lineage.candidate.status} />
              </div>

              <ol className={styles.timeline} aria-label={`Learning lineage for ${lineage.candidate.candidateId}`}>
                <li className={styles.step}>
                  <span className={styles.stepIndex} aria-hidden="true">1</span>
                  <div className={styles.card}>
                    <p className={styles.stage}>Source receipt</p>
                    <h5>{lineage.sourceReceipt.receiptId}</h5>
                    <dl className={styles.details}>
                      <div><dt>Decision</dt><dd>{lineage.sourceReceipt.recommendation}</dd></div>
                      <div><dt>Created</dt><dd>{formatDate(lineage.sourceReceipt.createdAt)}</dd></div>
                    </dl>
                  </div>
                </li>

                <li className={styles.step} id={outcomeId} tabIndex={-1}>
                  <span className={styles.stepIndex} aria-hidden="true">2</span>
                  <div className={styles.card}>
                    <p className={styles.stage}>Recorded outcome</p>
                    <h5>{lineage.outcome.outcomeId}</h5>
                    <dl className={styles.details}>
                      <div><dt>Rating</dt><dd>{lineage.outcome.rating} of 5</dd></div>
                      <div><dt>Recorded</dt><dd>{formatDate(lineage.outcome.recordedAt)}</dd></div>
                    </dl>
                    <p className={styles.privateNote}>Private correction and context notes are redacted.</p>
                  </div>
                </li>

                <li className={styles.step}>
                  <span className={styles.stepIndex} aria-hidden="true">3</span>
                  <div className={styles.card} data-state={lineage.candidate.status}>
                    <p className={styles.stage}>Candidate revisions</p>
                    <h5>Current · {lineage.candidate.candidateId}</h5>
                    <Status value={lineage.candidate.status} />
                    <div
                      className={styles.revisions}
                      aria-label={`Revisions 1 through ${currentRevision}; revision ${currentRevision} is current`}
                    >
                      {currentRevision > 1 ? <span>r1</span> : null}
                      {currentRevision > 2 ? <span aria-hidden="true">…</span> : null}
                      <strong>r{currentRevision} current</strong>
                    </div>
                    <p>{currentRevision > 1 ? `Earlier revision details remain in the append-only ledger; the current projection exposes revision ${currentRevision}.` : "This is the first recorded revision."}</p>
                    <dl className={styles.details}>
                      <div><dt>Condition</dt><dd>{factorCopy[lineage.candidate.condition.factor]} {operatorCopy[lineage.candidate.condition.operator]} {lineage.candidate.condition.threshold}</dd></div>
                      <div><dt>Adjustment</dt><dd>{lineage.candidate.adjustment.targetRecommendation} ({lineage.candidate.adjustment.weightDelta})</dd></div>
                    </dl>
                    <p className={styles.stateDetail}>{state.detail}</p>
                  </div>
                </li>

                <li className={styles.step}>
                  <span className={styles.stepIndex} aria-hidden="true">4</span>
                  <div className={styles.card} data-state={lineage.rule?.status ?? lineage.candidate.status}>
                    <p className={styles.stage}>Approved / expired rule</p>
                    {lineage.rule ? (
                      <>
                        <h5>{lineage.rule.ruleId} v{lineage.rule.version}</h5>
                        <Status value={lineage.rule.status} />
                        <dl className={styles.details}>
                          <div><dt>Approved</dt><dd>{formatDate(lineage.rule.approvedAt)}</dd></div>
                          <div><dt>Expires</dt><dd>{formatDate(lineage.rule.expiresAt)}</dd></div>
                          <div><dt>Effective</dt><dd>{lineage.rule.active ? "Active" : "Inactive"}</dd></div>
                        </dl>
                      </>
                    ) : (
                      <>
                        <h5>No approved rule</h5>
                        <Status value={lineage.candidate.status} />
                        <p>{state.detail}</p>
                      </>
                    )}
                  </div>
                </li>

                <li className={styles.step}>
                  <span className={styles.stepIndex} aria-hidden="true">5</span>
                  <div className={styles.card}>
                    <p className={styles.stage}>Later affected receipts</p>
                    <h5>{lineage.affectedReceipts.length === 0 ? "None recorded" : `${lineage.affectedReceipts.length} linked`}</h5>
                    {lineage.affectedReceipts.length === 0 ? (
                      <p>No later receipt in the local projection cites this rule.</p>
                    ) : (
                      <ul className={styles.receiptList}>
                        {lineage.affectedReceipts.map((receipt) => (
                          <li key={receipt.receiptId}>
                            <strong>{receipt.receiptId}</strong>
                            <span>{receipt.receiptId === focusReceiptId ? "This receipt · " : ""}{receipt.recommendation} · {formatDate(receipt.createdAt)}</span>
                            {receipt.provenance.map((appliedRule) => (
                              <p key={`${appliedRule.ruleId}-${appliedRule.version}`}>
                                {appliedRule.ruleId} v{appliedRule.version} · <a href={`#${outcomeId}`}>source outcome {appliedRule.sourceOutcomeId}</a>
                              </p>
                            ))}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </li>
              </ol>
            </article>
          );
        })}
      </div>
    </section>
  );
}
