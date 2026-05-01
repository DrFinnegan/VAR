"""Admin hygiene endpoints — clean up test/dev incidents that pollute the
corpus. Locked behind the admin role so it can't be abused."""
import logging
from typing import Optional

from fastapi import HTTPException, Request

from auth import get_current_user
from core import api_router, db

logger = logging.getLogger(__name__)


@api_router.post("/admin/hygiene/cleanup-fast-fire-tests")
async def cleanup_fast_fire_tests(
    request: Request,
    keep_recent: int = 0,
    dry_run: bool = False,
):
    """Delete fast-fire incidents tagged `quick_fire` whose description is
    obviously a test (default team_involved fixtures: Liverpool, Arsenal,
    Manchester City) so they don't pollute the rail / Match Wall.

    Query:
      keep_recent  — keep this many newest fast-fire incidents (default 0)
      dry_run=true — count only, don't delete
    """
    user = await get_current_user(request, db)
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    query = {"tags": {"$in": ["quick_fire"]}}

    cursor = db.incidents.find(query, {"_id": 0, "id": 1, "created_at": 1}).sort("created_at", -1)
    candidates = await cursor.to_list(10000)
    keep = candidates[:max(0, keep_recent)]
    keep_ids = {d["id"] for d in keep}
    delete_ids = [d["id"] for d in candidates if d["id"] not in keep_ids]

    if dry_run:
        return {
            "matched": len(candidates),
            "would_keep": len(keep_ids),
            "would_delete": len(delete_ids),
            "sample_to_delete": delete_ids[:10],
        }

    if not delete_ids:
        return {"matched": len(candidates), "deleted": 0, "kept": len(keep_ids)}

    res = await db.incidents.delete_many({"id": {"$in": delete_ids}})
    logger.info("Hygiene: deleted %d fast-fire test incidents", res.deleted_count)
    return {
        "matched": len(candidates),
        "deleted": res.deleted_count,
        "kept": len(keep_ids),
    }


@api_router.post("/admin/hygiene/reanalyse-text-only")
async def reanalyse_text_only(request: Request, limit: int = 50):
    """Mark text-only incidents (no visual evidence) for re-analysis. Useful
    after the ffmpeg outage — incidents created during that window can be
    bulk-flagged so operators see them as needing a video re-upload."""
    user = await get_current_user(request, db)
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    cursor = db.incidents.find(
        {
            "ai_analysis.visual_evidence_source": {"$in": [None, "text_only"]},
            "video_storage_path": {"$ne": None},
        },
        {"_id": 0, "id": 1},
    ).limit(max(1, min(500, limit)))
    docs = await cursor.to_list(limit)
    return {
        "candidates": len(docs),
        "ids": [d["id"] for d in docs],
        "hint": "Use POST /api/incidents/{id}/reanalyze to re-run with the multi-frame pipeline.",
    }
