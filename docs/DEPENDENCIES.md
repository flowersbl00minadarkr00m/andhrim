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

## Qualified clean-clone transitive inventory

The disposable Windows clean-clone qualification at exact source commit `15a6b52fd80f22b60ab228acb00b36e37a93842b` reconstructed 115 unique package roots. It found zero missing manifest licence fields and zero missing lockfile mentions:

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

This evidence clears the transitive-inventory gate for a GitHub source-only release because `node_modules`, `.eve`, `.next`, `.output`, Playwright and Chromium are ignored and are not redistributed. The MIT project licence applies only to project source and does not relicense third-party packages. A bundled installer, generated runtime archive, vendored dependency tree or browser-inclusive release requires a separate audit of the actual bundle, including Apache and Chromium notices, the obligations above and the nine roots lacking packaged licence files. This is an engineering assessment, not legal advice.

The qualification materialized 21,215 files totalling 474,605,647 bytes. The provider-free smoke matched pre/post SHA-256 evidence over 21,193 shared dependency files totalling 474,502,379 bytes. `pnpm install --frozen-lockfile --ignore-scripts` exited `0` with 115 packages, all reused and `downloaded 0`; no packet capture was performed, so this is bounded command evidence rather than proof of no network traffic.

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

The locked package is `@playwright/test` `1.62.1`, and a fresh Windows checkout needs that Playwright version's matching Chromium binary. The qualified installation command remains:

```powershell
pnpm exec playwright install chromium
```

[Playwright's browser documentation](https://playwright.dev/docs/browsers) states that each version needs specific browser binaries. In the clean-clone qualification this command exited `0`; matching Chromium/headless-shell revision `1234` was already present and no browser-download output occurred. On Windows the default cache is `%LOCALAPPDATA%\ms-playwright`, and the default download channel is separate from package-registry access. No packet capture was performed.
