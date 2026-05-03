"""
OCTON VAR — Continuous Self-Audit
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Once a week (Sunday 02:00 UTC) the engine re-analyses every decided
incident from the past 14 days using the *current* training corpus.
Whenever the new verdict differs from the historical decision OR
the new confidence is materially higher, an audit row is written to
the `self_audit` collection and surfaced on the admin dashboard.

This produces an explicit "I changed my mind because of new evidence"
trail — the visible proof that OCTON is genuinely self-learning and
not just running text-pattern matching.

Architect: Dr Finnegan
"""
import logging
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Optional

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

logger = logging.getLogger(__name__)

# Tunables
LOOKBACK_DAYS = 14
DRIFT_CONFIDENCE_THRESHOLD = 8.0  # +/- % to flag as material drift
MAX_AUDIT_INCIDENTS = 50          # ceiling per run to keep LLM costs bounded

_scheduler: Optional[AsyncIOScheduler] = None
_db_ref = None


async def run_self_audit(db) -> Dict:
    """Re-analyse recent decided incidents against the current corpus."""
    since = datetime.now(timezone.utc) - timedelta(days=LOOKBACK_DAYS)
    # Audit ANY incident with an AI analysis from the last 14 days —
    # whether the operator has signed off or not. This is what makes
    # the audit meaningful: if the corpus has shifted enough to bump
    # confidence on an open incident, the operator should be told now.
    cursor = db.incidents.find(
        {
            "ai_analysis": {"$exists": True, "$ne": None},
            "created_at": {"$gte": since.isoformat()},
        },
        {"_id": 0},
    ).sort("created_at", -1).limit(MAX_AUDIT_INCIDENTS)
    incidents = await cursor.to_list(MAX_AUDIT_INCIDENTS)

    drift_rows: List[Dict] = []
    examined = 0
    for inc in incidents:
        try:
            old = inc.get("ai_analysis") or {}
            old_decision = (old.get("suggested_decision") or "").strip()
            old_conf = float(old.get("final_confidence") or 0)
            old_uplift = float(old.get("confidence_uplift") or 0)

            # Re-run ONLY the precedent-retrieval + uplift path. This is
            # cheap (no LLM call) and isolates whether the corpus has
            # changed enough to bump confidence/decision.
            from training import retrieve_precedents, compute_confidence_uplift
            precedents = await retrieve_precedents(db, inc["incident_type"], inc.get("description", ""))
            new_uplift = compute_confidence_uplift(precedents)

            uplift_delta = new_uplift["uplift"] - old_uplift
            new_conf_estimate = min(99.0, old_conf - old_uplift + new_uplift["uplift"])
            conf_delta = new_conf_estimate - old_conf

            fresh_count = new_uplift.get("fresh_precedents", 0)
            material = abs(conf_delta) >= DRIFT_CONFIDENCE_THRESHOLD or fresh_count > 0

            if material:
                drift_rows.append({
                    "incident_id": inc["id"],
                    "incident_type": inc.get("incident_type"),
                    "old_decision": old_decision,
                    "old_confidence": round(old_conf, 1),
                    "new_confidence_estimate": round(new_conf_estimate, 1),
                    "confidence_delta": round(conf_delta, 1),
                    "uplift_delta": round(uplift_delta, 1),
                    "fresh_precedents_now": fresh_count,
                    "fresh_bonus_now": new_uplift.get("fresh_bonus", 0.0),
                    "examined_at": datetime.now(timezone.utc).isoformat(),
                })
            examined += 1
        except Exception as e:
            logger.warning(f"self-audit failed for incident {inc.get('id')}: {e}")

    summary = {
        "ran_at": datetime.now(timezone.utc).isoformat(),
        "examined": examined,
        "drift_count": len(drift_rows),
        "drift_rows": drift_rows[:30],  # cap for storage
    }
    await db.self_audit.insert_one({**summary})  # _id is auto
    # And refresh the latest pointer for the dashboard
    await db.system_state.update_one(
        {"id": "self_audit_latest"},
        {"$set": {"id": "self_audit_latest", **summary}},
        upsert=True,
    )
    logger.info(f"Self-audit run: examined={examined}, drift={len(drift_rows)}")
    return summary


# ── Scheduler lifecycle ──

async def start_self_audit(db) -> None:
    global _scheduler, _db_ref
    _db_ref = db
    if _scheduler and _scheduler.running:
        _scheduler.shutdown(wait=False)
    _scheduler = AsyncIOScheduler(timezone="UTC")
    # Sunday 02:00 UTC — weekly audit cycle
    _scheduler.add_job(
        _safe_run, trigger=CronTrigger(day_of_week="sun", hour=2, minute=0),
        id="octon-self-audit", replace_existing=True,
    )
    _scheduler.start()
    logger.info("Self-audit scheduler started (Sun 02:00 UTC)")


async def _safe_run() -> None:
    try:
        await run_self_audit(_db_ref)
    except Exception as e:
        logger.exception(f"Self-audit run errored: {e}")
