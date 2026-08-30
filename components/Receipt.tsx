import type { RecommendationReceipt } from "@/src/domain/recommendation";

const recommendationLabels: Record<RecommendationReceipt["recommendation"], string> = {
  "human-led": "Human-led",
  "ai-assisted": "AI-assisted",
  "agent-delegated": "Agent-delegated",
  automated: "Automated",
  "more-information-required": "More information required",
};

type Props = {
  receipt?: RecommendationReceipt;
  previewRecommendation: RecommendationReceipt["recommendation"];
  step: number;
};

export function Receipt({ receipt, previewRecommendation, step }: Props) {
  const recommendation = receipt?.recommendation ?? previewRecommendation;
  return (
    <article className="receipt" aria-live="polite">
      <header className="receipt__header">
        <div>
          <h2>Recommendation Receipt</h2>
          <p>{receipt ? "Validated local result" : "Live preview — updates as you answer"}</p>
        </div>
        <span>Step {step + 1} of 5</span>
      </header>

      <dl className="receipt__fields">
        <div className="receipt__row receipt__row--lead">
          <dt>Recommendation</dt>
          <dd>
            <strong>{recommendationLabels[recommendation]}</strong>
            <small>{receipt?.summary ?? "Complete the assessment to produce a strict Eve receipt."}</small>
          </dd>
        </div>
        <div className="receipt__row">
          <dt>Why</dt>
          <dd>{receipt?.why ?? "The preview balances consequence, clarity, repeatability, review cost, and context."}</dd>
        </div>
        <div className="receipt__row">
          <dt>Evidence</dt>
          <dd>
            <ul>{(receipt?.evidence ?? ["Your five bounded answers", "A deterministic no-tools validation boundary"]).map((item) => <li key={item}>{item}</li>)}</ul>
          </dd>
        </div>
        <div className="receipt__row">
          <dt>Assumptions</dt>
          <dd>
            <ul>{(receipt?.assumptions ?? ["You remain accountable for the outcome", "No external action is authorized"]).map((item) => <li key={item}>{item}</li>)}</ul>
          </dd>
        </div>
        <div className="receipt__row">
          <dt>Confidence</dt>
          <dd>
            <div className="confidence" aria-label={`${receipt?.confidence.score ?? 60} percent confidence`}>
              {[1, 2, 3, 4, 5].map((dot) => <span key={dot} className={dot <= Math.ceil((receipt?.confidence.score ?? 60) / 20) ? "is-filled" : ""} />)}
              <b>{receipt ? `${receipt.confidence.label} (${receipt.confidence.score}%)` : "Preview"}</b>
            </div>
            <small>{receipt?.confidence.uncertainty}</small>
          </dd>
        </div>
        <div className="receipt__row">
          <dt>Autonomy boundary</dt>
          <dd>
            <p>{receipt?.autonomyBoundary.allowed.join(" ") ?? "Suggest, draft, and prepare options."}</p>
            <p>{receipt?.autonomyBoundary.prohibited.join(" ") ?? "Do not decide, publish, purchase, or contact anyone."}</p>
          </dd>
        </div>
      </dl>

      <section className="starter-pack">
        <div className="section-title"><h3>Work Starter Pack</h3><span>Editable in your local case</span></div>
        {receipt?.starterPack.length ? (
          <ol>{receipt.starterPack.map((item) => <li key={item.id}><b>{item.label}:</b> {item.content}</li>)}</ol>
        ) : <p>Generated only for an actionable validated recommendation.</p>}
      </section>

      {receipt?.appliedRules.length ? (
        <section className="rule-provenance">
          <h3>Approved lessons applied</h3>
          {receipt.appliedRules.map((rule) => (
            <p key={`${rule.ruleId}-${rule.version}`}><b>{rule.ruleId} v{rule.version}</b> — {rule.explanation} Source: {rule.sourceOutcomeId}.</p>
          ))}
        </section>
      ) : null}

      <footer className="receipt__note">Everything here stays local. The model has no callable tools.</footer>
    </article>
  );
}
