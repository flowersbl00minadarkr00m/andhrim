import type { EvaluationComparisonProjection } from "@/src/domain/evaluation-comparison";
import type { RecommendationReceipt } from "@/src/domain/recommendation";
import styles from "./EvaluationComparisonGraph.module.css";

const recommendationLabels: Record<RecommendationReceipt["recommendation"], string> = {
  "human-led": "Human-led",
  "ai-assisted": "AI-assisted",
  "agent-delegated": "Agent-delegated",
  automated: "Automated",
  "more-information-required": "More information required",
};

const recommendationLanes = [
  "human-led",
  "ai-assisted",
  "agent-delegated",
  "automated",
  "more-information-required",
] as const;

function retryLabel(retries: number) {
  return `${retries} ${retries === 1 ? "retry" : "retries"}`;
}

function validationLabel(failures: number) {
  return `${failures} validation ${failures === 1 ? "failure" : "failures"}`;
}

export function EvaluationComparisonGraph({ projection }: { projection: EvaluationComparisonProjection }) {
  const graphWidth = 960;
  const laneStart = 252;
  const laneEnd = 930;
  const laneTop = 82;
  const laneGap = 43;
  const markerGap = (laneEnd - laneStart) / projection.traces.length;
  const plotDescription = `${projection.traces.length} source-versioned local traces are positioned by recommendation. ${projection.agreement.groups
    .map((group) => `${group.count} ${recommendationLabels[group.recommendation]}`)
    .join(", ")}. The accessible table below contains every value.`;

  return (
    <details className={styles.comparison} data-testid="evaluation-comparison">
      <summary className={styles.summary}>
        <span>
          <span className={styles.eyebrow}>Optional comparison view</span>
          <strong>Compare synthetic recommendation traces</strong>
          <small>{projection.agreement.summary}</small>
        </span>
        <span className={styles.summaryAction}>Toggle read-only graph</span>
      </summary>

      <div className={styles.body}>
        <header className={styles.heading}>
          <div>
            <p className={styles.eyebrow}>Synthetic trace comparison</p>
            <h2>{projection.title}</h2>
            <p>{projection.question}</p>
          </div>
          <div className={styles.boundary} aria-label="Comparison boundary">
            <strong>Synthetic deterministic traces</strong>
            <span>Not spawned agents</span>
            <span>Not live model outputs</span>
            <span>Not production telemetry</span>
          </div>
        </header>

        <p className={styles.scopeNote}>
          This secondary view projects the existing fixture report in memory. It cannot call a provider,
          inspect credentials, execute tools, or write assessment, receipt, event, outcome, or learning state.
          No latency, cost, or provider evidence is inferred.
        </p>

        <section className={styles.agreement} aria-labelledby="comparison-agreement-heading">
          <div>
            <p className={styles.eyebrow}>Agreement signal</p>
            <h3 id="comparison-agreement-heading">{projection.agreement.summary}</h3>
          </div>
          <dl>
            {projection.agreement.groups.map((group) => (
              <div key={group.recommendation}>
                <dt>{recommendationLabels[group.recommendation]}</dt>
                <dd>{group.count} / {projection.agreement.total}</dd>
              </div>
            ))}
          </dl>
        </section>

        <div className={styles.plotWrap}>
          <svg
            className={styles.plot}
            viewBox={`0 0 ${graphWidth} 296`}
            role="img"
            aria-labelledby="comparison-plot-title comparison-plot-description"
          >
            <title id="comparison-plot-title">Synthetic deterministic recommendation trace comparison</title>
            <desc id="comparison-plot-description">{plotDescription}</desc>
            {recommendationLanes.map((recommendation, index) => {
              const y = laneTop + index * laneGap;
              return (
                <g key={recommendation} aria-hidden="true">
                  <text className={styles.laneLabel} x="12" y={y + 5}>{recommendationLabels[recommendation]}</text>
                  <line className={styles.lane} x1={laneStart - 14} x2={laneEnd} y1={y} y2={y} />
                </g>
              );
            })}
            {projection.traces.map((trace, index) => {
              const x = laneStart + markerGap * index + markerGap / 2;
              const laneIndex = recommendationLanes.indexOf(trace.recommendation);
              const y = laneTop + laneIndex * laneGap;
              const aligned = trace.recommendation === projection.agreement.leadingRecommendation;
              return (
                <g key={trace.traceId} aria-hidden="true">
                  <text className={styles.traceLabel} textAnchor="middle" x={x} y="28">{trace.perspective}</text>
                  <line className={styles.stem} x1={x} x2={x} y1="42" y2={y - 10} />
                  <circle className={aligned ? styles.alignedMarker : styles.divergentMarker} cx={x} cy={y} r="9" />
                  <text className={styles.markerLabel} textAnchor="middle" x={x} y={y + 4}>{index + 1}</text>
                </g>
              );
            })}
          </svg>
          <p className={styles.mobilePlotNote}>On this viewport, the graph is represented by the stacked traces below.</p>
        </div>

        <ol className={styles.traceGrid} aria-label="Synthetic deterministic comparison traces">
          {projection.traces.map((trace, index) => {
            const aligned = trace.recommendation === projection.agreement.leadingRecommendation;
            return (
              <li
                className={styles.traceCard}
                data-alignment={aligned ? "leading" : "different"}
                data-trace-id={trace.traceId}
                key={trace.traceId}
              >
                <div className={styles.traceTopline}>
                  <span>Trace {index + 1}</span>
                  <strong>{trace.validation.status}</strong>
                </div>
                <h3>{trace.perspective}</h3>
                <p>{trace.framing}</p>
                <div className={styles.recommendation}>
                  <span>Resulting recommendation</span>
                  <strong>{recommendationLabels[trace.recommendation]}</strong>
                  <small>{aligned ? "Shared leading result" : "Disagrees with the leading result"}</small>
                </div>
                <dl className={styles.traceDetails}>
                  <div>
                    <dt>Validation / retry</dt>
                    <dd>{trace.validation.status} · {retryLabel(trace.validation.retries)} · {validationLabel(trace.validation.validationFailures)}</dd>
                  </div>
                  <div>
                    <dt>Input provenance</dt>
                    <dd><code>{trace.inputProvenance.fixtureId}</code><span>{trace.inputProvenance.summary}</span></dd>
                  </div>
                  <div>
                    <dt>Evidence provenance</dt>
                    <dd>
                      <ul>
                        {trace.evidenceProvenance.map((entry) => (
                          <li key={`${entry.source}-${entry.reference}`}>
                            <b>{entry.source.replaceAll("-", " ")}</b>
                            <code>{entry.reference}</code>
                            <span>{entry.note}</span>
                          </li>
                        ))}
                      </ul>
                    </dd>
                  </div>
                  <div>
                    <dt>Observed</dt>
                    <dd>{trace.validation.observed}</dd>
                  </div>
                </dl>
              </li>
            );
          })}
        </ol>

        <details className={styles.tableDetails} data-testid="comparison-table-fallback">
          <summary>Read the complete comparison as a table</summary>
          <div className={styles.tableWrap}>
            <table>
              <caption>Text alternative for the synthetic deterministic comparison graph</caption>
              <thead>
                <tr>
                  <th scope="col">Perspective</th>
                  <th scope="col">Input and evidence provenance</th>
                  <th scope="col">Validation and retry</th>
                  <th scope="col">Recommendation</th>
                </tr>
              </thead>
              <tbody>
                {projection.traces.map((trace) => (
                  <tr key={trace.traceId}>
                    <th scope="row">{trace.perspective}</th>
                    <td data-label="Input and evidence provenance">
                      {trace.inputProvenance.fixtureId}. {trace.evidenceProvenance.map((entry) => entry.reference).join("; ")}.
                    </td>
                    <td data-label="Validation and retry">{trace.validation.status}; {retryLabel(trace.validation.retries)}; {validationLabel(trace.validation.validationFailures)}.</td>
                    <td data-label="Recommendation">{recommendationLabels[trace.recommendation]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </div>
    </details>
  );
}
