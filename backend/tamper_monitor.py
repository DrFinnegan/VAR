"""
Audit-chain tamper monitor + Booth Activity aggregator.

Tamper monitor:
    Runs every 60 s on top of the existing AsyncIOScheduler. Walks the
    audit chain via `audit.verify_chain()`. If the chain is broken,
    broadcasts a `system_health` WS event ("tamper_alert") so every
    connected booth + Match Wall flips an unmissable red banner.
    Result is cached in `system_state.tamper_status` so the UI can read
    it on page-load without re-walking on every request.

Booth Activity:
    Aggregates `decided_by_booth` + WS subscriptions into a per-booth
    summary used by the admin Booth Activity page.
"""
import asyncio
import logging
from datetime import datetime, timezone
from typing import Optional

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger

from audit import verify_chain
from websocket_manager import ws_manager

logger = logging.getLogger("octon.tamper")

_scheduler: Optional[AsyncIOScheduler] = None
_db_ref = None


async def _check_tamper() -> None:
    if _db_ref is None:
        return
    try:
        result = await verify_chain(_db_ref)
        await _db_ref.system_state.update_one(
            {"id": "tamper_status"},
            {"$set": {
                "id": "tamper_status",
                "valid": bool(result.get("valid", True)),
                "result": result,
                "checked_at": datetime.now(timezone.utc).isoformat(),
            }},
            upsert=True,
        )
        if not result.get("valid", True):
            logger.error("AUDIT CHAIN TAMPER DETECTED: %s", result)
            await ws_manager.send_system_health({
                "event": "tamper_alert",
                "valid": False,
                "broken_at": result.get("broken_at"),
                "reason": result.get("reason"),
                "total_entries": result.get("total_entries"),
            })
    except Exception as e:
        logger.warning("Tamper check failed: %s", e)


async def start_tamper_monitor(db) -> None:
    """Called from FastAPI startup AFTER the web-learning scheduler so we
    don't double-create event loops."""
    global _scheduler, _db_ref
    _db_ref = db
    if _scheduler and _scheduler.running:
        return
    _scheduler = AsyncIOScheduler(timezone="UTC")
    _scheduler.add_job(_check_tamper, trigger=IntervalTrigger(seconds=60),
                       id="octon-tamper", replace_existing=True)
    _scheduler.start()
    # Run an immediate check so /system/health has a fresh tamper_status
    # before the first tick.
    asyncio.create_task(_check_tamper())
    logger.info("Audit tamper monitor started (60s interval)")


async def get_last_tamper_status(db) -> dict:
    doc = await db.system_state.find_one({"id": "tamper_status"}, {"_id": 0}) or {
        "valid": True,
        "checked_at": None,
        "result": None,
    }
    return doc


# ── Booth Activity aggregator ─────────────────────────────────────────
async def get_booth_activity(db) -> list:
    """Per-booth summary: live fixture, decision count, avg confidence,
    agreement rate (decision_status='confirmed' vs 'overturned')."""
    # Pull every distinct booth_id from incidents + ai_feedback.
    booth_ids = set()
    async for d in db.incidents.find(
        {"created_by_booth": {"$ne": None}},
        {"_id": 0, "created_by_booth": 1},
    ):
        if d.get("created_by_booth"):
            booth_ids.add(d["created_by_booth"])
    async for d in db.incidents.find(
        {"decided_by_booth": {"$ne": None}},
        {"_id": 0, "decided_by_booth": 1},
    ):
        if d.get("decided_by_booth"):
            booth_ids.add(d["decided_by_booth"])

    # Live subscriptions snapshot
    live_by_booth: dict = {}
    for sub in ws_manager.subscriptions.values():
        bid = sub.get("booth_id")
        if not bid:
            continue
        live_by_booth.setdefault(bid, {"match_ids": set()})
        if sub.get("match_id"):
            live_by_booth[bid]["match_ids"].add(sub["match_id"])

    out = []
    for bid in sorted(booth_ids):
        decisions = await db.incidents.count_documents({"decided_by_booth": bid})
        feedback = await db.ai_feedback.count_documents({"decided_by_booth": bid})
        confirmed = await db.ai_feedback.count_documents({
            "decided_by_booth": bid, "decision_status": "confirmed",
        })
        overturned = await db.ai_feedback.count_documents({
            "decided_by_booth": bid, "decision_status": "overturned",
        })
        # Average confidence on incidents this booth signed off
        cursor = db.incidents.find(
            {"decided_by_booth": bid},
            {"_id": 0, "ai_analysis.final_confidence": 1, "decided_by_booth_label": 1},
        ).sort("created_at", -1).limit(20)
        recent = await cursor.to_list(20)
        confs = [
            r.get("ai_analysis", {}).get("final_confidence")
            for r in recent
            if r.get("ai_analysis", {}).get("final_confidence") is not None
        ]
        label = next(
            (r.get("decided_by_booth_label") for r in recent if r.get("decided_by_booth_label")),
            None,
        )
        live = live_by_booth.get(bid)
        out.append({
            "booth_id": bid,
            "label": label,
            "decisions_total": decisions,
            "ai_feedback_total": feedback,
            "agreement_rate": round(confirmed / feedback * 100, 1) if feedback else None,
            "confirmed": confirmed,
            "overturned": overturned,
            "avg_recent_confidence": round(sum(confs) / len(confs), 1) if confs else None,
            "live_now": live is not None,
            "live_match_ids": sorted(list(live["match_ids"])) if live else [],
        })
    out.sort(key=lambda x: (-x["decisions_total"], x["booth_id"]))
    return out
