"""Regression tests for wave-3 corpus tooling:
  • POST /api/training/auto-seed-type — admin-only LLM-backed gap filler
  • GET  /api/training/stats          — source_quality field
  • web_scheduler                     — auto-disable feed after N empty runs
"""
import os
from datetime import datetime, timedelta, timezone

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


# ── 1. source_quality wired into /training/stats ────────────────
def test_training_stats_includes_source_quality():
    r = requests.get(f"{BASE_URL}/api/training/stats", timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()
    assert "source_quality" in body
    sq = body["source_quality"]
    assert isinstance(sq, list)
    if sq:
        first = sq[0]
        assert "source" in first
        assert "citation_count" in first
        assert "avg_confidence" in first
        assert first["source"] in {"seed", "web-learning", "operator", "manual"}
        assert 0 <= first["avg_confidence"] <= 100
        assert first["citation_count"] >= 1


# ── 2. auto-seed endpoint is admin-only ─────────────────────────
def test_auto_seed_requires_auth():
    r = requests.post(
        f"{BASE_URL}/api/training/auto-seed-type",
        json={"incident_type": "card", "count": 1},
        timeout=15,
    )
    assert r.status_code in (401, 403), r.text


def test_auto_seed_rejects_unknown_type(admin_session):
    r = admin_session.post(
        f"{BASE_URL}/api/training/auto-seed-type",
        json={"incident_type": "nonsense_type_xyz", "count": 1},
        timeout=15,
    )
    assert r.status_code == 400, r.text
    assert "incident_type" in r.text


# ── 3. web_scheduler auto-disable after 7 consecutive zero runs ─
def test_auto_disable_constant_present():
    """Sanity-check that the auto-disable threshold is wired in."""
    import sys
    from pathlib import Path

    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    from web_scheduler import _AUTO_DISABLE_AFTER

    assert _AUTO_DISABLE_AFTER == 7


@pytest.mark.asyncio
async def test_auto_disable_increments_consecutive_zero_runs():
    """Sim test: simulate two zero-insert runs and check the counter
    advances. We use a self-contained Motor client (separate from the
    production app's `db`) so this test's event loop doesn't collide
    with the FastAPI TestClient used by quick_fire tests.
    """
    import sys
    from pathlib import Path

    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    from motor.motor_asyncio import AsyncIOMotorClient
    from web_scheduler import _AUTO_DISABLE_AFTER, run_scheduled_ingestion  # noqa: E402

    mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
    db_name = os.environ.get("DB_NAME", "octon_var")
    client = AsyncIOMotorClient(mongo_url)
    test_db = client[db_name]

    feed_id = "test-feed-auto-disable"
    try:
        await test_db.feeds.delete_one({"id": feed_id})
        await test_db.feeds.insert_one({
            "id": feed_id,
            "url": "https://octon-test-invalid-domain.invalid/never-resolves",
            "label": "Auto-disable smoke",
            "enabled": True,
            "consecutive_zero_runs": _AUTO_DISABLE_AFTER - 1,
            "last_attempted_at": (
                datetime.now(timezone.utc) - timedelta(days=2)
            ).isoformat(),
            "last_inserted_count": 0,
        })

        await run_scheduled_ingestion(test_db)
        doc = await test_db.feeds.find_one({"id": feed_id}, {"_id": 0})
        assert doc is not None
        assert doc.get("consecutive_zero_runs", 0) >= _AUTO_DISABLE_AFTER, (
            f"counter did not advance: {doc}"
        )
        assert doc.get("enabled") is False, "feed was not auto-disabled"
        assert doc.get("auto_disabled_at"), "auto_disabled_at not stamped"
        assert "consecutive" in (doc.get("auto_disabled_reason") or "")
    finally:
        await test_db.feeds.delete_one({"id": feed_id})
        client.close()
