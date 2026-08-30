# Prototype execution record

This file is append-only durable control-plane evidence for the non-binding local prototype. It does not approve or complete canonical Andhrím feature 001 or TD-022.

## 2026-08-29 — Successor acknowledgment

```yaml
event:
  event_id: evt-agent-or-not-prototype-orchestrator-ack-20260830
  type: acknowledged
  occurred_at: 2026-08-29T22:01:34.0667419-07:00
  state: durable-fallback
  ownership:
    registry_id: andhr-m-agent-or-not-prototype
    registry_alias: andhrim-agent-or-not
    canonical_integration_checkout: C:\Users\henry\andhrim-agent-or-not
    owned_branch: codex/prototype-mvp
    owned_worktree: C:\Users\henry\andhrim-agent-or-not-worktrees\prototype-mvp
    integration_base: de00b90933e0cccbb226c01de44989b68d207693
    bootstrap_head: 937d68be19dc24dfbc7e68327c19a5618a6529a6
    handoff_head: 077c333dc8f94e3f828cf2854fa0c26184b6c129
    herdr_session: andhr-m-agent-or-not-prototype
    herdr_workspace: w1
    herdr_pane: w1:p2
    herdr_name: prototype-orchestrator
    model: gpt-5.6-sol
    effort: medium
    role: fresh visible top-level sole prototype orchestrator and implementation owner
  goal: >-
    Deliver by Tuesday, 2026-09-01 evening a Windows-verified, local-only,
    GitHub-ready source prototype built on Eve with OpenRouter BYOK, strict
    validated recommendations, and owner-approved outcome learning, without
    hosted services or action tools.
  deadline: Tuesday, 2026-09-01 evening
  protected_surfaces:
    - C:\Users\henry\andhrim and every Andhrím worktree are read-only and outside this assignment.
    - Canonical Andhrím feature 001 and TD-022 remain unchanged and incomplete.
    - The frozen TD-015 worktree will not be inspected, copied, mutated, or cleaned.
    - No credentials, OpenRouter/provider access, non-loopback egress, hosting, deployment, GitHub publication, licence choice, or demo recording occurs without its named owner gate.
    - No production-readiness, full-feature, autonomous-learning, fine-tuning, or complete security/privacy/deletion claim will be made.
  provider_ordering: >-
    Complete every provider-free release gate first. Do not inspect, request,
    print, or use an OpenRouter key until the latest safe checkpoint, when the
    owner alone performs the real local provider smoke.
  first_seam: >-
    Within six focused hours, prove Eve builds and starts on loopback with a
    deterministic provider-free fixture; the actual model request contains no
    callable tools; one representative recommendation reaches a strict validated
    terminal receipt; cancellation and shutdown leave no child process; and no
    provider call, credential access, non-loopback egress, or persistent learning occurs.
  source_handoff_event: evt-agent-or-not-prototype-orchestrator-transfer-937d68b-20260830
  return_delivery:
    state: durable-fallback
    receipt_evidence: This committed append-only EXECUTION.md event is the configured durable acknowledgment.
```

Acknowledgment: I accept the exact ownership, goal, deadline, identities, protected surfaces, provider-last ordering, and first seam above. The predecessor may cease prototype mutation. Provider-free implementation may begin only after this acknowledgment is committed by itself.

## 2026-08-29 — Provider-free execution checklist

- Mode/gate: direct, explicitly authorized non-binding prototype spike; canonical feature 001 and TD-022 remain outside scope.
- Frontier: provider-free Eve/no-tools/strict validated-receipt seam.
- Blockers: acknowledgment commit `7440f55` complete; required handoff sources and both concept images read and hash-verified.
- Assignment: `codex/prototype-mvp` in `C:\Users\henry\andhrim-agent-or-not-worktrees\prototype-mvp`, fresh visible top-level `w1:p2`, model `gpt-5.6-sol`, effort `medium`.
- Bootstrap: clean handoff head `077c333dc8f94e3f828cf2854fa0c26184b6c129`; acknowledgment head `7440f55`.
- Authority: `PROTOTYPE_SCOPE.md` SHA-256 `863c44a31f5c8806cc614da6b6a1958f30d78f523e5203331882bd170ccd17f7`; `LESSONS_LEARNED.md` SHA-256 `40ba06e8e2b256f6c723ba23271a0a0ba689b5aa872f1477d7088dc7d86410ed`; `docs/design/IMPLEMENTATION_BRIEF.md` SHA-256 `1847f44d41fb7967ee39cc510ae089009ffa237c36735d4ea831f5bf0e95502f`.
- Source provenance: Eve `0.44.0`; permitted read-only Andhrím commit `018cfc2b765b28d7869186331395202ca51cf041`, especially the provider-authored fixture, public Eve stream, explicit eleven-tool disable list, and cleanup pattern. The TD-021 thrown-sentinel acknowledgment is explicitly not reused.
- First approved seam: provider-free Eve build/start on loopback → actual model request with zero callable tools → strict validated terminal receipt; failure path is rejection of a non-empty tool envelope; cancellation/shutdown must leave no residual child.
- Owned implementation surfaces: this repository only. `C:\Users\henry\andhrim` and every Andhrím worktree remain read-only/protected; frozen TD-015 is not inspected.
- Return/evidence: append exact commands and results here. Real OpenRouter smoke, publication, licence selection, hosting, deployment, and demo video remain owner gates.

## 2026-08-29 — Dependency-boundary reconciliation

```yaml
event:
  event_id: evt-agent-or-not-dependency-boundary-reconciliation-20260830
  type: boundary-reconciled
  occurred_at: 2026-08-29T22:15:05.0353443-07:00
  provider_free_seam: not-passed
  provider_runtime_access: none
  credential_access: none
  openrouter_call: none
  conclusion: >-
    The commands were not independently packet-captured, so this record does not
    claim packet-level observation. Command arguments, npm 11.13.0 cache-mode
    implementation, npm debug logs, pnpm output, and pre-existing cache evidence
    establish that the successful package materialization was cache-only and that
    the failed resolution attempts did not download package bytes.
```

Reconciled command evidence:

1. `pnpm install --offline --frozen-lockfile=false` reported `downloaded 0` throughout and stopped with `ERR_PNPM_NO_OFFLINE_TARBALL` for `@types/node@24.10.13`. No success or seam claim resulted.
2. `npm install --offline --ignore-scripts --no-audit --no-fund` is recorded in `C:\Users\henry\AppData\Local\npm-cache\_logs\2026-08-30T05_11_43_349Z-debug-0.log` with the exact `--offline` argument. Its `http fetch GET` records are all annotated `(cache stale)` and it stopped with `ETARGET` for uncached `@ai-sdk/gateway@4.0.62`.
3. The active npm is `11.13.0` under `C:\Program Files\nodejs\node_modules\npm`. Its local `npm-registry-fetch\lib\index.js` maps `opts.offline` to cache mode `only-if-cached`. Its local `make-fetch-happen\lib\cache\index.js` throws when that mode has no cached entry and returns a cached stale entry without invoking `remote()` when one exists. Therefore the log phrase `(cache stale)` under `--offline` means a cached response, not a registry revalidation.
4. The first local-path `npm pack C:\Users\henry\andhrim\...` had no `--offline` flag, but log `2026-08-30T05_12_20_173Z-debug-0.log` shows it failed immediately with local `ENOENT` and contains no `http fetch` record.
5. `npm pack @types/node@24.13.3 --offline --pack-destination %TEMP%\agent-or-not-pnpm-seed` is recorded in log `2026-08-30T05_12_35_083Z-debug-0.log`. Its three fetch-shaped records are `(cache stale)` under the cache-only implementation above. The resulting local tarball is 461,946 bytes with SHA-512 `0e1f2f02c577ea2839c1af4e5f8a57bcc73d0f755e89b7f0db08b1d0253060e0cb0fc9e48fd52c2e3012af8f673e0fb678acf184157ebfb2fca57bd3e1eeb7f5`.
6. `pnpm store add %TEMP%\agent-or-not-pnpm-seed\types-node-24.13.3.tgz; pnpm install --offline --frozen-lockfile=false` added that explicit local file, reported `downloaded 0`, and then stopped with `ERR_PNPM_NO_OFFLINE_TARBALL` for `baseline-browser-mapping@2.11.18`.
7. Unflagged `npm cache ls ...` commands only enumerated cache keys; their debug logs contain no `http fetch` records. No package install completed and no lockfile was produced.

Boundary decision: no further dependency-manager command will be run in the provider-free phase. Existing local files, installed local package bytes, Git objects, and commands preloaded with an explicit non-loopback guard are the only permitted sources. If those are insufficient, execution stops blocked. The OpenRouter adapter may exist only as an inert manifest declaration; no adapter runtime, provider endpoint, environment credential, provider body, or key has been loaded, inspected, printed, or called.

## 2026-08-29 — Provider-free Eve seam verified

```yaml
event:
  event_id: evt-agent-or-not-provider-free-eve-seam-verified-20260830
  type: verified
  occurred_at: 2026-08-29T22:29:46.5371048-07:00
  state: provider-free-seam-passed
  scope: Eve build/start, no-tools model envelope, strict terminal receipt, cancellation, shutdown, and non-loopback guard
  provider_runtime_access: none
  credential_access: none
  openrouter_call: none
  clean_clone_gate: unresolved
```

Source/provenance applied:

- Eve `0.44.0`, AI SDK `7.0.77`, and Zod `4.4.3` are exact local bytes exposed through ignored junctions to the permitted read-only Andhrím checkout. They are execution transport, not committed dependencies or clean-clone evidence.
- Provider-authored fixture, explicit `disableTool()` sentinels, public Eve NDJSON session flow, and process-cleanup patterns derive from permitted commit `018cfc2b765b28d7869186331395202ca51cf041`.
- The TD-021 thrown-sentinel acknowledgment was not reused. The fixture returns a normal successful model result and writes only bounded temporary envelope evidence.
- The protected canonical checkout remained clean at `main`; no Andhrím worktree was mutated and frozen TD-015 was not inspected.

Important failure-path evidence:

- An initial request carrying Eve `outputSchema` reached the actual fixture model with a non-empty callable tool envelope and failed closed as `PROVIDER_FREE_TOOL_ENVELOPE_PRESENT` after Eve's bounded retries. No receipt or pass was claimed.
- Resolution: remove model-facing `outputSchema`; parse the terminal JSON message through the strict Zod receipt schema at the application boundary. This preserves a zero-tool request while retaining deterministic validation.
- Eve exposes the exact inert `eve:connection-search-dynamic` resolver even with no connections. The verifier accepts only that pinned identity, requires zero declared connections and zero available/authored tools, and still inspects the actual model-call envelope.

VERIFICATION REPORT

Claim: The provider-free Eve seam builds and starts on loopback, both actual fixture calls contain zero callable tools, one strict receipt reaches `session.completed`, explicit turn cancellation reaches `turn.cancelled` then `session.waiting`, all guarded processes attempt zero non-loopback egress, and shutdown leaves no tracked process.

Command: `node scripts/verify-provider-free.mjs`

Exit code: `0`

Output summary: `provider-free-eve-verification-v1` returned `state: passed`, `recommendation: ai-assisted`, model invocations `1` and `2` each with `toolDefinitionCount: 0`, cancellation `turn.cancelled -> session.waiting`, three guarded build/start processes, `nonLoopbackAttempts: 0`, and stopped PIDs `30648`, `43960`, `80664`. Eve built `.output` successfully. The only build warning is the explicit Eve transform override of root `compilerOptions.jsx`; it does not change the agent model/tool contract.

Errors: none in the passing run.

Verdict: PASS

VERIFICATION REPORT

Claim: The strict receipt accepts the deterministic fixture and rejects unknown fields and actionable receipts without a starter pack.

Command: `node scripts/verify-unit.mjs`

Exit code: `0`

Output summary: Vitest `4.1.11` ran one file and three tests; all passed in a guarded two-process run with `nonLoopbackAttempts: 0`.

Errors: none.

Verdict: PASS

Seam boundary: this verifies only the provider-free Eve/no-tools/validated-receipt slice and its important tool-envelope and cancellation paths. It does not verify the full schemas, learning projection, UI, clean-clone installation, real OpenRouter behavior, publication, licence, deployment, or demo video.
