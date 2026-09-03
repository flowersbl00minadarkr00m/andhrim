# Dependency and licence evidence

The project source is licensed under the [MIT License](../LICENSE). That project licence does not relicense third-party packages; each dependency retains its own terms. Node dependency versions are exact in `package.json` and `pnpm-lock.yaml`; Python MCP dependency versions are exact in `mcp_server/pyproject.toml` and `mcp_server/uv.lock`.

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
| just-bash | 3.4.2 | Eve skill-workspace runtime peer | Apache-2.0 |
| @types/node | 24.13.3 | Node type declarations | MIT |
| @types/react | 19.2.18 | React type declarations | MIT |
| @types/react-dom | 19.2.4 | React DOM type declarations | MIT |
| mcp (Python) | 2.1.1 | Loopback FastMCP server/runtime | MIT |
| pydantic (Python) | 2.13.5 | Strict MCP boundary models | MIT |

Node direct-dependency evidence comes from the `license` fields in the exact locally materialized package manifests, cross-checked by `scripts/verify-licenses.mjs`. Python licence metadata is recorded by the exact installed distributions and upstream project metadata, while `uv.lock` records the complete locked graph and integrity hashes. No project licence is inferred from dependency licences.

## Current qualified clean-clone transitive inventory

On 2026-09-01 a disposable Windows clone at exact runtime source commit `0bd5f2e7292a1713f9175c3f0691a81b38e19113` passed the frozen install and complete provider-free release sequence with no `.env.local`, `OPENROUTER_API_KEY`, or `OPENROUTER_MODEL`. The clone used local Git objects without hardlinks. `corepack pnpm install --frozen-lockfile` materialized 193 exact package versions, reporting all 193 reused and zero downloaded. `uv sync --project mcp_server --frozen` created the exact 29-distribution Python environment. `corepack pnpm exec playwright install chromium` exited `0` without download output because the matching browser was already present. No packet capture was performed, so these are bounded command results rather than proof of no network traffic during dependency setup.

The full source-secret, unit, typecheck, direct-licence, real MCP, real Eve/MCP seam, Eve/Next build, launcher, browser, and two no-key OpenRouter preflight checks all exited `0`. The guarded runtime and browser checks recorded zero non-loopback attempts; the OpenRouter checks recorded zero live provider calls and zero credential reads outside the existing adapter.

The installed Node graph contains 193 package versions and no unknown licence identifiers:

| Licence expression | Package versions |
| --- | ---: |
| MIT | 144 |
| Apache-2.0 | 21 |
| ISC | 12 |
| BSD-3-Clause | 5 |
| MPL-2.0 | 2 |
| Apache-2.0 AND LGPL-3.0-or-later | 1 |
| BSD-2-Clause | 1 |
| CC-BY-4.0 | 1 |
| (MIT OR WTFPL) | 1 |
| (AFL-2.1 OR BSD-3-Clause) | 1 |
| BlueOak-1.0.0 | 1 |
| LGPL-3.0 | 1 |
| (BSD-2-Clause OR MIT OR Apache-2.0) | 1 |
| 0BSD | 1 |

Eight Node package versions carry expressions that need explicit attention when their bytes are redistributed: `@img/sharp-win32-x64` `0.35.3` (`Apache-2.0 AND LGPL-3.0-or-later`), `caniuse-lite` `1.0.30001809` (`CC-BY-4.0`), `expand-template` `2.0.3` (`MIT OR WTFPL`), `json-schema` `0.4.0` (`AFL-2.1 OR BSD-3-Clause`), `lightningcss` and `lightningcss-win32-x64-msvc` `1.33.0` (`MPL-2.0`), `node-liblzma` `2.2.0` (`LGPL-3.0`), and `rc` `1.2.8` (`BSD-2-Clause OR MIT OR Apache-2.0`). The inventory is suitable evidence for publishing this source-only repository; it is not approval to redistribute installed dependency trees or generated bundles.

Of the 193 Node package versions, 182 include a root licence, notice, copying, or third-party file. Eleven declare a manifest licence but do not package one of those root files: `@ai-sdk/provider-utils`, `drizzle-orm`, `@next/env`, `@next/swc-win32-x64-msvc`, `@nodable/entities`, `@rolldown/binding-win32-x64-msvc`, `@tokenizer/token`, `client-only`, `pg-types`, `pgpass`, and `stackback`. Eve and the three Playwright roots package NOTICE records; the Playwright runtime roots also package third-party notices.

The installed Python graph contains 29 distributions, no unknown licence identifiers, and a packaged licence file for every distribution:

| Licence expression | Distributions |
| --- | ---: |
| MIT | 15 |
| BSD-3-Clause | 8 |
| Apache-2.0 | 2 |
| Apache-2.0 OR BSD-3-Clause | 1 |
| MIT-0 | 1 |
| PSF | 1 |
| PSF-2.0 | 1 |

This current inventory replaces the pre-MCP inventory as the source-publication gate. A bundled installer, generated runtime archive, vendored dependency tree, or browser-inclusive release still requires a separate audit of the actual redistributed bytes and applicable notice/source obligations. This is an engineering assessment, not legal advice.

## Historical qualified clean-clone transitive inventory

The disposable Windows clean-clone qualification at exact source commit `15a6b52fd80f22b60ab228acb00b36e37a93842b` reconstructed 115 unique package roots. It predates the bounded skill/MCP implementation, `just-bash`, and the Python environment, so it is historical evidence rather than qualification of the current source. It found zero missing manifest licence fields and zero missing lockfile mentions:

| Licence expression | Package roots |
| --- | ---: |
| MIT | 85 |
| Apache-2.0 | 18 |
| ISC | 5 |
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

Packaged NOTICE records exist for Eve and the three Playwright roots. Nine roots have manifest licence metadata but no root licence/notice file. Non-simple obligations were identified for `@img/sharp-win32-x64` `0.35.3`, `caniuse-lite` `1.0.30001809`, `json-schema` `0.4.0`, `lightningcss` `1.33.0`, and `lightningcss-win32-x64-msvc` `1.33.0`.

This historical evidence cleared the transitive-inventory gate for that earlier source revision only and has now been superseded by the current inventory above. The MIT project licence applies only to project source and does not relicense third-party packages.

The qualification materialized 21,215 files totalling 474,605,647 bytes. The provider-free smoke matched pre/post SHA-256 evidence over 21,193 shared dependency files totalling 474,502,379 bytes. `pnpm install --frozen-lockfile --ignore-scripts` exited `0` with 115 packages, all reused and `downloaded 0`; no packet capture was performed, so this is bounded command evidence rather than proof of no network traffic.

## Historical dependency-free disposable-clone audit

The disposable source audit used exact clone HEAD `7b3bd38aa5a2df666f954b146561e7a44ec1cbfe` and found:

- clean clone HEAD and clean worktree;
- 68 files scanned with zero secret findings;
- source syntax checks passed;
- forbidden tracked artifact count `0`;
- `.env.example` was the only tracked environment file; and
- the licence verifier failed closed because packages were deliberately not materialized.

That disposable clone contained only public committed source. This audit did not run a package-manager command, install dependencies, download Playwright Chromium, or pass the clean-clone installation or transitive-licence gates.

## Browser binary boundary

The locked package is `@playwright/test` `1.62.1`, and a fresh Windows checkout needs that Playwright version's matching Chromium binary. The qualified installation command remains:

```powershell
pnpm exec playwright install chromium
```

[Playwright's browser documentation](https://playwright.dev/docs/browsers) states that each version needs specific browser binaries. In the current clean-clone qualification this command exited `0`; matching Chromium/headless-shell revision `1234` was already present and no browser-download output occurred. On Windows the default cache is `%LOCALAPPDATA%\ms-playwright`, and the default download channel is separate from package-registry access. No packet capture was performed.
