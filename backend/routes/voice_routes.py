"""OCTON Voice Bot routes: transcribe, chat, speak, voice-sample, preferences."""
import asyncio
import base64
import io
import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import File, HTTPException, Request, UploadFile
from pydantic import BaseModel
from starlette.responses import StreamingResponse

from auth import get_current_user
from core import VOICE_SAMPLE_WHITELIST, api_router, db
from voice import (
    build_context,
    classify_intent,
    fast_intent,
    generate_reply,
    speak,
    transcribe_audio,
)

logger = logging.getLogger("octon.voice")


class VoiceChatRequest(BaseModel):
    text: str
    session_id: Optional[str] = None
    selected_incident_id: Optional[str] = None
    include_audio: bool = True
    voice: str = "ash"


class UserPreferencesPatch(BaseModel):
    voice: Optional[str] = None


_VOICE_SAMPLE_TEXT = "Ready when you are — this is OCTON VAR, your forensic AI co-pilot."


@api_router.post("/voice/transcribe")
async def voice_transcribe(audio: UploadFile = File(...)):
    """Whisper STT — accepts webm/wav/mp3."""
    data = await audio.read()
    if len(data) > 25 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Audio too large (25 MB max)")
    if len(data) < 1000:
        raise HTTPException(status_code=400, detail="Audio clip too short")
    try:
        text = await transcribe_audio(data, filename=audio.filename or "voice.webm")
    except Exception as e:
        logger.exception(f"transcribe failed: {e}")
        raise HTTPException(status_code=500, detail=f"Transcription failed: {e}")
    return {"text": text}


@api_router.post("/voice/chat")
async def voice_chat(req: VoiceChatRequest):
    """OCTON voice turn: text → intent + reply (+ optional TTS MP3 b64)."""
    if not req.text or not req.text.strip():
        raise HTTPException(status_code=400, detail="Empty text")
    session_id = req.session_id or f"octon-voice-{uuid.uuid4()}"
    user_text = req.text.strip()
    try:
        fast = fast_intent(user_text)
        action_lines = {
            "confirm_decision": "Confirming the on-field decision.",
            "overturn_decision": "Overturning the on-field decision.",
            "reanalyze": "Re-running the analysis.",
            "open_precedents": "Opening matched precedents.",
            "export_pdf": "Generating the signed forensic report.",
            "promote_training": "Promoting this decision into the Training Library.",
            "open_incident": "Opening the requested incident.",
            "summarize_match": "Summarising the match so far.",
        }

        if fast and fast["action"] != "chat":
            intent = fast
            action = intent["action"]
            if action == "summarize_match":
                context = await build_context(db, req.selected_incident_id)
                reply_text = await generate_reply(
                    "Give me a 1-2 sentence recap of the match so far.",
                    session_id, context,
                )
            elif action == "open_incident":
                idx = int((intent.get("args") or {}).get("index") or 0)
                reply_text = f"Opening incident {idx}." if idx else action_lines[action]
            else:
                reply_text = action_lines.get(action, "Acknowledged.")
        else:
            intent_task = asyncio.create_task(classify_intent(user_text, bool(req.selected_incident_id)))
            context_task = asyncio.create_task(build_context(db, req.selected_incident_id))
            context = await context_task
            reply_task = asyncio.create_task(generate_reply(user_text, session_id, context))
            intent = await intent_task
            if intent.get("action") == "chat" or intent.get("confidence", 0) < 0.6:
                reply_text = await reply_task
                intent["action"] = "chat"
            else:
                action = intent["action"]
                if action == "summarize_match":
                    reply_text = await reply_task
                elif action == "open_incident":
                    idx = int((intent.get("args") or {}).get("index") or 0)
                    reply_text = f"Opening incident {idx}." if idx else action_lines[action]
                else:
                    reply_text = action_lines.get(action, "Acknowledged.")
                try:
                    reply_task.cancel()
                except Exception:
                    pass
    except Exception as e:
        logger.exception(f"voice chat failed: {e}")
        raise HTTPException(status_code=500, detail=f"Reply failed: {e}")

    audio_b64 = None
    if req.include_audio and reply_text:
        try:
            audio_bytes = await speak(reply_text, voice=req.voice)
            audio_b64 = base64.b64encode(audio_bytes).decode("utf-8")
        except Exception as e:
            logger.warning(f"TTS failed (returning text only): {e}")

    return {
        "session_id": session_id,
        "reply_text": reply_text,
        "audio_base64": audio_b64,
        "audio_mime": "audio/mpeg" if audio_b64 else None,
        "action": intent.get("action", "chat"),
        "action_args": intent.get("args", {}),
        "action_confidence": intent.get("confidence", 0.0),
    }


@api_router.post("/voice/speak")
async def voice_speak(req: VoiceChatRequest):
    """Plain TTS — returns raw audio/mpeg bytes."""
    if not req.text:
        raise HTTPException(status_code=400, detail="Empty text")
    try:
        audio_bytes = await speak(req.text, voice=req.voice)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"TTS failed: {e}")
    return StreamingResponse(
        io.BytesIO(audio_bytes),
        media_type="audio/mpeg",
        headers={"Content-Disposition": "inline; filename=octon.mp3"},
    )


@api_router.get("/voice/sample")
async def voice_sample(voice: str = "nova"):
    """Return a short sample MP3 for a given voice, cached per-voice in Mongo."""
    v = (voice or "nova").lower().strip()
    if v not in VOICE_SAMPLE_WHITELIST:
        raise HTTPException(status_code=400, detail=f"Unknown voice: {voice}")
    cached = await db.voice_samples.find_one({"voice": v, "text_hash": "v1"}, {"_id": 0})
    if cached and cached.get("audio_b64"):
        audio_bytes = base64.b64decode(cached["audio_b64"])
    else:
        try:
            audio_bytes = await speak(_VOICE_SAMPLE_TEXT, voice=v)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Sample generation failed: {e}")
        await db.voice_samples.update_one(
            {"voice": v, "text_hash": "v1"},
            {"$set": {
                "voice": v,
                "text_hash": "v1",
                "audio_b64": base64.b64encode(audio_bytes).decode("utf-8"),
                "sample_text": _VOICE_SAMPLE_TEXT,
                "created_at": datetime.now(timezone.utc).isoformat(),
            }},
            upsert=True,
        )
    return StreamingResponse(
        io.BytesIO(audio_bytes),
        media_type="audio/mpeg",
        headers={
            "Content-Disposition": f"inline; filename=octon-sample-{v}.mp3",
            "Cache-Control": "public, max-age=3600",
        },
    )


# ── Per-user preferences (voice etc.) ────────────────────
@api_router.get("/preferences")
async def preferences_get(request: Request):
    user = await get_current_user(request, db)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    uid = user.get("id") or user.get("_id")
    prefs = await db.user_preferences.find_one({"user_id": uid}, {"_id": 0}) or {}
    return {"voice": prefs.get("voice") or "nova"}


@api_router.put("/preferences")
async def preferences_update(body: UserPreferencesPatch, request: Request):
    user = await get_current_user(request, db)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    uid = user.get("id") or user.get("_id")
    update = {}
    if body.voice is not None:
        v = body.voice.lower().strip()
        if v not in VOICE_SAMPLE_WHITELIST:
            raise HTTPException(status_code=400, detail=f"Unknown voice: {body.voice}")
        update["voice"] = v
    if not update:
        raise HTTPException(status_code=400, detail="No supported preference in payload")
    update["user_id"] = uid
    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.user_preferences.update_one({"user_id": uid}, {"$set": update}, upsert=True)
    return {"voice": update.get("voice", "nova")}
