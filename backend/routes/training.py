"""Training Library: precedent CRUD, media upload, RAG retrieve, web-learning,
auto-learn scheduler, feeds management."""
import base64
import logging
import uuid
from datetime import datetime, timezone
from typing import Dict, List, Optional

from fastapi import File, HTTPException, Query, Request, UploadFile
from pydantic import BaseModel

from auth import require_role
from core import IncidentType, api_router, db
from storage import put_object
from web_learning import ingest_url as _web_ingest_url
from web_learning import recent_ingestion_log as _web_recent_log
from web_scheduler import (
    delete_feed as _sched_delete_feed,
    get_config as _sched_get_config,
    list_feeds as _sched_list_feeds,
    run_now as _sched_run_now,
    start_scheduler as _sched_restart,
    update_config as _sched_update_config,
    upsert_feed as _sched_upsert_feed,
)

logger = logging.getLogger("octon.training")


class TrainingCaseCreate(BaseModel):
    title: str
    incident_type: IncidentType
    correct_decision: str
    rationale: str
    keywords: List[str] = []
    tags: List[str] = []
    match_context: Optional[Dict] = None
    law_references: List[str] = []
    outcome: Optional[str] = None


class TrainingCaseUpdate(BaseModel):
    title: Optional[str] = None
    correct_decision: Optional[str] = None
    rationale: Optional[str] = None
    keywords: Optional[List[str]] = None
    tags: Optional[List[str]] = None
    match_context: Optional[Dict] = None
    law_references: Optional[List[str]] = None
    outcome: Optional[str] = None
    visual_tags: Optional[List[str]] = None


class TextAnalysisRequest(BaseModel):
    incident_type: IncidentType
    description: str
    additional_context: Optional[str] = None


class WebIngestRequest(BaseModel):
    url: str
    auto_save: bool = True


class ScheduleConfigPatch(BaseModel):
    enabled: Optional[bool] = None
    cron_hour: Optional[int] = None
    cron_minute: Optional[int] = None


class FeedUpsert(BaseModel):
    url: str
    label: Optional[str] = None
    enabled: bool = True


def _format_case(doc: dict) -> dict:
    doc.pop("_id", None)
    return doc


# ── Cases CRUD ─────────────────────────────────────────────
@api_router.post("/training/cases")
async def create_training_case(data: TrainingCaseCreate, request: Request):
    """Create a ground-truth VAR precedent (admin only)."""
    user = await require_role(request, db, ["admin"])
    now = datetime.now(timezone.utc).isoformat()
    case = {
        "id": str(uuid.uuid4()),
        "title": data.title,
        "incident_type": data.incident_type.value,
        "correct_decision": data.correct_decision,
        "rationale": data.rationale,
        "keywords": [k.strip() for k in data.keywords if k and k.strip()],
        "tags": [t.strip() for t in data.tags if t and t.strip()],
        "match_context": data.match_context or {},
        "law_references": data.law_references or [],
        "outcome": data.outcome,
        "visual_tags": [],
        "media_storage_path": None,
        "thumbnail_storage_path": None,
        "created_by": user["id"],
        "created_by_name": user.get("name"),
        "created_at": now,
        "updated_at": now,
    }
    await db.training_cases.insert_one(case.copy())
    return _format_case(case)


@api_router.get("/training/cases")
async def list_training_cases(
    incident_type: Optional[str] = None,
    q: Optional[str] = None,
    law_q: Optional[str] = None,
    tag: Optional[str] = None,
    limit: int = Query(100, ge=1, le=500),
):
    query: Dict = {}
    if incident_type:
        query["incident_type"] = incident_type
    if tag:
        query["tags"] = tag
    if q:
        rx = {"$regex": q, "$options": "i"}
        query["$or"] = [{"title": rx}, {"rationale": rx}, {"correct_decision": rx}]
    if law_q:
        lrx = {"$regex": law_q, "$options": "i"}
        law_or = [
            {"law_references": lrx},
            {"title": lrx},
            {"rationale": lrx},
            {"correct_decision": lrx},
        ]
        if "$or" in query:
            existing_or = query.pop("$or")
            query["$and"] = [{"$or": existing_or}, {"$or": law_or}]
        else:
            query["$or"] = law_or
    return await db.training_cases.find(query, {"_id": 0}).sort("created_at", -1).to_list(limit)


@api_router.get("/training/cases/{case_id}")
async def get_training_case(case_id: str):
    doc = await db.training_cases.find_one({"id": case_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Training case not found")
    return doc


@api_router.put("/training/cases/{case_id}")
async def update_training_case(case_id: str, data: TrainingCaseUpdate, request: Request):
    await require_role(request, db, ["admin"])
    update = {k: v for k, v in data.model_dump(exclude_unset=True).items() if v is not None}
    if not update:
        raise HTTPException(status_code=400, detail="No fields to update")
    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    result = await db.training_cases.find_one_and_update(
        {"id": case_id}, {"$set": update}, return_document=True, projection={"_id": 0}
    )
    if not result:
        raise HTTPException(status_code=404, detail="Training case not found")
    return result


@api_router.delete("/training/cases/{case_id}")
async def delete_training_case(case_id: str, request: Request):
    await require_role(request, db, ["admin"])
    res = await db.training_cases.delete_one({"id": case_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Training case not found")
    return {"message": "Training case deleted"}


@api_router.post("/training/cases/{case_id}/media")
async def upload_training_media(case_id: str, file: UploadFile = File(...), request: Request = None):
    """Upload image/video for a training case and optionally auto-tag via vision AI."""
    await require_role(request, db, ["admin"])
    case = await db.training_cases.find_one({"id": case_id}, {"_id": 0})
    if not case:
        raise HTTPException(status_code=404, detail="Training case not found")

    ext = (file.filename or "bin").split(".")[-1].lower()
    from storage import MIME_TYPES
    content_type = MIME_TYPES.get(ext, file.content_type or "application/octet-stream")
    path = f"octon-var/training/{case_id}/{uuid.uuid4()}.{ext}"
    data_bytes = await file.read()
    if len(data_bytes) > 200 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File too large (200 MB max)")
    try:
        put_object(path, data_bytes, content_type)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Storage upload failed: {e}")

    is_image = content_type.startswith("image/")
    update: Dict = {
        "media_storage_path": path,
        "media_content_type": content_type,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    if is_image:
        update["thumbnail_storage_path"] = path

    auto_tags: List[str] = []
    if is_image:
        try:
            from training import auto_tag_image
            b64 = base64.b64encode(data_bytes).decode("utf-8")
            auto_tags = await auto_tag_image(b64)
            if auto_tags:
                update["visual_tags"] = list(set((case.get("visual_tags") or []) + auto_tags))
        except Exception as e:
            logger.warning(f"Auto-tag failed: {e}")

    result = await db.training_cases.find_one_and_update(
        {"id": case_id}, {"$set": update}, return_document=True, projection={"_id": 0}
    )
    return {"case": result, "auto_tags": auto_tags, "is_image": is_image}


@api_router.post("/training/seed")
async def seed_training_cases(request: Request):
    """Bulk-import canonical VAR precedents (idempotent by title)."""
    await require_role(request, db, ["admin"])
    from training_seed import CANONICAL_CASES
    now = datetime.now(timezone.utc).isoformat()
    inserted, skipped = 0, 0
    for tpl in CANONICAL_CASES:
        existing = await db.training_cases.find_one({"title": tpl["title"]}, {"_id": 0})
        if existing:
            skipped += 1
            continue
        case = {
            "id": str(uuid.uuid4()),
            **tpl,
            "visual_tags": [],
            "media_storage_path": None,
            "thumbnail_storage_path": None,
            "created_by": "seed",
            "created_by_name": "OCTON Seed",
            "created_at": now,
            "updated_at": now,
        }
        await db.training_cases.insert_one(case.copy())
        inserted += 1
    total = await db.training_cases.count_documents({})
    return {"inserted": inserted, "skipped": skipped, "total_cases": total}


@api_router.get("/training/stats")
async def training_stats():
    total = await db.training_cases.count_documents({})
    by_type_pipe = [
        {"$group": {"_id": "$incident_type", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
    ]
    by_type = await db.training_cases.aggregate(by_type_pipe).to_list(20)
    with_media = await db.training_cases.count_documents({"media_storage_path": {"$ne": None}})

    # ── Corpus telemetry: composition by source/origin ───────────────
    # `created_by` distinguishes:
    #   "seed"             → bootstrap CANONICAL_CASES (training_seed.py)
    #   "system-scheduler" → web-learning auto-ingest (Wikipedia / RSS)
    #   "operator-promoted" / user-id → operator feedback loop
    #   anything else      → manual admin entry
    # We collapse user-ids under "operator" so the breakdown is readable.
    by_source_pipe = [
        {"$group": {"_id": "$created_by", "count": {"$sum": 1}}},
    ]
    raw_by_source = await db.training_cases.aggregate(by_source_pipe).to_list(50)
    bucket = {"seed": 0, "web-learning": 0, "operator": 0, "manual": 0}
    for row in raw_by_source:
        cb = (row.get("_id") or "").strip()
        n = row.get("count", 0)
        if cb == "seed":
            bucket["seed"] += n
        elif cb in ("system-scheduler", "system"):
            bucket["web-learning"] += n
        elif cb == "operator-promoted" or (cb and cb != "manual" and cb != "seed"):
            # any user-id ends up here (operator feedback loop)
            bucket["operator"] += n
        else:
            bucket["manual"] += n
    # Operator-promoted incidents are also tagged via the `source` field
    # ("operator-promoted") for cases inserted before created_by was rich.
    promoted_legacy = await db.training_cases.count_documents(
        {"source": "operator-promoted", "created_by": {"$in": [None, "", "manual"]}}
    )
    if promoted_legacy:
        bucket["operator"] += promoted_legacy
        bucket["manual"] = max(0, bucket["manual"] - promoted_legacy)
    by_source = [{"source": k, "count": v} for k, v in bucket.items() if v > 0]
    by_source.sort(key=lambda x: -x["count"])

    # Recent (last 24h) growth — useful for the "is web-learning healthy?" tile.
    from datetime import datetime, timedelta, timezone
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
    last_24h = await db.training_cases.count_documents({"created_at": {"$gte": cutoff}})
    last_24h_web = await db.training_cases.count_documents(
        {"created_at": {"$gte": cutoff}, "created_by": "system-scheduler"}
    )

    # ── Vision-escalation telemetry ──
    # Count incidents whose AI analysis fired the violent-conduct safety-net.
    # Surfaced in the operator's Training Library so admin can spot trends
    # (e.g. "23 escalations in last 24h" → broadcast may have a series of
    # heavy clashes worth reviewing).
    # Wave-10: split into two distinct safety-nets.
    #   • vision_escalations  — violent-conduct (elbow / stamp / strike)
    #   • consequence_corrections — handball-in-box upgrade + no-goal veto
    # Each has its own filter so admin sees independent hit-rates.
    vision_24h_cutoff = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()

    vc_filter = {
        "ai_analysis.vision_escalation.triggered": True,
        "ai_analysis.vision_escalation.kind": "violent_conduct",
    }
    vc_total = await db.incidents.count_documents(vc_filter)
    vc_24h = await db.incidents.count_documents(
        {**vc_filter, "created_at": {"$gte": vision_24h_cutoff}}
    )
    vc_top_pipe = [
        {"$match": vc_filter},
        {"$group": {"_id": "$ai_analysis.vision_escalation.trigger_phrase",
                    "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 6},
    ]
    vc_top = [
        {"trigger": t["_id"], "count": t["count"]}
        for t in await db.incidents.aggregate(vc_top_pipe).to_list(6)
        if t.get("_id")
    ]

    cc_filter = {"ai_analysis.consequence_correction.triggered": True}
    cc_total = await db.incidents.count_documents(cc_filter)
    cc_24h = await db.incidents.count_documents(
        {**cc_filter, "created_at": {"$gte": vision_24h_cutoff}}
    )
    cc_top_pipe = [
        {"$match": cc_filter},
        {"$group": {"_id": "$ai_analysis.consequence_correction.trigger_phrase",
                    "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 6},
    ]
    cc_top = [
        {"trigger": t["_id"], "count": t["count"]}
        for t in await db.incidents.aggregate(cc_top_pipe).to_list(6)
        if t.get("_id")
    ]

    # Backwards-compat: keep the legacy `vision_escalations` totals
    # counting BOTH classes so existing dashboards don't break, and add
    # the new `consequence_corrections` block alongside it.
    vision_total = vc_total + cc_total
    vision_24h = vc_24h + cc_24h
    top_triggers = sorted(vc_top + cc_top, key=lambda r: -r["count"])[:6]

    return {
        "total_cases": total,
        "by_type": [{"incident_type": b["_id"], "count": b["count"]} for b in by_type],
        "with_media": with_media,
        "by_source": by_source,
        "last_24h": last_24h,
        "last_24h_web": last_24h_web,
        "source_quality": await _compute_source_quality(),
        "vision_escalations": {
            "total": vision_total,
            "last_24h": vision_24h,
            "top_triggers": top_triggers,
            # Sub-breakdown for the new dedicated panels.
            "violent_conduct": {
                "total": vc_total, "last_24h": vc_24h, "top_triggers": vc_top,
            },
        },
        "consequence_corrections": {
            "total": cc_total,
            "last_24h": cc_24h,
            "top_triggers": cc_top,
        },
    }


async def _compute_source_quality() -> List[Dict]:
    """Per-source quality: avg final_confidence of incidents whose
    cited precedents trace back to each source bucket.

    Pipeline:
      1. Look up the last 200 incidents that have AI analysis with precedents_used.
      2. For each precedent id, resolve `created_by` from training_cases.
      3. Bucket by source (same buckets as by_source) and average final_confidence.
    """
    incidents = await db.incidents.find(
        {"ai_analysis.precedents_used.0": {"$exists": True},
         "ai_analysis.final_confidence": {"$exists": True}},
        {"_id": 0, "ai_analysis.precedents_used.id": 1, "ai_analysis.final_confidence": 1},
    ).sort("created_at", -1).to_list(200)
    if not incidents:
        return []
    # Pre-fetch the created_by for every cited precedent in a single query.
    all_ids = set()
    for inc in incidents:
        for p in inc.get("ai_analysis", {}).get("precedents_used", []):
            if p.get("id"):
                all_ids.add(p["id"])
    if not all_ids:
        return []
    case_rows = await db.training_cases.find(
        {"id": {"$in": list(all_ids)}},
        {"_id": 0, "id": 1, "created_by": 1, "source": 1},
    ).to_list(len(all_ids))
    case_source = {}
    for c in case_rows:
        cb = (c.get("created_by") or "").strip()
        src_field = (c.get("source") or "").strip()
        if cb == "seed":
            bucket = "seed"
        elif cb in ("system-scheduler", "system"):
            bucket = "web-learning"
        elif cb == "operator-promoted" or src_field == "operator-promoted" or (cb and cb != "manual"):
            bucket = "operator"
        else:
            bucket = "manual"
        case_source[c["id"]] = bucket

    # Aggregate per bucket: sum/count of final_confidence across citing incidents.
    sums = {"seed": 0.0, "web-learning": 0.0, "operator": 0.0, "manual": 0.0}
    counts = {"seed": 0, "web-learning": 0, "operator": 0, "manual": 0}
    for inc in incidents:
        conf = inc.get("ai_analysis", {}).get("final_confidence")
        if conf is None:
            continue
        cited_buckets = set()
        for p in inc.get("ai_analysis", {}).get("precedents_used", []):
            b = case_source.get(p.get("id"))
            if b:
                cited_buckets.add(b)
        for b in cited_buckets:
            sums[b] += float(conf)
            counts[b] += 1
    out: List[Dict] = []
    for b in ("seed", "web-learning", "operator", "manual"):
        if counts[b] > 0:
            out.append({
                "source": b,
                "citation_count": counts[b],
                "avg_confidence": round(sums[b] / counts[b], 1),
            })
    return out


# ── Auto-seed GAP types via LLM ─────────────────────────
# Allowed types: extends the IncidentType enum to include legacy/derived
# corpus buckets ("freekick", "card") so the GAP-row auto-seed can target
# every type that surfaces in `/training/stats.by_type`.
_AUTOSEED_ALLOWED = {
    "offside", "handball", "foul", "penalty", "goal_line",
    "red_card", "corner", "other", "freekick", "card", "goal",
}


class AutoSeedRequest(BaseModel):
    incident_type: str
    count: int = 5


@api_router.post("/training/auto-seed-type")
async def auto_seed_type(body: AutoSeedRequest, request: Request):
    """Generate N canonical training cases for an under-represented incident
    type. Used by the Training Library's GAP rows to one-click backfill.

    Each generated case follows the CANONICAL_CASES schema and is tagged
    `auto-seeded` so admins can audit / prune later. Idempotent by title
    (LLM duplicates skip on insert).
    """
    user = await require_role(request, db, ["admin"])
    inc_type = (body.incident_type or "").strip().lower()
    if inc_type not in _AUTOSEED_ALLOWED:
        raise HTTPException(
            status_code=400,
            detail=f"incident_type must be one of: {sorted(_AUTOSEED_ALLOWED)}",
        )
    n = max(1, min(15, int(body.count or 5)))
    cases = await _llm_generate_canonical_cases(inc_type, n)
    now_iso = datetime.now(timezone.utc).isoformat()
    inserted, skipped = 0, 0
    for c in cases:
        title = (c.get("title") or "").strip()
        if not title or not c.get("correct_decision") or not c.get("rationale"):
            skipped += 1
            continue
        existing = await db.training_cases.find_one({"title": title}, {"_id": 0, "id": 1})
        if existing:
            skipped += 1
            continue
        doc = {
            "id": str(uuid.uuid4()),
            "title": title,
            "incident_type": inc_type,
            "correct_decision": c.get("correct_decision"),
            "rationale": c.get("rationale"),
            "keywords": c.get("keywords") or [],
            "tags": list(set(["auto-seeded", "gap-fill"] + (c.get("tags") or []))),
            "match_context": c.get("match_context") or {},
            "law_references": c.get("law_references") or [],
            "outcome": c.get("outcome"),
            "visual_tags": [],
            "media_storage_path": None,
            "thumbnail_storage_path": None,
            "source": "auto-seeded",
            "created_by": user.get("id") or "auto-seed",
            "created_by_name": "OCTON Auto-Seed",
            "created_at": now_iso,
            "updated_at": now_iso,
        }
        await db.training_cases.insert_one(doc.copy())
        inserted += 1
    total = await db.training_cases.count_documents({"incident_type": inc_type})
    return {
        "incident_type": inc_type,
        "requested": n,
        "inserted": inserted,
        "skipped": skipped,
        "total_for_type": total,
    }


async def _llm_generate_canonical_cases(incident_type: str, count: int) -> List[Dict]:
    """Single LLM call that returns `count` canonical VAR cases for the
    given incident_type as a JSON array. Falls back to empty list if the
    Emergent LLM key is missing or the response is unparseable — caller
    handles the empty-result UX.
    """
    import os
    import json
    import re
    api_key = os.environ.get("EMERGENT_LLM_KEY")
    if not api_key:
        logger.warning("EMERGENT_LLM_KEY missing — auto-seed cannot run")
        return []
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
    except Exception as e:
        logger.warning(f"emergentintegrations import failed: {e}")
        return []
    session_id = f"octon-autoseed-{int(datetime.now(timezone.utc).timestamp())}"
    chat = LlmChat(
        api_key=api_key,
        session_id=session_id,
        system_message=(
            "You are an IFAB / VAR archivist. Produce canonical training cases "
            "for the OCTON VAR precedent corpus. Your output must be a single "
            "JSON ARRAY only (no prose, no code fence). Each entry MUST contain: "
            "title (string), correct_decision (string), rationale (string, 2-3 "
            "sentences), keywords (string[]), tags (string[]), match_context "
            "({teams,competition,year}), law_references (string[]), outcome "
            "(string). The cases must be REAL or canonically-illustrative VAR "
            "scenarios derived from publicly-known IFAB / FIFA / PGMOL training "
            "material. Avoid duplicates. Do NOT mention 'Dr Finnegan' or any "
            "individual designers/operators."
        ),
    ).with_model("openai", "gpt-5.2")
    prompt = (
        f"Produce {count} canonical training cases of incident_type='{incident_type}'.\n"
        f"Each case must illustrate a distinct law application or VAR ruling pattern.\n"
        f"Return JSON array only."
    )
    try:
        resp = await chat.send_message(UserMessage(text=prompt))
        text = (resp or "").strip()
        # Strip code-fences if any
        text = re.sub(r"^```[a-z]*\n?", "", text)
        text = re.sub(r"\n?```$", "", text)
        m = re.search(r"\[\s*{.*}\s*\]", text, re.DOTALL)
        if not m:
            return []
        arr = json.loads(m.group(0))
        if isinstance(arr, list):
            return [c for c in arr if isinstance(c, dict)][:count]
    except Exception as e:
        logger.warning(f"LLM auto-seed parse failed: {e}")
    return []


@api_router.post("/training/retrieve")
async def preview_precedents(req: TextAnalysisRequest):
    """Preview which precedents would be retrieved for a given description."""
    from training import compute_confidence_uplift, retrieve_precedents
    precedents = await retrieve_precedents(db, req.incident_type.value, req.description)
    uplift_info = compute_confidence_uplift(precedents)
    return {"precedents": precedents, **uplift_info}


# ── Web-learning ──────────────────────────────────────────
@api_router.post("/training/ingest-url")
async def training_ingest_url(body: WebIngestRequest, request: Request):
    """Fetch a match-report URL, extract VAR decisions, seed training corpus."""
    user = await require_role(request, db, ["admin"])
    url = (body.url or "").strip()
    if not (url.startswith("http://") or url.startswith("https://")):
        raise HTTPException(status_code=400, detail="url must start with http:// or https://")
    try:
        return await _web_ingest_url(db, url, user, auto_save=body.auto_save)
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception("web ingestion failed")
        raise HTTPException(status_code=500, detail=f"Ingestion failed: {e}")


@api_router.get("/training/ingest-log")
async def training_ingest_log(request: Request, limit: int = 20):
    """Return recent web-ingestion attempts (admin only)."""
    await require_role(request, db, ["admin"])
    limit = max(1, min(100, int(limit)))
    return await _web_recent_log(db, limit=limit)


# ── Web-learning scheduler (cron + feeds) ────────────────
@api_router.get("/training/schedule")
async def schedule_get(request: Request):
    await require_role(request, db, ["admin"])
    cfg = await _sched_get_config(db)
    feeds = await _sched_list_feeds(db)
    return {"config": cfg, "feeds": feeds}


@api_router.put("/training/schedule")
async def schedule_update(body: ScheduleConfigPatch, request: Request):
    await require_role(request, db, ["admin"])
    patch = {k: v for k, v in body.model_dump(exclude_none=True).items()}
    if "cron_hour" in patch and not (0 <= patch["cron_hour"] <= 23):
        raise HTTPException(status_code=400, detail="cron_hour must be 0..23")
    if "cron_minute" in patch and not (0 <= patch["cron_minute"] <= 59):
        raise HTTPException(status_code=400, detail="cron_minute must be 0..59")
    cfg = await _sched_update_config(db, patch)
    if {"cron_hour", "cron_minute"} & set(patch.keys()):
        try:
            await _sched_restart(db)
        except Exception as e:
            logger.warning(f"scheduler restart failed: {e}")
    return cfg


@api_router.post("/training/schedule/run-now")
async def schedule_run_now(request: Request):
    """Fire the scheduled ingestion immediately (admin override)."""
    await require_role(request, db, ["admin"])
    return await _sched_run_now(db)


@api_router.post("/training/feeds")
async def feeds_upsert(body: FeedUpsert, request: Request):
    await require_role(request, db, ["admin"])
    try:
        return await _sched_upsert_feed(db, url=body.url, label=body.label or "", enabled=body.enabled)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@api_router.delete("/training/feeds/{feed_id}")
async def feeds_delete(feed_id: str, request: Request):
    await require_role(request, db, ["admin"])
    ok = await _sched_delete_feed(db, feed_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Feed not found")
    return {"deleted": True}
