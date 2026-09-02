import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { fixtureReceipt } from "../agent/lib/fixture-receipt";
import { ReceiptActions } from "./ReceiptActions";

describe("ReceiptActions", () => {
  it("renders three labelled receipt-scoped controls and an announced status region", () => {
    const markup = renderToStaticMarkup(<ReceiptActions receipt={fixtureReceipt} />);

    expect(markup).toContain("Use this receipt");
    expect(markup).toContain("Copy decision brief");
    expect(markup).toContain("Open print view");
    expect(markup).toContain("Download receipt JSON");
    expect(markup).toContain('role="group"');
    expect(markup).toContain('aria-label="Selected receipt actions"');
    expect(markup).toContain('role="status"');
    expect(markup).toContain('aria-live="polite"');
    expect(markup).toContain("separate full-ledger export remains in the primary navigation");
  });
});
