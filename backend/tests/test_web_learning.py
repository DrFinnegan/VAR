"""
OCTON VAR — Web-learning pipeline tests.
Runs against a mocked httpx + mocked LLM extractor so no network or LLM cost.

Run with:  cd /app/backend && python -m tests.test_web_learning
"""
import asyncio
import os
import sys
from pathlib import Path
from unittest.mock import AsyncMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402
from dotenv import load_dotenv  # noqa: E402
load_dotenv(Path(__file__).resolve().parent.parent / ".env")


FAKE_HTML = """<html><head><title>Liverpool 2-1 Man City — VAR drama</title></head>
<body><article>
Liverpool 2-1 Manchester City. In the 67th minute Jeremy Doku's equaliser was ruled
out for offside — semi-automated technology showed his armpit was marginally beyond
the last defender when the through ball was played by Rodri. Goal disallowed.
Later, Ruben Dias was shown a straight red for violent conduct after elbowing
Darwin Nunez in the face off the ball during an aerial duel. City down to ten.
In the 89th minute a potential handball by Trent Alexander-Arnold inside his own
box was checked by VAR, but the arm was in a natural position by his side and the
ball deflected off his head first, so no penalty was awarded. Play continued.
Some more filler text to push this article past the 60-word minimum so the
web-learning pipeline treats it as a legitimate match report and not a stub.
</article></body></html>"""

FAKE_CASES = [
    {
        "title": "Armpit offside — goal disallowed",
        "incident_type": "offside",
        "correct_decision": "Goal Disallowed - Offside",
        "rationale": "Attacker's armpit fractionally beyond the last defender at the moment the ball was played. Semi-automated line confirms offside.",
        "keywords": ["armpit", "marginal", "semi-automated", "through ball", "last defender"],
        "tags": ["marginal-offside", "goal-disallowed"],
        "law_references": ["IFAB Law 11"],
        "outcome": "goal overturned",
        "match_context": {"teams": "Liverpool vs Man City", "competition": "Premier League", "year": 2026},
        "confidence_in_extraction": 0.92,
    },
    {
        "title": "Off-ball elbow — violent conduct red",
        "incident_type": "red_card",
        "correct_decision": "Red Card - Violent Conduct",
        "rationale": "Player elbowed an opponent in the face off the ball during an aerial duel. Automatic violent conduct under IFAB Law 12 — straight red.",
        "keywords": ["elbow", "off the ball", "violent conduct", "aerial duel", "straight red"],
        "tags": ["violent-conduct", "off-ball", "automatic-red"],
        "law_references": ["IFAB Law 12"],
        "outcome": "red card issued",
        "match_context": {"teams": "Liverpool vs Man City", "competition": "Premier League", "year": 2026},
        "confidence_in_extraction": 0.9,
    },
    {
        "title": "Handball in own box — no penalty (deflection)",
        "incident_type": "handball",
        "correct_decision": "No Handball - Own Body Deflection",
        "rationale": "Ball deflected off defender's own head onto his arm which was in natural position. No handball offence under 2021 IFAB amendment.",
        "keywords": ["own body", "deflection", "natural position", "arm by side", "no handball"],
        "tags": ["own-body-deflection", "no-handball", "goal-stands"],
        "law_references": ["IFAB Law 12"],
        "outcome": "play on",
        "match_context": {"teams": "Liverpool vs Man City", "competition": "Premier League", "year": 2026},
        "confidence_in_extraction": 0.86,
    },
    # Low-confidence case — MUST be filtered out
    {
        "title": "Maybe a foul in midfield",
        "incident_type": "foul",
        "correct_decision": "Unclear",
        "rationale": "Vague description, not certain.",
        "keywords": [],
        "tags": [],
        "law_references": [],
        "outcome": "",
        "match_context": {},
        "confidence_in_extraction": 0.5,
    },
    # Invalid incident_type — MUST be filtered out
    {
        "title": "Mystery call",
        "incident_type": "witchcraft",
        "correct_decision": "Ruling",
        "rationale": "Example of bad incident type",
        "keywords": [], "tags": [], "law_references": [], "outcome": "",
        "match_context": {},
        "confidence_in_extraction": 0.9,
    },
]


class FakeResponse:
    def __init__(self, text, status_code=200, headers=None):
        self.text = text
        self.status_code = status_code
        self.headers = headers or {"content-type": "text/html; charset=utf-8"}


class FakeClient:
    def __init__(self, *a, **kw):
        pass
    async def __aenter__(self):
        return self
    async def __aexit__(self, *a):
        return False
    async def get(self, url, headers=None):
        return FakeResponse(FAKE_HTML)


async def run():
    mongo_url = os.environ["MONGO_URL"]
    db_name = os.environ["DB_NAME"]
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]

    print("=" * 80)
    print("OCTON VAR — Web-learning pipeline tests (mocked httpx + mocked LLM)")
    print("=" * 80)

    # Clean up any prior test runs so idempotency behaves
    await db.training_cases.delete_many({"source_url": "https://mock/test-article"})
    await db.web_ingestion_log.delete_many({"url": "https://mock/test-article"})

    from web_learning import ingest_url

    fake_extract = AsyncMock(return_value=FAKE_CASES)

    with patch("web_learning.httpx.AsyncClient", FakeClient), \
         patch("web_learning.extract_cases_from_text", fake_extract):
        # ── 1) First ingestion ──
        user = {"id": "test-user-1", "name": "Test Admin"}
        result = await ingest_url(db, "https://mock/test-article", user, auto_save=True)

        print(f"[1] First run: extracted={result['extracted']} accepted={result['accepted']} "
              f"inserted={result['inserted']} skipped={result['skipped_existing']}")
        assert result["extracted"] == 5, f"expected 5, got {result['extracted']}"
        assert result["accepted"] == 3, f"expected 3 (low-conf + bad-type filtered), got {result['accepted']}"
        assert result["inserted"] == 3, f"expected 3 newly inserted, got {result['inserted']}"
        assert result["skipped_existing"] == 0, "no dupes on first run"
        assert "confidence_lift" in result, "lift report missing"
        print(f"    lift_report: impacted={result['confidence_lift']['total_impacted']} "
              f"avg_uplift={result['confidence_lift']['avg_uplift_pct']}")
        print("    PASS")

        # ── 2) Idempotency — re-run the same URL, no new cases inserted ──
        result2 = await ingest_url(db, "https://mock/test-article", user, auto_save=True)
        print(f"[2] Re-run: inserted={result2['inserted']} skipped={result2['skipped_existing']}")
        assert result2["inserted"] == 0, f"expected 0 inserted on dupe run, got {result2['inserted']}"
        assert result2["skipped_existing"] == 3, f"expected 3 skipped, got {result2['skipped_existing']}"
        print("    PASS")

        # ── 3) Persisted cases carry provenance ──
        cases = await db.training_cases.find(
            {"source_url": "https://mock/test-article"},
            {"_id": 0},
        ).to_list(10)
        print(f"[3] Persisted {len(cases)} cases with provenance fields")
        assert len(cases) == 3
        for c in cases:
            assert c["source_url"] == "https://mock/test-article"
            assert c["source_title"]
            assert c["source_ingested_at"]
            assert 0.75 <= c["source_confidence"] <= 1.0
            assert "web-ingested" in c["tags"]
        print("    PASS")

        # ── 4) Ingestion log is written ──
        log = await db.web_ingestion_log.find_one(
            {"url": "https://mock/test-article"}, {"_id": 0},
        )
        print(f"[4] Log: extracted={log['extracted_count']} inserted={log['inserted_count']} "
              f"user={log['user_name']}")
        assert log["extracted_count"] == 5
        assert log["inserted_count"] == 3
        assert log["user_id"] == "test-user-1"
        print("    PASS")

    # ── 5) Error path: short article is rejected ──
    class ShortClient(FakeClient):
        async def get(self, url, headers=None):
            return FakeResponse("<html><body><p>Too short.</p></body></html>")
    with patch("web_learning.httpx.AsyncClient", ShortClient):
        try:
            await ingest_url(db, "https://mock/short", user, auto_save=True)
            print("[5] FAIL — short article should have raised")
            raise SystemExit(1)
        except RuntimeError as e:
            print(f"[5] Short-article guard: OK ({e})")

    # ── 6) Error path: non-HTML content-type rejected ──
    class JsonClient(FakeClient):
        async def get(self, url, headers=None):
            return FakeResponse('{"not":"html"}', headers={"content-type": "application/json"})
    with patch("web_learning.httpx.AsyncClient", JsonClient):
        try:
            await ingest_url(db, "https://mock/json", user, auto_save=True)
            print("[6] FAIL — non-HTML should have raised")
            raise SystemExit(1)
        except RuntimeError as e:
            print(f"[6] Non-HTML guard: OK ({e})")

    # Cleanup
    await db.training_cases.delete_many({"source_url": "https://mock/test-article"})
    await db.web_ingestion_log.delete_many({"url": "https://mock/test-article"})

    print("=" * 80)
    print("RESULT: 6/6 tests passed")
    print("=" * 80)
    client.close()


if __name__ == "__main__":
    asyncio.run(run())
