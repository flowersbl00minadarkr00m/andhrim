# Contributing

Andhrím is a bounded local prototype. Changes should preserve its loopback-only services, strict schemas, read-only evidence path, explicit owner approval, and provider-free default.

## Development

```powershell
pnpm install --frozen-lockfile
uv sync --project mcp_server --frozen
pnpm dev
```

Do not commit `.env.local`, product data, build output, browser traces, or provider responses.

## Required checks

For focused work, run the relevant unit test and `pnpm typecheck`. Before opening or merging a pull request, run:

```powershell
pnpm exec playwright install chromium
pnpm verify:release
```

The release verifier covers secret scanning, unit tests, type checking, dependency licences, MCP behavior, the provider-free Eve path, production build and launcher, responsive browser flows, and the offline OpenRouter smoke contract.

Live provider calls are never part of ordinary CI. Do not add repository secrets or a paid-provider test to pull-request workflows.
