# Local release checklist

## Implementer-verifiable gates

- [x] Provider-free Eve build/start, strict `result.completed` receipt, exactly one non-executing `final_output` schema channel, and zero action-capable tools.
- [x] Explicit cancellation and clean provider-free process shutdown.
- [x] Strict schemas and deterministic semantic validation.
- [x] Append-only local events and owner-approved active-rule projection.
- [x] Assessment, receipt, outcome, candidate and before/after UI.
- [x] Desktop/mobile browser flow with no non-loopback requests.
- [x] Cross-origin/no-CORS mutation and Eve session creation rejection with zero ledger/model-call effects at final source head.
- [x] Runtime-aware fixture/OpenRouter privacy disclosure and five factor-specific visible 1–5 anchors at final source head.
- [x] Persistent learning history with owner expiry/deactivation controls and retained tombstone export semantics at final source head.
- [x] Unique-port browser Eve ownership and exact final-output-only fixture-call reconciliation at final source head.
- [x] Source secret scan and direct dependency-licence evidence pass at final source head.
- [x] MIT project licence recorded in `LICENSE` and `package.json`; third-party dependency terms remain separate.
- [x] Dependency-free disposable-clone source audit at exact `7b3bd38aa5a2df666f954b146561e7a44ec1cbfe`: clean HEAD/tree, 68-file zero-finding secret scan, passing syntax checks, zero forbidden tracked artifacts, and only `.env.example` tracked; the licence verifier failed closed because packages were absent.
- [x] Owner-authorized `pnpm install --frozen-lockfile --ignore-scripts` qualified in the disposable Windows clone at exact commit `15a6b52fd80f22b60ab228acb00b36e37a93842b`: exit `0`, 115 packages, all reused, `downloaded 0`.
- [x] `pnpm exec playwright install chromium` qualified at the same commit: exit `0`, with Playwright `1.62.1`'s matching Chromium/headless-shell revision `1234` already present and no browser-download output.
- [x] Clean-clone transitive dependency and licence inventory reconciled for a source-only release: 115 roots, zero missing manifest licence fields and zero missing lockfile mentions. Bundled or binary redistribution remains outside this clearance.
- [x] Windows clean-clone test, typecheck, build, start, browser and provider-free smoke sequence passed at the pinned commit with zero residual qualification-owned processes.

The qualified clean-clone inventory contains 115 package roots: 85 MIT, 18 Apache-2.0, 5 ISC, 2 MPL-2.0, and one each BSD-3-Clause, 0BSD, CC-BY-4.0, `(AFL-2.1 OR BSD-3-Clause)`, and `Apache-2.0 AND LGPL-3.0-or-later`. It found no missing manifest licence fields or lockfile mentions. Packaged NOTICE records exist for Eve and the three Playwright roots. Non-simple obligations were identified for `@img/sharp-win32-x64`, `caniuse-lite`, `json-schema`, and both Lightning CSS roots; nine packages have manifest metadata but no root licence/notice file.

This inventory supports a GitHub source-only release because dependencies, `.eve`, `.next`, `.output`, Playwright and Chromium are ignored and are not redistributed. It is not legal clearance. A bundled installer, generated runtime archive, vendored `node_modules`, or browser-inclusive release requires a separate audit of the actual bundle, including Apache/Chromium notices and the obligations identified above.

The dependency-free audit clone remains at `C:\Users\henry\AppData\Local\Temp\andhrim-agent-or-not-cleanclone-audit-7dce38ef34244cacb843333d7f990af6` because host policy rejected recursive cleanup. It contains only public committed source.

## Qualified Windows provider-free sequence

The following sequence passed from the disposable Windows clone at exact commit `15a6b52fd80f22b60ab228acb00b36e37a93842b`:

```powershell
pnpm install --frozen-lockfile --ignore-scripts
pnpm exec playwright install chromium
pnpm scan:secrets
pnpm test
pnpm typecheck
pnpm verify:licenses
pnpm verify:provider-free
pnpm build
pnpm verify:start
pnpm verify:browser
node scripts/verify-openrouter-smoke.mjs
node scripts/openrouter-smoke.mjs
```

Every command exited `0`. Tests passed 6 files/23 tests; the secret scan covered 72 files with zero findings; direct licence verification covered 13 dependency records plus project MIT; provider-free receipt/cancellation, Eve/Next builds, launcher cleanup and the full browser flow passed. Both OpenRouter script invocations used no live flag and ran provider-free preflight only. The frozen install reported 115 packages, all reused and `downloaded 0`; matching Chromium was already present. No packet capture was performed, so these command observations do not prove an absence of network traffic outside the guarded runtime checks.

## Owner-only gates

- [ ] Copy `.env.example` to `.env.local` on the owner's machine.
- [ ] Only after every provider-free clean-clone qualification gate above passes, enter a local OpenRouter key and explicit model identifier at the latest safe checkpoint.
- [x] The clean-clone qualification ran `node scripts/verify-openrouter-smoke.mjs` and `node scripts/openrouter-smoke.mjs` without live flags; both provider-free preflights passed with no provider, OpenRouter, live-mode or credential-value access.
- [ ] With `OPENROUTER_API_KEY` already inherited privately by the parent shell, run exactly `node scripts/openrouter-smoke.mjs --live-openrouter --confirm-provider-data-transfer --provider openrouter --model "provider/model"` after replacing the placeholder with the explicit model identifier. Do not put the key on the command line. No flags means provider-free preflight only. Live Playwright substitutes a key-free `/api/runtime` bootstrap while exercising the real built Eve session/stream and client strict-validation path; this smoke does not qualify the shipped Next key-status/bootstrap behavior.
- [ ] Inspect ignored `output/openrouter-smoke-report.json`: require `state: passed`, one strictly validated receipt, one or two exactly reconciled Eve/model calls, `eve-final-output-only-v1`, exactly one `final_output` definition per call, zero action-capable tool definitions, zero blocked-third-session attempts, zero browser non-loopback requests, scratch removal, zero residual owned processes, zero residual ports, and no prompt/assessment/provider/header/key/raw-output/ledger content.
- [ ] Remove the key from the shell/session and confirm secret scan remains clean.
- [x] Select the MIT project licence and record the non-personal holder as Andhrím contributors.
- [ ] Review final dependency evidence and repository diff.
- [ ] Publish the GitHub repository, if desired.
- [ ] Record the optional install/demo video using the plan below.

The real OpenRouter smoke above remains owner-only, unexecuted and the latest safe checkpoint. Do not describe the provider-backed path as verified or publish the source repository before completing that smoke unless the owner explicitly re-scopes the gate. GitHub source publication remains separate; bundled or binary redistribution is not cleared by this checklist.

## Concise install/demo recording plan

1. Start from a fresh Windows clone with no `.env.local`.
2. Show Node/pnpm versions, frozen install, tests, typecheck and production build.
3. Copy `.env.example`, keep fixture mode, and start on loopback.
4. Complete one assessment, show the strict receipt, record an outcome, and show that the candidate is inert.
5. Edit and explicitly approve the candidate, then show its bounded before/after preview and provenance on a matching later receipt.
6. Export the local ledger and show that no secret/provider body is present.
7. Stop the services and show clean process exit.

Do not show an OpenRouter key, `.env.local`, credential manager, raw provider response, unrelated desktop content or private repository data in the recording.
