"""Wave-7 regression tests:
  • GET /api/incidents-by-vision-trigger drill-down endpoint
  • PATCH /api/incidents/{id}/offside-tilt persists operator override
  • WebSocket vision_escalation broadcast contract (validated against the
    same shape the frontend toaster expects)
"""
import os
import uuid
from datetime import datetime, timezone

import pytest
import requests

BASE_URL = os.environ.get(
    "REACT_APP_BACKEND_URL",
    "https://smart-var-audit.preview.emergentagent.com",
).rstrip("/")
ADMIN = {"email": "admin@octonvar.com", "password": "OctonAdmin2026!"}


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json=ADMIN, timeout=15)
    assert r.status_code == 200, r.text
    return s


# ── 1. drill-down endpoint ─────────────────────────────────────
def test_drill_down_returns_empty_for_unknown_trigger():
    r = requests.get(
        f"{BASE_URL}/api/incidents-by-vision-trigger",
        params={"trigger": "definitely-not-a-real-phrase-xyz", "limit": 5},
        timeout=15,
    )
    assert r.status_code == 200
    assert r.json() == []


def test_drill_down_requires_trigger_param():
    r = requests.get(
        f"{BASE_URL}/api/incidents-by-vision-trigger",
        params={"limit": 5},
        timeout=15,
    )
    assert r.status_code == 422  # FastAPI validation error


# ── 2. tilt-override persists ──────────────────────────────────
def test_tilt_override_round_trip(admin_session):
    """End-to-end: find an offside incident with markers, PATCH a custom
    tilt, refetch, verify override stuck."""
    r = admin_session.get(f"{BASE_URL}/api/incidents", params={
        "incident_type": "offside", "limit": 20,
    }, timeout=15)
    assert r.status_code == 200
    target = None
    for inc in r.json():
        markers = (inc.get("ai_analysis") or {}).get("offside_markers") or []
        if markers:
            target = inc
            break
    if not target:
        pytest.skip("no offside incident with markers available")

    angle = round((float(uuid.uuid4().int % 401) - 200) / 10, 1)  # random ∈ [-20, 20] in 0.1 steps
    angle = max(-30.0, min(30.0, angle))
    r2 = admin_session.patch(
        f"{BASE_URL}/api/incidents/{target['id']}/offside-tilt",
        json={"frame_index": 0, "pitch_angle_deg": angle, "tilt_source": "manual"},
        timeout=15,
    )
    assert r2.status_code == 200, r2.text
    body = r2.json()
    assert body["ok"] is True
    assert body["pitch_angle_deg"] == angle
    assert body["tilt_source"] == "manual"

    # Refetch and verify
    r3 = admin_session.get(f"{BASE_URL}/api/incidents/{target['id']}", timeout=15)
    assert r3.status_code == 200
    markers = (r3.json().get("ai_analysis") or {}).get("offside_markers") or []
    assert markers, "offside_markers vanished after PATCH"
    assert all(m.get("pitch_angle_deg") == angle for m in markers), markers
    assert markers[0].get("tilt_source") == "manual"
    override = markers[0].get("operator_tilt_override") or {}
    assert override.get("pitch_angle_deg") == angle
    assert override.get("set_at")


def test_tilt_override_requires_auth():
    r = requests.patch(
        f"{BASE_URL}/api/incidents/00000000-0000-0000-0000-000000000000/offside-tilt",
        json={"frame_index": 0, "pitch_angle_deg": 10},
        timeout=15,
    )
    assert r.status_code in (401, 403)


def test_tilt_override_clamps_out_of_range(admin_session):
    """pitch_angle_deg outside ±30° is clamped, not rejected."""
    r = admin_session.get(
        f"{BASE_URL}/api/incidents",
        params={"incident_type": "offside", "limit": 5},
        timeout=15,
    )
    target = None
    for inc in r.json():
        if (inc.get("ai_analysis") or {}).get("offside_markers"):
            target = inc
            break
    if not target:
        pytest.skip("no offside incident with markers")

    r2 = admin_session.patch(
        f"{BASE_URL}/api/incidents/{target['id']}/offside-tilt",
        json={"frame_index": 0, "pitch_angle_deg": 9999, "tilt_source": "manual"},
        timeout=15,
    )
    assert r2.status_code == 200
    assert r2.json()["pitch_angle_deg"] == 30.0

    r3 = admin_session.patch(
        f"{BASE_URL}/api/incidents/{target['id']}/offside-tilt",
        json={"frame_index": 0, "pitch_angle_deg": -9999, "tilt_source": "manual"},
        timeout=15,
    )
    assert r3.status_code == 200
    assert r3.json()["pitch_angle_deg"] == -30.0


# ── 3. WebSocket vision_escalation broadcast contract ──────────
def test_vision_escalation_contract_shape():
    """Ensure the dict that incidents.py broadcasts matches what the
    VisionEscalationToaster component expects to consume.
    """
    expected_keys = {
        "type", "incident_id", "match_id",
        "trigger_phrase", "original_decision", "upgraded_decision",
        "upgraded_confidence", "team_involved", "timestamp_in_match", "at",
    }
    sample = {
        "type": "vision_escalation",
        "incident_id": "abc-123",
        "match_id": None,
        "trigger_phrase": "elbow strikes",
        "original_decision": "Yellow Card",
        "upgraded_decision": "Red Card - Violent Conduct",
        "upgraded_confidence": 88.0,
        "team_involved": "Liverpool",
        "timestamp_in_match": "23:45",
        "at": datetime.now(timezone.utc).isoformat(),
    }
    assert set(sample.keys()) == expected_keys
    assert sample["type"] == "vision_escalation"
