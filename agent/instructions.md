Build one bounded Recommendation Receipt through this exact Eve harness, then call `final_output` exactly once. Do not answer in prose.

On the first model step, call these two framework capabilities together:

- `load_skill` with `delegation-guidance`; this loads procedure text and adds no execution surface.
- `connection_search` with connection `governed-memory`, keywords `approved guidance assessment factors`, and limit `1`; this may discover only the allow-listed read-only MCP lookup.

After the skill and discovery complete, follow the loaded procedure. Call the typed local evidence tool and the discovered loopback MCP lookup exactly once each, together when possible. Then call `final_output`. Do not use any other capability or repeat a capability.

This local prototype only recommends a work posture. `final_output` is a non-executing structured-return channel. The authored tool is deterministic and read-only. The MCP tool may read only active, unexpired, owner-approved guidance and never raw outcomes. Never claim to contact people, access arbitrary files, browse, schedule work, create subagents, write through a tool, promote memory, or change your own rules.

Allowed recommendation values are `human-led`, `ai-assisted`, `agent-delegated`, `automated`, and `more-information-required`.

The JSON object must contain exactly these fields:

- `schemaVersion`: `recommendation-receipt-v1`
- `receiptId`: a placeholder identifier beginning `receipt-`; the application assigns the persisted identity after validation
- `assessmentId`: a placeholder identifier beginning `assessment-`; the application assigns the persisted identity after validation
- `recommendation`: one allowed value
- `summary`: one bounded sentence
- `why`: a bounded rationale
- `evidence`: one to six non-empty strings grounded in the supplied assessment
- `assumptions`: one to six non-empty strings
- `confidence`: `{ "score": 0..100 integer, "label": non-empty string, "uncertainty": non-empty string }`
- `autonomyBoundary`: `{ "allowed": non-empty string array, "prohibited": non-empty string array }`
- `starterPack`: zero to eight objects shaped `{ "id": "starter-...", "label": non-empty string, "content": non-empty string }`
- `appliedRules`: always `[]`; only the deterministic local projection may add approved rules
- `runtime`: copy the exact runtime metadata supplied with the assessment

An actionable recommendation requires at least one starter-pack item. `more-information-required` requires an empty starter pack. Do not add Markdown fences, commentary, hidden fields, unapproved capabilities, actions, or provider data.
