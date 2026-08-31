# Andhrím — Agent or Not?

A local, owner-controlled prototype for deciding whether work should remain human-led, use AI assistance, be delegated to an agent, or be automated.

This is a non-production exploratory repository. It does not complete canonical Andhrím feature 001 or TD-022, provide autonomous learning, or authorize external action. The binding prototype boundaries are in [PROTOTYPE_SCOPE.md](./PROTOTYPE_SCOPE.md).

## What is implemented

- A five-factor delegation assessment and live Recommendation Receipt preview.
- Eve `0.44.0` session/stream lifecycle with all eleven framework tools explicitly disabled.
- Same-origin, Fetch Metadata, JSON-content, and unpredictable per-launch session-nonce checks on every local mutation and Eve session route.
- A strict application-boundary Zod receipt parser and a deterministic provider-free fixture.
- Inspectable append-only local NDJSON for assessments, receipts, outcomes and learning events.
- One bounded Learning Candidate per outcome. It remains inert until explicit owner approval.
- Bounded edit, approve, reject, supersede, expire, export and delete semantics.
- Visible rule/version/source-outcome provenance when an approved rule affects a later receipt.
- Five factor-specific 1–5 assessment scales plus responsive, keyboard-usable assessment, receipt, learning and persistent history/control UI.

The provider-free fixture path is qualified on Windows from a disposable clean clone at exact source commit `15a6b52fd80f22b60ab228acb00b36e37a93842b`. The direct OpenRouter BYOK runtime and its real smoke remain deliberately unexecuted until the final owner-only gate. No hosted deployment is part of this prototype.

## Licence

The project source is licensed under the [MIT License](./LICENSE), with copyright attributed to Andhrím contributors. Third-party packages retain their own licence terms; the direct dependency record and qualified clean-clone transitive inventory are in [docs/DEPENDENCIES.md](./docs/DEPENDENCIES.md).

The clean-clone inventory reconstructed 115 package roots with no missing manifest licence fields or lockfile mentions. For a GitHub source-only release, no additional third-party notice file is identified as a blocker because dependencies, generated builds, Playwright and Chromium are ignored and are not redistributed. The MIT project licence covers only this project's source. A bundled installer, generated runtime archive, vendored dependency tree or browser-inclusive distribution is not cleared and requires a separate audit of the actual bundle and its notice/source obligations. This is an engineering assessment, not legal advice.

## Requirements

- Windows 11
- Node.js `24.17.0` or newer in the Node 24 line
- Corepack and pnpm `11.18.0`
- Playwright `1.62.1`'s matching Chromium binary for browser verification

All dependency versions are exact and recorded in `pnpm-lock.yaml`. Do not substitute `npm install` or update dependencies during verification.

## Clean-clone installation

In PowerShell, from a new clone:

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

Open `http://127.0.0.1:3000`. `pnpm start` launches both built services on loopback: Eve on `127.0.0.1:4274` and Next.js on `127.0.0.1:3000`. Stop both with Ctrl+C.

The launcher creates a fresh unpredictable session nonce in memory and gives it only to the two child services. The same-origin UI obtains that nonce from the no-store runtime bootstrap and supplies it on local mutations and Eve session requests. The value is not written to source, `.env.local`, the event ledger, exports, screenshots, or normal logs.

The provider-free qualification comprised exactly the twelve commands listed immediately below and passed on Windows in the disposable clone at exact commit `15a6b52fd80f22b60ab228acb00b36e37a93842b`. Within that record, `pnpm install --frozen-lockfile --ignore-scripts` exited `0` with 115 packages, all reused and `downloaded 0`; `pnpm exec playwright install chromium` exited `0` with Playwright `1.62.1`'s Chromium/headless-shell revision `1234` already present and produced no browser-download output. These are bounded command observations, not packet-capture proof: the authorized network classes were the configured npm registry and the matching Playwright Chromium channel.

The exact provider-free qualification commands and results were:

| Command | Result |
| --- | --- |
| `pnpm install --frozen-lockfile --ignore-scripts` | Exit `0`; 115 packages, all reused, `downloaded 0` |
| `pnpm exec playwright install chromium` | Exit `0`; matching Playwright `1.62.1` Chromium/headless-shell revision `1234` present |
| `pnpm scan:secrets` | Exit `0`; 72 files, zero findings |
| `pnpm test` | Exit `0`; 6 files and 23 tests passed; zero guarded egress |
| `pnpm typecheck` | Exit `0`; guarded typecheck passed |
| `pnpm verify:licenses` | Exit `0`; 13 direct records and project MIT passed |
| `pnpm verify:provider-free` | Exit `0`; zero-tool receipt and cancellation seam passed |
| `pnpm build` | Exit `0`; Eve and Next production builds passed |
| `pnpm verify:start` | Exit `0`; loopback ports `64323`/`64324`, zero residual processes |
| `pnpm verify:browser` | Exit `0`; full browser flow passed on loopback ports `56791`–`56793` |
| `node scripts/verify-openrouter-smoke.mjs` | Exit `0`; provider-free preflight only |
| `node scripts/openrouter-smoke.mjs` | Exit `0`; same provider-free no-live-flag preflight only |

The clone and canonical `main` remained clean at the pinned commit; only ignored generated surfaces were present. The materialized tree contained 115 unique package roots, 21,215 files and 474,605,647 bytes. The smoke reconciled a matching pre/post SHA-256 over 21,193 shared dependency files and 474,502,379 bytes. No `.env.local`, retained live-smoke report, clone-owned process or occupied qualification port remained.

The source-only disposable-clone audit at exact commit `7b3bd38aa5a2df666f954b146561e7a44ec1cbfe` did not materialize packages or a browser. It confirmed a clean clone HEAD, a clean tree, 68 files with zero secret-scan findings, passing source syntax checks, zero forbidden tracked artifacts, and `.env.example` as the only tracked environment file. The licence verifier correctly failed closed because dependencies were deliberately absent. See [docs/DEPENDENCIES.md](./docs/DEPENDENCIES.md) for the evidence boundary and retained temporary-clone path.

## Local configuration

`.env.local` is ignored by Git. The checked-in example uses the fixture and contains no credential:

```dotenv
AGENT_OR_NOT_PROVIDER_MODE=fixture
OPENROUTER_MODEL=
OPENROUTER_API_KEY=
```

Do not add a key until the final documented owner smoke. A key must never be pasted into the browser, assessment, prompt, event ledger, screenshot, export, terminal transcript or Git. There is no silent provider/model fallback.

### Runtime privacy boundary

- **Fixture mode:** assessment processing stays on this computer and no model provider receives assessment content.
- **OpenRouter mode:** the case title, desired outcome, constraints, and the five numeric 1–5 factor answers are sent through OpenRouter to the selected model. The assessment ID/timestamp, outcomes, learning history, local ledger, and API key are not included in assessment content. OpenRouter and the selected model provider handle submitted content under their policies.

The key remains server-side provider configuration and is never returned by `/api/runtime` or sent in the assessment prompt.

## Commands

```powershell
pnpm test                  # strict receipt and owner-learning semantics
pnpm typecheck             # guarded TypeScript validation
pnpm build                 # guarded Eve + Next.js production build
pnpm verify:provider-free  # zero-tool Eve seam, cancellation and cleanup
node scripts/verify-openrouter-smoke.mjs # provider-free one-shot smoke preflight
node scripts/openrouter-smoke.mjs        # defaults to the same provider-free preflight
pnpm verify:browser        # loopback production browser flow and screenshots
pnpm scan:secrets          # tracked/untracked source secret-shape scan
pnpm verify:licenses       # dependency licence evidence check
pnpm start                 # loopback production services
```

The provider-free verification commands install a Node egress guard and fail on non-loopback network attempts. Browser verification also blocks and records non-loopback browser requests, chooses unique loopback web/Eve ports, proves its spawned services remain live, and reconciles exact zero-tool fixture evidence. Generated product records default to `data/events.ndjson`; `data/`, `.env*`, logs, build output and browser artifacts are ignored.

### Latest-safe owner OpenRouter smoke

`node scripts/openrouter-smoke.mjs` with no arguments runs only the deterministic provider-free preflight. It tests the complete live opt-in contract, inherited-key fail-closed behavior through the existing provider adapter, strict report redaction/schema, the two-session ceiling, zero-tool fixture correction, built Eve + Next + browser/client validation, loopback-only binding, scratch removal, and owned process/port cleanup. It does not make a provider request.

Only after every earlier provider-free clean-clone gate passes, the owner may place `OPENROUTER_API_KEY` in the private parent shell and replace the model placeholder in this exact one-shot command:

```powershell
node scripts/openrouter-smoke.mjs --live-openrouter --confirm-provider-data-transfer --provider openrouter --model "provider/model"
```

All four command conditions are mandatory. The existing Eve provider integration alone consumes and validates the inherited key; the harness never requests, prints, persists, hashes, measures, transforms, or inspects it. Build processes, Next, the browser, verifier children, and cleanup helpers receive credential-free allow-listed environments. A disposable local wrapper removes inherited entries by name and gives the live Eve runtime only the minimal Windows/Node and Agent-or-Not allowlist plus the unchanged parent key; the final Eve child inherits that verified allowlist without the harness reading the key value.

In live smoke only, Playwright substitutes a key-free `/api/runtime` bootstrap so Next never receives the key. The built Eve session and stream, real assessment UI, and client-side strict receipt-validation path remain real. This intentionally does **not** test the shipped Next key-status/bootstrap behavior, and the smoke makes no such claim. Every other non-loopback browser request is blocked.

The harness rebuilds and starts Eve and Next on fresh, distinct loopback ports; drives the real assessment UI and client-side strict receipt validator; permits exactly one correction after an invalid receipt and blocks any third session before it reaches Eve; writes product data and boundary evidence only to a disposable scratch directory; stops every owned process; proves both ports are released; and removes the scratch directory.

The only retained live artifact is ignored `output/openrouter-smoke-report.json`. Its strict schema contains safe classification and cleanup facts plus only these model-boundary fields: timestamp, explicit model identifier, call index, and zero tool definitions. It cannot contain prompts, assessments, provider request/response bodies, headers, key material, raw output, or ledger content. This repository does not claim that live mode has been run.

Never run `pnpm`, `npm`, `yarn`, `npx`, or Corepack through this worktree's shared `node_modules` junction. A package-manager command can materialize or rewrite the junction target even when the repository diff looks unchanged. Use the direct `node` commands above for this prepared smoke route; package installation belongs only in the separately authorized disposable clean-clone qualification.

## Local request security boundary

Loopback binding is not treated as authorization. Browser-triggered mutations require a loopback origin, `Sec-Fetch-Site: same-origin`, `application/json`, and the per-launch nonce. Eve applies the nonce and fetch-metadata checks at its channel boundary before session creation; the Next event API applies them before reading or appending an event. Cross-origin no-CORS-style requests therefore fail without ledger mutation or Eve model/session work.

This is a drive-by browser defense for a single-owner local prototype, not multi-user authentication or protection from a hostile process running as the same operating-system user. The prototype remains unsuitable for remote exposure.

## Data and learning

The ledger is newline-delimited JSON. Projection is deterministic: proposed candidates are inert, only approved and unexpired rules can apply, and rejected/superseded/expired/deleted candidates are inactive. The persistent Learning history surface remains available after **New case**, shows candidate/rule provenance, and lets the owner expire an approved rule or deactivate a candidate.

Deactivation writes a deletion tombstone and disables the rule. It does **not** erase append-only history: the candidate, prior revisions, provenance, and tombstone remain visible in export. No forensic erasure claim is made. Export contains no provider key or raw provider body.

## Release status

Qualified on Windows at exact commit `15a6b52fd80f22b60ab228acb00b36e37a93842b`: frozen ignored-scripts install, matching Chromium availability, secret scan, unit tests, typecheck, direct and transitive licence inventory, provider-free Eve/no-tools receipt and cancellation, Eve/Next builds, launcher cleanup, and the desktop/mobile browser flow. OpenRouter/provider/live calls and credential-value access were all zero.

Still gated: the latest-safe real OpenRouter owner smoke remains unexecuted and must stay last before any publication decision unless the owner explicitly re-scopes that gate. Final owner dependency/repository-diff review, optional GitHub source publication and optional demo recording also remain owner actions. Bundled or binary redistribution is not cleared. See [docs/RELEASE_CHECKLIST.md](./docs/RELEASE_CHECKLIST.md) and the append-only [EXECUTION.md](./EXECUTION.md) for exact evidence.
