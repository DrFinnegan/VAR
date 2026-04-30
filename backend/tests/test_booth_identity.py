"""Booth identity end-to-end — ensures the X-Booth-Id header threads
through the audit chain and decision trail so multiple booths watching
the same match can be told apart in the audit log.
"""
import asyncio

from audit import register_audit
from booth import get_booth_id, get_booth_label


class _FakeHeaders(dict):
    def get(self, k, default=None):
        return super().get(k.lower(), default)


class _FakeRequest:
    def __init__(self, headers):
        self.headers = _FakeHeaders({k.lower(): v for k, v in headers.items()})


def test_booth_headers_parse_case_insensitively():
    req = _FakeRequest({"X-Booth-Id": "booth-abc", "x-booth-label": "Booth 1"})
    assert get_booth_id(req) == "booth-abc"
    assert get_booth_label(req) == "Booth 1"


def test_register_audit_stamps_booth_id(tmp_path=None):
    """In-memory fake of motor's audit_chain collection — verifies that
    register_audit threads booth_id + booth_label into the persisted doc
    and into the returned payload."""

    inserted = []

    class _FakeCollection:
        async def find_one(self, *a, **kw):
            if inserted:
                return inserted[-1]
            return None
        def find(self, *a, **kw):
            class _Cursor:
                def sort(self, *a, **kw): return self
                async def to_list(self, n): return list(inserted)
            return _Cursor()
        async def insert_one(self, doc):
            inserted.append(doc)

    class _FakeDB:
        def __init__(self):
            self.audit_chain = _FakeCollection()

    db = _FakeDB()

    async def run():
        entry = await register_audit(
            db, "incident-xyz", {"final_confidence": 88.2},
            user_id="user-1",
            booth_id="booth-1", booth_label="Control Room A",
        )
        assert entry["booth_id"] == "booth-1"
        assert entry["booth_label"] == "Control Room A"
        assert inserted[0]["booth_id"] == "booth-1"
        assert inserted[0]["booth_label"] == "Control Room A"

        # A second booth registering for the same incident must chain
        # cleanly while preserving its own booth attribution.
        entry2 = await register_audit(
            db, "incident-xyz", {"final_confidence": 88.2},
            user_id="user-2",
            booth_id="booth-2", booth_label="Control Room B",
        )
        assert entry2["prev_hash"] == entry["entry_hash"]
        assert entry2["booth_id"] == "booth-2"
        assert inserted[1]["booth_id"] == "booth-2"

    asyncio.run(run())
