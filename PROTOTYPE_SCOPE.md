# Andhrím — Agent or Not? Local Prototype Scope

> Status: Non-binding prototype
> Target: Tuesday, 2026-09-01 evening
> Distribution: source code for local installation; no hosted service

## Goal

Deliver a Windows-verified local application that uses the Eve framework and the owner's OpenRouter key to produce a validated recommendation about whether work should remain human-led, use AI assistance, be delegated to an agent, or be automated. Outcomes can produce reviewable Learning Candidates; only owner-approved candidates may influence later recommendations.

This prototype is an exploratory delivery slice. It does not change or satisfy Andhrím feature `001-core-web-delegation-flow`, TD-022, or any production-readiness claim.

## Required Tuesday Outcome

- Run locally and bind only to loopback.
- Use a direct OpenRouter BYOK model selected through local configuration.
- Use Eve for the recommendation session and streaming lifecycle.
- Expose exactly one bounded Eve capability chain: native load-on-demand skill loading, allowlisted discovery of one loopback MCP connection, one deterministic read-only authored evidence tool, one read-only MCP guidance lookup, and the Eve-owned `final_output` schema channel. Disable shell, filesystem, web, delegation, scheduling, sandbox, workflow-authoring, arbitrary connection, and every other model-facing action capability.
- Validate intake, recommendation, starter pack, outcome, and Learning Candidate structures with strict Zod schemas and semantic validators inspired by Pydantic AI's typed-output and bounded-validation-retry pattern.
- Persist only local, inspectable product records: decisions, outcomes, candidate lessons, approval state, and approved rule versions.
- Let the owner label completed receipts with an expected recommendation, creating an inspectable local benchmark without sending labels to a provider.
- Require an explicit owner approval action before a Learning Candidate can affect later recommendations.
- Show which approved lessons influenced a recommendation and permit rejection, supersession, export, and deletion of prototype learning records.
- Keep the OpenRouter key outside source, prompts, learning records, screenshots, exports, and Git.
- Offer an explicit connection check that reads only OpenRouter key and model metadata, sends no assessment, and requests no inference.
- Include a tested Windows clean-clone installation path, README, example configuration, secret scan, dependency/licence record, and a concise install/demo recording plan.

## Learning Contract

“Self-learning” means outcome-conditioned, owner-approved adaptation. It is not model fine-tuning, autonomous code modification, hidden memory, or automatic promotion.

1. The owner submits a delegation question and receives a validated Recommendation Receipt.
2. The owner later records the observed outcome, rating, correction, and optional notes.
3. Eve may propose one bounded Learning Candidate containing a condition, proposed recommendation adjustment, rationale, evidence references, confidence, and expiry/review metadata.
4. Strict deterministic validation rejects unknown fields, unsupported actions, protected-invariant changes, missing evidence, and unbounded conditions.
5. The candidate remains inert until the owner explicitly approves it.
6. Approved candidates may adjust a documented scoring/rubric layer or add bounded guidance for matching future questions. The receipt identifies every applied rule and its provenance.
7. The owner may reject, supersede, export, or delete learning records. Deleted/rejected candidates cannot influence later recommendations.

## Six-Hour Go/No-Go Seam

Before expanding the UI or learning system, prove on a clean local tree:

- Eve builds and starts on loopback with a deterministic provider-free model fixture.
- The actual Eve lifecycle contains the exact bounded skill/discovery/authored-tool/MCP/final-output sequence and no unapproved tool or connection.
- One representative recommendation reaches a strict validated terminal receipt.
- Cancellation and shutdown leave no child process.
- No provider call, credential access, non-loopback egress, or persistent learning occurs during this seam.

If this seam cannot be proven within six focused hours, freeze the evidence and stop the Eve-backed Tuesday route rather than hiding Eve behind a fake wrapper or silently switching frameworks.

## Provider Ordering

The real OpenRouter smoke is intentionally the latest safe release checkpoint. Before any credential access or provider call, complete the provider-free Eve seam, schemas and semantic validators, local event/learning model, owner-approval workflow, deterministic tests, UI, clean shutdown, secret exclusion, and clean-clone setup. The owner alone supplies the local key for the final smoke. A late provider failure must not corrupt local records or erase the otherwise demonstrable provider-free product path.

## Explicit Exclusions

- Hosted deployment or Vercel runtime
- Authentication, multi-user access, or remote browser access
- PostgreSQL, pgvector, embeddings, Telegram, or general conversational memory
- Encrypted credential vault; the prototype uses documented local environment configuration
- Autonomous learning promotion, arbitrary procedural rules, external actions, subagents, web access, shell/file access, arbitrary connections, or workflows. The only allowed authored tool and connection are the deterministic read-only evidence tool and loopback approved-guidance MCP defined above.
- Production backup/restore, forensic deletion guarantees, availability guarantees, or public security certification
- Silent provider/model fallback
- Claims that the full Andhrím feature, Eve compatibility matrix, or production security/privacy contract is complete

## Release Gates

- Clean clone installs and starts on the verified Windows environment.
- No secret or credential-shaped value is tracked.
- Source and dependency licences are recorded and compatible with later public distribution.
- Core schemas, semantic validation, owner approval, rule application, rejection/supersession/deletion, exact capability sequencing, provenance, and no-unapproved-tools boundaries have deterministic tests.
- Real OpenRouter smoke is performed only by the owner with a local key and records no secret or provider body.
- Repository publication and licence choice require explicit owner authorization.
