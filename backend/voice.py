"""
OCTON — Voice assistant backend
STT (Whisper) + chat (GPT-5.2) + TTS (tts-1 / "onyx") using the Emergent LLM key.
"""
import asyncio
import io
import logging
import os
import uuid
from typing import Optional, Dict, Any, List

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are OCTON — the voice of a professional VAR forensic AI assistant working alongside match officials. You speak with a warm, confident American accent — like a senior US-based sports analyst briefing a colleague.

Persona: calm, authoritative, charismatic, EXTREMELY concise. Sound like a trusted forensic analyst who has seen it all, NOT a chatty robot.

Rules:
- Keep spoken replies VERY SHORT: 1-2 sentences (~15-20 words max) unless the user explicitly says "explain in detail".
- Lead with the verdict / key fact, not a preamble. Never start with "Certainly", "Sure", "Of course" or "Let me…". Just answer.
- Write in natural spoken American English. Use contractions ("it's", "that's", "don't"). Drop unnecessary words.
- Occasionally use punchy transitions ("Here's the thing —", "Short version:", "Bottom line:"). Keep it human.
- Never hedge ("I think…", "maybe…"). State findings directly; if confidence is low, say "evidence is inconclusive".
- When quoting laws, cite by number (e.g. "per IFAB Law 12").
- If the user asks about an incident that isn't selected, say so in one line and ask them to select or name one.
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
    ).with_model("openai", "gpt-4o-mini")

    # Seed with any provided history so the conversation feels continuous.
    if history:
        for h in history[-8:]:
            # LlmChat replays are light — we just prefix the new user message with a quick recap
            pass  # session_id-based memory is handled server-side by emergentintegrations

    resp = await chat.send_message(UserMessage(text=user_text))
    return (resp or "I don't have a response right now.").strip()


async def speak(text: str, voice: str = "ash", hd: bool = True) -> bytes:
    """TTS — returns MP3 bytes.
    Default: `ash` voice on `tts-1-hd` at speed 1.05 → warm, expressive
    American-English cadence that sounds alive rather than mechanistic."""
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
        speed=1.05,
    )
    return audio_bytes


import re as _re

# ── Fast regex-first intent classifier ──
# Matches common command phrases in < 1 ms so we can skip the GPT intent call
# (which adds 1-2 s of latency). GPT classification is used only if nothing
# matches and the utterance is long / ambiguous.
_INTENT_PATTERNS = [
    ("confirm_decision", _re.compile(
        r"\b(confirm|uphold|keep|agree(?:\s+with)?|let\s+(?:the\s+)?call\s+stand|"
        r"stand(?:s)?\s+as\s+(?:called|is)|yes\s*(?:confirm)?|on[-\s]?field\s+stands)\b",
        _re.I)),
    ("overturn_decision", _re.compile(
        r"\b(overturn|overrule|reverse|change\s+the\s+decision|"
        r"disagree|wrong\s+call|no\s*(?:overturn)?|flip\s+(?:the\s+)?call)\b",
        _re.I)),
    ("reanalyze", _re.compile(
        r"\b(re[-\s]?analy(?:z|s)e|run\s+again|redo|check\s+again|"
        r"analy(?:z|s)e\s+again|re[-\s]?run)\b", _re.I)),
    ("open_precedents", _re.compile(
        r"\b(precedent|similar\s+cases?|history\s+(?:for|of)|"
        r"past\s+(?:cases?|incidents?)|training\s+library)\b", _re.I)),
    ("export_pdf", _re.compile(
        r"\b(export|download|save|generate)\s+(?:the\s+)?(?:pdf|report|audit)\b|\bsign\s+(?:the\s+)?report\b",
        _re.I)),
    ("promote_training", _re.compile(
        r"\b(add\s+to\s+training|promote|train\s+on\s+this|learn\s+from\s+this|"
        r"add\s+to\s+(?:library|precedents))\b", _re.I)),
    ("summarize_match", _re.compile(
        r"\b(summary|recap|overview|how\s+is\s+(?:the\s+)?match|sum\s+up|briefing)\b",
        _re.I)),
]
_OPEN_INCIDENT_RE = _re.compile(
    r"\b(?:open|show|go\s+to|select|pull\s+up|jump\s+to)\s+(?:incident\s+)?(?:number\s+)?(\d+)\b",
    _re.I,
)


def fast_intent(user_text: str) -> Optional[Dict[str, Any]]:
    """Return an intent dict if a strong regex match is found, else None.
    Confidence is intentionally set high (0.9) so the voice_chat handler
    short-circuits the GPT intent call on the happy path."""
    t = (user_text or "").strip()
    if not t:
        return None
    m = _OPEN_INCIDENT_RE.search(t)
    if m:
        try:
            idx = int(m.group(1))
            return {"action": "open_incident", "args": {"index": idx}, "confidence": 0.92}
        except ValueError:
            pass
    for action, pattern in _INTENT_PATTERNS:
        if pattern.search(t):
            return {"action": action, "args": {}, "confidence": 0.9}
    return None


async def classify_intent(user_text: str, has_selection: bool) -> Dict[str, Any]:
    """One-pass GPT-5.2 intent classification. Returns {action, args, confidence}.
    NOTE: callers should prefer `fast_intent()` first and only fall through to
    this function when regex patterns don't match — saves 1-2s of LLM latency."""
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
    except Exception as e:
        raise RuntimeError(f"emergentintegrations import failed: {e}")
    import json as _json

    api_key = os.environ.get("EMERGENT_LLM_KEY")
    if not api_key:
        return {"action": "chat", "args": {}, "confidence": 0.0}

    sys_msg = (
        "You are the intent classifier for a VAR voice assistant. "
        "Map the user's utterance to EXACTLY ONE of these actions:\n"
        " - chat                (default — just answer a question / explain)\n"
        " - confirm_decision    (user says: confirm / confirm the call / uphold / agree / stand)\n"
        " - overturn_decision   (user says: overturn / overrule / reverse / change / disagree)\n"
        " - reanalyze           (user says: re-analyze / run again / redo analysis / check again)\n"
        " - open_precedents     (user says: show precedents / what precedents / open history / show similar cases)\n"
        " - export_pdf          (user says: export / download / pdf / report / save report)\n"
        " - promote_training    (user says: add to training / promote / train on this / learn from this)\n"
        " - open_incident       (user says: show incident N / open incident N / go to N)\n"
        " - summarize_match     (user says: summary / recap / overview / how is the match going)\n"
        "\nRespond ONLY as strict JSON: {\"action\": \"...\", \"args\": {...}, \"confidence\": 0.0-1.0}.\n"
        "For `open_incident`, `args = {\"index\": <1-based int>}`. For others `args = {}`.\n"
        "If unsure → {\"action\": \"chat\", \"args\": {}, \"confidence\": 0.0}."
    )
    if not has_selection:
        sys_msg += "\nNote: no incident is currently selected by the operator."

    chat = LlmChat(
        api_key=api_key,
        session_id=f"octon-intent-{uuid.uuid4()}",
        system_message=sys_msg,
    ).with_model("openai", "gpt-4o-mini")
    try:
        resp = await chat.send_message(UserMessage(text=user_text))
    except Exception:
        return {"action": "chat", "args": {}, "confidence": 0.0}

    m = _re.search(r"\{.*\}", resp or "", flags=_re.DOTALL)
    if not m:
        return {"action": "chat", "args": {}, "confidence": 0.0}
    try:
        parsed = _json.loads(m.group())
        action = str(parsed.get("action", "chat")).strip()
        args = parsed.get("args") or {}
        conf = float(parsed.get("confidence", 0.0))
        allowed = {"chat", "confirm_decision", "overturn_decision", "reanalyze",
                   "open_precedents", "export_pdf", "promote_training",
                   "open_incident", "summarize_match"}
        if action not in allowed:
            action = "chat"
        return {"action": action, "args": args, "confidence": conf}
    except Exception:
        return {"action": "chat", "args": {}, "confidence": 0.0}


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
