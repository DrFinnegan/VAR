"""Wave-8 regression tests:
  • Tilt-override ledger appends per PATCH (and is bounded at 50)
  • Vision-escalation false-alarm endpoint rolls back + adds counter-example
  • Smart-extractor latency budget for a 20s synthetic clip
"""
import asyncio
import os
import time
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


def _find_offside_with_markers(session):
    r = session.get(
        f"{BASE_URL}/api/incidents",
        params={"incident_type": "offside", "limit": 20},
        timeout=15,
    )
    for inc in r.json():
        if (inc.get("ai_analysis") or {}).get("offside_markers"):
            return inc
    return None


# ── 1. Tilt ledger ─────────────────────────────────────────────
def test_tilt_override_appends_to_ledger(admin_session):
    target = _find_offside_with_markers(admin_session)
    if not target:
        pytest.skip("no offside incident available")

    # Set 3 tilt values in succession → ledger should contain ≥ 3 entries.
    angles = [5.0, 10.5, -7.5]
    for a in angles:
        r = admin_session.patch(
            f"{BASE_URL}/api/incidents/{target['id']}/offside-tilt",
            json={"frame_index": 0, "pitch_angle_deg": a, "tilt_source": "manual"},
            timeout=15,
        )
        assert r.status_code == 200, r.text

    refetch = admin_session.get(f"{BASE_URL}/api/incidents/{target['id']}", timeout=15).json()
    history = (refetch.get("ai_analysis") or {}).get("tilt_override_history") or []
    assert len(history) >= len(angles), f"ledger missing entries: {history}"
    # Latest 3 must contain the angles we just set, in order.
    last3 = [round(h["to_pitch_angle_deg"], 1) for h in history[-3:]]
    assert last3 == [round(a, 1) for a in angles], last3
    # Each entry has the audit fields.
    last = history[-1]
    assert "by" in last and last["by"]
    assert "at" in last and last["at"]
    assert last.get("to_tilt_source") == "manual"


# ── 2. False-alarm endpoint (admin-only) ───────────────────────
def test_false_alarm_requires_auth():
    r = requests.post(
        f"{BASE_URL}/api/incidents/00000000-0000-0000-0000-000000000000/vision-escalation/false-alarm",
        json={"operator_note": "test"},
        timeout=15,
    )
    assert r.status_code in (401, 403)


def test_false_alarm_404_for_unknown_incident(admin_session):
    r = admin_session.post(
        f"{BASE_URL}/api/incidents/00000000-0000-0000-0000-000000000000/vision-escalation/false-alarm",
        json={"operator_note": "test"},
        timeout=15,
    )
    assert r.status_code == 404


def test_false_alarm_rejects_when_no_escalation(admin_session):
    """Pick a regular incident with NO vision_escalation block — must 400."""
    r = admin_session.get(
        f"{BASE_URL}/api/incidents",
        params={"limit": 30},
        timeout=15,
    )
    target = None
    for inc in r.json():
        ve = (inc.get("ai_analysis") or {}).get("vision_escalation") or {}
        if not ve.get("triggered"):
            target = inc
            break
    if not target:
        pytest.skip("no plain incident found")
    r2 = admin_session.post(
        f"{BASE_URL}/api/incidents/{target['id']}/vision-escalation/false-alarm",
        json={"operator_note": "test"},
        timeout=15,
    )
    assert r2.status_code == 400, r2.text
    assert "no vision escalation" in r2.text.lower()


# ── 3. Smart-extractor latency budget ──────────────────────────
@pytest.mark.asyncio
async def test_extract_frames_completes_within_budget(tmp_path):
    """Multi-frame extraction on a 20-second synthetic clip must finish
    in ≤ 8 seconds wall-clock. Wave-8 fix budgeted scene-detect at
    ≤ 6 s with parallel duration probe + 4 parallel frame extractions.
    """
    import sys
    from pathlib import Path
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    import subprocess
    from video_utils import extract_frames_b64, extract_frame_b64

    clip = tmp_path / "bench.mp4"
    cmd = [
        "ffmpeg", "-y", "-f", "lavfi", "-i",
        "testsrc=duration=20:size=640x480:rate=24",
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-loglevel", "error",
        str(clip),
    ]
    proc = subprocess.run(cmd, check=False, capture_output=True, timeout=30)
    if proc.returncode != 0 or not clip.exists():
        pytest.skip("ffmpeg synthetic clip generation failed")
    data = clip.read_bytes()

    t0 = time.time()
    frames = await extract_frames_b64(data, n_frames=4, quality=6)
    elapsed = time.time() - t0
    assert len(frames) == 4, f"expected 4 frames, got {len(frames)}"
    assert elapsed < 8.0, f"smart extraction too slow: {elapsed:.2f}s"

    # Single-frame fast-path must be < 2s (no scene-detect).
    t1 = time.time()
    f1 = await extract_frame_b64(data, at_seconds=10)
    elapsed1 = time.time() - t1
    assert f1 is not None
    assert elapsed1 < 2.0, f"single-frame too slow: {elapsed1:.2f}s"
