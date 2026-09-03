# Lessons carried into the local prototype

> Supporting engineering notes. These are not claims that the full Andhrím feature or its production controls are complete.

## Reuse before reinvention

- Treat the canonical Andhrím repository as read-only source material. Reuse only code whose exact source commit, diff and verification status are recorded; copy it into this separate repository with provenance rather than coupling the repositories.
- Start from controller-accepted T1 workspace conventions and the reviewed T2 schema, validation, stream-consumption, cleanup and evidence patterns where they fit the smaller prototype.
- Useful reviewed source identities include canonical Andhrím main `203d9106ab7dd5930e495a8e78d5a2e27a48b166`, TD-021 source commit `018cfc2b765b28d7869186331395202ca51cf041`, reviewed capture candidate `1bfc47386746d0af720a1f1b294db99b04bc337f55efa099352a3aae7802dff5`, and terminal architecture event `evt-t2-r3-td021-terminal-architecture-review-sol-xhigh-01-20260829`.
- Do not copy the TD-021 deliberate thrown-sentinel acknowledgment design. Its failure is the most important negative lesson.
- Never inspect, copy from, mutate or clean the frozen TD-015 worktree.

## Runtime and evidence lessons

1. Separate ordinary source revisions from scarce live provider attempts. Static fixes do not spend the OpenRouter smoke.
2. Keep the six-hour provider-free Eve seam small: build/start, actual model request with only Eve's non-executing `final_output` schema channel, one validated receipt, cancellation and clean shutdown.
3. Use Eve's public event framing. Eve converts model exceptions to public `MODEL_CALL_FAILED`; a private thrown sentinel is not a valid positive acknowledgment.
4. Do not require an event acknowledgment before reading independently captured safe evidence. Preserve the initiating public events and bounded diagnostic until the result is classified.
5. Do not discard returned safe events when wrapping an error. Primary cause, cancellation and cleanup remain separate fields.
6. Avoid private/minified source anchors, generated-source string surgery and fake-oracle-only wrappers. Prefer documented Eve APIs such as explicit `disableTool()` sentinels and a normal provider/model boundary.
7. The verifier must stay smaller than the product path. A failing diagnostic freezes evidence; it does not automatically create another recovery ticket.
8. Low findings block only when they affect security, privacy, correctness, evidence integrity or destructive cleanup. Other Low findings are recorded for cleanup rather than consuming scarce runtime budget.
9. Never allow an executor-less model-facing tool merely because it is expected not to be called. The sole exception is Eve's reviewed `final_output` schema channel, which the harness intercepts as the terminal structured result; the actual provider request must contain exactly that channel and no action-capable tools.
10. Run the real OpenRouter smoke last, after provider-free behavior, UI, learning, clean clone and secret exclusion are deterministic.

## Learning-system lessons

- Learning is an append-only evidence flow plus an owner-controlled projection, not hidden prompt mutation.
- A model may propose a Learning Candidate; deterministic validators own the allowed shape and protected invariants.
- Promotion is always explicit. Rejected, expired, superseded or deleted candidates cannot influence later recommendations.
- Every applied rule must be visible on the Recommendation Receipt with its source outcome and version.
- Prefer a bounded rule/weight adjustment over arbitrary natural-language instructions. Never allow a lesson to add tools, external actions, provider access, privacy changes or approval bypasses.
- Record the before/after recommendation impact before approval so the owner can understand the consequence.
- Local persistence must remain inspectable and portable. Provider keys, prompts and raw provider bodies never enter learning records.

## Delivery lessons

- One repository, one isolated worktree, one fresh visible implementation owner.
- Freeze the product scope before adding polish: OpenRouter only, Windows verified, loopback only, no hosted service, no PostgreSQL, no authentication, no Telegram and no autonomous actions.
- The public README must distinguish implemented, tested and owner-smoke-required behavior.
- A demo video supports installation; the written clean-clone instructions remain authoritative.
- GitHub publication is separate from implementation and requires an explicit licence decision plus a final secret/licence/clean-tree review.
