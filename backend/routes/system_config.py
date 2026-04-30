"""System-wide tunable configuration.

Exposes:
  • `ofr_threshold_pct` — inter-angle confidence delta that flags
    `angle_disagreement` (default 15.0, range 5.0 – 40.0).
  • `competition_profile` — named preset that bundles an OFR threshold,
    strictness bias, and voice-persona hint per competition tier.

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

# Competition profile presets. Each profile bundles:
#   • ofr_threshold_pct — stricter profiles flag disagreement earlier
#   • strictness — semantic hint surfaced in Neo Cortex prompts
#   • label — UI-facing human name
COMPETITION_PROFILES = {
    "premier_league": {
        "id": "premier_league",
        "label": "Premier League",
        "ofr_threshold_pct": 15.0,
        "strictness": "standard",
        "description": "Weekly league rhythm. Standard IFAB strictness; referee conferences have already normalised interpretations.",
    },
    "ucl": {
        "id": "ucl",
        "label": "UEFA Champions League",
        "ofr_threshold_pct": 12.0,
        "strictness": "stricter",
        "description": "Higher-stakes knockouts. Tighter OFR threshold + stricter reading of DOGSO and handball-in-build-up.",
    },
    "world_cup_final": {
        "id": "world_cup_final",
        "label": "World Cup Final",
        "ofr_threshold_pct": 10.0,
        "strictness": "strictest",
        "description": "Once-every-four-years high-scrutiny. Lowest OFR threshold and strictest reading of offside interference & violent conduct.",
    },
    "friendly": {
        "id": "friendly",
        "label": "Friendly / Pre-season",
        "ofr_threshold_pct": 25.0,
        "strictness": "relaxed",
        "description": "Experimental-law rehearsals and player-fitness emphasis. Highest OFR threshold; leniency on tactical fouls.",
    },
}


async def get_system_config_doc() -> dict:
    return await db.system_config.find_one({"id": CONFIG_ID}, {"_id": 0}) or {}


async def get_ofr_threshold() -> float:
    doc = await get_system_config_doc()
    return float(doc.get("ofr_threshold_pct", DEFAULT_OFR_THRESHOLD))


async def get_competition_profile() -> dict:
    doc = await get_system_config_doc()
    pid = doc.get("competition_profile") or "premier_league"
    return COMPETITION_PROFILES.get(pid, COMPETITION_PROFILES["premier_league"])


class SystemConfigPatch(BaseModel):
    ofr_threshold_pct: Optional[float] = Field(None, ge=5.0, le=40.0)
    competition_profile: Optional[str] = Field(None)


@api_router.get("/system/config")
async def system_config_get():
    """Return the current system tunables + the catalogue of available
    competition profiles. Public — needed by the AI engine on every analyse
    call and by every client reading the OFR threshold."""
    doc = await get_system_config_doc()
    profile_id = doc.get("competition_profile") or "premier_league"
    return {
        "ofr_threshold_pct": float(doc.get("ofr_threshold_pct", DEFAULT_OFR_THRESHOLD)),
        "competition_profile": profile_id,
        "competition_profile_details": COMPETITION_PROFILES.get(profile_id, COMPETITION_PROFILES["premier_league"]),
        "available_profiles": list(COMPETITION_PROFILES.values()),
        "updated_at": doc.get("updated_at"),
        "updated_by": doc.get("updated_by"),
    }


@api_router.put("/system/config")
async def system_config_update(patch: SystemConfigPatch, request: Request):
    """Adjust system tunables (admin-only). Picking a `competition_profile`
    also applies its preset `ofr_threshold_pct` unless one is explicitly
    supplied in the same request."""
    user = await require_role(request, db, ["admin"])
    update = {k: v for k, v in patch.model_dump(exclude_none=True).items()}
    if not update:
        raise HTTPException(status_code=400, detail="No fields to update")
    if "competition_profile" in update:
        pid = update["competition_profile"]
        if pid not in COMPETITION_PROFILES:
            raise HTTPException(
                status_code=400,
                detail=f"Unknown profile; allowed: {list(COMPETITION_PROFILES.keys())}",
            )
        # Apply the profile's preset threshold unless caller explicitly overrides.
        if "ofr_threshold_pct" not in update:
            update["ofr_threshold_pct"] = COMPETITION_PROFILES[pid]["ofr_threshold_pct"]
    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    update["updated_by"] = user.get("id") or user.get("name")
    update["id"] = CONFIG_ID
    await db.system_config.update_one(
        {"id": CONFIG_ID}, {"$set": update}, upsert=True,
    )
    return await system_config_get()
