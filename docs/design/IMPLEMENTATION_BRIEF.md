# Implementation brief

## Product surface

Build the usable local application shown in the two approved concept references beside this file:

- `assessment-receipt-concept.png`: five-question assessment with a live Recommendation Receipt preview.
- `outcome-learning-concept.png`: completed receipt, outcome capture, inert Learning Candidate, explicit approval/rejection/editing, before/after impact and mobile stacking.

The images are visual references, not implementation evidence. All text, controls, focus states and responsive behavior must be code-native.

## Visual system

- Warm white canvas, charcoal ink typography, restrained copper accent.
- Editorial open layout with fine dividers; avoid generic dashboard cards, gradients, glass effects and decorative badges.
- Strong serif display headings paired with a highly readable sans-serif UI/body face using local/system fallbacks unless a distributable font is deliberately added and licensed.
- Minimum 44px control targets, visible keyboard focus, semantic form controls, responsive stacked layout, reduced-motion support and readable error/recovery states.

## Core flow

1. Configure local OpenRouter model/key status without exposing the key to the browser or repository.
2. Answer a bounded assessment covering outcome stakes, repeatability, specification clarity, verification cost and context sensitivity.
3. Generate a strictly validated Eve recommendation with one of `human-led`, `ai-assisted`, `agent-delegated`, `automated`, or `more-information-required`.
4. Review rationale, evidence, assumptions, confidence, autonomy boundary and an editable Work Starter Pack.
5. Record an outcome and correction.
6. Generate and validate one inert Learning Candidate.
7. Preview its before/after effect, then approve, reject or edit it.
8. Apply only approved, active rules to later assessments and show provenance on the receipt.

## Build order

1. Provider-free Eve bounded skill/authored-tool/loopback-MCP/final-output/validated-receipt seam.
2. Schemas and deterministic semantic validators.
3. Append-only local product events plus derived owner-approved rule projection.
4. Assessment and receipt UI.
5. Outcome and Learning Candidate UI/logic.
6. Deterministic tests, accessibility/responsive checks and clean shutdown.
7. Clean-clone Windows install and secret/licence checks.
8. Real OpenRouter owner smoke last.

## Non-negotiable boundaries

Follow `PROTOTYPE_SCOPE.md` and `LESSONS_LEARNED.md`. Do not modify `C:\Users\henry\andhrim`, access credentials, call OpenRouter, publish GitHub, select a licence, add hosted deployment or claim production/full-feature completion without explicit owner release.
