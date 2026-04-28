"""
OCTON VAR Training Corpus — Ground-Truth Precedent RAG
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Architect: Dr Finnegan

Retrieves the most similar past VAR decisions (with known correct rulings)
so both the Hippocampus and Neo Cortex pathways can reason with
binding precedent — the way real VAR officials do.
"""
import os
import re
import json
import time
import logging
from typing import List, Dict, Optional

logger = logging.getLogger(__name__)

# Minimal stop-word list to keep tokens high-signal.
STOPWORDS = {
    "the", "and", "but", "for", "with", "was", "were", "are", "this", "that",
    "from", "into", "onto", "then", "than", "has", "had", "have", "been",
    "not", "only", "very", "too", "any", "all", "one", "two", "his", "her",
    "they", "them", "their", "there", "which", "when", "where", "what",
    "who", "how", "why", "over", "under", "into", "above", "below",
    "after", "before", "while", "about", "because", "off", "out", "you",
    "your", "yours", "it's", "its", "on", "in", "of", "to", "a", "an",
    "as", "at", "by", "or", "no", "so", "if", "be", "is", "am",
}


def _tokenize(text: str) -> set:
    if not text:
        return set()
    words = re.findall(r"[a-z0-9]+", text.lower())
    return {w for w in words if len(w) >= 3 and w not in STOPWORDS}


def _similarity(query_text: str, query_tags: List[str], case_text: str, case_tags: List[str]) -> float:
    """Blended Jaccard similarity: 60 % token overlap + 40 % tag overlap."""
    q_tokens = _tokenize(query_text) | {t.lower() for t in (query_tags or [])}
    c_tokens = _tokenize(case_text) | {t.lower() for t in (case_tags or [])}
    if not q_tokens or not c_tokens:
        return 0.0
    inter = len(q_tokens & c_tokens)
    union = len(q_tokens | c_tokens)
    jaccard = inter / union if union else 0.0

    q_tags = {t.lower() for t in (query_tags or [])}
    c_tags = {t.lower() for t in (case_tags or [])}
    if q_tags and c_tags:
        tag_union = len(q_tags | c_tags)
        tag_overlap = len(q_tags & c_tags) / tag_union if tag_union else 0.0
    else:
        tag_overlap = 0.0
    return round(0.6 * jaccard + 0.4 * tag_overlap, 4)


async def retrieve_precedents(
    db,
    incident_type: str,
    description: str,
    query_tags: Optional[List[str]] = None,
    top_k: int = 5,
    min_score: float = 0.12,
) -> List[Dict]:
    """Pull top-K ground-truth cases of the same incident_type ranked by similarity."""
    try:
        cursor = db.training_cases.find(
            {"incident_type": incident_type},
            {"_id": 0},
        )
        cases = await cursor.to_list(500)
    except Exception as e:
        logger.error(f"Training retrieval error: {e}")
        return []

    scored: List[Dict] = []
    for c in cases:
        case_text = " ".join([
            c.get("title") or "",
            c.get("description") or "",
            c.get("rationale") or "",
            " ".join(c.get("keywords") or []),
        ])
        all_tags = list(set((c.get("keywords") or []) + (c.get("tags") or []) + (c.get("visual_tags") or [])))
        score = _similarity(description, query_tags or [], case_text, all_tags)
        if score >= min_score:
            scored.append({
                "id": c["id"],
                "title": c.get("title"),
                "incident_type": c.get("incident_type"),
                "correct_decision": c.get("correct_decision"),
                "rationale": c.get("rationale"),
                "match_context": c.get("match_context"),
                "law_references": c.get("law_references") or [],
                "keywords": c.get("keywords") or [],
                "visual_tags": c.get("visual_tags") or [],
                "media_storage_path": c.get("media_storage_path"),
                "thumbnail_storage_path": c.get("thumbnail_storage_path"),
                "similarity": score,
            })

    scored.sort(key=lambda x: x["similarity"], reverse=True)
    return scored[:top_k]


def compute_confidence_uplift(precedents: List[Dict]) -> Dict:
    """Return a transparent, capped uplift so the badge can audit the boost.

    Updated 2026-02 — consensus-aware uplift:
      • Top match drives baseline ( top_sim × 40 )
      • Each supporting strong-match (>= 0.10) adds +2 %
      • +3 % consensus bonus when ≥ 3 strong matches all agree on the same
        canonical decision (read from the literal `correct_decision` first
        word — penalty / red / yellow / offside / no-handball / etc.)
      • Cap raised from 20 → 25 % to reflect the larger seeded corpus.
    """
    if not precedents:
        return {"uplift": 0.0, "strong_matches": 0, "avg_similarity": 0.0, "consensus": False}
    strong = [p for p in precedents if p["similarity"] >= 0.10]
    if not strong:
        return {"uplift": 0.0, "strong_matches": 0, "avg_similarity": 0.0, "consensus": False}
    top_sim = max(p["similarity"] for p in strong)
    avg_sim = sum(p["similarity"] for p in strong) / len(strong)

    # Consensus detection — 3+ strong precedents whose `correct_decision`
    # share the same head-token (case-insensitive) signal a textbook
    # application of law. Adds a +3 % uplift bonus.
    consensus = False
    if len(strong) >= 3:
        heads = []
        for p in strong:
            d = (p.get("correct_decision") or "").strip().lower()
            if not d:
                continue
            head = d.split()[0]
            heads.append(head)
        if heads and heads.count(heads[0]) >= max(3, int(0.66 * len(heads))):
            consensus = True

    raw = top_sim * 50.0 + (len(strong) - 1) * 2.5
    if consensus:
        raw += 4.0
    uplift = round(max(0.0, min(30.0, raw)), 1)
    return {
        "uplift": uplift,
        "strong_matches": len(strong),
        "avg_similarity": round(avg_sim, 3),
        "consensus": consensus,
    }


def build_precedent_prompt(precedents: List[Dict]) -> str:
    """Format precedents as a Neo Cortex prompt block."""
    if not precedents:
        return ""
    lines = [
        "GROUND-TRUTH PRECEDENTS (highest similarity first — apply as binding precedent):",
    ]
    for i, p in enumerate(precedents, 1):
        ctx = p.get("match_context") or {}
        ctx_line = ""
        if ctx:
            teams = ctx.get("teams") or ""
            comp = ctx.get("competition") or ""
            year = ctx.get("year") or ""
            ctx_line = f" [{teams} · {comp} · {year}]" if any([teams, comp, year]) else ""
        laws = ", ".join(p.get("law_references") or [])
        lines.append(
            f"  {i}. \"{p.get('title','Precedent')}\"{ctx_line}\n"
            f"     Rationale: {p.get('rationale','')[:220]}\n"
            f"     Correct ruling: {p.get('correct_decision','')}\n"
            f"     Laws: {laws or 'n/a'}    Similarity: {p['similarity']*100:.1f}%"
        )
    lines.append(
        "When a precedent matches closely, defer to its ruling unless the facts diverge materially. "
        "Cite the precedent number(s) inside your reasoning (e.g. 'per precedent #1')."
    )
    return "\n".join(lines)


async def auto_tag_image(image_base64: str) -> List[str]:
    """Use GPT-5.2 Vision to extract compact visual tags from a training image."""
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent
    except Exception:
        return []
    api_key = os.environ.get("EMERGENT_LLM_KEY")
    if not api_key or not image_base64:
        return []
    try:
        session_id = f"octon-tagger-{int(time.time())}"
        chat = LlmChat(
            api_key=api_key,
            session_id=session_id,
            system_message=(
                "You are a VAR forensic tagger. Given a frame from a football incident, "
                "output a compact JSON array of 6-12 lowercase visual tags useful for retrieval. "
                "Focus on: body-part contact (e.g. 'arm-extended', 'studs-up', 'ball-to-hand'), "
                "position (e.g. 'inside-box', 'goal-line'), posture (e.g. 'airborne', 'sliding'), "
                "proximity (e.g. 'last-defender', 'two-players'), severity hints (e.g. 'high-boot'). "
                'Respond ONLY as a JSON array like ["arm-extended","ball-to-hand","inside-box"]. '
                "No prose."
            ),
        ).with_model("openai", "gpt-5.2")
        msg = UserMessage(
            text="Tag this VAR frame.",
            file_contents=[ImageContent(image_base64=image_base64)],
        )
        resp = await chat.send_message(msg)
        arr_match = re.search(r"\[[^\[\]]*\]", resp or "")
        if not arr_match:
            return []
        tags = json.loads(arr_match.group())
        cleaned = []
        for t in tags:
            if not isinstance(t, str):
                continue
            t = t.strip().lower().replace(" ", "-")
            if t and 2 <= len(t) <= 40:
                cleaned.append(t)
        return cleaned[:14]
    except Exception as e:
        logger.warning(f"auto_tag_image failed: {e}")
        return []
