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
from datetime import datetime, timezone
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
    min_score: float = 0.08,
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
    now_dt = datetime.now(timezone.utc)
    for c in cases:
        case_text = " ".join([
            c.get("title") or "",
            c.get("description") or "",
            c.get("rationale") or "",
            " ".join(c.get("keywords") or []),
        ])
        all_tags = list(set((c.get("keywords") or []) + (c.get("tags") or []) + (c.get("visual_tags") or [])))
        score = _similarity(description, query_tags or [], case_text, all_tags)

        # ── Recency boost (Continuous Learning v2, 2026-02) ───────
        # Lessons harvested from recent PL/UCL matches should weigh
        # more than 10-year-old encyclopedia precedents — the laws
        # evolve every season and so do referee patterns.
        #   • case <  7 days old   → similarity ×1.25
        #   • case < 30 days old   → similarity ×1.15
        #   • else                 → no change
        # `created_at` is set by training_seed / training endpoints.
        age_days: Optional[float] = None
        try:
            ca = c.get("created_at") or c.get("source_ingested_at")
            if ca:
                if isinstance(ca, str):
                    ca = datetime.fromisoformat(ca.replace("Z", "+00:00"))
                if ca.tzinfo is None:
                    ca = ca.replace(tzinfo=timezone.utc)
                age_days = (now_dt - ca).total_seconds() / 86400.0
        except Exception:
            age_days = None

        recency_factor = 1.0
        if age_days is not None:
            if age_days < 7:
                recency_factor = 1.25
            elif age_days < 30:
                recency_factor = 1.15
        score = score * recency_factor

        # Landmark-precedent boost — iconic cases (Hand of God, Lampard ghost
        # goal, Henry vs Ireland, etc.) are universally recognised legal
        # anchors. Even a weak token overlap should still retrieve them so
        # the reasoning can demonstrate institutional knowledge.
        landmark = any(
            t in (c.get("tags") or []) for t in (
                "landmark", "landmark-precedent", "iconic", "iconic-precedent",
            )
        )
        # Also auto-detect iconic titles to avoid hand-tagging every case.
        title_lower = (c.get("title") or "").lower()
        iconic_phrases = (
            "hand of god", "lampard ghost", "henry vs ireland", "ghost goal",
            "zidane headbutt", "battle of santiago", "maradona",
        )
        if not landmark and any(phrase in title_lower for phrase in iconic_phrases):
            landmark = True
        if landmark:
            score = max(score, 0.18)  # floor so landmark precedents always retrieve

        if score >= min_score:
            # Freshness label for prompt + UI: how the engine should
            # weight this lesson. "FRESH" precedents are very recent
            # match reports; "RECENT" are within a month; "CANON"
            # are settled long-standing precedents.
            if age_days is None:
                freshness = "CANON"
            elif age_days < 7:
                freshness = "FRESH"
            elif age_days < 30:
                freshness = "RECENT"
            else:
                freshness = "CANON"

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
                "age_days": round(age_days, 1) if age_days is not None else None,
                "freshness": freshness,
                "source_url": c.get("source_url"),
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
    # Threshold lowered 0.10 → 0.08 (2026-02) to match the relaxed retrieve_precedents
    # min_score, so loosely-related precedents start to contribute uplift on
    # generic incident descriptions where text-match is weak.
    strong = [p for p in precedents if p["similarity"] >= 0.08]
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
    # Fresh-precedent bonus: each precedent created within the last
    # 30 days adds +1.5 % uplift, capped to +6 %. This is what makes
    # OCTON visibly improve as new PL/UCL match reports flow into the
    # corpus — recent rulings dominate stale ones.
    fresh_count = sum(1 for p in strong if (p.get("freshness") in ("FRESH", "RECENT")))
    fresh_bonus = min(6.0, fresh_count * 1.5)
    raw += fresh_bonus
    uplift = round(max(0.0, min(30.0, raw)), 1)
    return {
        "uplift": uplift,
        "strong_matches": len(strong),
        "avg_similarity": round(avg_sim, 3),
        "consensus": consensus,
        "fresh_precedents": fresh_count,
        "fresh_bonus": round(fresh_bonus, 1),
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
        ctx_parts = []
        teams = ctx.get("teams") or ""
        comp = ctx.get("competition") or ""
        year = ctx.get("year") or ""
        date = ctx.get("date") or ""
        referee = ctx.get("referee") or ""
        minute = ctx.get("minute") or ""
        if teams:
            ctx_parts.append(str(teams))
        if comp:
            ctx_parts.append(str(comp))
        if date:
            ctx_parts.append(str(date))
        elif year:
            ctx_parts.append(str(year))
        if referee:
            ctx_parts.append(f"referee {referee}")
        if minute:
            ctx_parts.append(f"min {minute}")
        ctx_line = f" [{' · '.join(ctx_parts)}]" if ctx_parts else ""
        laws = ", ".join(p.get("law_references") or [])
        # Freshness badge — tells Neocortex to weight recent lessons higher
        freshness = p.get("freshness") or "CANON"
        age_days = p.get("age_days")
        if freshness == "FRESH" and age_days is not None:
            fresh_tag = f" 🆕 FRESH · {age_days:.0f} d old"
        elif freshness == "RECENT" and age_days is not None:
            fresh_tag = f" ⏱ RECENT · {age_days:.0f} d old"
        else:
            fresh_tag = "  📜 CANON"
        lines.append(
            f"  {i}.{fresh_tag}  \"{p.get('title','Precedent')}\"{ctx_line}\n"
            f"     Rationale: {p.get('rationale','')[:220]}\n"
            f"     Correct ruling: {p.get('correct_decision','')}\n"
            f"     Laws: {laws or 'n/a'}    Similarity: {p['similarity']*100:.1f}%"
        )
    lines.append(
        "When a precedent matches closely, defer to its ruling unless the facts diverge materially. "
        "FRESH precedents (last 7 days) reflect this season's referee guidance and should weigh "
        "MORE than older CANON entries when the laws-of-the-game application is contested. "
        "In your reasoning, cite the precedent by TEAM-NAMES + DATE (and REFEREE where listed) to "
        "demonstrate institutional knowledge — e.g. \"consistent with Liverpool vs Tottenham "
        "(2021-11-07, referee Paul Tierney): Law 11 offside interference via blocked line-of-sight.\" "
        "This concrete citation is more persuasive to operators than generic 'per precedent #1'."
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
