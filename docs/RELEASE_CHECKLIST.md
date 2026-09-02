# Local release checklist

## Implementer-verifiable gates

- [x] Eve and Next production builds pass with provider access disabled.
- [x] The launcher follows the Eve port baked into the Next proxy manifest and fails closed on an explicit mismatch.
- [x] The loopback Pydantic/FastMCP companion starts, exposes only `lookup_approved_guidance`, rejects invalid input, returns no raw outcomes, and stops cleanly.
- [x] Every fixture session uses the exact bounded sequence: `load_skill`, `connection_search`, `derive_delegation_evidence`, `governed-memory__lookup_approved_guidance`, `final_output`.
- [x] Capability state budgets prevent duplicate authored-tool or MCP reads; exact lifecycle validation rejects any completed recommendation that repeats skill loading or connection discovery.
- [x] Provenance is derived from Eve action lifecycle events, strictly validated, persisted with the recommendation, and visible on the receipt.
- [x] Cancellation and provider-free process shutdown are explicit and leave no owned process or port.
- [x] Same-origin/no-CORS mutation and Eve-session creation rejection have zero ledger/model-call effects.
- [x] Strict schemas, deterministic semantic validation, append-only events, owner-approved active-rule projection, and retained tombstone export semantics pass unit tests.
- [x] The desktop/mobile browser flow covers assessment, invalid-first correction, outcome, candidate editing/approval, later MCP rule use, provenance, export, expiry, and deletion.
- [x] Provider-free guarded processes and the browser make zero non-loopback requests.
- [x] Source secret scanning and direct Node dependency-licence verification pass at current source.
- [x] MIT project licence is recorded; third-party terms remain separate.
- [x] Offline OpenRouter smoke contract/preflight passes without credential access or provider calls.
- [x] A disposable Windows clean clone of runtime source commit `0bd5f2e7292a1713f9175c3f0691a81b38e19113` passes frozen Node and Python installs plus the full sequence below.
- [x] A current transitive dependency/licence inventory replaces the historical pre-MCP inventory.

## Current provider-free sequence

Run from a disposable clone with no `.env.local`:

```powershell
corepack pnpm install --frozen-lockfile
uv sync --project mcp_server --frozen
corepack pnpm exec playwright install chromium
corepack pnpm scan:secrets
corepack pnpm test
corepack pnpm typecheck
corepack pnpm verify:licenses
corepack pnpm verify:mcp
corepack pnpm verify:provider-free
corepack pnpm build
corepack pnpm verify:start
corepack pnpm verify:browser
node scripts/verify-openrouter-smoke.mjs
node scripts/openrouter-smoke.mjs
```

The final two commands use no live flag and are provider-free preflight only. On 2026-09-01 this complete sequence passed in a clean, credential-free Windows clone at exact runtime source commit `0bd5f2e7292a1713f9175c3f0691a81b38e19113`. The Node install reported 193 packages reused and zero downloaded; Python created the exact 29-package frozen environment; matching Playwright Chromium was already present. No packet capture was performed, so the install statements are command evidence rather than proof of no network traffic.

## Owner-only gates

- [x] Only after the provider-free clean-clone gates passed, enter an OpenRouter key through the local masked GUI and keep it in memory rather than creating `.env.local`.
- [x] Supply the explicit verified model identifier `openai/gpt-4.1-mini` and authorize the documented bounded provider-data transfer.
- [x] Run the equivalent of the exact owner-only command below with `OPENROUTER_API_KEY` present only in the smoke child environment:

```powershell
node scripts/openrouter-smoke.mjs --live-openrouter --confirm-provider-data-transfer --provider openrouter --model "openai/gpt-4.1-mini"
```

- [x] Inspect ignored `output/openrouter-smoke-report.json`: `state: passed`; one strictly validated receipt; exactly three calls; classification `eve-bounded-guidance-harness-v1`; four pre-discovery and five post-discovery tool definitions; exact prepare/evidence/final sequence; loopback-only Next/Eve/MCP ports; unchanged shared dependencies; scratch removal; and zero residual owned processes or ports.
- [x] Confirm the redacted report contains no prompt, assessment, provider header, key, raw model output, outcome content, or event ledger.
- [x] Clear the key from the GUI/child environment and rerun the secret scan: 84 source files, zero findings.
- [ ] Review the current dependency evidence and repository diff.
- [ ] Publish the GitHub repository, if desired.

The owner-only OpenRouter smoke passed on 2026-09-01 against exact qualified runtime commit `0bd5f2e7292a1713f9175c3f0691a81b38e19113` with `openai/gpt-4.1-mini`. This verifies one bounded provider-backed receipt and cleanup run only. Source-only publication and bundled/binary redistribution remain separate decisions; the latter requires a new audit of the actual bundle.

## Concise install/demo recording plan

1. Start from a fresh Windows clone with no `.env.local`.
2. Show locked Node/Python installs, tests, typecheck, MCP verification, and production build.
3. Keep fixture mode, start the three loopback services, and show their health without exposing the nonce.
4. Complete one assessment and show the receipt's skill, authored-tool, and MCP provenance.
5. Record an outcome, show that its candidate is inert, then edit and explicitly approve it.
6. Run a matching assessment and show the approved rule returned through MCP with provenance and no raw outcome data.
7. Export the local ledger, stop the services, and show clean process exit.

Do not show an OpenRouter key, `.env.local`, credential manager, raw provider response, unrelated desktop content, or private repository data in the recording.
