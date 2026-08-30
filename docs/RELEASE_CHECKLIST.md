# Local release checklist

## Implementer-verifiable gates

- [x] Provider-free Eve build/start, strict terminal receipt and zero callable tools.
- [x] Explicit cancellation and clean provider-free process shutdown.
- [x] Strict schemas and deterministic semantic validation.
- [x] Append-only local events and owner-approved active-rule projection.
- [x] Assessment, receipt, outcome, candidate and before/after UI.
- [x] Desktop/mobile browser flow with no non-loopback requests.
- [x] Cross-origin/no-CORS mutation and Eve session creation rejection with zero ledger/model-call effects at final source head.
- [x] Runtime-aware fixture/OpenRouter privacy disclosure and five factor-specific visible 1–5 anchors at final source head.
- [x] Persistent learning history with owner expiry/deactivation controls and retained tombstone export semantics at final source head.
- [x] Unique-port browser Eve ownership and exact zero-tool fixture-call reconciliation at final source head.
- [x] Source secret scan and direct dependency-licence evidence pass at final source head.
- [x] Dependency-free disposable-clone source audit at exact `7b3bd38aa5a2df666f954b146561e7a44ec1cbfe`: clean HEAD/tree, 68-file zero-finding secret scan, passing syntax checks, zero forbidden tracked artifacts, and only `.env.example` tracked; the licence verifier failed closed because packages were absent.
- [ ] Owner-authorize and qualify `pnpm install --frozen-lockfile --ignore-scripts` in a disposable Windows clone. This security-focused candidate may access the configured package registry and is not yet proven.
- [ ] After the frozen install, run `pnpm exec playwright install chromium`. This separately downloads Playwright `1.62.1`'s matching Chromium from Microsoft's CDN by default into `%LOCALAPPDATA%\ms-playwright`; it has not yet been run in a clean clone.
- [ ] Clean-clone transitive dependency and licence review.
- [ ] Windows clean-clone install, test, build, start and browser smoke.

Preliminary transitive inventory from the already-materialized, previously verified tree is not clean-clone evidence and does not pass the gate: 99 package roots, zero missing licence fields; 73 MIT, 16 Apache-2.0, 3 ISC, 2 MPL-2.0, and one each BSD-3-Clause, 0BSD, CC-BY-4.0, `(AFL-2.1 OR BSD-3-Clause)`, and `Apache-2.0 AND LGPL-3.0-or-later`. Notable exact roots are `@img/sharp-win32-x64` `0.35.3`, `caniuse-lite` `1.0.30001809`, `json-schema` `0.4.0`, `lightningcss` `1.33.0`, and `lightningcss-win32-x64-msvc` `1.33.0`. Reconcile compatibility and notice obligations from the disposable clean clone before checking the transitive-licence gate.

The dependency-free audit clone remains at `C:\Users\henry\AppData\Local\Temp\andhrim-agent-or-not-cleanclone-audit-7dce38ef34244cacb843333d7f990af6` because host policy rejected recursive cleanup. It contains only public committed source.

## Pending Windows qualification sequence

Run only after owner authorization, from a disposable clean clone:

```powershell
corepack enable
corepack prepare pnpm@11.18.0 --activate
pnpm install --frozen-lockfile --ignore-scripts
pnpm exec playwright install chromium
Copy-Item .env.example .env.local
pnpm test
pnpm typecheck
pnpm build
pnpm start
```

The frozen install's package-registry access and Playwright's separate Microsoft-CDN browser download are distinct network actions. Do not mark either install step, the runtime checks, or the clean-clone transitive-licence gate complete until the owner-authorized sequence passes and its evidence is recorded.

## Owner-only gates

- [ ] Copy `.env.example` to `.env.local` on the owner's machine.
- [ ] Only after every provider-free clean-clone qualification gate above passes, enter a local OpenRouter key and explicit model identifier at the latest safe checkpoint.
- [ ] Run one direct OpenRouter smoke; record only pass/fail, model identifier, timestamp and safe request-envelope facts. Never record the key or provider body.
- [ ] Remove the key from the shell/session and confirm secret scan remains clean.
- [ ] Select a public project licence. Current state is deliberately `unselected`.
- [ ] Review final dependency evidence and repository diff.
- [ ] Publish the GitHub repository, if desired.
- [ ] Record the optional install/demo video using the plan below.

## Concise install/demo recording plan

1. Start from a fresh Windows clone with no `.env.local`.
2. Show Node/pnpm versions, frozen install, tests, typecheck and production build.
3. Copy `.env.example`, keep fixture mode, and start on loopback.
4. Complete one assessment, show the strict receipt, record an outcome, and show that the candidate is inert.
5. Edit and explicitly approve the candidate, then show its bounded before/after preview and provenance on a matching later receipt.
6. Export the local ledger and show that no secret/provider body is present.
7. Stop the services and show clean process exit.

Do not show an OpenRouter key, `.env.local`, credential manager, raw provider response, unrelated desktop content or private repository data in the recording.
