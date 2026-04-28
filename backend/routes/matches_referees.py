"""Referees + Matches + match assignment/status routes."""
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException, Query, Request
from pydantic import BaseModel

from auth import require_role
from core import UserRole, api_router, db


class RefereeCreate(BaseModel):
    name: str
    role: UserRole
    email: Optional[str] = None


class MatchCreate(BaseModel):
    team_home: str
    team_away: str
    date: str
    competition: str
    stadium: Optional[str] = None
    var_operator_id: Optional[str] = None
    referee_id: Optional[str] = None


class MatchAssignment(BaseModel):
    referee_id: Optional[str] = None
    var_operator_id: Optional[str] = None


# ── Referees ───────────────────────────────────────────────
@api_router.post("/referees")
async def create_referee(data: RefereeCreate):
    ref_doc = {
        "id": str(uuid.uuid4()),
        "name": data.name,
        "role": data.role.value,
        "email": data.email,
        "total_decisions": 0,
        "correct_decisions": 0,
        "average_decision_time_seconds": 0,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.referees.insert_one(ref_doc)
    ref_doc.pop("_id", None)
    return ref_doc


@api_router.get("/referees")
async def get_referees(role: Optional[str] = None):
    query = {}
    if role:
        query["role"] = role
    return await db.referees.find(query, {"_id": 0}).to_list(100)


@api_router.get("/referees/{referee_id}")
async def get_referee(referee_id: str):
    doc = await db.referees.find_one({"id": referee_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Referee not found")
    return doc


# ── Matches ────────────────────────────────────────────────
@api_router.post("/matches")
async def create_match(data: MatchCreate):
    match_doc = {
        "id": str(uuid.uuid4()),
        "team_home": data.team_home,
        "team_away": data.team_away,
        "date": data.date,
        "competition": data.competition,
        "stadium": data.stadium,
        "var_operator_id": data.var_operator_id,
        "referee_id": data.referee_id,
        "incidents_count": 0,
        "status": "scheduled",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.matches.insert_one(match_doc)
    match_doc.pop("_id", None)
    return match_doc


@api_router.get("/matches")
async def get_matches(status: Optional[str] = None, limit: int = Query(50, ge=1, le=200)):
    query = {}
    if status:
        query["status"] = status
    return await db.matches.find(query, {"_id": 0}).sort("created_at", -1).to_list(limit)


@api_router.put("/matches/{match_id}/assign")
async def assign_match(match_id: str, assignment: MatchAssignment, request: Request):
    """Assign referee and/or VAR operator to a match (admin only)."""
    await require_role(request, db, ["admin"])
    match = await db.matches.find_one({"id": match_id}, {"_id": 0})
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")

    update = {"updated_at": datetime.now(timezone.utc).isoformat()}
    if assignment.referee_id is not None:
        ref = await db.referees.find_one({"id": assignment.referee_id})
        if not ref:
            raise HTTPException(status_code=404, detail="Referee not found")
        update["referee_id"] = assignment.referee_id
        update["referee_name"] = ref.get("name", "")
    if assignment.var_operator_id is not None:
        op = await db.referees.find_one({"id": assignment.var_operator_id})
        if not op:
            raise HTTPException(status_code=404, detail="VAR operator not found")
        update["var_operator_id"] = assignment.var_operator_id
        update["var_operator_name"] = op.get("name", "")

    return await db.matches.find_one_and_update(
        {"id": match_id}, {"$set": update}, return_document=True, projection={"_id": 0}
    )


@api_router.put("/matches/{match_id}/status")
async def update_match_status(match_id: str, request: Request, status: str = Query(...)):
    """Update match status (admin only)."""
    await require_role(request, db, ["admin"])
    if status not in ("scheduled", "live", "completed"):
        raise HTTPException(status_code=400, detail="Invalid status")
    result = await db.matches.find_one_and_update(
        {"id": match_id},
        {"$set": {"status": status, "updated_at": datetime.now(timezone.utc).isoformat()}},
        return_document=True,
        projection={"_id": 0},
    )
    if not result:
        raise HTTPException(status_code=404, detail="Match not found")
    return result
