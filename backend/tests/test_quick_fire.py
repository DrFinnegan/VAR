"""Quick-fire endpoint tests — verify corner enum + fast-path tagging +
Law 17 citation thread through without mocks. Uses the live FastAPI
TestClient against a real Mongo test collection isolation.
"""
import os
import uuid

import pytest
from starlette.testclient import TestClient


@pytest.fixture(scope="module")
def client():
    os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
    os.environ.setdefault("DB_NAME", f"octon_test_{uuid.uuid4().hex[:6]}")
    from server import app
    with TestClient(app) as c:
        yield c


def test_corner_enum_is_registered():
    from core import IncidentType
    assert IncidentType.CORNER.value == "corner"


def test_corner_keywords_and_clause_present_in_ai_engine():
    from ai_engine import _DEFAULT_CITED_CLAUSE, HippocampusAnalyzer
    assert "Law 17" in _DEFAULT_CITED_CLAUSE["corner"]
    assert "corner" in HippocampusAnalyzer.PATTERN_DB
    kb = HippocampusAnalyzer.PATTERN_DB["corner"]
    assert "corner" in kb["keywords"]
    assert "encroachment" in kb["keywords"]


def test_quick_corner_endpoint_returns_fast_path_incident(client):
    resp = client.post(
        "/api/quick/corner",
        json={"team_involved": "Arsenal", "timestamp_in_match": "78:10"},
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["incident_type"] == "corner"
    assert "quick_fire" in data["tags"]
    assert data["ai_analysis"]["fast_path"] is True
    cited = (data["ai_analysis"].get("cited_clause") or "").lower()
    reasoning = (data["ai_analysis"].get("reasoning") or "").lower()
    anchor = f"{cited} {reasoning}"
    assert "17" in anchor or "corner" in anchor, f"expected Law 17/corner anchor, got cited={cited!r}"


def test_quick_offside_endpoint_returns_fast_path_incident(client):
    resp = client.post(
        "/api/quick/offside",
        json={"team_involved": "Liverpool", "timestamp_in_match": "23:45"},
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["incident_type"] == "offside"
    assert "quick_fire" in data["tags"]
    assert data["ai_analysis"]["fast_path"] is True
    cited = (data["ai_analysis"].get("cited_clause") or "").lower()
    reasoning = (data["ai_analysis"].get("reasoning") or "").lower()
    anchor = f"{cited} {reasoning}"
    assert "11" in anchor or "offside" in anchor, f"expected Law 11/offside anchor, got cited={cited!r}"


def test_quick_corner_scouting_endpoint(client):
    """Scouting aggregation shape is stable."""
    resp = client.get("/api/quick/corner-scouting?team=Arsenal")
    assert resp.status_code == 200
    payload = resp.json()
    for k in ["team", "total_corners_seen", "legal_corners", "goal_kicks_overturned",
              "retakes", "top_kickers", "sample"]:
        assert k in payload, f"missing key: {k}"
    assert isinstance(payload["sample"], list)
    assert isinstance(payload["top_kickers"], list)
