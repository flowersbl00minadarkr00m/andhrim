# Launch security review

Review target: the source-only `v0.1.0` release of the local Andhrím prototype. The immutable tag and its Windows CI run identify the exact commit reviewed. This is not a certification or a claim that the prototype is suitable for hosted, multi-user, or high-sensitivity use.

## Twenty-factor review

| # | Factor | Status | Evidence and boundary |
| ---: | --- | --- | --- |
| 1 | Hide private API keys | PASS | `.env*` is ignored except `.env.example`; the key is read server-side, omitted from runtime responses, assessment payloads, ledgers, exports, and screenshots. Source and browser tests cover the boundary. |
| 2 | Purge Git secrets | PASS | `pnpm scan:secrets` checks the current tree and full available Git history without echoing matches. The release scan found no credential-shaped value. |
| 3 | Use a public client database key | NOT APPLICABLE | There is no client database or database key. |
| 4 | Enable effective row-level security | NOT APPLICABLE | There is no remotely exposed database, table, grant, or policy surface. |
| 5 | Protect sensitive data at rest and in transit | PASS | The documented threat model is an owner-controlled local device. Product records and `.env.local` are plaintext local files; backups are explicitly described as sensitive. Provider metadata and inference use HTTPS with normal certificate verification. |
| 6 | Enforce trusted-side authentication | NOT APPLICABLE | The app has no accounts and is not remotely accessible. Local mutation routes instead require same-origin metadata plus an unpredictable per-launch nonce. |
| 7 | Lock record access | NOT APPLICABLE | There are no users or tenants; the ledger is a local owner file and listeners bind to loopback. |
| 8 | Block field tampering | PASS | Strict Zod schemas allowlist request and event fields. Approval, label revision, timestamps, identifiers, and receipt verification are created or checked on the server. Invalid state transitions fail closed. |
| 9 | Secure session cookies | NOT APPLICABLE | The prototype creates no authentication or session cookie. |
| 10 | Hash passwords | NOT APPLICABLE | The prototype accepts and stores no password. |
| 11 | Rate-limit login and recovery | NOT APPLICABLE | There are no login, signup, password-reset, OTP, invite, or token-exchange routes. |
| 12 | Add bot and abuse protection | PASS | No public API exists. Local model sessions have fixed call/action budgets, explicit cancellation, replay rejection, bounded concurrency, and fail-closed lifecycle validation. |
| 13 | Parameterize queries | PASS | There is no SQL or NoSQL query surface. User input is not interpolated into a shell command; local child-process programs and arguments are fixed by the launcher. |
| 14 | Validate all input | PASS | Shared strict schemas and semantic validators cover assessment, receipt, outcome, learning, evaluation label, configuration, and restore boundaries. JSON bodies, model identifiers, strings, ranges, and collections are bounded; event actions are capped at 256 KiB. |
| 15 | Escape or safely render user content | PASS | React renders user text through text nodes; the source contains no `dangerouslySetInnerHTML`, raw HTML renderer, or executable template sink. |
| 16 | Restrict file and archive imports | PASS | Restore accepts one JSON envelope, capped at 5 MiB and 50,000 events. It rejects unknown fields, digest mismatches, invalid projection/replay, and expired one-use confirmation tokens; it does not unpack archives or accept paths. |
| 17 | Minimize API responses | PASS | Runtime/configuration/test routes return explicit redacted status objects. Errors omit provider bodies, keys, prompts, assessment content, stack traces, and private paths. Exports deliberately exclude the launch nonce and provider material. |
| 18 | Add browser security headers | NOT APPLICABLE | There is no public HTTPS deployment. The supported UI is loopback HTTP only; hosted deployment requires a separate header and CSP review. |
| 19 | Enforce HTTPS and verify TLS peers | PASS | Public traffic does not exist. The sole external origin is fixed to `https://openrouter.ai`; ordinary TLS verification remains enabled and redirects are rejected by the metadata check. |
| 20 | Scan and control dependencies | PASS | Exact Node and Python lockfiles are committed, `pnpm audit --audit-level high` reports no known vulnerability, direct/transitive licence checks are recorded, CI actions use immutable SHAs, and Dependabot is configured. |

## Additional launch risks

- **Outbound requests / SSRF — PASS.** OpenRouter connection testing uses one fixed HTTPS origin, exact metadata paths, no redirect following, an 8-second timeout, and a 256 KiB response limit. Runtime diagnostics accept loopback HTTP only. The model-facing harness exposes no web or arbitrary connection tool.
- **CORS and cross-site mutation — PASS.** Mutation routes reject cross-site/no-CORS requests and require JSON plus the per-process nonce; no permissive CORS response is configured.
- **Logs, errors, and analytics — PASS.** No analytics service is installed. Verification checks redaction and provider-free operation; public responses do not expose credentials or provider bodies.
- **Webhooks and background jobs — NOT APPLICABLE.** Neither surface exists.
- **CI and release supply chain — PASS.** The workflow token is read-only, external actions are commit-pinned, pull-request code receives no repository secret, and release qualification runs in a fresh Windows checkout.
- **Publication target — PASS.** The target is the public repository `flowersbl00minadarkr00m/andhrim`, default branch `main`; the authenticated owner and remote were checked independently before publication work.
- **Demo versus production — PASS.** Fixture receipts and evaluation traces are labelled deterministic; no hosted demo or shared paid key is offered.
- **Public repository privacy — FIXED.** Internal execution/handoff records and personal filesystem paths were removed from the current public tree. Historical paths are not credentials, but they remain in prior commits because a destructive history rewrite was neither necessary nor authorized.

## Accepted residual risk

The local key and ledger are not encrypted against another process or account that can read the project directory. This matches the declared single-owner prototype scope, is disclosed in `SECURITY.md`, and would need a credential vault plus an authenticated storage design before any hosted or multi-user release.

## Reproduce the release evidence

```powershell
pnpm install --frozen-lockfile
uv sync --project mcp_server --frozen
pnpm exec playwright install chromium
pnpm audit --audit-level high
pnpm verify:release
```

The release workflow runs the same provider-free qualification from a full-history checkout. It receives no OpenRouter credential and does not authorize a live provider call.
