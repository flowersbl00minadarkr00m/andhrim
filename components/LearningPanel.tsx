import { useState } from "react";
import { postProductAction } from "@/src/client/events";
import type { LearningCandidate, Outcome, ProductProjection } from "@/src/domain/learning";
import type { RecommendationReceipt } from "@/src/domain/recommendation";

type Props = {
  receipt: RecommendationReceipt;
  projection?: ProductProjection;
  sessionNonce?: string;
  onProjection: (projection: ProductProjection) => void;
  onError: (message: string) => void;
};

export function LearningPanel({ receipt, projection, sessionNonce, onProjection, onError }: Props) {
  const [rating, setRating] = useState(4);
  const [correctionNotes, setCorrectionNotes] = useState("The scope constraint was tighter than expected. Future calls should favor stronger scope checks.");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [candidateRationale, setCandidateRationale] = useState("");

  const outcome = Object.values(projection?.outcomes ?? {}).find((entry) => entry.receiptId === receipt.receiptId);
  const candidate = Object.values(projection?.candidates ?? {}).find((entry) => entry.sourceOutcomeId === outcome?.outcomeId);

  const run = async (action: unknown) => {
    if (!sessionNonce) {
      onError("The local session boundary is not ready.");
      return;
    }
    setBusy(true);
    try { onProjection(await postProductAction(action, sessionNonce)); onError(""); }
    catch (error) { onError(error instanceof Error ? error.message : "Local learning action failed."); }
    finally { setBusy(false); }
  };

  const recordOutcome = async () => {
    const suffix = crypto.randomUUID();
    const value: Outcome = {
      schemaVersion: "outcome-v1",
      outcomeId: `outcome-${suffix}`,
      receiptId: receipt.receiptId,
      recordedAt: new Date().toISOString(),
      rating,
      correctionNotes,
      notes,
    };
    await run({ action: "record-outcome", outcome: value });
  };

  const saveEdit = async (current: LearningCandidate) => {
    await run({
      action: "edit-learning",
      candidate: {
        ...current,
        revision: current.revision + 1,
        rationale: candidateRationale || current.rationale,
      },
    });
    setEditing(false);
  };

  return (
    <section className="learning-panel" aria-labelledby="outcome-heading">
      <div className="learning-panel__eyebrow">What happened?</div>
      <h2 id="outcome-heading">Turn an outcome into reviewable learning.</h2>

      <div className="outcome-step">
        <span className="step-number">1</span>
        <div>
          <h3>Outcome rating</h3>
          <p>How did the recommendation and process work for you?</p>
          <div className="rating" role="radiogroup" aria-label="Outcome rating">
            {[1, 2, 3, 4, 5].map((value) => (
              <button key={value} type="button" role="radio" aria-checked={rating === value} className={rating === value ? "is-selected" : ""} onClick={() => setRating(value)} disabled={Boolean(outcome)}>{value}</button>
            ))}
            <span>{rating >= 4 ? "Worked well" : rating === 3 ? "Mixed result" : "Needs correction"}</span>
          </div>
        </div>
      </div>

      <div className="outcome-step">
        <span className="step-number">2</span>
        <div>
          <label htmlFor="correction"><b>Correction notes</b> <small>(required for ratings 1–2)</small></label>
          <textarea id="correction" value={correctionNotes} maxLength={800} onChange={(event) => setCorrectionNotes(event.target.value)} disabled={Boolean(outcome)} />
          <label htmlFor="outcome-notes"><b>Optional context</b></label>
          <textarea id="outcome-notes" value={notes} maxLength={1200} onChange={(event) => setNotes(event.target.value)} disabled={Boolean(outcome)} />
          {!outcome ? <button className="button button--primary" type="button" onClick={recordOutcome} disabled={busy}>Record outcome locally</button> : null}
        </div>
      </div>

      <div className="outcome-step">
        <span className="step-number">3</span>
        <div>
          <h3>Learning Candidate <small>(preview only)</small></h3>
          {candidate ? (
            <>
              <div className="candidate">
                <dl>
                  <div><dt>Condition</dt><dd>{candidate.condition.factor} {candidate.condition.operator} {candidate.condition.threshold}</dd></div>
                  <div><dt>Proposed adjustment</dt><dd>{candidate.adjustment.targetRecommendation}; weight {candidate.adjustment.weightDelta}</dd></div>
                  <div><dt>Evidence</dt><dd>{candidate.evidenceRefs.join(", ")}</dd></div>
                  <div><dt>Confidence</dt><dd>{candidate.confidence}%</dd></div>
                  <div><dt>Review date</dt><dd>{new Date(candidate.reviewAt).toLocaleDateString()}</dd></div>
                  <div><dt>Status</dt><dd><b>{candidate.status}</b> · revision {candidate.revision}</dd></div>
                </dl>
                <p>{candidate.rationale}</p>
              </div>
              <p className="inert-note">🔒 {candidate.status === "proposed" ? "Inert until you approve." : `This candidate is ${candidate.status}.`}</p>
              {editing && candidate.status === "proposed" ? (
                <div className="edit-candidate">
                  <label htmlFor="candidate-rationale">Bounded rationale</label>
                  <textarea id="candidate-rationale" value={candidateRationale} maxLength={600} onChange={(event) => setCandidateRationale(event.target.value)} />
                  <button className="button button--primary" type="button" onClick={() => saveEdit(candidate)} disabled={busy}>Save new revision</button>
                </div>
              ) : null}
              <div className="candidate-actions">
                {candidate.status === "proposed" ? (
                  <>
                    <button className="button button--primary" type="button" onClick={() => run({ action: "approve-learning", candidateId: candidate.candidateId })} disabled={busy}>Approve learning</button>
                    <button className="button" type="button" onClick={() => run({ action: "reject-learning", candidateId: candidate.candidateId, reason: "Owner rejected the proposed adjustment." })} disabled={busy}>Reject</button>
                    <button className="button" type="button" onClick={() => { setCandidateRationale(candidate.rationale); setEditing((value) => !value); }} disabled={busy}>Edit</button>
                  </>
                ) : null}
                {candidate.status !== "deleted" ? <button className="button button--quiet" type="button" onClick={() => run({ action: "delete-learning", candidateId: candidate.candidateId, reason: "Owner deactivated this prototype learning record with a retained tombstone." })} disabled={busy}>Deactivate (keep tombstone)</button> : null}
              </div>
            </>
          ) : <p>Record an outcome to create one bounded, inert candidate.</p>}
        </div>
      </div>

      {candidate ? (
        <section className="impact-preview">
          <h3>Before / after impact <small>(preview)</small></h3>
          <div className="impact-grid">
            <div><span>Before</span><b>{receipt.recommendation}</b><p>Current validated receipt.</p></div>
            <div><span>After</span><b>{candidate.adjustment.targetRecommendation}</b><p>Only if this candidate is approved and its bounded condition matches.</p></div>
            <div><span>Provenance</span><b>{candidate.sourceOutcomeId}</b><p>Owner-controlled local evidence.</p></div>
          </div>
        </section>
      ) : null}
    </section>
  );
}
