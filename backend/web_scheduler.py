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
from apscheduler.triggers.cron import CronTrigger  # noqa: F401  (kept for legacy admin endpoints)
from datetime import datetime as _dt_now_safe, timezone as _tz_now_safe, timedelta as _td_now_safe

def now_safe():
    """First run ~60 s after server start so boot finishes before harvest kicks off."""
    return _dt_now_safe.now(_tz_now_safe.utc).replace(microsecond=0) + _td_now_safe(seconds=60)

from web_learning import ingest_url

logger = logging.getLogger(__name__)

CONFIG_ID = "web_learning"
SYSTEM_USER = {"id": "system-scheduler", "name": "OCTON Scheduler"}
# 2026-02 — Continuous-learning v2:
#   • daily 3am cron → 3-hour interval so PL/UCL match reports land
#     in the corpus the same evening as kick-off
#   • per-feed rate-limit dropped 20h → 4h so the same Guardian/BBC
#     section page can yield freshly-published match reports through
#     the day rather than once per 24h
MIN_REFRESH_HOURS = 4
SCHEDULE_INTERVAL_HOURS = 3
# 2026-02 — auto-disable a feed after N consecutive runs that produce 0
# usable cases. Conservative threshold: 7 (≈ 21 hours of no learning at
# the 3-hour cadence) avoids flapping on temporary publisher hiccups
# while still pruning truly dead links from the rotation.
_AUTO_DISABLE_AFTER = 7


DEFAULT_FEEDS: List[Dict] = [
    # ── Section/landing pages — daily PL + UCL match reports ───────
    # These section pages publish multiple match reports a day. The
    # extractor de-dupes per article URL, so re-hitting them every
    # few hours yields fresh precedent without spam.
    {"url": "https://www.theguardian.com/football",
     "label": "The Guardian · Football",          "enabled": True},
    {"url": "https://www.theguardian.com/football/champions-league",
     "label": "The Guardian · Champions League",  "enabled": True},
    {"url": "https://www.theguardian.com/football/premierleague",
     "label": "The Guardian · Premier League",    "enabled": True},
    {"url": "https://www.espn.com/soccer/",
     "label": "ESPN Soccer",                       "enabled": True},
    {"url": "https://www.espn.com/soccer/league/_/name/eng.1",
     "label": "ESPN · English Premier League",    "enabled": True},
    {"url": "https://www.espn.com/soccer/league/_/name/uefa.champions",
     "label": "ESPN · UEFA Champions League",     "enabled": True},
    {"url": "https://www.bbc.com/sport/football",
     "label": "BBC Sport · Football",              "enabled": True},
    {"url": "https://www.bbc.com/sport/football/premier-league",
     "label": "BBC Sport · Premier League",       "enabled": True},
    {"url": "https://www.bbc.com/sport/football/champions-league",
     "label": "BBC Sport · Champions League",     "enabled": True},
    {"url": "https://www.premierleague.com/news",
     "label": "Premier League · Official News",   "enabled": True},
    {"url": "https://www.skysports.com/football/news",
     "label": "Sky Sports · Football News",       "enabled": True},
    {"url": "https://www.skysports.com/premier-league-news",
     "label": "Sky Sports · Premier League News", "enabled": True},
    {"url": "https://www.skysports.com/champions-league-news",
     "label": "Sky Sports · Champions League News","enabled": True},
    {"url": "https://www.uefa.com/uefachampionsleague/news/",
     "label": "UEFA · Champions League Official", "enabled": True},
]


# ── Curated single-article URLs ─────────────────────────────────────────
# Stable, encyclopedic / canonical resources that contain multiple unambiguous
# VAR-reviewable decisions in a single page. The auto-extractor (see
# web_learning.py — uses LLM with explicit "INCIDENT + FINAL OUTCOME" rule)
# can usually pull 2-6 precedents per Wikipedia / IFAB / official-rules page.
# These are added on every server boot via `seed_curated_articles()`; admins
# can disable any individual entry from the Training Library UI.
CURATED_ARTICLE_URLS: List[Dict] = [
    {"url": "https://en.wikipedia.org/wiki/Video_assistant_referee",
     "label": "Wikipedia · Video Assistant Referee (canonical reference)"},
    {"url": "https://en.wikipedia.org/wiki/2018_FIFA_World_Cup_Final",
     "label": "Wikipedia · 2018 World Cup Final (VAR penalty + handball precedent)"},
    {"url": "https://en.wikipedia.org/wiki/2022_FIFA_World_Cup_Final",
     "label": "Wikipedia · 2022 World Cup Final (multiple VAR reviews)"},
    {"url": "https://en.wikipedia.org/wiki/Goal-line_technology",
     "label": "Wikipedia · Goal-line Technology (Lampard 2010, Law 10)"},
    {"url": "https://en.wikipedia.org/wiki/Hand_of_God_goal",
     "label": "Wikipedia · Hand of God — handball-goal canonical precedent"},
    {"url": "https://en.wikipedia.org/wiki/Luis_Su%C3%A1rez",
     "label": "Wikipedia · Luis Suárez (handball-on-line + biting precedents)"},
    {"url": "https://en.wikipedia.org/wiki/Diving_(association_football)",
     "label": "Wikipedia · Simulation/Diving (Law 12 §3 examples)"},
    {"url": "https://en.wikipedia.org/wiki/Offside_(association_football)",
     "label": "Wikipedia · Offside (Law 11 — interfering, advantage, deliberate-play)"},
    {"url": "https://en.wikipedia.org/wiki/Penalty_kick_(association_football)",
     "label": "Wikipedia · Penalty Kick (Law 14 — encroachment, GK-line, retake)"},
    {"url": "https://www.premierleague.com/var",
     "label": "Premier League · Official VAR rules & decisions hub"},
    # ── Round 2 (2026-02): more VAR-rich encyclopedic sources ──
    {"url": "https://en.wikipedia.org/wiki/Laws_of_the_Game_(association_football)",
     "label": "Wikipedia · Laws of the Game (full IFAB Laws 1-17 reference)"},
    {"url": "https://en.wikipedia.org/wiki/Fouls_and_misconduct_(association_football)",
     "label": "Wikipedia · Fouls and Misconduct (Law 12 — careless/reckless/excessive force)"},
    {"url": "https://en.wikipedia.org/wiki/Direct_free_kick",
     "label": "Wikipedia · Direct Free Kick (10 DFK offences + handball)"},
    {"url": "https://en.wikipedia.org/wiki/Red_card_(association_football)",
     "label": "Wikipedia · Red Card (7 sending-off offences inc. DOGSO, SFP, VC)"},
    {"url": "https://en.wikipedia.org/wiki/Misconduct_(association_football)",
     "label": "Wikipedia · Misconduct (cautions/dissent/SPA/promising attack)"},
    {"url": "https://en.wikipedia.org/wiki/Handball_(association_football)",
     "label": "Wikipedia · Handball (Law 12 — APP, body-bigger, scorer rule)"},
    {"url": "https://en.wikipedia.org/wiki/2010_FIFA_World_Cup_knockout_stage",
     "label": "Wikipedia · 2010 WC Knockout (Lampard ghost goal — pre-GLT precedent)"},
    {"url": "https://en.wikipedia.org/wiki/2014_FIFA_World_Cup_Final",
     "label": "Wikipedia · 2014 World Cup Final (Schürrle/Götze + injuries)"},
    {"url": "https://en.wikipedia.org/wiki/UEFA_Euro_2020_final",
     "label": "Wikipedia · Euro 2020 Final (penalty shoot-out + sending-off)"},
    {"url": "https://en.wikipedia.org/wiki/Diego_Maradona",
     "label": "Wikipedia · Diego Maradona (Hand of God + handball precedents)"},
    {"url": "https://en.wikipedia.org/wiki/Thierry_Henry",
     "label": "Wikipedia · Thierry Henry (2009 handball assist — pre-VAR precedent)"},
    {"url": "https://en.wikipedia.org/wiki/UEFA_Euro_2024_Final",
     "label": "Wikipedia · Euro 2024 Final (recent VAR application)"},
    # ── Round 3 (2026-02): PL / Euro 2024 rich-text match reports ──
    {"url": "https://en.wikipedia.org/wiki/UEFA_Euro_2024_knockout_stage",
     "label": "Wikipedia · Euro 2024 Knockout Stage (10+ VAR-decided ties)"},
    {"url": "https://en.wikipedia.org/wiki/2023%E2%80%9324_Premier_League",
     "label": "Wikipedia · 2023-24 Premier League season (VAR incidents inc. Luis Diaz ghost-offside)"},
    {"url": "https://en.wikipedia.org/wiki/2024%E2%80%9325_Premier_League",
     "label": "Wikipedia · 2024-25 Premier League season (SAOT rollout season)"},
    {"url": "https://en.wikipedia.org/wiki/2022%E2%80%9323_Premier_League",
     "label": "Wikipedia · 2022-23 Premier League season (Haaland goal-line + multiple DOGSO)"},
    {"url": "https://en.wikipedia.org/wiki/2024_UEFA_Champions_League_Final",
     "label": "Wikipedia · 2024 UCL Final (Dortmund-Real Madrid VAR checks)"},
    {"url": "https://en.wikipedia.org/wiki/2022_FIFA_World_Cup_knockout_stage",
     "label": "Wikipedia · 2022 World Cup KO stage (multiple VAR precedents)"},
    {"url": "https://en.wikipedia.org/wiki/UEFA_Euro_2024_Group_C",
     "label": "Wikipedia · Euro 2024 Group C (England vs Slovenia handball checks)"},
    {"url": "https://en.wikipedia.org/wiki/UEFA_Champions_League",
     "label": "Wikipedia · UEFA Champions League (historical VAR landmark moments)"},
    # ── Round 4 (2026-02): FREE DATASETS / curated VAR analysis ──
    {"url": "https://en.wikipedia.org/wiki/Video_assistant_referee",
     "label": "Wikipedia · VAR — protocol, controversies, landmark cases"},
    {"url": "https://en.wikipedia.org/wiki/List_of_video_assistant_referee_decisions",
     "label": "Wikipedia · List of VAR decisions (comprehensive index)"},
    {"url": "https://en.wikipedia.org/wiki/2018_FIFA_World_Cup_final",
     "label": "Wikipedia · 2018 WC Final (first WC-final VAR penalty)"},
    {"url": "https://en.wikipedia.org/wiki/2022_FIFA_World_Cup_final",
     "label": "Wikipedia · 2022 WC Final (multiple VAR reviews, offside rulings)"},
    {"url": "https://en.wikipedia.org/wiki/Offside_(association_football)",
     "label": "Wikipedia · Offside — law text, 2021 armpit precedent, SAOT"},
    {"url": "https://en.wikipedia.org/wiki/Denying_a_goal-scoring_opportunity",
     "label": "Wikipedia · DOGSO — IFAB definition, 4-D test examples"},
    {"url": "https://en.wikipedia.org/wiki/Handball_(association_football)",
     "label": "Wikipedia · Handball — 2021 Law 12 narrowing, 2025/26 refinements"},
    {"url": "https://en.wikipedia.org/wiki/Laws_of_the_Game_(association_football)",
     "label": "Wikipedia · Laws of the Game — canonical reference"},
    {"url": "https://github.com/statsbomb/open-data",
     "label": "StatsBomb Open Data · free event-level football dataset (Euros, WC, WSL)"},
    {"url": "https://en.wikipedia.org/wiki/StatsBomb",
     "label": "Wikipedia · StatsBomb — open football event data methodology"},
    # ── Round 5 (2026-02): VAR-specific free datasets & PGMOL/IFAB pages ──
    {"url": "https://en.wikipedia.org/wiki/Premier_League_referees",
     "label": "Wikipedia · Premier League referees (PGMOL panel + season stats)"},
    {"url": "https://en.wikipedia.org/wiki/Professional_Game_Match_Officials_Limited",
     "label": "Wikipedia · PGMOL (post-match referee body explanations)"},
    {"url": "https://www.theifab.com/laws-of-the-game/",
     "label": "IFAB · Laws of the Game — official 2025/26 reference"},
    {"url": "https://en.wikipedia.org/wiki/Premier_League_Match_Centre",
     "label": "Wikipedia · PL Match Centre (official VAR explanation channel)"},
    {"url": "https://en.wikipedia.org/wiki/2024%E2%80%9325_UEFA_Champions_League",
     "label": "Wikipedia · 2024-25 UCL season (group + KO VAR decisions)"},
    {"url": "https://en.wikipedia.org/wiki/2025%E2%80%9326_Premier_League",
     "label": "Wikipedia · 2025-26 Premier League (current season VAR rulings)"},
    {"url": "https://en.wikipedia.org/wiki/2025%E2%80%9326_UEFA_Champions_League",
     "label": "Wikipedia · 2025-26 UCL (current season VAR rulings)"},
    {"url": "https://en.wikipedia.org/wiki/2025%E2%80%9326_La_Liga",
     "label": "Wikipedia · 2025-26 La Liga (RFEF VAR application)"},
    {"url": "https://en.wikipedia.org/wiki/Goal_Decision_System",
     "label": "Wikipedia · Goal Decision System (Hawk-Eye / GoalControl coverage)"},
    {"url": "https://en.wikipedia.org/wiki/Semi-automated_offside_technology",
     "label": "Wikipedia · Semi-Automated Offside Technology (FIFA SAOT 2022+ rulings)"},
    {"url": "https://en.wikipedia.org/wiki/Penalty_shoot-out_(association_football)",
     "label": "Wikipedia · Penalty Shoot-out (Law 14 procedure + VAR scope)"},
    {"url": "https://en.wikipedia.org/wiki/Corner_kick",
     "label": "Wikipedia · Corner Kick (Law 17 — taking, encroachment, in-play)"},
    {"url": "https://en.wikipedia.org/wiki/Throw-in",
     "label": "Wikipedia · Throw-in (Law 15 — VAR scope clarification)"},
    {"url": "https://en.wikipedia.org/wiki/Goal_kick",
     "label": "Wikipedia · Goal Kick (Law 16 — restart procedure)"},
]


async def seed_curated_articles(db) -> int:
    """Idempotently seed the curated single-article URL list as feeds.

    These are *enabled* by default (admin can flip off per-row in the UI).
    Existing rows that have never been attempted get their label/enabled
    flag aligned with the latest list — same idempotency contract as
    `seed_default_feeds`.
    """
    inserted = 0
    for f in CURATED_ARTICLE_URLS:
        existing = await db.feeds.find_one({"url": f["url"]}, {"_id": 0})
        if existing:
            never_run = existing.get("last_attempted_at") is None
            if never_run and not existing.get("enabled", False):
                await db.feeds.update_one(
                    {"url": f["url"]},
                    {"$set": {"enabled": True, "label": f["label"]}},
                )
            continue
        doc = {
            "id": str(uuid.uuid4()),
            "url": f["url"],
            "label": f["label"],
            "enabled": True,
            "curated": True,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "last_attempted_at": None,
            "last_inserted_count": 0,
        }
        await db.feeds.insert_one(doc.copy())
        inserted += 1
    return inserted


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
    successfully ingested in the last MIN_REFRESH_HOURS.

    Auto-disable rule (added 2026-02): a feed that returns ZERO usable
    extractions on `_AUTO_DISABLE_AFTER` consecutive runs is automatically
    disabled (`enabled=False`) with `auto_disabled_at`+`auto_disabled_reason`
    populated so the admin UI can re-enable manually if desired. Resets to
    0 the moment a run produces ≥1 inserted case.
    """
    feeds = await list_feeds(db)
    enabled = [f for f in feeds if f.get("enabled")]
    now = datetime.now(timezone.utc)
    processed: List[Dict] = []
    total_inserted = 0
    auto_disabled: List[Dict] = []
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
            update = {
                "last_attempted_at": now.isoformat(),
                "last_inserted_count": inserted,
            }
            if inserted > 0:
                update["consecutive_zero_runs"] = 0
                update["last_error"] = None
            else:
                update["consecutive_zero_runs"] = int(f.get("consecutive_zero_runs", 0)) + 1
                if update["consecutive_zero_runs"] >= _AUTO_DISABLE_AFTER:
                    update["enabled"] = False
                    update["auto_disabled_at"] = now.isoformat()
                    update["auto_disabled_reason"] = (
                        f"{_AUTO_DISABLE_AFTER} consecutive runs returned 0 cases"
                    )
                    auto_disabled.append({"url": f["url"], "label": f.get("label")})
            await db.feeds.update_one({"id": f["id"]}, {"$set": update})
            processed.append({
                "url": f["url"], "inserted": inserted,
                "accepted": result.get("accepted", 0),
                "extracted": result.get("extracted", 0),
                "consecutive_zero_runs": update.get("consecutive_zero_runs", 0),
                "auto_disabled": update.get("auto_disabled_at") is not None,
            })
        except Exception as e:
            logger.warning(f"scheduled ingest failed for {f['url']}: {e}")
            cz = int(f.get("consecutive_zero_runs", 0)) + 1
            update = {
                "last_attempted_at": now.isoformat(),
                "last_inserted_count": 0,
                "last_error": str(e)[:240],
                "consecutive_zero_runs": cz,
            }
            if cz >= _AUTO_DISABLE_AFTER:
                update["enabled"] = False
                update["auto_disabled_at"] = now.isoformat()
                update["auto_disabled_reason"] = (
                    f"{_AUTO_DISABLE_AFTER} consecutive runs failed/empty"
                )
                auto_disabled.append({"url": f["url"], "label": f.get("label")})
            await db.feeds.update_one({"id": f["id"]}, {"$set": update})
            processed.append({"url": f["url"], "error": str(e)[:120],
                              "consecutive_zero_runs": cz,
                              "auto_disabled": update.get("auto_disabled_at") is not None})

    summary = {
        "ran_at": now.isoformat(),
        "enabled_feeds": len(enabled),
        "total_inserted": total_inserted,
        "auto_disabled": auto_disabled,
        "details": processed,
    }
    await db.schedule_config.update_one(
        {"id": CONFIG_ID},
        {"$set": {"last_run_at": now.isoformat(), "last_run_summary": summary}},
        upsert=True,
    )
    if auto_disabled:
        logger.info(
            f"web-learning auto-disabled {len(auto_disabled)} feed(s) after "
            f"{_AUTO_DISABLE_AFTER} empty runs: "
            + ", ".join(d["url"] for d in auto_disabled)
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
    await seed_curated_articles(db)

    if _scheduler and _scheduler.running:
        _scheduler.shutdown(wait=False)

    _scheduler = AsyncIOScheduler(timezone="UTC")
    # 2026-02: switched from a single daily CronTrigger to a 3-hour
    # IntervalTrigger so the corpus tracks live matches in near-real
    # time. The per-feed MIN_REFRESH_HOURS guard keeps publishers from
    # being hammered.
    from apscheduler.triggers.interval import IntervalTrigger
    interval_hours = int(cfg.get("interval_hours", SCHEDULE_INTERVAL_HOURS))
    trigger = IntervalTrigger(hours=interval_hours)
    _scheduler.add_job(_safe_run, trigger=trigger, id="octon-web-learning",
                       replace_existing=True, next_run_time=now_safe())
    _scheduler.start()
    logger.info("Web-learning scheduler started (enabled=%s, every %d h)",
                cfg.get("enabled"), interval_hours)


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
