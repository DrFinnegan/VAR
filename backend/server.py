"""
OCTON VAR Forensic Audit System
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Architect: Dr Finnegan
Lightning speed analyses powered by dual-brain AI.
Hippocampus -> Neo Cortex messaging pathway.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"""
from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

from fastapi import (
    FastAPI,
    APIRouter,
    HTTPException,
    UploadFile,
    File,
    Query,
    Request,
    WebSocket,
    WebSocketDisconnect,
    Response,
)
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import base64
import uuid
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Dict
from datetime import datetime, timezone
from enum import Enum

from auth import (
    hash_password,
    verify_password,
    create_access_token,
    create_refresh_token,
    get_current_user,
    get_optional_user,
    require_role,
    seed_admin,
    check_brute_force,
    record_failed_attempt,
    clear_failed_attempts,
)
from ai_engine import brain_engine
from storage import init_storage, put_object, get_object, generate_upload_path
from websocket_manager import ws_manager

# MongoDB
mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

app = FastAPI(title="OCTON VAR Forensic Audit System - Dr Finnegan")
api_router = APIRouter(prefix="/api")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


# ── Enums ──────────────────────────────────────────────────
class IncidentType(str, Enum):
    OFFSIDE = "offside"
    HANDBALL = "handball"
    FOUL = "foul"
    PENALTY = "penalty"
    GOAL_LINE = "goal_line"
    RED_CARD = "red_card"
    OTHER = "other"


class DecisionStatus(str, Enum):
    PENDING = "pending"
    CONFIRMED = "confirmed"
    OVERTURNED = "overturned"
    NO_DECISION = "no_decision"


class UserRole(str, Enum):
    VAR_OPERATOR = "var_operator"
    REFEREE = "referee"
    ADMIN = "admin"


# ── Pydantic Models ───────────────────────────────────────
class RegisterInput(BaseModel):
    name: str
    email: str
    password: str
    role: Optional[str] = "referee"


class LoginInput(BaseModel):
    email: str
    password: str


class IncidentCreate(BaseModel):
    match_id: Optional[str] = None
    incident_type: IncidentType
    description: str
    timestamp_in_match: Optional[str] = None
    team_involved: Optional[str] = None
    player_involved: Optional[str] = None
    image_base64: Optional[str] = None


class DecisionUpdate(BaseModel):
    decision_status: DecisionStatus
    final_decision: str
    decided_by: str


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


class TextAnalysisRequest(BaseModel):
    incident_type: IncidentType
    description: str
    additional_context: Optional[str] = None


# ── Helpers ────────────────────────────────────────────────
def set_auth_cookies(response: Response, access_token: str, refresh_token: str):
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        secure=False,
        samesite="lax",
        max_age=3600,
        path="/",
    )
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=False,
        samesite="lax",
        max_age=604800,
        path="/",
    )


def user_response(user: dict) -> dict:
    return {
        "id": str(user.get("_id", "")),
        "name": user.get("name", ""),
        "email": user.get("email", ""),
        "role": user.get("role", "referee"),
        "created_at": user.get("created_at", ""),
    }


def format_incident(doc: dict) -> dict:
    """Format incident document for API response, excluding _id."""
    doc.pop("_id", None)
    for field in ("created_at", "updated_at"):
        if isinstance(doc.get(field), str):
            doc[field] = datetime.fromisoformat(doc[field])
    return doc


# ── Auth Routes ────────────────────────────────────────────
@api_router.post("/auth/register")
async def register(inp: RegisterInput, response: Response):
    email = inp.email.strip().lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email already registered")
    if len(inp.password) < 6:
        raise HTTPException(
            status_code=400, detail="Password must be at least 6 characters"
        )
    allowed_roles = ["var_operator", "referee"]
    role = inp.role if inp.role in allowed_roles else "referee"
    hashed = hash_password(inp.password)
    user_doc = {
        "email": email,
        "password_hash": hashed,
        "name": inp.name.strip(),
        "role": role,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    result = await db.users.insert_one(user_doc)
    user_doc["_id"] = str(result.inserted_id)
    access = create_access_token(user_doc["_id"], email, role)
    refresh = create_refresh_token(user_doc["_id"])
    set_auth_cookies(response, access, refresh)
    return user_response(user_doc)


@api_router.post("/auth/login")
async def login(inp: LoginInput, request: Request, response: Response):
    email = inp.email.strip().lower()
    ip = request.client.host if request.client else "unknown"
    identifier = f"{ip}:{email}"
    await check_brute_force(db, identifier)
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(inp.password, user["password_hash"]):
        await record_failed_attempt(db, identifier)
        raise HTTPException(status_code=401, detail="Invalid email or password")
    await clear_failed_attempts(db, identifier)
    uid = str(user["_id"])
    access = create_access_token(uid, email, user.get("role", "referee"))
    refresh = create_refresh_token(uid)
    set_auth_cookies(response, access, refresh)
    user["_id"] = uid
    return user_response(user)


@api_router.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return {"message": "Logged out"}


@api_router.get("/auth/me")
async def me(request: Request):
    user = await get_current_user(request, db)
    return user_response(user)


@api_router.post("/auth/refresh")
async def refresh_token(request: Request, response: Response):
    import jwt as pyjwt
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(status_code=401, detail="No refresh token")
    try:
        payload = pyjwt.decode(
            token, os.environ["JWT_SECRET"], algorithms=["HS256"]
        )
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Invalid token type")
        from bson import ObjectId
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        uid = str(user["_id"])
        access = create_access_token(uid, user["email"], user.get("role", "referee"))
        response.set_cookie(
            key="access_token",
            value=access,
            httponly=True,
            secure=False,
            samesite="lax",
            max_age=3600,
            path="/",
        )
        return {"message": "Token refreshed"}
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid refresh token")


# ── Incident Routes ───────────────────────────────────────
@api_router.post("/incidents")
async def create_incident(data: IncidentCreate, request: Request):
    user = await get_optional_user(request, db)
    incident_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()

    # Handle image upload to storage
    storage_path = None
    image_b64 = data.image_base64
    if image_b64:
        try:
            user_id = user.get("_id", "anonymous") if user else "anonymous"
            path = generate_upload_path(user_id, f"{incident_id}.jpg")
            image_bytes = base64.b64decode(image_b64)
            put_object(path, image_bytes, "image/jpeg")
            storage_path = path
            logger.info(f"Image uploaded to storage: {path}")
        except Exception as e:
            logger.warning(f"Storage upload failed, keeping base64 reference: {e}")

    # Run OCTON Brain analysis (Hippocampus -> Neo Cortex)
    analysis_result = await brain_engine.analyze_incident(
        incident_type=data.incident_type.value,
        description=data.description,
        db=db,
        image_base64=image_b64,
    )

    incident_doc = {
        "id": incident_id,
        "match_id": data.match_id,
        "incident_type": data.incident_type.value,
        "description": data.description,
        "timestamp_in_match": data.timestamp_in_match,
        "team_involved": data.team_involved,
        "player_involved": data.player_involved,
        "storage_path": storage_path,
        "has_image": bool(image_b64),
        "ai_analysis": analysis_result,
        "decision_status": "pending",
        "final_decision": None,
        "decided_by": None,
        "created_by": user.get("_id") if user else None,
        "created_at": now,
        "updated_at": now,
    }

    await db.incidents.insert_one(incident_doc)
    incident_doc.pop("_id", None)

    # Broadcast via WebSocket
    ws_data = {
        "id": incident_id,
        "incident_type": data.incident_type.value,
        "description": data.description[:100],
        "confidence": analysis_result.get("final_confidence", 0),
    }
    await ws_manager.send_incident_created(ws_data)

    return incident_doc


@api_router.get("/incidents")
async def get_incidents(
    status: Optional[str] = None,
    incident_type: Optional[str] = None,
    limit: int = Query(50, ge=1, le=200),
):
    query = {}
    if status:
        query["decision_status"] = status
    if incident_type:
        query["incident_type"] = incident_type
    incidents = (
        await db.incidents.find(query, {"_id": 0})
        .sort("created_at", -1)
        .to_list(limit)
    )
    return incidents


@api_router.get("/incidents/{incident_id}")
async def get_incident(incident_id: str):
    doc = await db.incidents.find_one({"id": incident_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Incident not found")
    return doc


@api_router.put("/incidents/{incident_id}/decision")
async def update_decision(incident_id: str, decision: DecisionUpdate, request: Request):
    update_data = {
        "decision_status": decision.decision_status.value,
        "final_decision": decision.final_decision,
        "decided_by": decision.decided_by,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    result = await db.incidents.find_one_and_update(
        {"id": incident_id},
        {"$set": update_data},
        return_document=True,
        projection={"_id": 0},
    )
    if not result:
        raise HTTPException(status_code=404, detail="Incident not found")

    await ws_manager.send_decision_made(
        incident_id, decision.final_decision, decision.decision_status.value
    )
    return result


@api_router.delete("/incidents/{incident_id}")
async def delete_incident(incident_id: str, request: Request):
    await require_role(request, db, ["admin"])
    result = await db.incidents.delete_one({"id": incident_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Incident not found")
    return {"message": "Incident deleted"}


@api_router.post("/incidents/{incident_id}/reanalyze")
async def reanalyze_incident(incident_id: str, request: Request):
    doc = await db.incidents.find_one({"id": incident_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Incident not found")

    # Re-fetch image from storage if available
    image_b64 = None
    if doc.get("storage_path"):
        try:
            data, _ = get_object(doc["storage_path"])
            image_b64 = base64.b64encode(data).decode("utf-8")
        except Exception as e:
            logger.warning(f"Could not fetch image for reanalysis: {e}")

    analysis = await brain_engine.analyze_incident(
        incident_type=doc["incident_type"],
        description=doc["description"],
        db=db,
        image_base64=image_b64,
    )

    result = await db.incidents.find_one_and_update(
        {"id": incident_id},
        {
            "$set": {
                "ai_analysis": analysis,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
        },
        return_document=True,
        projection={"_id": 0},
    )

    await ws_manager.send_analysis_complete(
        incident_id, analysis.get("final_confidence", 0)
    )
    return result


# ── Text-only AI analysis ─────────────────────────────────
@api_router.post("/ai/analyze-text")
async def analyze_text(req: TextAnalysisRequest):
    desc = req.description
    if req.additional_context:
        desc += f" Context: {req.additional_context}"
    result = await brain_engine.analyze_incident(
        incident_type=req.incident_type.value,
        description=desc,
        db=db,
    )
    return result


# ── File serving ──────────────────────────────────────────
@api_router.get("/files/{path:path}")
async def serve_file(path: str):
    try:
        data, content_type = get_object(path)
        return Response(content=data, media_type=content_type)
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"File not found: {e}")


# ── Referee Routes ────────────────────────────────────────
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


# ── Match Routes ──────────────────────────────────────────
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


# ── Analytics Routes ──────────────────────────────────────
@api_router.get("/analytics/overview")
async def analytics_overview():
    total_incidents = await db.incidents.count_documents({})
    total_matches = await db.matches.count_documents({})
    total_referees = await db.referees.count_documents({})

    type_pipeline = [{"$group": {"_id": "$incident_type", "count": {"$sum": 1}}}]
    type_results = await db.incidents.aggregate(type_pipeline).to_list(100)
    incidents_by_type = {r["_id"]: r["count"] for r in type_results}

    conf_pipeline = [
        {"$match": {"ai_analysis.final_confidence": {"$exists": True}}},
        {"$group": {"_id": None, "avg": {"$avg": "$ai_analysis.final_confidence"}}},
    ]
    conf_result = await db.incidents.aggregate(conf_pipeline).to_list(1)
    avg_confidence = conf_result[0]["avg"] if conf_result else 0.0

    # Fallback: check old format too
    if avg_confidence == 0:
        conf_pipeline2 = [
            {"$match": {"ai_analysis.confidence_score": {"$exists": True}}},
            {"$group": {"_id": None, "avg": {"$avg": "$ai_analysis.confidence_score"}}},
        ]
        conf_result2 = await db.incidents.aggregate(conf_pipeline2).to_list(1)
        if conf_result2:
            avg_confidence = conf_result2[0]["avg"]

    time_pipeline = [
        {"$match": {"average_decision_time_seconds": {"$gt": 0}}},
        {"$group": {"_id": None, "avg": {"$avg": "$average_decision_time_seconds"}}},
    ]
    time_result = await db.referees.aggregate(time_pipeline).to_list(1)
    avg_time = time_result[0]["avg"] if time_result else 0.0

    acc_pipeline = [
        {"$match": {"total_decisions": {"$gt": 0}}},
        {
            "$group": {
                "_id": None,
                "correct": {"$sum": "$correct_decisions"},
                "total": {"$sum": "$total_decisions"},
            }
        },
    ]
    acc_result = await db.referees.aggregate(acc_pipeline).to_list(1)
    accuracy = (
        (acc_result[0]["correct"] / acc_result[0]["total"] * 100)
        if acc_result and acc_result[0]["total"] > 0
        else 0.0
    )

    return {
        "total_incidents": total_incidents,
        "incidents_by_type": incidents_by_type,
        "average_confidence_score": round(avg_confidence, 2),
        "average_decision_time_seconds": round(avg_time, 2),
        "decision_accuracy_rate": round(accuracy, 2),
        "total_matches": total_matches,
        "total_referees": total_referees,
    }


@api_router.get("/analytics/patterns")
async def analytics_patterns():
    pipeline = [
        {"$match": {"decision_status": {"$ne": "pending"}}},
        {
            "$group": {
                "_id": {"type": "$incident_type", "decision": "$final_decision"},
                "count": {"$sum": 1},
            }
        },
        {"$sort": {"count": -1}},
    ]
    patterns = await db.incidents.aggregate(pipeline).to_list(100)

    decision_patterns = {}
    for p in patterns:
        t = p["_id"]["type"]
        if t not in decision_patterns:
            decision_patterns[t] = []
        decision_patterns[t].append(
            {"decision": p["_id"]["decision"], "count": p["count"]}
        )

    # Learning metrics
    total_decided = await db.incidents.count_documents(
        {"decision_status": {"$ne": "pending"}}
    )
    total_confirmed = await db.incidents.count_documents(
        {"decision_status": "confirmed"}
    )
    total_overturned = await db.incidents.count_documents(
        {"decision_status": "overturned"}
    )

    return {
        "patterns": patterns,
        "decision_patterns_by_type": decision_patterns,
        "total_analyzed": len(patterns),
        "learning_metrics": {
            "total_decided": total_decided,
            "confirmed": total_confirmed,
            "overturned": total_overturned,
            "learning_accuracy": round(
                (total_confirmed / total_decided * 100) if total_decided > 0 else 0, 2
            ),
        },
    }


@api_router.get("/analytics/referee/{referee_id}")
async def referee_analytics(referee_id: str):
    ref = await db.referees.find_one({"id": referee_id}, {"_id": 0})
    if not ref:
        raise HTTPException(status_code=404, detail="Referee not found")
    incidents = await db.incidents.find(
        {"decided_by": referee_id}, {"_id": 0}
    ).to_list(100)
    type_dist = {}
    for inc in incidents:
        t = inc.get("incident_type", "other")
        type_dist[t] = type_dist.get(t, 0) + 1
    accuracy = (
        (ref["correct_decisions"] / ref["total_decisions"] * 100)
        if ref["total_decisions"] > 0
        else 0
    )
    return {
        "referee": ref,
        "incidents_decided": len(incidents),
        "type_distribution": type_dist,
        "accuracy_rate": round(accuracy, 2),
    }


# ── WebSocket ─────────────────────────────────────────────
@api_router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await ws_manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            # Echo back with timestamp for heartbeat
            await websocket.send_json({"type": "pong", "data": data})
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)


# ── Seed Demo ─────────────────────────────────────────────
@api_router.post("/seed-demo")
async def seed_demo():
    from ai_engine import OctonBrainEngine

    demo_referees = [
        {
            "id": str(uuid.uuid4()),
            "name": "Michael Oliver",
            "role": "referee",
            "email": "m.oliver@octonvar.com",
            "total_decisions": 45,
            "correct_decisions": 42,
            "average_decision_time_seconds": 18.5,
            "created_at": datetime.now(timezone.utc).isoformat(),
        },
        {
            "id": str(uuid.uuid4()),
            "name": "Stuart Attwell",
            "role": "var_operator",
            "email": "s.attwell@octonvar.com",
            "total_decisions": 78,
            "correct_decisions": 71,
            "average_decision_time_seconds": 22.3,
            "created_at": datetime.now(timezone.utc).isoformat(),
        },
        {
            "id": str(uuid.uuid4()),
            "name": "Anthony Taylor",
            "role": "referee",
            "email": "a.taylor@octonvar.com",
            "total_decisions": 62,
            "correct_decisions": 58,
            "average_decision_time_seconds": 15.8,
            "created_at": datetime.now(timezone.utc).isoformat(),
        },
        {
            "id": str(uuid.uuid4()),
            "name": "Paul Tierney",
            "role": "var_operator",
            "email": "p.tierney@octonvar.com",
            "total_decisions": 34,
            "correct_decisions": 31,
            "average_decision_time_seconds": 25.1,
            "created_at": datetime.now(timezone.utc).isoformat(),
        },
    ]

    for ref in demo_referees:
        if not await db.referees.find_one({"email": ref["email"]}):
            await db.referees.insert_one(ref)

    demo_matches = [
        {
            "id": str(uuid.uuid4()),
            "team_home": "Manchester United",
            "team_away": "Liverpool",
            "date": "2026-01-15",
            "competition": "Premier League",
            "stadium": "Old Trafford",
            "status": "completed",
            "incidents_count": 3,
            "created_at": datetime.now(timezone.utc).isoformat(),
        },
        {
            "id": str(uuid.uuid4()),
            "team_home": "Chelsea",
            "team_away": "Arsenal",
            "date": "2026-01-18",
            "competition": "Premier League",
            "stadium": "Stamford Bridge",
            "status": "live",
            "incidents_count": 1,
            "created_at": datetime.now(timezone.utc).isoformat(),
        },
        {
            "id": str(uuid.uuid4()),
            "team_home": "Manchester City",
            "team_away": "Tottenham",
            "date": "2026-01-20",
            "competition": "Premier League",
            "stadium": "Etihad Stadium",
            "status": "scheduled",
            "incidents_count": 0,
            "created_at": datetime.now(timezone.utc).isoformat(),
        },
    ]
    for m in demo_matches:
        if not await db.matches.find_one(
            {"team_home": m["team_home"], "date": m["date"]}
        ):
            await db.matches.insert_one(m)

    demo_incidents = [
        {
            "id": str(uuid.uuid4()),
            "incident_type": "offside",
            "description": "Striker appears to be in offside position when receiving through ball behind last defender",
            "timestamp_in_match": "23:45",
            "team_involved": "Liverpool",
            "player_involved": "M. Salah",
            "decision_status": "confirmed",
            "final_decision": "Offside - Goal Disallowed",
            "has_image": False,
            "storage_path": None,
            "ai_analysis": {
                "hippocampus": {
                    "stage": "hippocampus",
                    "initial_confidence": 82.3,
                    "initial_decision": "Goal Disallowed - Offside",
                    "matched_keywords": ["offside", "through ball", "last defender", "behind"],
                    "keyword_match_ratio": 0.5,
                    "severity_weight": 0.85,
                    "historical_boost": 4.0,
                    "processing_time_ms": 2,
                },
                "neo_cortex": {
                    "stage": "neo_cortex",
                    "confidence_score": 94.5,
                    "suggested_decision": "Offside - Goal Disallowed",
                    "reasoning": "Player was 0.3m beyond the last defender when the ball was played",
                    "key_factors": ["Player position", "Defender line", "Ball trajectory"],
                    "risk_level": "low",
                    "neo_cortex_notes": "Clear offside with minimal margin for error",
                    "processing_time_ms": 1250,
                },
                "final_confidence": 94.5,
                "suggested_decision": "Offside - Goal Disallowed",
                "reasoning": "Player was 0.3m beyond the last defender when the ball was played",
                "key_factors": ["Player position", "Defender line", "Ball trajectory"],
                "risk_level": "low",
                "similar_historical_cases": 156,
                "historical_accuracy": 91.2,
                "total_processing_time_ms": 1252,
                "pathway": "hippocampus -> neo_cortex",
                "engine_version": "OCTON v1.0 - Dr Finnegan",
            },
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        },
        {
            "id": str(uuid.uuid4()),
            "incident_type": "penalty",
            "description": "Possible handball in the penalty area during corner kick, arm in unnatural position",
            "timestamp_in_match": "67:12",
            "team_involved": "Manchester United",
            "player_involved": "R. Varane",
            "decision_status": "overturned",
            "final_decision": "No Penalty - Natural Position",
            "has_image": False,
            "storage_path": None,
            "ai_analysis": {
                "hippocampus": {
                    "stage": "hippocampus",
                    "initial_confidence": 76.0,
                    "initial_decision": "Penalty Awarded",
                    "matched_keywords": ["penalty", "area", "handball"],
                    "keyword_match_ratio": 0.38,
                    "severity_weight": 0.90,
                    "historical_boost": 3.6,
                    "processing_time_ms": 1,
                },
                "neo_cortex": {
                    "stage": "neo_cortex",
                    "confidence_score": 78.2,
                    "suggested_decision": "Penalty - Handball",
                    "reasoning": "Ball contact with arm detected but arm position debatable",
                    "key_factors": ["Arm position", "Ball distance", "Reaction time"],
                    "risk_level": "high",
                    "neo_cortex_notes": "Borderline case - arm was transitioning from natural to unnatural",
                    "processing_time_ms": 2100,
                },
                "final_confidence": 78.2,
                "suggested_decision": "Penalty - Handball",
                "reasoning": "Ball contact with arm detected but arm position debatable",
                "key_factors": ["Arm position", "Ball distance", "Reaction time"],
                "risk_level": "high",
                "similar_historical_cases": 89,
                "historical_accuracy": 76.4,
                "total_processing_time_ms": 2101,
                "pathway": "hippocampus -> neo_cortex",
                "engine_version": "OCTON v1.0 - Dr Finnegan",
            },
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        },
        {
            "id": str(uuid.uuid4()),
            "incident_type": "red_card",
            "description": "Late tackle from behind with studs up on attacking player, excessive force and dangerous play",
            "timestamp_in_match": "54:30",
            "team_involved": "Chelsea",
            "player_involved": "E. Fernandez",
            "decision_status": "confirmed",
            "final_decision": "Red Card - Serious Foul Play",
            "has_image": False,
            "storage_path": None,
            "ai_analysis": {
                "hippocampus": {
                    "stage": "hippocampus",
                    "initial_confidence": 83.5,
                    "initial_decision": "Red Card - Serious Foul Play",
                    "matched_keywords": ["red card", "excessive force", "dangerous", "studs up"],
                    "keyword_match_ratio": 0.44,
                    "severity_weight": 0.88,
                    "historical_boost": 2.0,
                    "processing_time_ms": 1,
                },
                "neo_cortex": {
                    "stage": "neo_cortex",
                    "confidence_score": 91.8,
                    "suggested_decision": "Red Card - Serious Foul Play",
                    "reasoning": "Tackle was reckless with excessive force endangering opponent safety",
                    "key_factors": ["Tackle intensity", "Point of contact", "Player safety"],
                    "risk_level": "critical",
                    "neo_cortex_notes": "Clear red card situation - studs up with excessive force",
                    "processing_time_ms": 980,
                },
                "final_confidence": 91.8,
                "suggested_decision": "Red Card - Serious Foul Play",
                "reasoning": "Tackle was reckless with excessive force endangering opponent safety",
                "key_factors": ["Tackle intensity", "Point of contact", "Player safety"],
                "risk_level": "critical",
                "similar_historical_cases": 43,
                "historical_accuracy": 88.4,
                "total_processing_time_ms": 981,
                "pathway": "hippocampus -> neo_cortex",
                "engine_version": "OCTON v1.0 - Dr Finnegan",
            },
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        },
        {
            "id": str(uuid.uuid4()),
            "incident_type": "foul",
            "description": "Challenge in midfield with potential for yellow card, deliberate foul to stop counter-attack",
            "timestamp_in_match": "31:15",
            "team_involved": "Arsenal",
            "player_involved": "D. Rice",
            "decision_status": "pending",
            "final_decision": None,
            "has_image": False,
            "storage_path": None,
            "ai_analysis": {
                "hippocampus": {
                    "stage": "hippocampus",
                    "initial_confidence": 71.0,
                    "initial_decision": "Foul Confirmed",
                    "matched_keywords": ["foul", "challenge"],
                    "keyword_match_ratio": 0.22,
                    "severity_weight": 0.70,
                    "historical_boost": 6.0,
                    "processing_time_ms": 1,
                },
                "neo_cortex": {
                    "stage": "neo_cortex",
                    "confidence_score": 65.3,
                    "suggested_decision": "Yellow Card - Tactical Foul",
                    "reasoning": "Deliberate foul to stop counter-attack, no excessive force",
                    "key_factors": ["Intent", "Impact", "Game situation"],
                    "risk_level": "medium",
                    "neo_cortex_notes": "Classic tactical foul scenario - yellow card appropriate",
                    "processing_time_ms": 750,
                },
                "final_confidence": 65.3,
                "suggested_decision": "Yellow Card - Tactical Foul",
                "reasoning": "Deliberate foul to stop counter-attack, no excessive force",
                "key_factors": ["Intent", "Impact", "Game situation"],
                "risk_level": "medium",
                "similar_historical_cases": 234,
                "historical_accuracy": 82.1,
                "total_processing_time_ms": 751,
                "pathway": "hippocampus -> neo_cortex",
                "engine_version": "OCTON v1.0 - Dr Finnegan",
            },
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        },
    ]

    for inc in demo_incidents:
        await db.incidents.insert_one(inc)

    return {
        "message": "OCTON VAR demo data seeded - Dr Finnegan's system ready",
        "referees": len(demo_referees),
        "matches": len(demo_matches),
        "incidents": len(demo_incidents),
    }


# ── Root ──────────────────────────────────────────────────
@api_router.get("/")
async def root():
    return {
        "name": "OCTON VAR Forensic Audit System",
        "architect": "Dr Finnegan",
        "version": "1.0.0",
        "architecture": "Hippocampus -> Neo Cortex Neural Pathway",
        "description": "Lightning speed analyses for VAR decision support",
    }


# ── App Setup ─────────────────────────────────────────────
app.include_router(api_router)

frontend_url = os.environ.get(
    "FRONTEND_URL", "https://smart-var-audit.preview.emergentagent.com"
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[frontend_url, "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    await seed_admin(db)
    try:
        init_storage()
    except Exception as e:
        logger.warning(f"Storage init warning: {e}")
    logger.info("OCTON VAR System online - Dr Finnegan's Neural Pathway active")

    # Write test credentials
    creds_path = Path("/app/memory/test_credentials.md")
    creds_path.parent.mkdir(parents=True, exist_ok=True)
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@octonvar.com")
    admin_password = os.environ.get("ADMIN_PASSWORD", "OctonAdmin2026!")
    creds_path.write_text(
        f"# OCTON VAR Test Credentials\n\n"
        f"## Admin\n- Email: {admin_email}\n- Password: {admin_password}\n- Role: admin\n\n"
        f"## Auth Endpoints\n- POST /api/auth/register\n- POST /api/auth/login\n"
        f"- POST /api/auth/logout\n- GET /api/auth/me\n- POST /api/auth/refresh\n"
    )


@app.on_event("shutdown")
async def shutdown():
    client.close()
