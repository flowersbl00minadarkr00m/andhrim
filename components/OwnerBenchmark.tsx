"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { postProductAction } from "@/src/client/events";
import type { ProductProjection } from "@/src/domain/learning";
import { projectOwnerBenchmark } from "@/src/domain/owner-benchmark";
import { RECOMMENDATION_MODES, type RecommendationReceipt } from "@/src/domain/recommendation";
import { runtimeStatusSchema } from "@/src/domain/runtime";
import styles from "./OwnerBenchmark.module.css";

const recommendationLabels: Record<RecommendationReceipt["recommendation"], string> = {
  "human-led": "Human-led",
  "ai-assisted": "AI-assisted",
  "agent-delegated": "Agent-delegated",
  automated: "Automated",
  "more-information-required": "More information required",
};

function sortedReceipts(projection: ProductProjection) {
  return Object.values(projection.receipts).sort((left, right) => {
    const leftDate = projection.assessments[left.assessmentId]?.createdAt ?? "";
    const rightDate = projection.assessments[right.assessmentId]?.createdAt ?? "";
    return rightDate.localeCompare(leftDate) || left.receiptId.localeCompare(right.receiptId);
  });
}

export function OwnerBenchmark() {
  const [projection, setProjection] = useState<ProductProjection>();
  const [sessionNonce, setSessionNonce] = useState("");
  const [selectedReceiptId, setSelectedReceiptId] = useState("");
  const [expectedRecommendation, setExpectedRecommendation] = useState<RecommendationReceipt["recommendation"]>("ai-assisted");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch("/api/runtime", { cache: "no-store" }).then(async (response) => {
        if (!response.ok) throw new Error("The local runtime status is unavailable.");
        return runtimeStatusSchema.parse(await response.json());
      }),
      fetch("/api/state", { cache: "no-store" }).then(async (response) => {
        const payload = await response.json() as { projection?: ProductProjection; error?: string };
        if (!response.ok || !payload.projection) throw new Error(payload.error ?? "The local product ledger is unavailable.");
        return payload.projection;
      }),
    ]).then(([runtime, state]) => {
      if (cancelled) return;
      setSessionNonce(runtime.sessionNonce);
      setProjection(state);
      const first = sortedReceipts(state)[0];
      if (first) {
        const label = Object.values(state.evaluationLabels).find((item) => item.receiptId === first.receiptId);
        setSelectedReceiptId(first.receiptId);
        setExpectedRecommendation(label?.expectedRecommendation ?? first.recommendation);
        setNotes(label?.notes ?? "");
      }
    }).catch((caught) => {
      if (!cancelled) setError(caught instanceof Error ? caught.message : "The owner benchmark could not load.");
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const receipts = useMemo(() => projection ? sortedReceipts(projection) : [], [projection]);
  const benchmark = useMemo(() => projection ? projectOwnerBenchmark(projection) : undefined, [projection]);
  const selectedReceipt = projection?.receipts[selectedReceiptId];

  function selectReceipt(receiptId: string) {
    setSelectedReceiptId(receiptId);
    setMessage("");
    setError("");
    if (!projection) return;
    const receipt = projection.receipts[receiptId];
    const label = Object.values(projection.evaluationLabels).find((item) => item.receiptId === receiptId);
    setExpectedRecommendation(label?.expectedRecommendation ?? receipt?.recommendation ?? "ai-assisted");
    setNotes(label?.notes ?? "");
  }

  async function saveLabel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedReceiptId || !sessionNonce) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const next = await postProductAction({
        action: "label-evaluation",
        receiptId: selectedReceiptId,
        expectedRecommendation,
        notes,
      }, sessionNonce);
      setProjection(next);
      setMessage("Owner label saved to the local ledger. No provider call was made.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The owner label could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className={styles.panel} aria-labelledby="owner-benchmark-heading">
      <div className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>Owner-labelled evidence</p>
          <h2 id="owner-benchmark-heading">Benchmark real decisions, not just fixtures.</h2>
        </div>
        <p>Label an existing receipt with the posture you believe was right. The comparison stays in the local append-only ledger.</p>
      </div>

      {loading ? <p className={styles.empty}>Reading local receipts…</p> : null}
      {error ? <p className={styles.error} role="alert">{error}</p> : null}

      {!loading && projection && benchmark ? (
        <>
          <dl className={styles.metrics}>
            <div><dt>Labelled cases</dt><dd>{benchmark.labelledCases}</dd></div>
            <div><dt>Agreement</dt><dd>{benchmark.agreementRate === null ? "—" : `${benchmark.agreementRate}%`}</dd></div>
            <div><dt>Disagreements</dt><dd>{benchmark.disagreements}</dd></div>
            <div><dt>Awaiting labels</dt><dd>{benchmark.unlabelledCases}</dd></div>
          </dl>

          {receipts.length > 0 ? (
            <div className={styles.workspace}>
              <form className={styles.form} onSubmit={(event) => { void saveLabel(event); }}>
                <label>
                  <span>Recorded case</span>
                  <select value={selectedReceiptId} onChange={(event) => selectReceipt(event.target.value)} disabled={saving}>
                    {receipts.map((receipt) => (
                      <option key={receipt.receiptId} value={receipt.receiptId}>
                        {projection.assessments[receipt.assessmentId]?.title ?? receipt.receiptId}
                      </option>
                    ))}
                  </select>
                </label>
                <div className={styles.observed}>
                  <span>Andhrim recommended</span>
                  <strong>{selectedReceipt ? recommendationLabels[selectedReceipt.recommendation] : "Select a case"}</strong>
                  <small>{selectedReceipt?.runtime.modelId ?? "Model unavailable"}</small>
                </div>
                <label>
                  <span>Owner’s expected posture</span>
                  <select value={expectedRecommendation} onChange={(event) => setExpectedRecommendation(event.target.value as RecommendationReceipt["recommendation"])} disabled={saving}>
                    {RECOMMENDATION_MODES.map((recommendation) => (
                      <option key={recommendation} value={recommendation}>{recommendationLabels[recommendation]}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Why? <small>Optional, local only</small></span>
                  <textarea value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={800} rows={3} disabled={saving} />
                </label>
                <button type="submit" disabled={saving || !selectedReceiptId}>{saving ? "Saving label…" : "Save owner label"}</button>
                {message ? <p className={styles.message} role="status">{message}</p> : null}
              </form>

              <div className={styles.results}>
                <div className={styles.resultsHeading}>
                  <h3>Labelled cases</h3>
                  <span>{benchmark.rows.length} local record{benchmark.rows.length === 1 ? "" : "s"}</span>
                </div>
                {benchmark.rows.length > 0 ? (
                  <ol>
                    {benchmark.rows.map((row) => (
                      <li key={row.labelId} data-agrees={row.agrees}>
                        <div><strong>{row.title}</strong><small>{row.modelId}</small></div>
                        <p><span>Actual</span>{recommendationLabels[row.actualRecommendation]}</p>
                        <p><span>Owner</span>{recommendationLabels[row.expectedRecommendation]}</p>
                        <b>{row.agrees ? "Agrees" : "Review gap"}</b>
                      </li>
                    ))}
                  </ol>
                ) : <p className={styles.empty}>Save the first owner label to begin a real-case benchmark.</p>}
              </div>
            </div>
          ) : (
            <p className={styles.empty}>Complete at least one assessment, then return here to label the receipt.</p>
          )}
        </>
      ) : null}
    </section>
  );
}
