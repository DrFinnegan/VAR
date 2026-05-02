"""Booth Activity admin endpoint.

Exposes the per-booth aggregation (decisions count, agreement rate, avg
confidence on recent incidents, live fixture). Admin-only.
"""
from fastapi import HTTPException, Request

from auth import get_current_user
from core import api_router, db
from tamper_monitor import get_booth_activity, get_last_tamper_status


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
