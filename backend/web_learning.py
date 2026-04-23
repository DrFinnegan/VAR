"""
OCTON VAR — Web-learning ingestion.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Architect: Dr Finnegan

Pulls VAR-decision articles from the public web, extracts structured
ground-truth decisions via GPT-5.2, and seeds the Training Corpus so
OCTON learns from real-world matches as they happen.

Security posture:
    • Admin-only callers.
    • Only fetches URLs the admin explicitly provides (no crawl).
    • HTML sanitised to plain text before LLM call (no remote code).
    • Each accepted case carries `source_url`, `source_title`,
      `source_ingested_at`, `source_confidence` for auditability.
"""
import os
import re
import json
import uuid
import logging
import asyncio
from datetime import datetime, timezone
from typing import List, Dict, Optional

import httpx
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

VALID_TYPES = {"offside", "handball", "foul", "penalty", "goal_line", "red_card", "other"}

# Hard timeouts so a slow website can't hang the server
_FETCH_TIMEOUT = 15.0
_LLM_TIMEOUT = 45.0
_MAX_TEXT_CHARS = 12000  # ~ 3k GPT tokens — well within the GPT-5.2 limit


# ── HTML fetch + clean ───────────────────────────────────

async def fetch_article_text(url: str) -> Dict:
    """Fetch a URL and return {title, text, fetched_at}. Raises on failure."""
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        ),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
    }
    async with httpx.AsyncClient(timeout=_FETCH_TIMEOUT, follow_redirects=True) as client:
        r = await client.get(url, headers=headers)
    if r.status_code >= 400:
        raise RuntimeError(f"HTTP {r.status_code} fetching {url}")
    ct = r.headers.get("content-type", "")
    if "html" not in ct and "xml" not in ct:
        raise RuntimeError(f"Unsupported content-type {ct!r} for {url}")

    soup = BeautifulSoup(r.text, "lxml")

    # Strip known noise
    for tag in soup(["script", "style", "noscript", "svg", "form", "header",
                     "footer", "nav", "aside", "iframe"]):
        tag.decompose()

    title = (soup.title.string.strip() if soup.title and soup.title.string else url)

    # Prefer <article> if present
    main = soup.find("article") or soup.find("main") or soup.body or soup
    text = main.get_text(separator="\n", strip=True)
    # Collapse whitespace
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = re.sub(r"[ \t]{2,}", " ", text)
    if len(text) > _MAX_TEXT_CHARS:
        text = text[:_MAX_TEXT_CHARS] + "\n\n[… truncated for LLM ingestion]"
    if len(text.split()) < 60:
        raise RuntimeError("Article body too short to contain a VAR decision")
    return {"title": title, "text": text, "fetched_at": datetime.now(timezone.utc).isoformat()}


# ── LLM extraction ───────────────────────────────────────

_EXTRACT_SYSTEM = (
    "You are OCTON VAR's WEB-LEARNING extractor. You read a football match "
    "article or match report and extract every VAR-reviewable decision that "
    "the article clearly describes: offside, handball, foul, penalty, goal "
    "line, red card, or mistaken identity.\n\n"
    "Rules:\n"
    "- ONLY extract decisions where the article makes both the INCIDENT and the "
    "FINAL OUTCOME unambiguous.\n"
    "- Do NOT invent details. If the article is vague, skip the case.\n"
    "- Use concise professional VAR-analyst language.\n"
    "- Each case must be generic enough to apply as a precedent — strip names "
    "of individual players where not essential to the principle.\n"
    "- `incident_type` MUST be one of: offside, handball, foul, penalty, "
    "goal_line, red_card, other.\n"
    "- `confidence_in_extraction` 0-1 — how confident you are that the article "
    "unambiguously describes this decision (>= 0.75 to include).\n\n"
    "Return STRICT JSON:\n"
    "{\n"
    '  "cases": [\n'
    "    {\n"
    '      "title": "short descriptive title",\n'
    '      "incident_type": "offside|handball|foul|penalty|goal_line|red_card|other",\n'
    '      "correct_decision": "clear decision string, e.g. Goal Disallowed - Offside",\n'
    '      "rationale": "1-3 sentence VAR-analyst rationale citing the relevant law",\n'
    '      "keywords": ["6-12 high-signal phrases from the article"],\n'
    '      "tags": ["3-6 kebab-case tags"],\n'
    '      "law_references": ["IFAB Law 11", "..."],\n'
    '      "outcome": "short outcome phrase",\n'
    '      "match_context": {"teams": "Team A vs Team B", "competition": "League", "year": 2026},\n'
    '      "confidence_in_extraction": 0.0-1.0\n'
    "    }\n"
    "  ]\n"
    "}\n"
    "If the article contains NO clear VAR-reviewable decision, return: {\"cases\": []}"
)


async def extract_cases_from_text(title: str, text: str) -> List[Dict]:
    """Call GPT-5.2 to extract structured VAR cases. Returns raw list (unfiltered)."""
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
    except ImportError:
        logger.error("emergentintegrations not installed — web-learning disabled")
        return []

    api_key = os.environ.get("EMERGENT_LLM_KEY")
    if not api_key:
        logger.warning("EMERGENT_LLM_KEY missing — skipping web extraction")
        return []

    session_id = f"octon-web-ingest-{uuid.uuid4().hex[:8]}"
    chat = LlmChat(api_key=api_key, session_id=session_id,
                   system_message=_EXTRACT_SYSTEM).with_model("openai", "gpt-5.2")

    prompt = (
        f"ARTICLE TITLE: {title}\n\n"
        f"ARTICLE BODY:\n{text}\n\n"
        "Extract every unambiguous VAR-reviewable decision. JSON only."
    )
    try:
        resp = await asyncio.wait_for(
            chat.send_message(UserMessage(text=prompt)),
            timeout=_LLM_TIMEOUT,
        )
    except asyncio.TimeoutError:
        logger.warning("LLM extraction timed out")
        return []
    except Exception as e:
        logger.error(f"LLM extraction error: {e}")
        return []

    # Parse the first JSON object the model returned
    m = re.search(r"\{.*\}", resp or "", re.DOTALL)
    if not m:
        return []
    try:
        data = json.loads(m.group())
    except json.JSONDecodeError:
        return []
    cases = data.get("cases", [])
    if not isinstance(cases, list):
        return []
    return cases


# ── Normalisation + persistence ──────────────────────────

def _sanitise_case(raw: Dict, source_url: str, source_title: str) -> Optional[Dict]:
    """Clamp and normalise an extracted case; return None if invalid."""
    itype = str(raw.get("incident_type", "")).lower().strip()
    if itype not in VALID_TYPES:
        return None
    title = str(raw.get("title") or "").strip()[:160]
    decision = str(raw.get("correct_decision") or "").strip()[:200]
    rationale = str(raw.get("rationale") or "").strip()[:1400]
    if not (title and decision and rationale):
        return None
    conf = float(raw.get("confidence_in_extraction") or 0)
    if conf < 0.75:
        return None
    kws = [str(k).strip()[:60] for k in (raw.get("keywords") or []) if str(k).strip()][:14]
    tags = [str(t).strip()[:40] for t in (raw.get("tags") or []) if str(t).strip()][:8]
    laws = [str(lr).strip()[:40] for lr in (raw.get("law_references") or []) if str(lr).strip()][:6]
    mctx = raw.get("match_context") or {}
    if not isinstance(mctx, dict):
        mctx = {}
    return {
        "title": title,
        "incident_type": itype,
        "correct_decision": decision,
        "rationale": rationale,
        "keywords": kws,
        "tags": list(set(tags + ["web-ingested"])),
        "match_context": {
            "teams": str(mctx.get("teams") or "")[:120] or None,
            "competition": str(mctx.get("competition") or "")[:80] or None,
            "year": mctx.get("year"),
        },
        "law_references": laws,
        "outcome": str(raw.get("outcome") or "")[:120] or None,
        "source_url": source_url,
        "source_title": source_title[:240],
        "source_ingested_at": datetime.now(timezone.utc).isoformat(),
        "source_confidence": round(conf, 2),
    }


async def ingest_url(db, url: str, user: Dict, auto_save: bool = True) -> Dict:
    """Full pipeline: fetch → extract → sanitise → (optionally) persist as training cases."""
    fetched = await fetch_article_text(url)
    raw_cases = await extract_cases_from_text(fetched["title"], fetched["text"])

    accepted: List[Dict] = []
    for rc in raw_cases:
        norm = _sanitise_case(rc, source_url=url, source_title=fetched["title"])
        if norm:
            accepted.append(norm)

    inserted: List[Dict] = []
    inserted_full: List[Dict] = []
    skipped_existing: int = 0
    if auto_save and accepted:
        now = datetime.now(timezone.utc).isoformat()
        for norm in accepted:
            # Idempotency on (source_url, title)
            existing = await db.training_cases.find_one(
                {"source_url": url, "title": norm["title"]},
                {"_id": 0},
            )
            if existing:
                skipped_existing += 1
                continue
            case = {
                "id": str(uuid.uuid4()),
                **norm,
                "visual_tags": [],
                "media_storage_path": None,
                "thumbnail_storage_path": None,
                "created_by": user.get("id"),
                "created_by_name": user.get("name"),
                "created_at": now,
                "updated_at": now,
            }
            await db.training_cases.insert_one(case.copy())
            inserted_full.append(case)
            inserted.append({"id": case["id"], "title": case["title"],
                             "incident_type": case["incident_type"],
                             "correct_decision": case["correct_decision"]})

    # Compute the confidence-lift report for operators (how these new
    # precedents would improve any pending incidents of the same type).
    lift_report = await compute_confidence_lift_report(db, inserted_full) if inserted_full else {
        "total_impacted": 0, "avg_uplift_pct": 0.0, "impacted_incidents": [],
    }

    # Also log the ingestion attempt for auditability
    await db.web_ingestion_log.insert_one({
        "id": str(uuid.uuid4()),
        "url": url,
        "title": fetched["title"],
        "extracted_count": len(raw_cases),
        "accepted_count": len(accepted),
        "inserted_count": len(inserted),
        "skipped_existing": skipped_existing,
        "impacted_pending_count": lift_report["total_impacted"],
        "user_id": user.get("id"),
        "user_name": user.get("name"),
        "ingested_at": fetched["fetched_at"],
    })

    return {
        "url": url,
        "article_title": fetched["title"],
        "extracted": len(raw_cases),
        "accepted": len(accepted),
        "inserted": len(inserted),
        "skipped_existing": skipped_existing,
        "cases": inserted if auto_save else accepted,
        "confidence_lift": lift_report,
    }


# ── Confidence Lift Report ──────────────────────────────
# When new precedents land, this routine estimates how much they would
# lift analysis confidence on pending incidents of the same type, so
# operators see tangible "learning gain" from every ingestion.

async def compute_confidence_lift_report(db, inserted_cases: List[Dict]) -> Dict:
    """For each newly-ingested case, find pending incidents of the same type
    that match by RAG similarity, and estimate projected confidence uplift."""
    if not inserted_cases:
        return {"total_impacted": 0, "avg_uplift_pct": 0.0, "impacted_incidents": []}

    try:
        from training import _similarity
    except Exception:
        return {"total_impacted": 0, "avg_uplift_pct": 0.0, "impacted_incidents": []}

    # Group by incident_type
    by_type: Dict[str, List[Dict]] = {}
    for c in inserted_cases:
        by_type.setdefault(c["incident_type"], []).append(c)

    impacted: List[Dict] = []
    for itype, new_cases in by_type.items():
        pending_cursor = db.incidents.find(
            {"incident_type": itype, "decision_status": "pending"},
            {"_id": 0, "id": 1, "description": 1, "ai_analysis": 1,
             "team_involved": 1, "player_involved": 1, "incident_type": 1,
             "timestamp_in_match": 1},
        ).sort("created_at", -1).limit(50)
        pending = await pending_cursor.to_list(50)

        for inc in pending:
            desc = (inc.get("description") or "").strip()
            if not desc:
                continue
            # Similarity vs each newly-inserted case
            sims: List[float] = []
            for nc in new_cases:
                case_text = " ".join([
                    nc.get("title") or "",
                    nc.get("rationale") or "",
                    " ".join(nc.get("keywords") or []),
                ])
                all_tags = list(set((nc.get("keywords") or []) + (nc.get("tags") or [])))
                s = _similarity(desc, [], case_text, all_tags)
                if s >= 0.12:
                    sims.append(s)
            if not sims:
                continue
            # Projected uplift — mirrors training.compute_confidence_uplift logic,
            # capped at the per-new-case delta (max +15 %)
            top_sim = max(sims)
            raw = top_sim * 40.0 + (len(sims) - 1) * 2.0
            projected = round(max(0.0, min(15.0, raw)), 1)
            current_conf = float(((inc.get("ai_analysis") or {})
                                  .get("final_confidence") or 0))
            impacted.append({
                "incident_id": inc.get("id"),
                "incident_type": itype,
                "team_involved": inc.get("team_involved"),
                "player_involved": inc.get("player_involved"),
                "timestamp_in_match": inc.get("timestamp_in_match"),
                "description_preview": desc[:120],
                "current_confidence": round(current_conf, 1),
                "projected_uplift": projected,
                "projected_confidence": round(min(99.0, current_conf + projected), 1),
                "matched_new_cases": len(sims),
                "top_similarity": round(top_sim, 3),
            })

    impacted.sort(key=lambda x: x["projected_uplift"], reverse=True)
    top = impacted[:10]
    avg = (round(sum(i["projected_uplift"] for i in impacted) / len(impacted), 1)
           if impacted else 0.0)
    return {
        "total_impacted": len(impacted),
        "avg_uplift_pct": avg,
        "impacted_incidents": top,
    }


# ── Ingestion log query ──────────────────────────────────

async def recent_ingestion_log(db, limit: int = 20) -> List[Dict]:
    docs = await db.web_ingestion_log.find({}, {"_id": 0}).sort("ingested_at", -1).to_list(limit)
    return docs
