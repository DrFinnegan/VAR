"""Booth Activity admin endpoint.

Exposes the per-booth aggregation (decisions count, agreement rate, avg
confidence on recent incidents, live fixture). Admin-only.
"""
from fastapi import HTTPException, Request

from auth import get_current_user
from core import api_router, db
from tamper_monitor import get_booth_activity, get_last_tamper_status
from self_audit import run_self_audit


@api_router.get("/admin/booth-activity")
async def booth_activity(request: Request):
    user = await get_current_user(request, db)
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    rows = await get_booth_activity(db)
    return {"booths": rows, "count": len(rows)}


@api_router.get("/admin/tamper-status")
async def tamper_status(request: Request):
    """Cached audit-chain integrity result. Refreshed every 60s by the
    background tamper monitor."""
    user = await get_current_user(request, db)
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    return await get_last_tamper_status(db)


@api_router.get("/admin/self-audit/latest")
async def self_audit_latest(request: Request):
    """Latest weekly self-audit result. Shows whether the engine has
    changed its mind on recent incidents thanks to fresh corpus
    learnings — proof of continuous self-improvement."""
    user = await get_current_user(request, db)
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    doc = await db.system_state.find_one({"id": "self_audit_latest"}, {"_id": 0})
    return doc or {"ran_at": None, "examined": 0, "drift_count": 0, "drift_rows": []}


@api_router.post("/admin/self-audit/run-now")
async def self_audit_run_now(request: Request):
    """Manually trigger a self-audit pass — useful right after a curated
    article harvest to see immediately which decisions have shifted."""
    user = await get_current_user(request, db)
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    return await run_self_audit(db)
