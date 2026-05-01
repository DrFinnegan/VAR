"""
OCTON Quick-Fire routes — one-click lightning verdicts.

`POST /api/quick/offside` and `/api/quick/corner` let operators submit
1-N scrubber frames + optional match context and receive a full OCTON
verdict in a single round-trip. Multi-frame ingestion lets GPT-5.2
reason about *motion* (ball release moment vs attacker position) rather
than a single still.

If the operator fires a quick-check with NO visual evidence (no frame
captured, no still attached), we run the engine in text-only mode AND
hard-cap confidence so the verdict is honestly framed as a heuristic
suggestion, not a fabricated certainty.
"""
import logging
import uuid
from datetime import datetime, timezone
from typing import List, Optional

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
    extra_images_base64: Optional[List[str]] = None  # multi-frame burst from the scrubber
    note: Optional[str] = None  # operator context


# Strict, evidence-grounded prompts. The CRITICAL line forces the LLM to
# refuse fabrication when the attached frames don't show the relevant
# moment — solves the "imaginary verdict" bug.
_OFFSIDE_PROMPT = (
    "Automated offside check. Determine whether the attacking player is "
    "beyond the second-to-last defender at the EXACT moment the ball is "
    "played. Use the strict daylight/marginal/onside scale "
    "(IFAB Law 11). Consider head/body/feet (shirt-sleeve excluded), the "
    "through-ball line, and any deliberate defender play that resets "
    "the offside phase.\n\n"
    "CRITICAL — EVIDENCE-GROUNDED OUTPUT:\n"
    "• If the attached frame(s) do NOT clearly show an attacking move, "
    "  through-ball, or the defensive line at the moment of pass, you "
    "  MUST set suggested_decision to "
    "  'No clear offside event visible — load the moment-of-pass frame and retry' "
    "  and confidence_score to no greater than 30.\n"
    "• If only one frame is attached, treat it as a snapshot — you "
    "  cannot determine the exact moment of pass from one image alone. "
    "  Cap confidence at 65 and explain the limitation.\n"
    "• Do NOT fabricate player names, scoreline, jersey numbers, or "
    "  events that are not visible in the frames or stated in the "
    "  description."
)
_CORNER_PROMPT = (
    "Automated corner kick legality check (IFAB Law 17). Determine "
    "(a) which team last touched the ball before it crossed the goal "
    "line — corner vs goal kick — and (b) whether any defensive "
    "infringement occurred at delivery (encroachment inside the 1 m "
    "corner-arc rule, blocking or holding the goalkeeper, defensive "
    "or offensive foul in the penalty area). Map outcomes to one of: "
    "legal corner, goal kick, retake, penalty, no infringement.\n\n"
    "CRITICAL — EVIDENCE-GROUNDED OUTPUT:\n"
    "• If the attached frame(s) do NOT show the moment the ball "
    "  crosses the byline OR the moment of corner delivery, you MUST "
    "  set suggested_decision to "
    "  'No clear corner event visible — load the byline-cross or delivery frame and retry' "
    "  and confidence_score to no greater than 30.\n"
    "• If only one frame is attached, treat it as a snapshot — cap "
    "  confidence at 65 and explain the limitation.\n"
    "• Do NOT fabricate which player took the corner, what the score "
    "  was, or which way the ball was delivered if not visible."
)


def _post_process_quick_analysis(analysis: dict, frame_count: int) -> dict:
    """Defend against runaway confidence + missing-evidence hallucinations.

    Rules (applied AFTER the engine returns):
      1. If no frames attached → cap final_confidence at 60.
      2. If exactly one frame   → cap final_confidence at 75.
      3. If suggested_decision contains rejection language → cap at 40.
      4. If precedent uplift pushed final_confidence > 95 but reasoning
         flags 'unclear / cannot determine / insufficient' → cap at 60.
    Each cap also dampens the per-stage confidence so the radial ring
    matches the headline number.
    """
    if not isinstance(analysis, dict):
        return analysis

    suggested = (analysis.get("suggested_decision") or "").lower()
    reasoning = (analysis.get("reasoning") or "").lower()
    notes = (analysis.get("neo_cortex_notes") or "").lower()
    blob = f"{suggested} {reasoning} {notes}"

    rejection_phrases = (
        "no clear", "not visible", "cannot determine", "cannot be determined",
        "insufficient", "unclear", "no offside event visible",
        "no corner event visible", "load the moment-of-pass",
        "load the byline-cross",
    )
    has_rejection = any(p in blob for p in rejection_phrases)

    cap = 99.0
    cap_reason = None
    if has_rejection:
        cap, cap_reason = 40.0, "evidence-rejection language detected"
    elif frame_count == 0:
        cap, cap_reason = 60.0, "no visual evidence attached"
    elif frame_count == 1:
        cap, cap_reason = 75.0, "single-frame snapshot — moment-of-event uncertain"

    final = float(analysis.get("final_confidence") or 0)
    if final > cap:
        analysis["final_confidence"] = round(cap, 1)
        analysis.setdefault("confidence_caps", []).append({
            "applied": cap, "from": final, "reason": cap_reason,
        })
        # Mirror cap onto Neo Cortex sub-stage so the breakdown UI agrees.
        nc = analysis.get("neo_cortex") or {}
        if isinstance(nc.get("confidence_score"), (int, float)) and nc["confidence_score"] > cap:
            nc["confidence_score"] = round(cap, 1)
            analysis["neo_cortex"] = nc
        # Drop risk down a notch if we just heavily capped.
        if cap <= 50:
            analysis["risk_level"] = "high"
    return analysis


async def _run_quick_incident(
    incident_type: str,
    description: str,
    request: Request,
    body: QuickFireRequest,
) -> dict:
    user = await get_optional_user(request, db)
    full_desc = description
    if body.note:
        full_desc = f"{description} Operator note: {body.note.strip()}"

    extras = [b for b in (body.extra_images_base64 or []) if b]
    if body.image_base64 and body.image_base64 in extras:
        extras = [b for b in extras if b != body.image_base64]
    extras = extras[:3]  # vision payload cap = 4 (1 primary + 3 extras)

    frame_count = (1 if body.image_base64 else 0) + len(extras)

    analysis = await brain_engine.analyze_incident(
        incident_type=incident_type,
        description=full_desc,
        db=db,
        image_base64=body.image_base64,
        extra_images_b64=extras,
    )
    analysis = _post_process_quick_analysis(analysis, frame_count)

    analysis["visual_evidence_source"] = (
        "video_frames" if frame_count >= 2 else
        ("image" if frame_count == 1 else "text_only")
    )
    analysis["fast_path"] = True
    analysis["fast_path_frame_count"] = frame_count

    # OFR threshold (kept identical to standard path).
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
        "has_image": frame_count >= 1,
        "storage_path": None,
        "ai_analysis": analysis,
        "tags": ["quick_fire", f"quick_{incident_type}"],
        "created_at": now,
        "updated_at": now,
    }
    await db.incidents.insert_one(incident_doc)
    incident_doc.pop("_id", None)

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
    """Lightning offside check — frame-grounded, Law 11 verdict."""
    return await _run_quick_incident("offside", _OFFSIDE_PROMPT, request, body)


@api_router.post("/quick/corner")
async def quick_corner(body: QuickFireRequest, request: Request):
    """Lightning corner legality check — frame-grounded, Law 17 verdict."""
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

    total = len(docs)
    legal = sum(1 for d in docs if "corner" in (d.get("final_decision") or d.get("ai_analysis", {}).get("suggested_decision") or "").lower())
    goal_kick = sum(1 for d in docs if "goal kick" in (d.get("final_decision") or d.get("ai_analysis", {}).get("suggested_decision") or "").lower())
    retakes = sum(1 for d in docs if "retake" in (d.get("final_decision") or d.get("ai_analysis", {}).get("suggested_decision") or "").lower())

    kickers: dict = {}
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
