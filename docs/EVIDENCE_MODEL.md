# Evidence model

This prototype separates three kinds of information so a plausible model answer is never presented as proof of its own correctness.

## What the owner sees

The completed receipt has three views:

1. **Decision** — the model-derived recommendation, rationale, evidence, assumptions, confidence, and autonomy boundary.
2. **Work plan** — the locally editable starter pack and any owner-approved learning that changed the recommendation.
3. **Trust** — deterministic gates, replay fingerprints, and framework-observed capability provenance.

Desktop gives the receipt more space beside the outcome-learning workflow. Smaller screens stack the receipt and learning workflow, while the same three-view navigation keeps technical proof out of the primary reading path.

The Evaluation Lab is separate from the receipt. Deterministic fixtures exercise known cases, while the owner can attach an expected recommendation to any completed receipt. The resulting agreement rate is a transparent local benchmark, not a general accuracy claim.

## What is deterministic

Every new receipt records five passed gates only after code has validated:

- the strict receipt schema and semantic rules;
- the exact four-step Eve capability sequence;
- the read-only evidence path;
- the raw-outcome isolation boundary;
- the fixed two-session retry budget.

SHA-256 canonical fingerprints cover the exact provider-bound assessment input, the observed capability trace, and the original recorded receipt event. The server recomputes this evidence whenever it reads the append-only ledger. A mismatch prevents the projection from loading.

## What recovery means

Replay failure does not repair, replace, truncate, or delete the ledger. The UI stops using the failed projection and offers the unchanged NDJSON as a recovery download with a SHA-256 response header. Manual repair remains an owner action; the prototype does not guess which history should be trusted.

## Release verification

`pnpm verify:release` runs the complete provider-free qualification. Independent checks run concurrently; build-, launcher-, browser-, and smoke-dependent checks run in a fixed sequence. The command writes `output/release-verification.json` and per-check logs. It never authorizes a live provider call or forwards credential variables.

`pnpm verify:release --fast` runs only the independent checks. Reported durations describe one local run and are not a performance benchmark.

The System connection check is also deliberately narrow: it verifies the saved OpenRouter key and exact model through metadata endpoints only. It does not send assessment content and does not request an inference.

## Limits

Model confidence remains a model judgement. Passed gates establish bounded facts about this run; they do not prove the recommendation is correct, prove general model reliability, or establish production readiness. Full fingerprints remain in exports and release evidence even though the UI shortens them for readability.
