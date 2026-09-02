"use client";

import { useEffect, useState } from "react";
import styles from "./EvaluationLab.module.css";
import { runEvaluationSuite, type EvaluationReport } from "@/src/domain/evaluation";
import {
  projectEvaluationComparison,
  type EvaluationComparisonProjection,
} from "@/src/domain/evaluation-comparison";
import { evaluationComparisonFixture } from "@/src/evaluation/comparison-fixtures";
import { evaluationScenarioPack } from "@/src/evaluation/fixtures";
import { EvaluationComparisonGraph } from "./EvaluationComparisonGraph";

const categoryLabels: Record<EvaluationReport["results"][number]["category"], string> = {
  recommendation: "Recommendation class",
  "output-validation": "Output validation",
  "retry-control": "Retry control",
  "guidance-boundary": "Guidance lifecycle",
  "ledger-recovery": "Ledger recovery",
};

function formatLatency(value: number) {
  if (value > 0 && value < 0.01) return "<0.01 ms";
  return `${value.toFixed(2)} ms`;
}

export function EvaluationLab() {
  const [evaluation, setEvaluation] = useState<{
    report: EvaluationReport;
    comparison: EvaluationComparisonProjection;
  }>();
  const [error, setError] = useState("");
  const report = evaluation?.report;
  const comparison = evaluation?.comparison;

  const run = () => {
    setError("");
    try {
      const nextReport = runEvaluationSuite(evaluationScenarioPack, () => performance.now());
      const nextComparison = projectEvaluationComparison(
        nextReport,
        evaluationScenarioPack,
        evaluationComparisonFixture,
      );
      setEvaluation({ report: nextReport, comparison: nextComparison });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The local evaluation could not run.");
    }
  };

  useEffect(() => {
    run();
  }, []);

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <a className={styles.wordmark} href="/">Andhrím <span>Agent or Not?</span></a>
        <nav aria-label="Evaluation navigation">
          <a href="/">Assessment</a>
          <a aria-current="page" href="/evaluation">Evaluation Lab</a>
        </nav>
      </header>

      <section className={styles.hero} aria-labelledby="evaluation-title">
        <div>
          <p className={styles.eyebrow}>Local evaluation surface</p>
          <h1 id="evaluation-title">Test the boundaries, not the story.</h1>
          <p className={styles.lede}>
            Run deterministic fixtures against the same strict receipt, approved-guidance,
            and product-event schemas used by the prototype. A passing adversarial case means
            the expected rejection or recovery behavior was observed.
          </p>
        </div>
        <div className={styles.runPanel}>
          <div className={styles.boundaries} aria-label="Evaluation boundaries">
            <span>Fixture only</span>
            <span>No provider calls</span>
            <span>No product writes</span>
          </div>
          <button className={styles.runButton} type="button" onClick={run}>
            Run deterministic suite
          </button>
          <p>This action executes local in-memory checks only. It does not inspect credentials.</p>
        </div>
      </section>

      {error ? <p className={styles.error} role="alert">{error}</p> : null}

      {report ? (
        <>
          <section className={styles.metrics} aria-labelledby="metrics-heading" aria-live="polite">
            <div className={styles.sectionHeading}>
              <div>
                <p className={styles.eyebrow}>Latest local run</p>
                <h2 id="metrics-heading">Evaluation summary</h2>
              </div>
              <span className={report.failed === 0 ? styles.overallPass : styles.overallFail}>
                {report.failed === 0 ? "All expectations passed" : `${report.failed} expectation failures`}
              </span>
            </div>
            <dl className={styles.metricGrid}>
              <div><dt>Run count</dt><dd>{report.runCount}</dd></div>
              <div><dt>Pass / fail</dt><dd>{report.passed} / {report.failed}</dd></div>
              <div><dt>Retries</dt><dd>{report.retries}</dd></div>
              <div><dt>Validation failures</dt><dd>{report.validationFailures}</dd></div>
              <div><dt>Latency</dt><dd>{formatLatency(report.latency.totalMs)}</dd><small>{formatLatency(report.latency.meanMs)} mean · local execution</small></div>
              <div><dt>Cost</dt><dd className={styles.cost}>{report.cost}</dd><small>Fixture mode does not provide cost evidence.</small></div>
            </dl>
            <p className={styles.telemetryNote}>
              Evaluation data: {report.dataSource}. These measurements describe this browser run;
              they are not production telemetry or a performance benchmark.
            </p>
          </section>

          {comparison ? <EvaluationComparisonGraph projection={comparison} /> : null}

          <section className={styles.scenarios} aria-labelledby="scenarios-heading">
            <div className={styles.sectionHeading}>
              <div>
                <p className={styles.eyebrow}>Adversarial scenario pack</p>
                <h2 id="scenarios-heading">What was exercised</h2>
              </div>
              <p>{report.results.length} deterministic cases</p>
            </div>
            <ol className={styles.scenarioGrid} data-testid="evaluation-scenario-list">
              {report.results.map((result) => (
                <li className={styles.scenarioCard} key={result.id}>
                  <div className={styles.cardTopline}>
                    <span>{categoryLabels[result.category]}</span>
                    <strong className={result.status === "passed" ? styles.pass : styles.fail}>
                      {result.status}
                    </strong>
                  </div>
                  <h3>{result.title}</h3>
                  <p className={styles.expectation}>{result.expectation}</p>
                  <p className={styles.observed}><b>Observed:</b> {result.observed}</p>
                  <dl className={styles.cardMetrics}>
                    <div><dt>Retries</dt><dd>{result.retries}</dd></div>
                    <div><dt>Validation failures</dt><dd>{result.validationFailures}</dd></div>
                    <div><dt>Latency</dt><dd>{formatLatency(result.latencyMs)}</dd></div>
                  </dl>
                  {result.validationKinds.length ? (
                    <p className={styles.validationKinds}>
                      {result.validationKinds.map((kind) => kind.replaceAll("-", " ")).join(" · ")}
                    </p>
                  ) : null}
                </li>
              ))}
            </ol>
          </section>

          <aside className={styles.futureBoundary} aria-labelledby="future-boundary-heading">
            <p className={styles.eyebrow}>Future live-run seam</p>
            <h2 id="future-boundary-heading">Deliberately unavailable here</h2>
            <p>{report.liveProvider.note}</p>
            <p>No live-provider button, implicit fallback, credential lookup, or production telemetry claim is present in this lab.</p>
          </aside>
        </>
      ) : (
        <section className={styles.loading} aria-live="polite">Preparing the deterministic scenario pack…</section>
      )}
    </main>
  );
}
