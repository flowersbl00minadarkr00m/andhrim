# Andhrím — Agent or Not?

A local, owner-controlled prototype for deciding whether work should remain human-led, use AI assistance, be delegated to an agent, or be automated.

This is a non-production exploratory repository. It does not complete canonical Andhrím feature 001 or TD-022, provide autonomous learning, or authorize external action. The binding boundaries are in `PROTOTYPE_SCOPE.md`.

## What is implemented

- A five-factor delegation assessment and Recommendation Receipt UI.
- A responsive completed receipt that separates the decision, editable work plan, and progressively disclosed trust evidence on desktop and mobile.
- An Eve `0.44.0` session that must complete one bounded capability chain: load the static delegation skill, discover one allowlisted MCP connection, derive deterministic evidence with one authored tool, read approved guidance through one local MCP tool, then submit the final structured output.
- A loopback-only Python MCP server built with the official Pydantic/FastMCP stack. It returns only active, matching, owner-approved guidance provenance; it cannot write records and never receives or returns raw outcomes.
- Framework-lifecycle-derived provenance for every capability call, persisted with each recommendation and displayed on its receipt.
- Five deterministic receipt gates, bounded retry usage, and SHA-256 input/trace/output fingerprints. Verification evidence is replayed whenever the local event ledger is read and is included in local exports.
- A fail-closed recovery route that leaves an invalid ledger untouched and offers its exact NDJSON bytes for owner-led repair.
- Same-origin, Fetch Metadata, JSON-content, and unpredictable per-launch session-nonce checks on local mutation and Eve session routes.
- Strict Zod/Pydantic schemas, deterministic provider-free fixtures, append-only local NDJSON records, inert Learning Candidates, and explicit owner approval before a rule can affect later recommendations.
- Bounded edit, approve, reject, supersede, expire, export, and delete semantics.

The provider-free fixture, MCP server, Eve/Next builds, launcher behavior, full browser learning flow, and offline OpenRouter smoke preflight are tested locally. Runtime source commit `0bd5f2e7292a1713f9175c3f0691a81b38e19113` also passed the complete frozen Windows clean-clone qualification and one owner-authorized live OpenRouter smoke with `openai/gpt-4.1-mini`. That live check validates the bounded receipt path and cleanup contract; it is not a general provider-availability or production-readiness claim.

## Requirements

- Windows 11
- Node.js `24.17.0` or newer in the Node 24 line
- Corepack and pnpm `11.18.0`
- Python `3.11`–`3.14` (verified with `3.13.12`)
- `uv` (verified with `0.11.1`)
- Playwright `1.62.1`'s matching Chromium binary for browser verification

All Node and Python dependency versions are locked in `pnpm-lock.yaml` and `mcp_server/uv.lock`.

## Local installation

In PowerShell:

```powershell
corepack enable
corepack prepare pnpm@11.18.0 --activate
pnpm install --frozen-lockfile
uv sync --project mcp_server --frozen
pnpm exec playwright install chromium
Copy-Item .env.example .env.local
pnpm test
pnpm typecheck
pnpm verify:mcp
pnpm build
pnpm start
```

Open `http://127.0.0.1:3000`. The production launcher starts three loopback services: the Pydantic MCP companion, Eve, and Next.js. It derives Eve's port from the built Next.js proxy manifest and fails closed if an explicit configured port disagrees. Stop all services with Ctrl+C.

The launcher creates a fresh session nonce in memory and gives it only to the local child services. It is not written to source, `.env.local`, the event ledger, exports, screenshots, or normal logs.

## Verification

Provider-free checks:

```powershell
pnpm scan:secrets
pnpm test
pnpm typecheck
pnpm verify:licenses
pnpm verify:mcp
pnpm verify:provider-free
pnpm build
pnpm verify:start
pnpm verify:browser
pnpm verify:openrouter-smoke
```

Run the same release sequence with one machine-readable summary:

```powershell
pnpm verify:release
```

Independent gates run concurrently; checks that share build/runtime state run in order. The report is written to `output/release-verification.json`. Use `pnpm verify:release --fast` for the independent subset. See `docs/EVIDENCE_MODEL.md` for the receipt, replay, recovery, and measurement boundaries.

`verify:provider-free` and `verify:browser` run the real built Eve runtime and real local MCP server with a deterministic fixture model. Guarded processes fail on non-loopback network access. The OpenRouter command above is only an offline preflight unless the separate owner-only live flags are supplied.

## Local data and privacy boundary

Product events are append-only local NDJSON. The application atomically maintains a separate strict projection containing only active approved rules. The MCP process receives the bounded five-factor assessment, reads only that projection, and never opens the event ledger. It returns rule IDs and provenance for matching guidance, never outcome notes, corrections, rejected candidates, credentials, prompts, or provider bodies.

Learning means owner-approved rule adaptation. It is not model fine-tuning, autonomous code modification, hidden memory, or automatic promotion.

## Licence

The project source is MIT-licensed. Third-party packages retain their own terms; exact direct and current clean-clone transitive dependency evidence is documented in `docs/DEPENDENCIES.md`. Bundled or binary redistribution requires a separate audit of the actual bundle.
