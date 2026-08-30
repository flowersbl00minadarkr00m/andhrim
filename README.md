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

The deterministic fixture path is verified on Windows. The direct OpenRouter BYOK runtime and its real smoke are deliberately withheld until the final owner-only gate. No hosted deployment is part of this prototype.

## Requirements

- Windows 11
- Node.js `24.17.0` or newer in the Node 24 line
- Corepack and pnpm `11.18.0`
- A local Chromium installed by Playwright for browser verification

All dependency versions are exact and recorded in `pnpm-lock.yaml`. Do not substitute `npm install` or update dependencies during verification.

## Clean-clone installation

In PowerShell, from a new clone:

```powershell
corepack enable
corepack prepare pnpm@11.18.0 --activate
pnpm install --frozen-lockfile
Copy-Item .env.example .env.local
pnpm test
pnpm typecheck
pnpm build
pnpm start
```

Open `http://127.0.0.1:3000`. `pnpm start` launches both built services on loopback: Eve on `127.0.0.1:4274` and Next.js on `127.0.0.1:3000`. Stop both with Ctrl+C.

The launcher creates a fresh unpredictable session nonce in memory and gives it only to the two child services. The same-origin UI obtains that nonce from the no-store runtime bootstrap and supplies it on local mutations and Eve session requests. The value is not written to source, `.env.local`, the event ledger, exports, screenshots, or normal logs.

The install command may use the package registry in an ordinary owner-run clean clone. In the current implementation session it was intentionally not executed after the owner imposed a no-dependency-command boundary, so clean-clone installation remains an explicit unpassed gate in `EXECUTION.md`.

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
pnpm verify:browser        # loopback production browser flow and screenshots
pnpm scan:secrets          # tracked/untracked source secret-shape scan
pnpm verify:licenses       # dependency licence evidence check
pnpm start                 # loopback production services
```

The provider-free verification commands install a Node egress guard and fail on non-loopback network attempts. Browser verification also blocks and records non-loopback browser requests, chooses unique loopback web/Eve ports, proves its spawned services remain live, and reconciles exact zero-tool fixture evidence. Generated product records default to `data/events.ndjson`; `data/`, `.env*`, logs, build output and browser artifacts are ignored.

## Local request security boundary

Loopback binding is not treated as authorization. Browser-triggered mutations require a loopback origin, `Sec-Fetch-Site: same-origin`, `application/json`, and the per-launch nonce. Eve applies the nonce and fetch-metadata checks at its channel boundary before session creation; the Next event API applies them before reading or appending an event. Cross-origin no-CORS-style requests therefore fail without ledger mutation or Eve model/session work.

This is a drive-by browser defense for a single-owner local prototype, not multi-user authentication or protection from a hostile process running as the same operating-system user. The prototype remains unsuitable for remote exposure.

## Data and learning

The ledger is newline-delimited JSON. Projection is deterministic: proposed candidates are inert, only approved and unexpired rules can apply, and rejected/superseded/expired/deleted candidates are inactive. The persistent Learning history surface remains available after **New case**, shows candidate/rule provenance, and lets the owner expire an approved rule or deactivate a candidate.

Deactivation writes a deletion tombstone and disables the rule. It does **not** erase append-only history: the candidate, prior revisions, provenance, and tombstone remain visible in export. No forensic erasure claim is made. Export contains no provider key or raw provider body.

## Release status

Verified locally: provider-free Eve/no-tools seam, guarded same-origin/session-nonce mutation boundary, strict schemas and six-item provider contract, factor-specific scales, learning projection and persistent owner controls, production builds, unique-port loopback browser flow, responsive screenshots, local export, process cancellation and documented launcher shutdown.

Still gated: Windows clean-clone install, direct OpenRouter owner smoke, public licence selection, GitHub publication and demo-video recording. See [docs/RELEASE_CHECKLIST.md](./docs/RELEASE_CHECKLIST.md) and the append-only [EXECUTION.md](./EXECUTION.md) for exact evidence.
