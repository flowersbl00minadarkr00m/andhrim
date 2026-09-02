"use client";

import { useState } from "react";
import type { ProductProjection } from "@/src/domain/learning";
import type { BackupValidationReport } from "@/src/server/ledger-backup";
import styles from "./DataBackupRestore.module.css";

const MAX_SELECTED_BACKUP_BYTES = 5 * 1024 * 1024;

type PreRestoreRecovery = {
  identifier: string;
  storageReference: string;
  downloadUrl: string;
  sha256: string;
  byteLength: number;
};

type ValidationResponse = {
  report?: BackupValidationReport;
  validationToken?: string;
  expiresAt?: string;
  error?: string;
};

type RestoreResponse = {
  projection?: ProductProjection;
  restoredEventCount?: number;
  preRestoreRecovery?: PreRestoreRecovery;
  error?: string;
};

function filenameFromDisposition(value: string | null, fallback: string) {
  const match = value?.match(/filename=(?:"([^"]+)"|([^;]+))/iu);
  return match?.[1]?.trim() || match?.[2]?.trim() || fallback;
}

async function downloadWithSession(url: string, sessionNonce: string, fallbackFilename: string) {
  const response = await fetch(url, {
    cache: "no-store",
    headers: { "x-agent-or-not-session": sessionNonce },
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(payload.error ?? "The local download could not be created.");
  }
  const blobUrl = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = blobUrl;
  link.download = filenameFromDisposition(response.headers.get("content-disposition"), fallbackFilename);
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(blobUrl);
}

export function DataBackupRestore({
  sessionNonce,
  onRestore,
}: {
  sessionNonce?: string;
  onRestore: (projection: ProductProjection) => void;
}) {
  const [selectedFile, setSelectedFile] = useState<File>();
  const [report, setReport] = useState<BackupValidationReport>();
  const [validationToken, setValidationToken] = useState("");
  const [validationExpiresAt, setValidationExpiresAt] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState<"backup" | "validate" | "restore" | "recovery">();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [recovery, setRecovery] = useState<PreRestoreRecovery>();

  const resetValidation = () => {
    setReport(undefined);
    setValidationToken("");
    setValidationExpiresAt("");
    setConfirmed(false);
    setRecovery(undefined);
    setMessage("");
    setError("");
  };

  const createBackup = async () => {
    if (!sessionNonce) return;
    setBusy("backup");
    setError("");
    setMessage("");
    try {
      await downloadWithSession("/api/data/backup", sessionNonce, "andhrim-agent-or-not-backup-v1.json");
      setMessage("Validated backup downloaded. Its digest covers the ordered event ledger and safe backup metadata.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The local backup could not be downloaded.");
    } finally {
      setBusy(undefined);
    }
  };

  const validateSelectedBackup = async () => {
    if (!selectedFile || !sessionNonce) return;
    resetValidation();
    setBusy("validate");
    try {
      if (selectedFile.size > MAX_SELECTED_BACKUP_BYTES) {
        throw new Error("The selected backup exceeds the local 5 MiB upload limit.");
      }
      let backup: unknown;
      try {
        backup = JSON.parse(await selectedFile.text()) as unknown;
      } catch {
        throw new Error("The selected backup is malformed JSON.");
      }
      const response = await fetch("/api/data/restore/validate", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-agent-or-not-session": sessionNonce,
        },
        body: JSON.stringify({ backup }),
      });
      const payload = await response.json() as ValidationResponse;
      if (payload.report) setReport(payload.report);
      if (!response.ok || !payload.report?.canRestore || !payload.validationToken || !payload.expiresAt) {
        if (!payload.report) throw new Error(payload.error ?? "The backup failed validation.");
        return;
      }
      setValidationToken(payload.validationToken);
      setValidationExpiresAt(payload.expiresAt);
      setMessage("Validation passed. The local ledger was not changed; confirmation is bound to this exact upload.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The backup could not be validated.");
    } finally {
      setBusy(undefined);
    }
  };

  const confirmRestore = async () => {
    if (!sessionNonce || !validationToken || !confirmed) return;
    setBusy("restore");
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/data/restore/confirm", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-agent-or-not-session": sessionNonce,
        },
        body: JSON.stringify({ validationToken }),
      });
      const payload = await response.json() as RestoreResponse;
      if (!response.ok || !payload.projection || !payload.preRestoreRecovery) {
        throw new Error(payload.error ?? "The validated backup could not be restored.");
      }
      setValidationToken("");
      setConfirmed(false);
      setRecovery(payload.preRestoreRecovery);
      setMessage(`Restore completed atomically with ${payload.restoredEventCount ?? 0} ordered events. The pre-restore recovery remains available below.`);
      onRestore(payload.projection);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The validated backup could not be restored.");
    } finally {
      setBusy(undefined);
    }
  };

  const downloadRecovery = async () => {
    if (!sessionNonce || !recovery) return;
    setBusy("recovery");
    setError("");
    try {
      await downloadWithSession(recovery.downloadUrl, sessionNonce, `${recovery.identifier}.ndjson`);
      setMessage("Pre-restore recovery downloaded with its original ledger bytes unchanged.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The pre-restore recovery could not be downloaded.");
    } finally {
      setBusy(undefined);
    }
  };

  const visibleRecordCounts = report
    ? Object.entries(report.recordCountsByEventType).filter(([, count]) => count > 0)
    : [];

  return (
    <section className={styles.panel} id="data" aria-labelledby="data-heading">
      <div className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>Local data</p>
          <h2 id="data-heading">Backup &amp; restore</h2>
          <p>Create a validated portable backup, inspect an import without mutation, then explicitly confirm complete ledger replacement.</p>
        </div>
        <button className="button" type="button" onClick={() => { void createBackup(); }} disabled={!sessionNonce || busy !== undefined}>
          {busy === "backup" ? "Creating backup…" : "Download validated backup"}
        </button>
      </div>

      <div className={styles.restoreGrid}>
        <div>
          <h3>1. Select and validate</h3>
          <p className={styles.help}>JSON only, up to 5 MiB. Validation checks version, canonical digest, strict events, identities, event order, and projection rebuildability without touching the ledger.</p>
          <label className={styles.fileLabel}>
            <span>Backup file</span>
            <input
              type="file"
              accept="application/json,.json"
              onChange={(event) => {
                setSelectedFile(event.target.files?.[0]);
                resetValidation();
              }}
            />
          </label>
          <button className="button" type="button" onClick={() => { void validateSelectedBackup(); }} disabled={!selectedFile || !sessionNonce || busy !== undefined}>
            {busy === "validate" ? "Validating without mutation…" : "Validate selected backup"}
          </button>
        </div>

        <div className={styles.summary} aria-live="polite">
          <h3>2. Review dry run</h3>
          {!report ? <p className={styles.help}>No backup has been validated in this session.</p> : (
            <>
              <dl className={styles.statusGrid}>
                <div><dt>Backup version</dt><dd>{report.schemaVersion ?? "Unreadable"} · {report.supportedSchemaVersion ? "supported" : "unsupported"}</dd></div>
                <div><dt>Integrity</dt><dd>{report.integrityStatus}</dd></div>
                <div><dt>Ordered records</dt><dd>{report.eventCount ?? "unknown"}</dd></div>
                <div><dt>Strict projection</dt><dd>{report.projectionRebuildable ? "rebuildable" : "not rebuildable"}</dd></div>
              </dl>

              <div className={styles.counts}>
                <div>
                  <h4>Records by event type</h4>
                  {visibleRecordCounts.length > 0
                    ? <ul>{visibleRecordCounts.map(([type, count]) => <li key={type}><span>{type}</span><b>{count}</b></li>)}</ul>
                    : <p>None</p>}
                </div>
                <div>
                  <h4>Projected entities</h4>
                  {report.projectedEntityCounts
                    ? <ul>{Object.entries(report.projectedEntityCounts).map(([entity, count]) => <li key={entity}><span>{entity}</span><b>{count}</b></li>)}</ul>
                    : <p>Unavailable</p>}
                </div>
              </div>

              {report.duplicateEventIds.length > 0 ? <div className={styles.problem}><h4>Duplicate event IDs</h4><ul>{report.duplicateEventIds.map((id) => <li key={id}>{id}</li>)}</ul></div> : null}
              {report.conflictingEventIds.length > 0 ? <div className={styles.problem}><h4>Conflicting event IDs</h4><ul>{report.conflictingEventIds.map((id) => <li key={id}>{id}</li>)}</ul></div> : null}
              {report.errors.length > 0 ? <div className={styles.problem} role="alert"><h4>Validation errors</h4><ul>{report.errors.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul></div> : null}
              {report.warnings.length > 0 ? <div className={styles.warning}><h4>Warnings</h4><ul>{report.warnings.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul></div> : null}
            </>
          )}
        </div>

        <div>
          <h3>3. Confirm replacement</h3>
          <p className={styles.help}>Restore never merges or repairs events. It preserves the validated order and tombstones as one complete, atomic ledger replacement.</p>
          {report?.canRestore && validationToken ? (
            <>
              <label className={styles.confirmLabel}>
                <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
                <span>I approve replacing the complete local ledger with this exact validated backup.</span>
              </label>
              <button className="button button--primary" type="button" onClick={() => { void confirmRestore(); }} disabled={!confirmed || busy !== undefined}>
                {busy === "restore" ? "Creating recovery and restoring…" : "Confirm and replace local ledger"}
              </button>
              <p className={styles.expiry}>Validation token expires {new Date(validationExpiresAt).toLocaleTimeString()}.</p>
            </>
          ) : <p className={styles.help}>A restore action appears only after a supported, untampered backup passes every dry-run check.</p>}
        </div>
      </div>

      {recovery ? (
        <div className={styles.recovery}>
          <div>
            <h3>Pre-restore recovery retained</h3>
            <p><code>{recovery.identifier}</code> · {recovery.byteLength} bytes · SHA-256 <code>{recovery.sha256}</code></p>
            <p>Data-directory-relative reference: <code>{recovery.storageReference}</code>. This is a single bounded recovery file, not filesystem access.</p>
          </div>
          <button className="button" type="button" onClick={() => { void downloadRecovery(); }} disabled={busy !== undefined}>
            {busy === "recovery" ? "Downloading recovery…" : "Download pre-restore recovery"}
          </button>
        </div>
      ) : null}

      <div className={styles.messages} aria-live="polite">
        {message ? <p className={styles.success}>{message}</p> : null}
        {error ? <p className="error" role="alert">{error}</p> : null}
      </div>
    </section>
  );
}
