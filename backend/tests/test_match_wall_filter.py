"""
Regression test for Match Wall deep-link bug.

Before the fix:
  GET /api/incidents?match_id=<id> ignored the match_id param. The frontend
  fell back to client-side filter on the latest 100 incidents, so older
  matches' incidents were dropped off the page → Match Wall tile click
  loaded an empty list.

After the fix:
  Backend filters incidents by match_id OR team_involved (mirrors the
  /matches/live aggregator's $or logic) so deep-links surface every
  incident the tile counts.
"""
import os
import sys
from pathlib import Path

import pytest
import requests

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

BASE_URL = os.environ.get(
    "REACT_APP_BACKEND_URL",
    "https://smart-var-audit.preview.emergentagent.com",
).rstrip("/")


def _live_matches():
    r = requests.get(f"{BASE_URL}/api/matches/live", timeout=15)
    assert r.status_code == 200, r.text
    return r.json().get("matches", [])


@pytest.mark.parametrize("idx", [0, 1, 2])
def test_match_wall_deep_link_returns_incidents(idx):
    """A match tile reporting incidents_total > 0 must return ≥ that many
    incidents when its match_id is sent to GET /api/incidents."""
    matches = _live_matches()
    if idx >= len(matches):
        pytest.skip(f"only {len(matches)} match tile(s) available")
    tile = matches[idx]
    if tile.get("incidents_total", 0) == 0:
        pytest.skip("tile has no incidents to verify")

    mid = tile["match"]["id"]
    r = requests.get(
        f"{BASE_URL}/api/incidents",
        params={"match_id": mid, "limit": 200},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    incidents = r.json()
    # Tile caps at 8; our fetch caps at 200 — must equal-or-exceed tile count.
    assert len(incidents) >= tile["incidents_total"], (
        f"deep-link returned {len(incidents)} incidents but tile reported "
        f"{tile['incidents_total']} for match {mid}"
    )


def test_match_wall_unknown_match_returns_empty():
    """An unknown match_id must return [] — never the global incident list."""
    r = requests.get(
        f"{BASE_URL}/api/incidents",
        params={"match_id": "00000000-0000-0000-0000-000000000000", "limit": 200},
        timeout=15,
    )
    assert r.status_code == 200
    assert r.json() == []
