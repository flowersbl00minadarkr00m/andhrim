from __future__ import annotations

import argparse
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Annotated, Literal

from mcp.server import MCPServer
from pydantic import BaseModel, ConfigDict, Field


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class AssessmentAnswers(StrictModel):
    outcomeStakes: Annotated[int, Field(ge=1, le=5)]
    repeatability: Annotated[int, Field(ge=1, le=5)]
    specificationClarity: Annotated[int, Field(ge=1, le=5)]
    verificationCost: Annotated[int, Field(ge=1, le=5)]
    contextSensitivity: Annotated[int, Field(ge=1, le=5)]


class RuleCondition(StrictModel):
    factor: Literal[
        "outcomeStakes",
        "repeatability",
        "specificationClarity",
        "verificationCost",
        "contextSensitivity",
    ]
    operator: Literal["gte", "lte", "eq"]
    threshold: Annotated[int, Field(ge=1, le=5)]


class RuleAdjustment(StrictModel):
    targetRecommendation: Literal[
        "human-led",
        "ai-assisted",
        "agent-delegated",
        "automated",
        "more-information-required",
    ]
    weightDelta: Annotated[int, Field(ge=-2, le=2)]


class ApprovedRule(StrictModel):
    ruleId: Annotated[str, Field(pattern=r"^rule-[a-z0-9-]+$")]
    version: Annotated[int, Field(gt=0)]
    sourceOutcomeId: Annotated[str, Field(pattern=r"^outcome-[a-z0-9-]+$")]
    explanation: Annotated[str, Field(min_length=1, max_length=240)]
    candidateId: Annotated[str, Field(pattern=r"^candidate-[a-z0-9-]+$")]
    approvedAt: datetime
    reviewAt: datetime
    expiresAt: datetime
    active: bool
    condition: RuleCondition
    adjustment: RuleAdjustment


class MatchedGuidance(StrictModel):
    ruleId: str
    version: int
    sourceOutcomeId: str
    explanation: str
    targetRecommendation: str
    weightDelta: int


class GuidanceLookup(StrictModel):
    schemaVersion: Literal["approved-guidance-v1"]
    boundary: Literal["loopback-mcp"]
    readOnly: Literal[True]
    historicalOutcomesRetrieved: Literal[False]
    inputFields: list[str]
    matchedRules: list[MatchedGuidance]


class ApprovedGuidanceProjection(StrictModel):
    schemaVersion: Literal["approved-guidance-projection-v1"]
    rules: Annotated[list[ApprovedRule], Field(max_length=128)]


def data_directory() -> Path:
    configured = os.environ.get("AGENT_OR_NOT_DATA_DIR", "").strip()
    directory = Path(configured) if configured else Path.cwd() / "data"
    if configured and not directory.is_absolute():
        raise RuntimeError("AGENT_OR_NOT_DATA_DIR must be absolute.")
    return directory


def read_approved_rules() -> list[ApprovedRule]:
    projection_path = data_directory() / "approved-guidance.json"
    if not projection_path.exists():
        return []
    if projection_path.stat().st_size > 1024 * 1024:
        raise RuntimeError("The approved-guidance projection exceeds the bounded MCP read limit.")
    try:
        projection = ApprovedGuidanceProjection.model_validate_json(projection_path.read_text(encoding="utf-8"))
    except Exception as error:
        raise RuntimeError("The approved-guidance projection is invalid.") from error
    return projection.rules


def condition_matches(answers: AssessmentAnswers, condition: RuleCondition) -> bool:
    observed = getattr(answers, condition.factor)
    if condition.operator == "gte":
        return observed >= condition.threshold
    if condition.operator == "lte":
        return observed <= condition.threshold
    return observed == condition.threshold


server = MCPServer(
    "Andhrim Governed Memory",
    instructions="Read-only loopback access to active owner-approved guidance. Raw outcomes and writes are unavailable.",
)


@server.tool(name="lookup_approved_guidance")
def lookup_approved_guidance(answers: AssessmentAnswers) -> GuidanceLookup:
    """Return active, unexpired owner-approved guidance matching five bounded assessment factors."""
    now = datetime.now(timezone.utc)
    matched = []
    for rule in sorted(read_approved_rules(), key=lambda item: item.ruleId):
        expires_at = rule.expiresAt if rule.expiresAt.tzinfo else rule.expiresAt.replace(tzinfo=timezone.utc)
        if not rule.active or expires_at <= now or not condition_matches(answers, rule.condition):
            continue
        matched.append(MatchedGuidance(
            ruleId=rule.ruleId,
            version=rule.version,
            sourceOutcomeId=rule.sourceOutcomeId,
            explanation=rule.explanation,
            targetRecommendation=rule.adjustment.targetRecommendation,
            weightDelta=rule.adjustment.weightDelta,
        ))
    return GuidanceLookup(
        schemaVersion="approved-guidance-v1",
        boundary="loopback-mcp",
        readOnly=True,
        historicalOutcomesRetrieved=False,
        inputFields=list(AssessmentAnswers.model_fields),
        matchedRules=matched[:12],
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run the local Andhrim governed-memory MCP server.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=4275)
    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()
    if args.host != "127.0.0.1" or not 1 <= args.port <= 65535:
        raise SystemExit("The governed-memory MCP server must use a valid 127.0.0.1 port.")
    server.run(
        transport="streamable-http",
        host=args.host,
        port=args.port,
        streamable_http_path="/mcp",
        stateless_http=True,
        json_response=True,
    )
