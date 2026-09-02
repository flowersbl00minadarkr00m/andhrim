"use client";

import { useState } from "react";
import type { CapabilityTrace } from "../src/domain/capabilities";
import type { RecommendationReceipt } from "../src/domain/recommendation";
import {
  createReceiptPrintDocument,
  formatReceiptDecisionBrief,
  receiptDownloadFilename,
  serializePortableReceipt,
} from "../src/domain/receipt-portability";
import type { ReceiptVerification } from "../src/domain/verification";
import styles from "./ReceiptActions.module.css";

type Props = {
  receipt: RecommendationReceipt;
  capabilityTrace?: CapabilityTrace;
  verification?: ReceiptVerification;
};

export function ReceiptActions({ receipt, capabilityTrace, verification }: Props) {
  const [status, setStatus] = useState("");
  const descriptionId = `receipt-actions-description-${receipt.receiptId}`;

  const copyDecisionBrief = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard access is unavailable.");
      await navigator.clipboard.writeText(formatReceiptDecisionBrief(receipt));
      setStatus("Decision brief copied to the clipboard.");
    } catch {
      setStatus("The decision brief could not be copied. Check this browser's clipboard permission.");
    }
  };

  const openPrintView = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      setStatus("The print view was blocked. Allow pop-ups for this loopback app and try again.");
      return;
    }

    try {
      printWindow.opener = null;
      printWindow.document.open();
      printWindow.document.write(createReceiptPrintDocument({ receipt, capabilityTrace, verification }));
      printWindow.document.close();
      printWindow.document.getElementById("print-receipt")?.addEventListener("click", () => printWindow.print());
      printWindow.focus();
      setStatus("Print-friendly receipt opened in a new tab.");
    } catch {
      printWindow.close();
      setStatus("The print view could not be opened.");
    }
  };

  const downloadReceipt = () => {
    try {
      const contents = serializePortableReceipt({ receipt, capabilityTrace, verification });
      const url = URL.createObjectURL(new Blob([contents], { type: "application/json;charset=utf-8" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = receiptDownloadFilename(receipt);
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
      setStatus("Selected receipt JSON downloaded.");
    } catch {
      setStatus("The selected receipt JSON could not be downloaded.");
    }
  };

  return (
    <section className={styles.actions} aria-labelledby="receipt-actions-heading">
      <div className={styles.intro}>
        <h3 id="receipt-actions-heading">Use this receipt</h3>
        <p id={descriptionId}>These controls use this receipt only. The separate full-ledger export remains in the primary navigation.</p>
      </div>
      <div className={styles.controls} role="group" aria-label="Selected receipt actions" aria-describedby={descriptionId}>
        <button className={styles.control} type="button" onClick={copyDecisionBrief}>Copy decision brief</button>
        <button className={styles.control} type="button" onClick={openPrintView}>Open print view</button>
        <button className={styles.control} type="button" onClick={downloadReceipt}>Download receipt JSON</button>
      </div>
      <p className={styles.status} role="status" aria-live="polite">{status}</p>
    </section>
  );
}
