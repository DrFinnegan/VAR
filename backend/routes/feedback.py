"""AI feedback loop + admin user listing."""
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException, Query, Request
from pydantic import BaseModel

from auth import get_current_user, require_role
from core import api_router, db


class FeedbackCreate(BaseModel):
    incident_id: str
    was_ai_correct: bool
    operator_notes: Optional[str] = None


@api_router.post("/feedback")
async def submit_feedback(fb: FeedbackCreate, request: Request):
    """Explicit operator feedback on AI accuracy."""
    user = await get_current_user(request, db)
    incident = await db.incidents.find_one({"id": fb.incident_id}, {"_id": 0})
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")

    feedback_doc = {
        "id": str(uuid.uuid4()),
        "incident_id": fb.incident_id,
        "incident_type": incident.get("incident_type", "other"),
        "was_ai_correct": fb.was_ai_correct,
        "operator_notes": fb.operator_notes,
        "submitted_by": user.get("_id", ""),
        "submitted_by_name": user.get("name", ""),
        "ai_confidence": incident.get("ai_analysis", {}).get("final_confidence", 0),
        "ai_suggestion": incident.get("ai_analysis", {}).get("suggested_decision", ""),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.ai_feedback.insert_one(feedback_doc)
    feedback_doc.pop("_id", None)
    return feedback_doc


@api_router.get("/feedback/stats")
async def feedback_stats():
    """Get AI feedback statistics for the learning loop."""
    total = await db.ai_feedback.count_documents({})
    correct = await db.ai_feedback.count_documents({"was_ai_correct": True})
    incorrect = total - correct
    accuracy = (correct / total * 100) if total > 0 else 0

    pipeline = [
        {"$group": {
            "_id": "$incident_type",
            "total": {"$sum": 1},
            "correct": {"$sum": {"$cond": ["$was_ai_correct", 1, 0]}},
        }},
        {"$sort": {"total": -1}},
    ]
    by_type = await db.ai_feedback.aggregate(pipeline).to_list(20)
    type_stats = {}
    for t in by_type:
        type_stats[t["_id"]] = {
            "total": t["total"],
            "correct": t["correct"],
            "accuracy": round((t["correct"] / t["total"] * 100) if t["total"] > 0 else 0, 1),
        }

    cal_pipeline = [
        {"$group": {
            "_id": "$was_ai_correct",
            "avg_confidence": {"$avg": "$ai_confidence"},
            "count": {"$sum": 1},
        }}
    ]
    calibration = await db.ai_feedback.aggregate(cal_pipeline).to_list(5)
    confidence_calibration = {}
    for c in calibration:
        key = "correct" if c["_id"] else "incorrect"
        confidence_calibration[key] = {
            "avg_confidence": round(c["avg_confidence"], 1),
            "count": c["count"],
        }

    return {
        "total_feedback": total,
        "correct": correct,
        "incorrect": incorrect,
        "overall_accuracy": round(accuracy, 1),
        "by_incident_type": type_stats,
        "confidence_calibration": confidence_calibration,
    }


@api_router.get("/feedback")
async def get_feedback(limit: int = Query(50, ge=1, le=200)):
    """List recent feedback entries."""
    return await db.ai_feedback.find({}, {"_id": 0}).sort("created_at", -1).to_list(limit)


# ── Admin: list users ────────────────────────────────────
@api_router.get("/users")
async def list_users(request: Request):
    """List all users (admin only)."""
    await require_role(request, db, ["admin"])
    users = await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(200)
    for u in users:
        u.pop("password_hash", None)
    return users
