"""Tournament-mode WebSocket isolation tests.

Validates that ConnectionManager.broadcast() only routes match-tagged
events to subscribers of that match (or global subscribers).
"""
import asyncio
from unittest.mock import AsyncMock, MagicMock

from websocket_manager import ConnectionManager


def _fake_ws():
    ws = MagicMock()
    ws.accept = AsyncMock()
    ws.send_json = AsyncMock()
    return ws


def test_match_scoped_event_only_to_match_subscribers():
    async def run():
        mgr = ConnectionManager()
        booth_a = _fake_ws(); booth_b = _fake_ws(); global_view = _fake_ws()
        await mgr.connect(booth_a, match_id="match-A")
        await mgr.connect(booth_b, match_id="match-B")
        await mgr.connect(global_view, match_id=None)
        await mgr.send_incident_created({"id": "inc-1"}, match_id="match-A")
        booth_a.send_json.assert_awaited_once()
        global_view.send_json.assert_awaited_once()
        booth_b.send_json.assert_not_awaited()
    asyncio.run(run())


def test_global_broadcast_reaches_everyone():
    async def run():
        mgr = ConnectionManager()
        booth_a = _fake_ws(); booth_b = _fake_ws(); global_view = _fake_ws()
        await mgr.connect(booth_a, match_id="match-A")
        await mgr.connect(booth_b, match_id="match-B")
        await mgr.connect(global_view, match_id=None)
        await mgr.send_system_health({"status": "degraded"})
        assert booth_a.send_json.await_count == 1
        assert booth_b.send_json.await_count == 1
        assert global_view.send_json.await_count == 1
    asyncio.run(run())


def test_booths_for_match_lists_distinct_booth_ids():
    async def run():
        mgr = ConnectionManager()
        a, b, c, d = _fake_ws(), _fake_ws(), _fake_ws(), _fake_ws()
        await mgr.connect(a, match_id="match-A", booth_id="booth-1")
        await mgr.connect(b, match_id="match-A", booth_id="booth-2")
        await mgr.connect(c, match_id="match-A", booth_id="booth-1")  # same booth, second tab
        await mgr.connect(d, match_id="match-B", booth_id="booth-9")
        booths = mgr.booths_for_match("match-A")
        assert set(booths) == {"booth-1", "booth-2"}
        assert mgr.booths_for_match("match-B") == ["booth-9"]
        assert mgr.booths_for_match("match-Z") == []
    asyncio.run(run())


def test_disconnect_removes_subscription():
    async def run():
        mgr = ConnectionManager()
        ws = _fake_ws()
        await mgr.connect(ws, match_id="match-X")
        assert len(mgr.subscriptions) == 1
        mgr.disconnect(ws)
        assert len(mgr.subscriptions) == 0
    asyncio.run(run())


def test_match_id_stamped_on_payload():
    async def run():
        mgr = ConnectionManager()
        booth = _fake_ws()
        await mgr.connect(booth, match_id="match-Z")
        await mgr.send_decision_made(
            "inc-9", "Penalty awarded", "confirmed", match_id="match-Z"
        )
        booth.send_json.assert_awaited_once()
        payload = booth.send_json.await_args.args[0]
        assert payload["type"] == "decision_made"
        assert payload["match_id"] == "match-Z"
    asyncio.run(run())
