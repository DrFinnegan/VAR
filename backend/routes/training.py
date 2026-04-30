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
    pipeline = [
        {"$group": {"_id": "$incident_type", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
    ]
    by_type = await db.training_cases.aggregate(pipeline).to_list(20)
    with_media = await db.training_cases.count_documents({"media_storage_path": {"$ne": None}})
    return {
        "total_cases": total,
        "by_type": [{"incident_type": b["_id"], "count": b["count"]} for b in by_type],
        "with_media": with_media,
    }


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
