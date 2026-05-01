"""Shared core: MongoDB client, enums, helpers, and module-level caches.

Imported by every router module so we have a single source of truth for the
database connection and cross-route state (health cache, etc.).
"""
from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import os
import logging
from datetime import datetime, timezone
from enum import Enum
from typing import Optional
from motor.motor_asyncio import AsyncIOMotorClient
from fastapi import APIRouter, Response

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger("octon")

# ── MongoDB ────────────────────────────────────────────────
mongo_url = os.environ["MONGO_URL"]
mongo_client = AsyncIOMotorClient(mongo_url)
db = mongo_client[os.environ["DB_NAME"]]

# ── API Router (all routers mount under /api) ──────────────
api_router = APIRouter(prefix="/api")


# ── Enums ──────────────────────────────────────────────────
class IncidentType(str, Enum):
    OFFSIDE = "offside"
    HANDBALL = "handball"
    FOUL = "foul"
    PENALTY = "penalty"
    GOAL_LINE = "goal_line"
    RED_CARD = "red_card"
    CORNER = "corner"
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


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ── Cross-route caches ─────────────────────────────────────
# System-health cache (invalidated when incidents emit storage_warnings).
_HEALTH_CACHE = {"at": 0.0, "data": None}


def invalidate_health_cache() -> None:
    _HEALTH_CACHE["at"] = 0.0
    _HEALTH_CACHE["data"] = None


# ── Voice sample whitelist (shared between voice + preferences routes) ──
VOICE_SAMPLE_WHITELIST = {"nova", "shimmer", "coral", "ash", "echo", "onyx", "sage", "alloy"}
