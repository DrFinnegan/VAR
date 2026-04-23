"""
OCTON VAR — Audit Hash Chain
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Tamper-evident audit trail for every PDF report.

Each entry stores:
  - prev_hash: the previous entry's SHA-256 (links the chain)
  - content_hash: SHA-256 of the canonical incident+analysis JSON
  - entry_hash: SHA-256(prev_hash || content_hash || timestamp || incident_id)

Breaking any earlier entry invalidates every subsequent entry_hash,
giving us blockchain-style tamper detection without a blockchain.
"""
import hashlib
import json
import uuid
from datetime import datetime, timezone

GENESIS_HASH = "0" * 64  # First entry links to "genesis"


def _canonical(obj) -> str:
    """Stable JSON serialization (sorted keys, no whitespace) for hashing."""
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), default=str)


def _sha256(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


async def get_last_hash(db) -> str:
    """Fetch the most recent entry's entry_hash (or genesis if empty)."""
    last = await db.audit_chain.find_one(
        {}, {"_id": 0, "entry_hash": 1}, sort=[("created_at", -1)]
    )
    return last["entry_hash"] if last else GENESIS_HASH


async def register_audit(db, incident_id: str, analysis: dict, user_id: str | None = None) -> dict:
    """Append a new entry to the chain; returns {entry_hash, prev_hash, content_hash, audit_id, created_at}."""
    prev_hash = await get_last_hash(db)
    content_hash = _sha256(_canonical({"incident_id": incident_id, "analysis": analysis}))
    created_at = datetime.now(timezone.utc).isoformat()
    entry_hash = _sha256(f"{prev_hash}|{content_hash}|{created_at}|{incident_id}")
    audit_id = str(uuid.uuid4())

    doc = {
        "id": audit_id,
        "incident_id": incident_id,
        "prev_hash": prev_hash,
        "content_hash": content_hash,
        "entry_hash": entry_hash,
        "created_at": created_at,
        "user_id": user_id,
    }
    await db.audit_chain.insert_one(doc.copy())
    return {
        "audit_id": audit_id,
        "incident_id": incident_id,
        "prev_hash": prev_hash,
        "content_hash": content_hash,
        "entry_hash": entry_hash,
        "created_at": created_at,
    }


async def verify_chain(db) -> dict:
    """Walk the full chain; report the first break (if any) and total length."""
    cursor = db.audit_chain.find({}, {"_id": 0}).sort("created_at", 1)
    entries = await cursor.to_list(10000)
    prev = GENESIS_HASH
    for i, e in enumerate(entries):
        if e["prev_hash"] != prev:
            return {"valid": False, "broken_at": i, "total_entries": len(entries), "reason": "prev_hash mismatch"}
        expected = _sha256(f"{e['prev_hash']}|{e['content_hash']}|{e['created_at']}|{e['incident_id']}")
        if expected != e["entry_hash"]:
            return {"valid": False, "broken_at": i, "total_entries": len(entries), "reason": "entry_hash mismatch"}
        prev = e["entry_hash"]
    return {"valid": True, "total_entries": len(entries), "latest_hash": prev}
