"""Regression test for /api/training/stats corpus-telemetry expansion."""
import os

import requests

BASE_URL = os.environ.get(
    "REACT_APP_BACKEND_URL",
    "https://smart-var-audit.preview.emergentagent.com",
).rstrip("/")


def test_training_stats_returns_corpus_telemetry():
    r = requests.get(f"{BASE_URL}/api/training/stats", timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()

    # Pre-existing fields still present
    assert "total_cases" in body
    assert "by_type" in body
    assert "with_media" in body

    # New telemetry fields
    assert "by_source" in body, "by_source breakdown missing"
    assert "last_24h" in body, "last_24h growth counter missing"
    assert "last_24h_web" in body, "last_24h_web counter missing"

    # by_source shape
    by_source = body["by_source"]
    assert isinstance(by_source, list)
    if by_source:
        first = by_source[0]
        assert "source" in first and "count" in first
        # Allowed buckets only
        for row in by_source:
            assert row["source"] in {"seed", "web-learning", "operator", "manual"}, (
                f"unexpected source bucket: {row['source']}"
            )
        # Counts sum up to <= total_cases (operator+legacy may double-count if any seed runs got tagged)
        assert sum(r["count"] for r in by_source) >= 1
