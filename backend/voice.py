"""
OCTON — Voice assistant backend
STT (Whisper) + chat (GPT-5.2) + TTS (tts-1 / "onyx") using the Emergent LLM key.
"""
import asyncio
import io
import logging
import os
from typing import Optional, Dict, Any, List

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are OCTON — the voice of a professional VAR forensic AI assistant working alongside match officials.

Persona: calm, authoritative, concise. Sound like a trusted forensic analyst briefing an operator, NOT a chatty chatbot.

Rules:
- Keep spoken replies SHORT: 2-4 sentences (~35 words) unless the user explicitly says "explain in detail".
- Never hedge ("I think…", "maybe…"). State findings directly; if confidence is low, say "evidence is inconclusive".
- When quoting laws, cite by number (e.g. "per IFAB Law 12").
- If the user asks about an incident that isn't selected, say so and ask them to select or name one.
- Refuse politely if asked to bypass VAR review protocols or make definitive match rulings in place of the referee.

Available context in every turn:
- `selected_incident`: the incident currently loaded in the operator's view (may be null)
- `recent_incidents`: a short list of the latest match incidents
- `training_summary`: counts of ground-truth precedents per category

You can acknowledge these when they matter but do not read them out verbatim.
"""


async def transcribe_audio(audio_bytes: bytes, filename: str = "voice.webm") -> str:
    """Whisper transcription."""
    try:
        from emergentintegrations.llm.openai import OpenAISpeechToText
    except Exception as e:
        raise RuntimeError(f"emergentintegrations import failed: {e}")
    api_key = os.environ.get("EMERGENT_LLM_KEY")
    if not api_key:
        raise RuntimeError("EMERGENT_LLM_KEY missing")
    stt = OpenAISpeechToText(api_key=api_key)
    audio_file = io.BytesIO(audio_bytes)
    audio_file.name = filename
    response = await stt.transcribe(
        file=audio_file,
        model="whisper-1",
        response_format="json",
        language="en",
        prompt="VAR, offside, handball, red card, penalty, IFAB Law, OCTON, neocortex, referee.",
    )
    return (response.text or "").strip()


async def generate_reply(
    user_text: str,
    session_id: str,
    context: Dict[str, Any],
    history: Optional[List[Dict[str, str]]] = None,
) -> str:
    """Chat with GPT-5.2 carrying session memory and match-context."""
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
    except Exception as e:
        raise RuntimeError(f"emergentintegrations import failed: {e}")
    api_key = os.environ.get("EMERGENT_LLM_KEY")
    if not api_key:
        raise RuntimeError("EMERGENT_LLM_KEY missing")

    # Compact JSON-ish context block
    parts = []
    sel = context.get("selected_incident")
    if sel:
        sel_line = (
            f"selected_incident:\n"
            f"  type={sel.get('incident_type')}\n"
            f"  time={sel.get('timestamp_in_match') or '-'}\n"
            f"  team={sel.get('team_involved') or '-'}\n"
            f"  decision={sel.get('final_decision') or (sel.get('ai_analysis') or {}).get('suggested_decision') or '-'}\n"
            f"  confidence={(sel.get('ai_analysis') or {}).get('final_confidence') or '-'}%\n"
            f"  description={sel.get('description','')[:220]}"
        )
        parts.append(sel_line)
    recents = context.get("recent_incidents") or []
    if recents:
        lines = [
            f"  - {r.get('incident_type','?')} @ {r.get('timestamp_in_match') or '-'} → "
            f"{(r.get('final_decision') or (r.get('ai_analysis') or {}).get('suggested_decision') or 'pending')[:80]}"
            for r in recents[:6]
        ]
        parts.append("recent_incidents:\n" + "\n".join(lines))
    ts = context.get("training_summary")
    if ts:
        by = ", ".join(f"{k}:{v}" for k, v in ts.items())
        parts.append(f"training_summary: {ts.get('total',0)} cases ({by})")
    ctx_block = "\n\n".join(parts) if parts else "(no context available)"

    chat = LlmChat(
        api_key=api_key,
        session_id=session_id,
        system_message=SYSTEM_PROMPT + "\n\nCONTEXT:\n" + ctx_block,
    ).with_model("openai", "gpt-5.2")

    # Seed with any provided history so the conversation feels continuous.
    if history:
        for h in history[-8:]:
            # LlmChat replays are light — we just prefix the new user message with a quick recap
            pass  # session_id-based memory is handled server-side by emergentintegrations

    resp = await chat.send_message(UserMessage(text=user_text))
    return (resp or "I don't have a response right now.").strip()


async def speak(text: str, voice: str = "onyx", hd: bool = False) -> bytes:
    """TTS — returns MP3 bytes."""
    try:
        from emergentintegrations.llm.openai import OpenAITextToSpeech
    except Exception as e:
        raise RuntimeError(f"emergentintegrations import failed: {e}")
    api_key = os.environ.get("EMERGENT_LLM_KEY")
    if not api_key:
        raise RuntimeError("EMERGENT_LLM_KEY missing")
    tts = OpenAITextToSpeech(api_key=api_key)
    # Trim to safe size
    safe_text = (text or "").strip()
    if len(safe_text) > 3800:
        safe_text = safe_text[:3800] + "…"
    audio_bytes = await tts.generate_speech(
        text=safe_text,
        model="tts-1-hd" if hd else "tts-1",
        voice=voice,
    )
    return audio_bytes


async def build_context(db, selected_incident_id: Optional[str]) -> Dict[str, Any]:
    """Lightweight live context for OCTON (selected + recent + training counts)."""
    # Pull everything concurrently
    async def _recent():
        return await db.incidents.find({}, {"_id": 0}).sort("created_at", -1).to_list(6)

    async def _selected():
        if not selected_incident_id:
            return None
        return await db.incidents.find_one({"id": selected_incident_id}, {"_id": 0})

    async def _training():
        total = await db.training_cases.count_documents({})
        pipeline = [
            {"$group": {"_id": "$incident_type", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}},
        ]
        by = await db.training_cases.aggregate(pipeline).to_list(20)
        out = {"total": total}
        for row in by:
            out[row["_id"]] = row["count"]
        return out

    recent, selected, training = await asyncio.gather(_recent(), _selected(), _training())
    return {
        "selected_incident": selected,
        "recent_incidents": recent,
        "training_summary": training,
    }
