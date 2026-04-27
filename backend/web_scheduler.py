"""
OCTON VAR — Web-learning scheduler.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Runs `ingest_url` against a curated list of public football/VAR news sources
on a fixed cadence so OCTON stays current with real-world match decisions.

Control plane:
    • `feeds` collection stores the curated URLs (admin-managed).
    • `schedule_config` document (id="web_learning") holds enabled flag
      and the cron cadence (defaults to once per day @ 03:15 UTC).
    • `web_ingestion_log` already records every attempt (from web_learning.py).

Safety posture:
    • The job runs as a "system" user (no operator id) — its ingestions are
      clearly attributable in the log.
    • Any per-feed failure is caught and logged; never blocks other feeds.
    • Per-feed rate-limit: max 1 successful ingest per 20-hour window
      (prevents repeat ingestion on long-lived article URLs).
"""
import asyncio
import logging
import os
import uuid
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from web_learning import ingest_url

logger = logging.getLogger(__name__)

CONFIG_ID = "web_learning"
SYSTEM_USER = {"id": "system-scheduler", "name": "OCTON Scheduler"}
MIN_REFRESH_HOURS = 20


DEFAULT_FEEDS: List[Dict] = [
    # Public football news roots — article URLs extracted from section pages
    # may not always yield VAR decisions, but the scheduler dedupes per-URL,
    # so leaving these enabled keeps the precedent corpus growing daily.
    # Admins can disable individual feeds from the Training Library UI.
    {"url": "https://www.theguardian.com/football",
     "label": "The Guardian · Football",          "enabled": True},
    {"url": "https://www.espn.com/soccer/",
     "label": "ESPN Soccer",                       "enabled": True},
    {"url": "https://www.bbc.com/sport/football",
     "label": "BBC Sport · Football",              "enabled": True},
    # VAR-specific authoritative sources — much higher hit-rate for our
    # precedent extractor (Premier League officiating + dedicated VAR
    # decision/explanation pages).
    {"url": "https://www.premierleague.com/news",
     "label": "Premier League · Official News",   "enabled": True},
    {"url": "https://www.skysports.com/football/news",
     "label": "Sky Sports · Football News",       "enabled": True},
]


# ── Config helpers ──────────────────────────────────────

async def get_config(db) -> Dict:
    doc = await db.schedule_config.find_one({"id": CONFIG_ID}, {"_id": 0})
    if not doc:
        doc = {
            "id": CONFIG_ID,
            "enabled": False,
            "cron_hour": 3,
            "cron_minute": 15,
            "last_run_at": None,
            "last_run_summary": None,
        }
        await db.schedule_config.insert_one(doc.copy())
    return doc


async def update_config(db, patch: Dict) -> Dict:
    allowed = {"enabled", "cron_hour", "cron_minute"}
    upd = {k: v for k, v in patch.items() if k in allowed}
    if not upd:
        return await get_config(db)
    await db.schedule_config.update_one({"id": CONFIG_ID}, {"$set": upd}, upsert=True)
    return await get_config(db)


async def seed_default_feeds(db) -> int:
    """Idempotently ensure the default-feeds list exists in Mongo.

    Existing rows that have never been attempted (`last_attempted_at` is
    None) AND match a default-feed URL get their `enabled` flag aligned
    with the latest DEFAULT_FEEDS list, so a server restart can promote
    previously-disabled defaults without trampling admin overrides on
    feeds the scheduler has already touched.
    """
    inserted = 0
    for f in DEFAULT_FEEDS:
        existing = await db.feeds.find_one({"url": f["url"]}, {"_id": 0})
        if existing:
            wants_enabled = bool(f.get("enabled", False))
            never_run = existing.get("last_attempted_at") is None
            if never_run and bool(existing.get("enabled", False)) != wants_enabled:
                await db.feeds.update_one(
                    {"url": f["url"]},
                    {"$set": {"enabled": wants_enabled, "label": f["label"]}},
                )
            continue
        doc = {
            "id": str(uuid.uuid4()),
            "url": f["url"],
            "label": f["label"],
            "enabled": f.get("enabled", False),
            "created_at": datetime.now(timezone.utc).isoformat(),
            "last_attempted_at": None,
            "last_inserted_count": 0,
        }
        await db.feeds.insert_one(doc.copy())
        inserted += 1
    return inserted


async def list_feeds(db) -> List[Dict]:
    return await db.feeds.find({}, {"_id": 0}).sort("created_at", 1).to_list(200)


async def upsert_feed(db, url: str, label: str, enabled: bool = True) -> Dict:
    url = (url or "").strip()
    if not (url.startswith("http://") or url.startswith("https://")):
        raise ValueError("url must be http(s)")
    existing = await db.feeds.find_one({"url": url}, {"_id": 0})
    if existing:
        await db.feeds.update_one(
            {"url": url},
            {"$set": {"label": label or existing.get("label") or url,
                      "enabled": bool(enabled)}},
        )
        return await db.feeds.find_one({"url": url}, {"_id": 0})
    doc = {
        "id": str(uuid.uuid4()),
        "url": url,
        "label": label or url,
        "enabled": bool(enabled),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "last_attempted_at": None,
        "last_inserted_count": 0,
    }
    await db.feeds.insert_one(doc.copy())
    return doc


async def delete_feed(db, feed_id: str) -> bool:
    res = await db.feeds.delete_one({"id": feed_id})
    return res.deleted_count == 1


# ── The scheduled job ───────────────────────────────────

async def run_scheduled_ingestion(db) -> Dict:
    """Single scheduled pass: ingest each enabled feed that hasn't been
    successfully ingested in the last MIN_REFRESH_HOURS."""
    feeds = await list_feeds(db)
    enabled = [f for f in feeds if f.get("enabled")]
    now = datetime.now(timezone.utc)
    processed: List[Dict] = []
    total_inserted = 0
    for f in enabled:
        # Rate-limit guard
        last = f.get("last_attempted_at")
        if last:
            try:
                last_dt = datetime.fromisoformat(last)
                if (now - last_dt) < timedelta(hours=MIN_REFRESH_HOURS):
                    processed.append({"url": f["url"], "skipped": "rate-limit"})
                    continue
            except Exception:
                pass
        try:
            result = await ingest_url(db, f["url"], SYSTEM_USER, auto_save=True)
            inserted = int(result.get("inserted", 0))
            total_inserted += inserted
            await db.feeds.update_one(
                {"id": f["id"]},
                {"$set": {"last_attempted_at": now.isoformat(),
                          "last_inserted_count": inserted}},
            )
            processed.append({
                "url": f["url"], "inserted": inserted,
                "accepted": result.get("accepted", 0),
                "extracted": result.get("extracted", 0),
            })
        except Exception as e:
            logger.warning(f"scheduled ingest failed for {f['url']}: {e}")
            await db.feeds.update_one(
                {"id": f["id"]},
                {"$set": {"last_attempted_at": now.isoformat(),
                          "last_inserted_count": 0,
                          "last_error": str(e)[:240]}},
            )
            processed.append({"url": f["url"], "error": str(e)[:120]})

    summary = {
        "ran_at": now.isoformat(),
        "enabled_feeds": len(enabled),
        "total_inserted": total_inserted,
        "details": processed,
    }
    await db.schedule_config.update_one(
        {"id": CONFIG_ID},
        {"$set": {"last_run_at": now.isoformat(), "last_run_summary": summary}},
        upsert=True,
    )
    return summary


# ── Scheduler lifecycle ─────────────────────────────────

_scheduler: Optional[AsyncIOScheduler] = None
_db_ref = None


async def start_scheduler(db) -> None:
    """Called once from FastAPI startup."""
    global _scheduler, _db_ref
    _db_ref = db
    cfg = await get_config(db)
    await seed_default_feeds(db)

    if _scheduler and _scheduler.running:
        _scheduler.shutdown(wait=False)

    _scheduler = AsyncIOScheduler(timezone="UTC")
    trigger = CronTrigger(hour=int(cfg.get("cron_hour", 3)),
                          minute=int(cfg.get("cron_minute", 15)))
    _scheduler.add_job(_safe_run, trigger=trigger, id="octon-web-learning",
                       replace_existing=True)
    _scheduler.start()
    logger.info("Web-learning scheduler started (enabled=%s, %02d:%02d UTC)",
                cfg.get("enabled"), cfg.get("cron_hour"), cfg.get("cron_minute"))


async def _safe_run() -> None:
    """Scheduler entrypoint — guards on the enabled flag at run time."""
    if _db_ref is None:
        return
    cfg = await get_config(_db_ref)
    if not cfg.get("enabled"):
        return
    try:
        await run_scheduled_ingestion(_db_ref)
    except Exception as e:
        logger.exception(f"scheduled ingestion raised: {e}")


async def run_now(db) -> Dict:
    """Admin-triggered immediate run (ignores the enabled flag on the config
    so admins can manually fire even while the schedule is paused)."""
    return await run_scheduled_ingestion(db)
