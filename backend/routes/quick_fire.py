"""
OCTON Quick-Fire routes — one-click lightning verdicts.

`POST /api/quick/offside` and `/api/quick/corner` let operators submit a
scrubber frame + optional match context and receive a full OCTON verdict
(IFAB-cited reasoning, confidence, recommended decision) in a single
round-trip. Under the hood they construct a synthetic incident
description, run the existing dual-brain engine, and persist the result
so it surfaces in history, Match Wall, and the training loop — just
like any operator-created incident.

Tag: `quick_fire` on the incident + `ai_analysis.fast_path = true` so
the UI can label it "FAST-PATH ⚡".
"""
import base64
import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException, Request
from pydantic import BaseModel

from ai_engine import brain_engine
from auth import get_optional_user
from booth import get_booth_id, get_booth_label
from core import api_router, db
from websocket_manager import ws_manager

logger = logging.getLogger("octon.quick")


class QuickFireRequest(BaseModel):
    match_id: Optional[str] = None
    team_involved: Optional[str] = None
    player_involved: Optional[str] = None
    timestamp_in_match: Optional[str] = None
    image_base64: Optional[str] = None
    note: Optional[str] = None  # Optional extra operator context


# Canonical descriptions the engine should reason against. Short but
# signal-dense: keywords pre-seed Hippocampus, the IFAB anchor nudges
# Neo Cortex toward the right clause.
_OFFSIDE_PROMPT = (
    "Automated offside check — determine whether the attacking player was "
    "beyond the last defender at the exact moment the ball was played. "
    "Consider head/body/feet position (shirt-sleeve excluded), the "
    "through-ball line, and any potential deliberate defender play. "
    "Return one of: daylight offside (> 30 cm clear), marginal/tight "
    "offside (armpit line), onside, or 'decision stands — too close to "
    "call with certainty'."
)
_CORNER_PROMPT = (
    "Automated corner kick legality check — determine (a) which team last "
    "touched the ball before it crossed the goal-line (award corner vs "
    "goal kick), and (b) whether any defensive infringement occurred at "
    "delivery (encroachment inside the 1 m corner-arc rule, blocking or "
    "holding the goalkeeper, offensive/defensive foul in the penalty "
    "area). Flag retake / penalty / legal-corner / goal-kick outcomes."
)


async def _run_quick_incident(
    incident_type: str,
    description: str,
    request: Request,
    body: QuickFireRequest,
) -> dict:
    user = await get_optional_user(request, db)
    # Compose the full description — base prompt + operator note if any.
    full_desc = description
    if body.note:
        full_desc = f"{description} Operator note: {body.note.strip()}"

    analysis = await brain_engine.analyze_incident(
        incident_type=incident_type,
        description=full_desc,
        db=db,
        image_base64=body.image_base64,
    )
    analysis["visual_evidence_source"] = "image" if body.image_base64 else "text_only"
    analysis["fast_path"] = True

    # Evaluate OFR threshold (kept identical to standard path).
    from .system_config import get_ofr_threshold
    threshold = await get_ofr_threshold()
    delta = float(analysis.get("angle_confidence_delta") or 0.0)
    analysis["angle_disagreement"] = bool(delta >= threshold and delta > 0)
    analysis["ofr_threshold_pct"] = threshold

    incident_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    incident_doc = {
        "id": incident_id,
        "match_id": body.match_id,
        "incident_type": incident_type,
        "description": full_desc,
        "timestamp_in_match": body.timestamp_in_match,
        "team_involved": body.team_involved,
        "player_involved": body.player_involved,
        "decision_status": "pending",
        "final_decision": None,
        "decided_by": None,
        "created_by": user.get("_id") if user else None,
        "created_by_booth": get_booth_id(request),
        "created_by_booth_label": get_booth_label(request),
        "has_image": bool(body.image_base64),
        "storage_path": None,  # Quick-fire doesn't persist the frame.
        "ai_analysis": analysis,
        "tags": ["quick_fire", f"quick_{incident_type}"],
        "created_at": now,
        "updated_at": now,
    }
    await db.incidents.insert_one(incident_doc)
    incident_doc.pop("_id", None)

    # Live feed
    await ws_manager.send_incident_created(
        {
            "id": incident_id,
            "incident_type": incident_type,
            "description": full_desc[:100],
            "confidence": analysis.get("final_confidence", 0),
            "fast_path": True,
        },
        match_id=body.match_id,
    )
    return incident_doc


@api_router.post("/quick/offside")
async def quick_offside(body: QuickFireRequest, request: Request):
    """Lightning offside check — frame-optional, Law 11-grounded verdict."""
    return await _run_quick_incident("offside", _OFFSIDE_PROMPT, request, body)


@api_router.post("/quick/corner")
async def quick_corner(body: QuickFireRequest, request: Request):
    """Lightning corner legality check — Law 17-grounded verdict."""
    return await _run_quick_incident("corner", _CORNER_PROMPT, request, body)


# ── Corner scouting (set-piece) ──────────────────────────────────────
@api_router.get("/quick/corner-scouting")
async def quick_corner_scouting(team: Optional[str] = None, limit: int = 20):
    """Set-piece scouting payload: historical corner outcomes + kicker
    tendencies + conversion rate. Aggregates from the incidents corpus
    so it grows with league traffic without external feeds."""
    query = {"incident_type": "corner"}
    if team:
        query["team_involved"] = team
    docs = await db.incidents.find(query, {"_id": 0}).sort("created_at", -1).to_list(limit)

    # Tallies
    total = len(docs)
    legal = sum(1 for d in docs if "corner" in (d.get("final_decision") or d.get("ai_analysis", {}).get("suggested_decision") or "").lower())
    goal_kick = sum(1 for d in docs if "goal kick" in (d.get("final_decision") or d.get("ai_analysis", {}).get("suggested_decision") or "").lower())
    retakes = sum(1 for d in docs if "retake" in (d.get("final_decision") or d.get("ai_analysis", {}).get("suggested_decision") or "").lower())

    kickers = {}
    for d in docs:
        k = d.get("player_involved")
        if not k:
            continue
        kickers.setdefault(k, {"count": 0, "successful": 0})
        kickers[k]["count"] += 1
        if d.get("decision_status") == "confirmed":
            kickers[k]["successful"] += 1
    top_kickers = sorted(
        [{"name": k, **v} for k, v in kickers.items()],
        key=lambda x: x["count"],
        reverse=True,
    )[:5]

    return {
        "team": team,
        "total_corners_seen": total,
        "legal_corners": legal,
        "goal_kicks_overturned": goal_kick,
        "retakes": retakes,
        "top_kickers": top_kickers,
        "sample": [
            {
                "id": d["id"],
                "final_decision": d.get("final_decision") or d.get("ai_analysis", {}).get("suggested_decision"),
                "team": d.get("team_involved"),
                "player": d.get("player_involved"),
                "confidence": d.get("ai_analysis", {}).get("final_confidence"),
                "created_at": d.get("created_at"),
            }
            for d in docs[:5]
        ],
    }
