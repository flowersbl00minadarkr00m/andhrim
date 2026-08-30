# Local release checklist

## Implementer-verifiable gates

- [x] Provider-free Eve build/start, strict terminal receipt and zero callable tools.
- [x] Explicit cancellation and clean provider-free process shutdown.
- [x] Strict schemas and deterministic semantic validation.
- [x] Append-only local events and owner-approved active-rule projection.
- [x] Assessment, receipt, outcome, candidate and before/after UI.
- [x] Desktop/mobile browser flow with no non-loopback requests.
- [x] Source secret scan and direct dependency-licence evidence pass at final source head.
- [ ] Clean-clone transitive dependency and licence review.
- [ ] Windows clean-clone install, test, build, start and browser smoke.

## Owner-only gates

- [ ] Copy `.env.example` to `.env.local` on the owner's machine.
- [ ] At the latest safe checkpoint, enter a local OpenRouter key and explicit model identifier.
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
