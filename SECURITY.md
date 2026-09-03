# Security

## Supported use

Andhrím is a local exploratory prototype, not a hosted or multi-user service. Its web, Eve, and MCP listeners bind to loopback; local mutation routes require same-origin Fetch Metadata and an unpredictable per-launch nonce.

## Credentials

OpenRouter is optional. The setup dialog writes the selected model and key to Git-ignored `.env.local`; the key is never returned to the browser, included in prompts, written to the product ledger, or added to exports. The optional connection test calls only OpenRouter key and model-metadata endpoints and requests no inference.

This is not an encrypted credential vault. Another process or account with permission to read the project directory may be able to read `.env.local`. Remove the saved key from the System dialog when it is no longer needed and use a narrowly limited OpenRouter key.

## Local data

Assessment, receipt, outcome, label, and learning records are stored in append-only local NDJSON. Integrity replay fails closed and preserves the original bytes for owner-led recovery. Backup files may contain private assessment and outcome content; store them accordingly.

## Reporting a vulnerability

Open a private GitHub security advisory for the repository. Do not place credentials, private assessment content, or an exploitable proof of concept in a public issue.

The detailed release review is in [docs/LAUNCH_SECURITY.md](docs/LAUNCH_SECURITY.md).
