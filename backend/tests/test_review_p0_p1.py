"""
Regression tests for OCTON VAR P0/P1 review request:
- Multi-frame video analysis via FFmpeg (no caps, ≥85% on clear foul)
- video_source persistence
- 2025-26 IFAB: goalkeeper 8-second rule → corner
- Admin booth-activity + tamper-status
- System health ffmpeg=ok
"""
import base64
import os
import sys
import time
from pathlib import Path

import pytest
import requests

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://smart-var-audit.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "admin@octonvar.com"
ADMIN_PASSWORD = "OctonAdmin2026!"
CLIP_PATH = "/tmp/clip.mp4"


# ---------- fixtures ----------
@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    r = s.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=15,
    )
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="module")
def clip_b64():
    if not Path(CLIP_PATH).exists():
        pytest.skip(f"{CLIP_PATH} missing")
    return base64.b64encode(Path(CLIP_PATH).read_bytes()).decode("utf-8")


# ---------- system health ----------
def test_system_health_ffmpeg_ok():
    r = requests.get(f"{BASE_URL}/api/system/health", timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert data["ffmpeg"]["status"] == "ok", f"ffmpeg not ok: {data['ffmpeg']}"


# ---------- admin endpoints ----------
def test_admin_booth_activity_requires_auth():
    r = requests.get(f"{BASE_URL}/api/admin/booth-activity", timeout=10)
    assert r.status_code in (401, 403)


def test_admin_booth_activity_authed(admin_session):
    r = admin_session.get(f"{BASE_URL}/api/admin/booth-activity", timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "booths" in data and isinstance(data["booths"], list)
    assert "count" in data and isinstance(data["count"], int)


def test_admin_tamper_status_authed(admin_session):
    r = admin_session.get(f"{BASE_URL}/api/admin/tamper-status", timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    # valid may be True or False (on initial run) but must exist and be bool
    assert "valid" in data and isinstance(data["valid"], bool)
    assert "checked_at" in data
    assert "result" in data


# ---------- 2025-26 IFAB: GK 8-second rule ----------
def test_goalkeeper_8_second_rule_text_analyze(admin_session):
    payload = {
        "description": "goalkeeper held ball for 12 seconds before releasing it",
        "incident_type": "foul",
    }
    r = admin_session.post(f"{BASE_URL}/api/ai/analyze-text", json=payload, timeout=60)
    assert r.status_code == 200, r.text
    data = r.json()
    decision = (data.get("suggested_decision") or "").lower()
    cited = (data.get("cited_clause") or "").lower()
    reasoning = (data.get("reasoning") or "").lower()
    combined = f"{decision} {cited} {reasoning}"
    # Should surface 8-second corner kick rule
    assert "corner" in decision or "8" in combined, (
        f"expected 8-second corner-kick rule surfaced; got decision='{decision}', "
        f"cited='{cited[:120]}'"
    )


# ---------- multi-frame video (no caps) ----------
def test_multi_frame_video_no_caps_high_confidence(admin_session, clip_b64):
    payload = {
        "description": (
            "two-footed lunge, studs up, excessive force, over the top of the ball, "
            "no attempt to play the ball, endangered opponent's safety"
        ),
        "incident_type": "red_card",
        "match_id": None,
        "referee_id": None,
        "video_base64": clip_b64,
    }
    r = admin_session.post(f"{BASE_URL}/api/incidents", json=payload, timeout=180)
    assert r.status_code in (200, 201), f"{r.status_code} {r.text[:400]}"
    data = r.json()
    incident_id = data.get("id") or data.get("_id") or data.get("incident_id")
    assert incident_id, f"no incident id returned: {data}"

    # allow AI to settle
    time.sleep(2)
    g = admin_session.get(f"{BASE_URL}/api/incidents/{incident_id}", timeout=30)
    assert g.status_code == 200, g.text
    inc = g.json()

    ai = inc.get("ai_analysis") or {}
    neo = ai.get("neo_cortex") or {}
    conf = ai.get("final_confidence") or neo.get("confidence_score") or 0
    decision = (ai.get("suggested_decision") or neo.get("suggested_decision") or "").lower()
    evidence_src = ai.get("visual_evidence_source") or neo.get("visual_evidence_source")
    cited = (ai.get("cited_clause") or neo.get("cited_clause") or "").lower()

    assert conf >= 85, f"expected >=85% confidence, got {conf}. decision={decision}"
    assert "red" in decision and "card" in decision, f"expected red card, got '{decision}'"
    assert "law 12" in cited or "12" in cited, f"expected Law 12 citation, got '{cited[:180]}'"
    # visual_evidence_source should indicate video_frame when clip present
    if evidence_src is not None:
        assert "video" in str(evidence_src).lower() or "frame" in str(evidence_src).lower(), (
            f"expected video_frame, got {evidence_src}"
        )


# ---------- video_source persistence (go_live_capture) ----------
def test_video_source_go_live_capture_persists(admin_session, clip_b64):
    payload = {
        "description": "two-footed lunge studs up excessive force endangering safety",
        "incident_type": "red_card",
        "video_base64": clip_b64,
        "video_source": "go_live_capture",
    }
    r = admin_session.post(f"{BASE_URL}/api/incidents", json=payload, timeout=180)
    assert r.status_code in (200, 201), r.text
    data = r.json()
    incident_id = data.get("id") or data.get("_id") or data.get("incident_id")
    assert incident_id

    g = admin_session.get(f"{BASE_URL}/api/incidents/{incident_id}", timeout=30)
    assert g.status_code == 200
    inc = g.json()
    assert inc.get("video_source") == "go_live_capture", (
        f"expected video_source='go_live_capture', got {inc.get('video_source')}"
    )
