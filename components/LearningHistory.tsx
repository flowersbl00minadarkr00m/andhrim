import { useState } from "react";
import { postProductAction } from "@/src/client/events";
import type { LearningCandidate, ProductProjection } from "@/src/domain/learning";
import { LearningLineage } from "./LearningLineage";

type Props = {
  projection?: ProductProjection;
  sessionNonce?: string;
  onProjection: (projection: ProductProjection) => void;
  onError: (message: string) => void;
  onResumeReview: (candidateId: string) => void;
};

const statusCopy: Record<LearningCandidate["status"], string> = {
  proposed: "Proposed — inert until owner approval",
  approved: "Approved — rule may apply while active",
  rejected: "Rejected — inactive",
  superseded: "Superseded — inactive",
  deleted: "Deleted tombstone — inactive and retained",
  expired: "Expired — inactive",
};

export function LearningHistory({ projection, sessionNonce, onProjection, onError, onResumeReview }: Props) {
  const [busyCandidateId, setBusyCandidateId] = useState<string>();
  const candidates = Object.values(projection?.candidates ?? {})
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  const rules = Object.values(projection?.rules ?? {});

  const run = async (candidateId: string, action: unknown) => {
    if (!sessionNonce) {
      onError("The local session boundary is not ready.");
      return;
    }
    setBusyCandidateId(candidateId);
    try {
      onProjection(await postProductAction(action, sessionNonce));
      onError("");
    } catch (error) {
      onError(error instanceof Error ? error.message : "The history control failed.");
    } finally {
      setBusyCandidateId(undefined);
    }
  };

  return (
    <section className="learning-history" id="history" aria-labelledby="history-heading">
      <div className="learning-history__heading">
        <div>
          <div className="learning-panel__eyebrow">Persistent local control</div>
          <h2 id="history-heading">Learning history</h2>
        </div>
        <a className="button" href="/api/export">Export full ledger</a>
      </div>
      <p className="history-boundary">
        Deactivation writes a deletion tombstone: it disables the candidate’s rule but does not erase append-only history. The candidate, provenance, prior revisions, and tombstone remain in the local export.
      </p>
      <LearningLineage projection={projection} idPrefix="history-lineage" />
      {candidates.length === 0 ? <p>No learning candidates have been recorded yet.</p> : (
        <div className="history-list">
          {candidates.map((candidate) => {
            const rule = rules.find((entry) => entry.candidateId === candidate.candidateId);
            const busy = busyCandidateId === candidate.candidateId;
            return (
              <article className="history-item" key={candidate.candidateId}>
                <div className="history-item__summary">
                  <div>
                    <h3>{candidate.candidateId}</h3>
                    <p><b>{statusCopy[candidate.status]}</b> · revision {candidate.revision}</p>
                  </div>
                  <span>{new Date(candidate.createdAt).toLocaleDateString()}</span>
                </div>
                <dl>
                  <div><dt>Source outcome</dt><dd>{candidate.sourceOutcomeId}</dd></div>
                  <div><dt>Condition</dt><dd>{candidate.condition.factor} {candidate.condition.operator} {candidate.condition.threshold}</dd></div>
                  <div><dt>Rule</dt><dd>{rule ? `${rule.ruleId} v${rule.version} · ${rule.active ? "active" : "inactive"}` : "No approved rule"}</dd></div>
                  <div><dt>Expiry</dt><dd>{new Date(candidate.expiresAt).toLocaleDateString()}</dd></div>
                </dl>
                <p>{candidate.rationale}</p>
                <div className="candidate-actions">
                  {candidate.status === "proposed" ? (
                    <button className="button button--primary" type="button" disabled={busy} aria-label={`Resume review ${candidate.candidateId}`} onClick={() => onResumeReview(candidate.candidateId)}>Resume review</button>
                  ) : null}
                  {candidate.status === "approved" ? (
                    <button className="button" type="button" disabled={busy} onClick={() => run(candidate.candidateId, {
                      action: "expire-learning",
                      candidateId: candidate.candidateId,
                    })}>Expire now</button>
                  ) : null}
                  {candidate.status !== "deleted" ? (
                    <button className="button button--quiet" type="button" disabled={busy} onClick={() => run(candidate.candidateId, {
                      action: "delete-learning",
                      candidateId: candidate.candidateId,
                      reason: "Owner deactivated this prototype learning record with a retained tombstone.",
                    })}>Deactivate (keep tombstone)</button>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
