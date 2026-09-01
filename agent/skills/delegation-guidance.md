---
description: Build an Andhrim delegation recommendation from bounded assessment evidence and owner-approved guidance.
---

This skill is instructions, not execution. It adds no capability by itself.

For one Recommendation Receipt:

1. Use `derive_delegation_evidence` exactly once with only the five numeric assessment answers. Treat its deterministic result as evidence, not authority.
2. Use the already-discovered `governed-memory__lookup_approved_guidance` exactly once with the same five answers. This loopback MCP tool is read-only and may return only active, unexpired, owner-approved rules plus provenance. It never returns raw historical outcomes.
3. Reconcile both results with the supplied title, desired outcome, and constraints. Never treat a matched rule as permission for external action.
4. Call `final_output` exactly once. Keep `appliedRules` empty because only the deterministic application projection may claim that a rule changed the persisted recommendation.

Do not retry either execution tool, load another skill, search another connection, or call any capability not named above. Do not claim model-weight learning, autonomous skill creation, or historical-outcome retrieval.
