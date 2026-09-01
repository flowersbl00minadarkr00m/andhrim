from __future__ import annotations

import json
import os
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

from server import AssessmentAnswers, lookup_approved_guidance, read_approved_rules


ANSWERS = AssessmentAnswers(
    outcomeStakes=3,
    repeatability=4,
    specificationClarity=2,
    verificationCost=2,
    contextSensitivity=3,
)


def approved_event(*, rule_id: str = "rule-approved", candidate_id: str = "candidate-approved", expires_at: datetime) -> dict:
    now = datetime.now(timezone.utc)
    return {
        "type": "learning.approved",
        "rule": {
            "ruleId": rule_id,
            "version": 1,
            "sourceOutcomeId": "outcome-reviewed",
            "explanation": "Low specification clarity needs stronger human review.",
            "candidateId": candidate_id,
            "approvedAt": now.isoformat(),
            "reviewAt": (now + timedelta(days=14)).isoformat(),
            "expiresAt": expires_at.isoformat(),
            "active": True,
            "condition": {"factor": "specificationClarity", "operator": "lte", "threshold": 3},
            "adjustment": {"targetRecommendation": "human-led", "weightDelta": -2},
        },
    }


class GovernedMemoryTests(unittest.TestCase):
    def run_with_rules(self, rules: list[dict]):
        with tempfile.TemporaryDirectory() as directory:
            Path(directory, "approved-guidance.json").write_text(json.dumps({
                "schemaVersion": "approved-guidance-projection-v1",
                "rules": rules,
            }), encoding="utf-8")
            with patch.dict(os.environ, {"AGENT_OR_NOT_DATA_DIR": directory}, clear=False):
                return lookup_approved_guidance(ANSWERS)

    def test_returns_only_matching_approved_provenance(self):
        secret = "private correction note that must not cross the MCP boundary"
        with tempfile.TemporaryDirectory() as directory:
            Path(directory, "events.ndjson").write_text(f"not valid JSON; {secret}", encoding="utf-8")
            rule = approved_event(expires_at=datetime.now(timezone.utc) + timedelta(days=30))["rule"]
            Path(directory, "approved-guidance.json").write_text(json.dumps({
                "schemaVersion": "approved-guidance-projection-v1",
                "rules": [rule],
            }), encoding="utf-8")
            with patch.dict(os.environ, {"AGENT_OR_NOT_DATA_DIR": directory}, clear=False):
                result = lookup_approved_guidance(ANSWERS)
        serialized = result.model_dump_json()
        self.assertEqual(result.schemaVersion, "approved-guidance-v1")
        self.assertTrue(result.readOnly)
        self.assertFalse(result.historicalOutcomesRetrieved)
        self.assertEqual([rule.ruleId for rule in result.matchedRules], ["rule-approved"])
        self.assertEqual(result.inputFields, list(AssessmentAnswers.model_fields))
        self.assertNotIn(secret, serialized)

    def test_filters_expired_and_lifecycle_deactivated_rules(self):
        expired = approved_event(rule_id="rule-expired", candidate_id="candidate-expired", expires_at=datetime.now(timezone.utc) - timedelta(seconds=1))["rule"]
        inactive = approved_event(rule_id="rule-inactive", candidate_id="candidate-inactive", expires_at=datetime.now(timezone.utc) + timedelta(days=30))["rule"]
        inactive["active"] = False
        result = self.run_with_rules([expired, inactive])
        self.assertEqual(result.matchedRules, [])

    def test_rejects_invalid_approved_rule_records(self):
        with tempfile.TemporaryDirectory() as directory:
            Path(directory, "approved-guidance.json").write_text(
                json.dumps({"schemaVersion": "approved-guidance-projection-v1", "rules": [{"ruleId": "not-valid"}]}) + "\n",
                encoding="utf-8",
            )
            with patch.dict(os.environ, {"AGENT_OR_NOT_DATA_DIR": directory}, clear=False):
                with self.assertRaisesRegex(RuntimeError, "approved-guidance projection is invalid"):
                    read_approved_rules()


if __name__ == "__main__":
    unittest.main()
