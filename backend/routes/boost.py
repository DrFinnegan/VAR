"""'Boost confidence' flow — generate contextual follow-up questions for
borderline (<80% confidence) incidents and re-run analysis with the operator's
answers appended to the original description.

Two endpoints:
  POST /api/incidents/{id}/boost-confidence       → list of 2-4 questions
  POST /api/incidents/{id}/boost-confidence/answer → re-runs analysis with answers
"""
import json
import logging
import os
import re
from datetime import datetime, timezone
from typing import Dict, List

from fastapi import HTTPException, Request
from pydantic import BaseModel

from ai_engine import brain_engine
from auth import get_optional_user
from core import api_router, db
from websocket_manager import ws_manager

logger = logging.getLogger("octon.boost")


class BoostAnswer(BaseModel):
    question: str
    answer: str


class BoostAnswers(BaseModel):
    answers: List[BoostAnswer]


# ── Question generation prompts per incident type ─────────────
# These are intentionally specific — each addresses the exact factual
# variable that flips the verdict from 65% to 85% under IFAB.
_QUESTION_BANK = {
    "foul": [
        "Were the studs up, planted, or rolled over the ball?",
        "Was the ball still in playing distance when contact occurred?",
        "Was the contact with excessive force (boot/shin/thigh)?",
        "Was it a single-foot or two-footed challenge?",
    ],
    "red_card": [
        "Was the action on or off the ball?",
        "Was contact with excessive force or endangering opponent's safety?",
        "Was there intent to play the ball or solely the player?",
        "Was the player already cautioned earlier in the match?",
    ],
    "handball": [
        "Was the arm above the shoulder when ball contact occurred?",
        "Did the arm move toward the ball or was the body 'made bigger'?",
        "Was the arm supporting the body weight (slide / fall / jump)?",
        "Was it the immediate scorer or a team-mate in the build-up?",
    ],
    "penalty": [
        "Did the contact occur clearly inside the penalty area?",
        "Was the defender making a genuine attempt to play the ball?",
        "Was it holding/pushing/shirt-pulling, or a trip/foot contact?",
        "Was the attacker beating the keeper / clean through on goal?",
    ],
    "offside": [
        "How much daylight was visible between attacker and last defender?",
        "Did the attacker actively interfere with play or an opponent?",
        "Was the rebound off a save or a deliberate defensive play?",
        "Did the attacker touch the ball or solely position himself?",
    ],
    "goal_line": [
        "Did the WHOLE ball cross the WHOLE line?",
        "Were there clear synchronised camera angles available?",
        "Did the goal-line tech (if available) confirm or contradict?",
    ],
    "other": [
        "What specific IFAB law or article applies?",
        "Was contact made, and if so, where on the body?",
        "Did the action affect the immediate phase of play?",
    ],
}


def _pick_questions(incident_type: str, description: str, n: int = 4) -> List[str]:
    """Pick the most useful follow-up questions for THIS incident.

    Filters out questions whose answer is already obvious from the description
    (e.g. don't ask 'were studs up' if description already says 'studs up')."""
    bank = _QUESTION_BANK.get(incident_type) or _QUESTION_BANK["other"]
    desc_l = (description or "").lower()
    picked: List[str] = []
    for q in bank:
        # Skip if a key noun phrase is already covered.
        ql = q.lower()
        keywords = []
        if "studs" in ql:
            keywords.append("studs")
        if "playing distance" in ql:
            keywords.append("playing distance")
        if "above the shoulder" in ql:
            keywords.append("above shoulder")
        if "inside the penalty area" in ql:
            keywords.append("inside")
        if "daylight" in ql:
            keywords.append("daylight")
        if "goal-line" in ql:
            keywords.append("goal line")
        already_covered = any(k in desc_l for k in keywords)
        if not already_covered:
            picked.append(q)
        if len(picked) >= n:
            break
    if not picked:
        picked = bank[:n]
    return picked[:n]


@api_router.post("/incidents/{incident_id}/boost-confidence")
async def boost_confidence_questions(incident_id: str, request: Request):
    """Return 2-4 IFAB-targeted follow-up questions designed to push a
    borderline verdict over the 80% confidence line."""
    inc = await db.incidents.find_one({"id": incident_id}, {"_id": 0})
    if not inc:
        raise HTTPException(status_code=404, detail="Incident not found")
    questions = _pick_questions(
        inc.get("incident_type", "other"),
        inc.get("description", ""),
        n=4,
    )
    return {
        "incident_id": incident_id,
        "questions": questions,
        "current_confidence": (inc.get("ai_analysis") or {}).get("final_confidence", 0),
    }


@api_router.post("/incidents/{incident_id}/boost-confidence/answer")
async def boost_confidence_answer(
    incident_id: str, body: BoostAnswers, request: Request,
):
    """Append the operator's Q&A pairs to the description and re-run analysis."""
    inc = await db.incidents.find_one({"id": incident_id}, {"_id": 0})
    if not inc:
        raise HTTPException(status_code=404, detail="Incident not found")

    answered = [a for a in body.answers if (a.answer or "").strip()]
    if not answered:
        raise HTTPException(status_code=400, detail="At least one answer required")

    qa_block = "\n\nOPERATOR FOLLOW-UP CLARIFICATIONS:\n" + "\n".join(
        f"- Q: {a.question}\n  A: {a.answer.strip()}" for a in answered
    )
    enriched_description = (inc.get("description") or "") + qa_block

    # Pull stored image for re-analysis (vision flow keeps its bonus)
    image_b64 = None
    if inc.get("storage_path"):
        try:
            from storage import get_object
            import base64 as _b64
            data, _ = get_object(inc["storage_path"])
            image_b64 = _b64.b64encode(data).decode("utf-8")
        except Exception as e:
            logger.warning(f"Could not fetch image for boost re-analysis: {e}")

    prior_conf = (inc.get("ai_analysis") or {}).get("final_confidence", 0)
    analysis = await brain_engine.analyze_incident(
        incident_type=inc.get("incident_type", "other"),
        description=enriched_description,
        db=db,
        image_base64=image_b64,
    )
    analysis["visual_evidence_source"] = "boost_re_analysis"
    analysis["boosted"] = True
    analysis["boost_questions_answered"] = [a.model_dump() for a in answered]
    analysis["confidence_lift_from_boost"] = round(
        analysis.get("final_confidence", 0) - prior_conf, 1
    )

    # Re-evaluate angle disagreement against admin threshold
    from .system_config import get_ofr_threshold
    threshold = await get_ofr_threshold()
    delta = float(analysis.get("angle_confidence_delta") or 0.0)
    analysis["angle_disagreement"] = bool(delta >= threshold and delta > 0)
    analysis["ofr_threshold_pct"] = threshold

    result = await db.incidents.find_one_and_update(
        {"id": incident_id},
        {"$set": {
            "description": enriched_description,
            "ai_analysis": analysis,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }},
        return_document=True,
        projection={"_id": 0},
    )

    # ── Auto-archive the Q&A as a self-learning training case ──
    # When the boosted analysis is high-confidence (>= 75%) AND carries a
    # specific IFAB clause, this interaction has produced a forensic-quality
    # precedent. Silently ingest it into the Training Library tagged
    # `from-boost` so the next similar borderline case retrieves it via RAG
    # and skips the boost step entirely. Zero manual curation — the platform
    # literally learns from every referee deliberation.
    archived_case = None
    try:
        archived_case = await _archive_boost_to_training(
            db=db,
            incident=inc,
            analysis=analysis,
            qa_pairs=[a.model_dump() for a in answered],
        )
        if archived_case:
            # Tag the analysis with the case id so the UI can surface it.
            analysis["training_case_archived_id"] = archived_case["id"]
            await db.incidents.update_one(
                {"id": incident_id},
                {"$set": {"ai_analysis.training_case_archived_id": archived_case["id"]}},
            )
            # refresh response doc so client sees the linkage
            result = await db.incidents.find_one({"id": incident_id}, {"_id": 0})
    except Exception as e:
        logger.warning(f"Boost → training archival skipped: {e}")

    try:
        await ws_manager.send_analysis_complete(
            incident_id, analysis.get("final_confidence", 0)
        )
    except Exception:
        pass

    return result


async def _archive_boost_to_training(
    db, incident: Dict, analysis: Dict, qa_pairs: List[Dict],
) -> Dict:
    """Turn a boosted high-confidence incident + Q&A into a training case.

    Returns the new case document on success, or None when quality threshold
    isn't met / this incident has already been archived from boost.
    """
    import uuid
    final_conf = float(analysis.get("final_confidence", 0))
    cited_clause = (analysis.get("cited_clause") or "").strip()
    suggested = (analysis.get("suggested_decision") or "").strip()
    if final_conf < 75.0 or not cited_clause or not suggested:
        return None
    existing = await db.training_cases.find_one(
        {"source_incident_id": incident["id"], "tags": "from-boost"},
        {"_id": 0, "id": 1},
    )
    if existing:
        return None

    kf = analysis.get("key_factors") or []
    qa_keywords = [qa.get("answer", "")[:40] for qa in qa_pairs if qa.get("answer")]
    keywords = [str(k)[:60] for k in kf][:8] + qa_keywords[:4]

    # Derive a readable title.
    itype = incident.get("incident_type", "incident").replace("_", " ").title()
    team = incident.get("team_involved") or "match"
    date = datetime.now(timezone.utc).date().isoformat()
    title = f"{itype} — {team} — {date} (boost-ingested)"[:160]

    now = datetime.now(timezone.utc).isoformat()
    rationale = (analysis.get("reasoning") or "")[:1100]
    if qa_pairs:
        qa_trailer = "\n\nOPERATOR CLARIFICATIONS (boosted):\n" + "\n".join(
            f"• {qa.get('question','')[:90]} → {qa.get('answer','')[:140]}"
            for qa in qa_pairs
        )
        rationale = (rationale + qa_trailer)[:1800]

    case = {
        "id": str(uuid.uuid4()),
        "title": title,
        "incident_type": incident.get("incident_type", "other"),
        "correct_decision": suggested,
        "rationale": rationale,
        "keywords": keywords,
        "tags": ["from-boost", "auto-learned", f"conf:{int(final_conf)}"],
        "match_context": {
            "teams": incident.get("team_involved"),
            "competition": incident.get("match_id"),
            "year": datetime.now(timezone.utc).year,
        },
        "law_references": [cited_clause[:90]],
        "outcome": f"boosted to {final_conf:.1f}%",
        "visual_tags": [],
        "media_storage_path": incident.get("storage_path"),
        "thumbnail_storage_path": incident.get("storage_path"),
        "source_incident_id": incident["id"],
        "boost_qa": qa_pairs,
        "boost_confidence_lift": analysis.get("confidence_lift_from_boost", 0),
        "created_by": "boost-archiver",
        "created_by_name": "OCTON Self-Learning",
        "created_at": now,
        "updated_at": now,
    }
    await db.training_cases.insert_one(case.copy())
    logger.info(
        f"[boost→training] archived '{title}' conf={final_conf} "
        f"clause='{cited_clause[:40]}' for incident {incident['id']}"
    )
    return case
