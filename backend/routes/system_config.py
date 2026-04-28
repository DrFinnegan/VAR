"""System-wide tunable configuration.

Currently exposes one knob — `ofr_threshold_pct` — the inter-angle
confidence delta at which Neo Cortex should flag `angle_disagreement` and
the dashboard should fire an OFR escalation toast. Default: 15.0.

Stored as a single Mongo doc `system_config/_id="default"`.
"""
from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException, Request
from pydantic import BaseModel, Field

from auth import require_role
from core import api_router, db

CONFIG_ID = "default"
DEFAULT_OFR_THRESHOLD = 15.0


async def get_ofr_threshold() -> float:
    doc = await db.system_config.find_one({"id": CONFIG_ID}, {"_id": 0})
    if not doc:
        return DEFAULT_OFR_THRESHOLD
    return float(doc.get("ofr_threshold_pct", DEFAULT_OFR_THRESHOLD))


class SystemConfigPatch(BaseModel):
    ofr_threshold_pct: Optional[float] = Field(None, ge=5.0, le=40.0)


@api_router.get("/system/config")
async def system_config_get():
    """Return the current system tunables. Public — needed by the AI engine
    on every analyse call and by every client reading the OFR threshold."""
    doc = await db.system_config.find_one({"id": CONFIG_ID}, {"_id": 0}) or {}
    return {
        "ofr_threshold_pct": float(doc.get("ofr_threshold_pct", DEFAULT_OFR_THRESHOLD)),
        "updated_at": doc.get("updated_at"),
        "updated_by": doc.get("updated_by"),
    }


@api_router.put("/system/config")
async def system_config_update(patch: SystemConfigPatch, request: Request):
    """Adjust system tunables (admin-only)."""
    user = await require_role(request, db, ["admin"])
    update = {k: v for k, v in patch.model_dump(exclude_none=True).items()}
    if not update:
        raise HTTPException(status_code=400, detail="No fields to update")
    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    update["updated_by"] = user.get("id") or user.get("name")
    update["id"] = CONFIG_ID
    await db.system_config.update_one(
        {"id": CONFIG_ID}, {"$set": update}, upsert=True,
    )
    return await system_config_get()
