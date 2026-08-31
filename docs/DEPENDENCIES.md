# Dependency and licence evidence

The project source is licensed under the [MIT License](../LICENSE). That project licence does not relicense third-party packages; each dependency retains its own terms. Dependency versions are exact in `package.json` and `pnpm-lock.yaml`.

| Package | Version | Role | Licence |
| --- | ---: | --- | --- |
| eve | 0.44.0 | Local agent/session runtime | Apache-2.0 |
| ai | 7.0.77 | Model interface | Apache-2.0 |
| @openrouter/ai-sdk-provider | 3.0.0 | Final owner-gated direct provider adapter | Apache-2.0 |
| zod | 4.4.3 | Strict runtime validation | MIT |
| next | 16.3.2 | Local web application | MIT |
| react | 19.2.8 | UI runtime | MIT |
| react-dom | 19.2.8 | DOM renderer | MIT |
| typescript | 5.9.2 | Compiler | Apache-2.0 |
| vitest | 4.1.11 | Deterministic tests | MIT |
| @playwright/test | 1.62.1 | Browser verification | Apache-2.0 |
| @types/node | 24.13.3 | Node type declarations | MIT |
| @types/react | 19.2.18 | React type declarations | MIT |
| @types/react-dom | 19.2.4 | React DOM type declarations | MIT |

Direct-dependency evidence source: the `license` fields in the exact locally materialized package manifests, cross-checked by `scripts/verify-licenses.mjs`. Transitive packages and integrity hashes are recorded by the lockfile. No project licence is inferred from dependency licences.

## Preliminary transitive inventory

A read-only inventory of the already-materialized, previously verified dependency tree found 99 package roots and zero missing licence fields:

| Licence expression | Package roots |
| --- | ---: |
| MIT | 73 |
| Apache-2.0 | 16 |
| ISC | 3 |
| MPL-2.0 | 2 |
| BSD-3-Clause | 1 |
| 0BSD | 1 |
| CC-BY-4.0 | 1 |
| (AFL-2.1 OR BSD-3-Clause) | 1 |
| Apache-2.0 AND LGPL-3.0-or-later | 1 |

The notable exact package roots in that inventory include:

- `@img/sharp-win32-x64` `0.35.3`
- `caniuse-lite` `1.0.30001809`
- `json-schema` `0.4.0`
- `lightningcss` `1.33.0`
- `lightningcss-win32-x64-msvc` `1.33.0`

This is preliminary read-only evidence from an existing dependency tree, explicitly not clean-clone evidence. Licence compatibility and notice obligations still need to be reconciled from the disposable clean clone after the owner authorizes dependency and browser materialization. The transitive-licence release gate remains unpassed.

## Dependency-free disposable-clone audit

The disposable source audit used exact clone HEAD `7b3bd38aa5a2df666f954b146561e7a44ec1cbfe` and found:

- clean clone HEAD and clean worktree;
- 68 files scanned with zero secret findings;
- source syntax checks passed;
- forbidden tracked artifact count `0`;
- `.env.example` was the only tracked environment file; and
- the licence verifier failed closed because packages were deliberately not materialized.

The temporary clone remains at `C:\Users\henry\AppData\Local\Temp\andhrim-agent-or-not-cleanclone-audit-7dce38ef34244cacb843333d7f990af6` because host policy rejected recursive cleanup. It contains only public committed source. This audit did not run a package-manager command, install dependencies, download Playwright Chromium, or pass the clean-clone installation or transitive-licence gates.

## Browser binary boundary

The locked package is `@playwright/test` `1.62.1`, but a fresh Windows checkout also needs that Playwright version's matching Chromium binary. After the owner-authorized frozen package install, run:

```powershell
pnpm exec playwright install chromium
```

[Playwright's browser documentation](https://playwright.dev/docs/browsers) states that each version needs specific browser binaries. On Windows the default browser cache is `%LOCALAPPDATA%\ms-playwright`; the default browser download comes from Microsoft's CDN and is separate from package-registry access used to materialize JavaScript dependencies. This command has not been run in a clean clone for release qualification.
