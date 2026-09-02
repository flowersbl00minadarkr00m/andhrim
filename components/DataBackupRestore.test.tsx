import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DataBackupRestore } from "./DataBackupRestore";

describe("DataBackupRestore", () => {
  it("renders a dedicated three-stage owner flow without exposing a restore action before validation", () => {
    const markup = renderToStaticMarkup(<DataBackupRestore sessionNonce={"a".repeat(43)} onRestore={() => undefined} />);

    expect(markup).toContain("Backup &amp; restore");
    expect(markup).toContain("1. Select and validate");
    expect(markup).toContain("2. Review dry run");
    expect(markup).toContain("3. Confirm replacement");
    expect(markup).toContain("Download validated backup");
    expect(markup).not.toContain("Confirm and replace local ledger");
  });
});
