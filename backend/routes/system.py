"""System routes: health pip, websocket, root."""
import os
import time
from datetime import datetime, timezone

from fastapi import WebSocket, WebSocketDisconnect

from core import _HEALTH_CACHE, api_router, db
from websocket_manager import ws_manager


@api_router.get("/system/health")
async def system_health(force: bool = False):
    """Live health of every external dependency. 25 s cached.
    Surfaced in the dashboard top-nav as coloured pips."""
    now_ts = time.time()
    if not force and _HEALTH_CACHE["data"] and (now_ts - _HEALTH_CACHE["at"] < 25):
        return _HEALTH_CACHE["data"]

    storage_state = {"status": "down", "latency_ms": None, "error": None}
    storage_t0 = time.perf_counter()
    try:
        from storage import init_storage as _init_storage
        if not _init_storage():
            raise RuntimeError("Storage key not initialised")
        storage_state["status"] = "ok"
        storage_state["latency_ms"] = int((time.perf_counter() - storage_t0) * 1000)
    except Exception as e:
        storage_state["latency_ms"] = int((time.perf_counter() - storage_t0) * 1000)
        storage_state["error"] = str(e)[:160]

    llm_state = {"status": "down", "error": None}
    if os.environ.get("EMERGENT_LLM_KEY"):
        llm_state["status"] = "ok"
    else:
        llm_state["error"] = "EMERGENT_LLM_KEY missing from environment"

    last_inc = await db.incidents.find(
        {"storage_warnings": {"$exists": True, "$ne": []}},
        {"_id": 0, "storage_warnings": 1, "created_at": 1},
    ).sort("created_at", -1).limit(1).to_list(1)
    recent_storage_warning = None
    if last_inc:
        try:
            ts = datetime.fromisoformat(last_inc[0]["created_at"])
            age_s = (datetime.now(timezone.utc) - ts).total_seconds()
            if age_s < 300:
                recent_storage_warning = {
                    "at": last_inc[0]["created_at"],
                    "warnings": last_inc[0]["storage_warnings"],
                    "age_seconds": int(age_s),
                }
        except Exception:
            pass

    if recent_storage_warning and storage_state["status"] == "ok":
        storage_state["status"] = "degraded"
        storage_state["error"] = f"Recent upload failure {recent_storage_warning['age_seconds']}s ago"

    sched_cfg = await db.schedule_config.find_one({"id": "web_learning"}, {"_id": 0}) or {}

    # Vision pipeline (ffmpeg). If missing, video uploads silently fall
    # back to text-only analysis — operators get hallucinated verdicts.
    # Surfacing this in /system/health makes the regression loud.
    import shutil
    ffmpeg_state = {"status": "ok"}
    if not shutil.which("ffmpeg") or not shutil.which("ffprobe"):
        ffmpeg_state = {
            "status": "down",
            "error": "ffmpeg/ffprobe not on PATH — video uploads will not be analysed visually. "
                     "Install via `apt-get install -y ffmpeg`.",
        }

    payload = {
        "storage": storage_state,
        "llm": llm_state,
        "ffmpeg": ffmpeg_state,
        "scheduler": {
            "enabled": bool(sched_cfg.get("enabled")),
            "last_run_at": sched_cfg.get("last_run_at"),
            "cron": f"{sched_cfg.get('cron_hour', 3):02d}:{sched_cfg.get('cron_minute', 15):02d} UTC",
        },
        "recent_storage_warning": recent_storage_warning,
        "checked_at": datetime.now(timezone.utc).isoformat(),
    }
    _HEALTH_CACHE["data"] = payload
    _HEALTH_CACHE["at"] = now_ts
    return payload


@api_router.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    match_id: str = None,
    booth_id: str = None,
):
    """Tournament isolation: clients pass `?match_id=<id>` to scope the
    feed to a single fixture. `?booth_id=<id>` identifies which VAR
    booth is connecting so server-side audit logs can distinguish
    multiple operators watching the same match.
    Global subscribers (no match_id) still receive every event — used by
    the Match Wall and admin views."""
    sub_match = match_id if match_id and match_id != "all" else None
    await ws_manager.connect(websocket, match_id=sub_match, booth_id=booth_id)
    try:
        while True:
            data = await websocket.receive_text()
            await websocket.send_json({"type": "pong", "data": data})
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)


@api_router.get("/")
async def root():
    return {
        "name": "OCTON VAR Forensic Audit System",
        "architect": "Dr Finnegan",
        "version": "1.0.0",
        "architecture": "Hippocampus -> Neo Cortex Neural Pathway",
        "description": "Lightning speed analyses for VAR decision support",
    }
