# Dependency and licence evidence

The project licence is intentionally unselected; public distribution is an owner gate. Dependency versions are exact in `package.json` and `pnpm-lock.yaml`.

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

Evidence source: the `license` fields in the exact locally materialized package manifests, cross-checked by `scripts/verify-licenses.mjs`. Transitive packages and integrity hashes are recorded by the lockfile. No project licence is inferred from dependency licences.
