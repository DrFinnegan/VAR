"""
RTMP live-ingest endpoints.

OCTON pairs with mediamtx (a single-binary RTMP→HLS gateway running as a
supervisor service). Operators run OBS and push their broadcast capture
to:

    rtmp://<this-host>:1935/octon/<stream_key>

mediamtx then exposes the same stream as HLS at:

    http://<this-host>:8888/octon/<stream_key>/index.m3u8

These endpoints register the stream in Mongo (so it shows up in the UI)
and return the HLS URL the LiveVAR stage can attach to.

Why this layer?
- The browser screen-share (GO LIVE) is brilliant for tab/window capture
  but doesn't survive the operator switching apps.
- RTMP push from OBS is rock-solid for a control-room rig — once OBS is
  pointed at the broadcast it just keeps streaming.
"""
import os
import secrets
from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException, Request
from pydantic import BaseModel, Field

from auth import get_current_user
from booth import get_booth_id, get_booth_label
from core import api_router, db


PUBLIC_HOST = os.environ.get("OCTON_PUBLIC_HOST", "octonvar.example")
RTMP_PORT = os.environ.get("OCTON_RTMP_PORT", "1935")
HLS_PORT = os.environ.get("OCTON_HLS_PORT", "8888")
RTMP_APP = "octon"  # mediamtx path prefix


class CreateIngestRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=80)
    match_id: Optional[str] = None
    description: Optional[str] = None


@api_router.post("/live/ingest")
async def create_ingest(body: CreateIngestRequest, request: Request):
    """Register a new live-ingest stream and return the OBS push URL +
    the HLS playback URL for the stage."""
    user = await get_current_user(request, db)
    stream_key = secrets.token_urlsafe(16).replace("-", "").replace("_", "")[:24]
    rtmp_url = f"rtmp://{PUBLIC_HOST}:{RTMP_PORT}/{RTMP_APP}"
    hls_url = f"http://{PUBLIC_HOST}:{HLS_PORT}/{RTMP_APP}/{stream_key}/index.m3u8"
    doc = {
        "id": stream_key,
        "name": body.name,
        "match_id": body.match_id,
        "description": body.description,
        "rtmp_url": rtmp_url,
        "rtmp_full_url": f"{rtmp_url}/{stream_key}",
        "hls_url": hls_url,
        "stream_key": stream_key,
        "created_by": user.get("_id"),
        "created_by_booth": get_booth_id(request),
        "created_by_booth_label": get_booth_label(request),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "active": False,
        "last_seen_at": None,
    }
    await db.live_ingests.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.get("/live/ingest")
async def list_ingests(match_id: Optional[str] = None):
    q: dict = {}
    if match_id:
        q["match_id"] = match_id
    docs = await db.live_ingests.find(q, {"_id": 0}).sort("created_at", -1).to_list(50)
    return docs


@api_router.delete("/live/ingest/{stream_key}")
async def delete_ingest(stream_key: str, request: Request):
    user = await get_current_user(request, db)
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    res = await db.live_ingests.delete_one({"id": stream_key})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Stream not found")
    return {"deleted": stream_key}


@api_router.post("/live/ingest/{stream_key}/heartbeat")
async def ingest_heartbeat(stream_key: str):
    """mediamtx hooks (or a sidecar) call this when a publisher
    connects/disconnects so the UI can show ACTIVE / IDLE."""
    await db.live_ingests.update_one(
        {"id": stream_key},
        {"$set": {"active": True, "last_seen_at": datetime.now(timezone.utc).isoformat()}},
    )
    return {"ok": True}


@api_router.get("/live/ingest/setup-help")
async def setup_help():
    """Cheat-sheet returned to the UI for operators new to OBS."""
    return {
        "rtmp_endpoint": f"rtmp://{PUBLIC_HOST}:{RTMP_PORT}/{RTMP_APP}",
        "hls_pattern": f"http://{PUBLIC_HOST}:{HLS_PORT}/{RTMP_APP}/<stream_key>/index.m3u8",
        "obs_settings": {
            "service": "Custom",
            "server": f"rtmp://{PUBLIC_HOST}:{RTMP_PORT}/{RTMP_APP}",
            "stream_key_field": "(use the stream_key from POST /api/live/ingest)",
            "video_bitrate_kbps": 4500,
            "keyframe_interval_seconds": 1,
            "preset": "veryfast",
            "profile": "high",
        },
        "notes": [
            "mediamtx must be running on the OCTON host (port 1935 RTMP + 8888 HLS).",
            "For demos behind a firewall, browser GO LIVE (getDisplayMedia) avoids the RTMP setup entirely.",
        ],
    }
