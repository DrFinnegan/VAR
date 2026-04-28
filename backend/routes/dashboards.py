"""Live multi-match dashboard + extended referee scorecard + team-level
CSV export."""
import csv
import io
from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException, Query
from starlette.responses import StreamingResponse

from core import api_router, db


# ── Live multi-match dashboard ────────────────────────────
@api_router.get("/matches/live")
async def matches_live(limit: int = Query(20, ge=1, le=100)):
    """Aggregate live + recently-active matches with their latest VAR verdict
    summary. Each tile carries: match meta, incident counts, last verdict, OFR
    pending flag, average confidence over the last 5 incidents."""
    matches = await db.matches.find(
        {"status": {"$in": ["live", "completed"]}},
        {"_id": 0},
    ).sort("created_at", -1).to_list(limit)

    out = []
    for m in matches:
        mid = m.get("id")
        # Pull last 8 incidents for this match
        incs = await db.incidents.find(
            {"match_id": mid},
            {"_id": 0},
        ).sort("created_at", -1).to_list(8)

        confidences = [i.get("ai_analysis", {}).get("final_confidence", 0) for i in incs[:5] if i.get("ai_analysis")]
        avg_conf = round(sum(confidences) / len(confidences), 1) if confidences else 0.0
        ofr_pending = any(i.get("ofr_pending") for i in incs)
        last = incs[0] if incs else None

        statuses = {"pending": 0, "confirmed": 0, "overturned": 0}
        for i in incs:
            s = i.get("decision_status", "pending")
            if s in statuses:
                statuses[s] += 1

        out.append({
            "match": m,
            "incidents_total": len(incs),
            "incidents_by_status": statuses,
            "avg_confidence_recent": avg_conf,
            "ofr_pending": ofr_pending,
            "last_incident": {
                "id": last.get("id"),
                "incident_type": last.get("incident_type"),
                "decision_status": last.get("decision_status"),
                "final_decision": last.get("final_decision"),
                "suggested_decision": last.get("ai_analysis", {}).get("suggested_decision"),
                "final_confidence": last.get("ai_analysis", {}).get("final_confidence"),
                "cited_clause": last.get("ai_analysis", {}).get("cited_clause"),
                "timestamp_in_match": last.get("timestamp_in_match"),
                "team_involved": last.get("team_involved"),
                "created_at": last.get("created_at"),
            } if last else None,
        })
    return {"matches": out, "live_count": sum(1 for m in matches if m.get("status") == "live")}


# ── Extended per-referee scorecard ────────────────────────
@api_router.get("/analytics/referee/{referee_id}/scorecard")
async def referee_scorecard(referee_id: str):
    """Comprehensive per-referee scorecard: AI agreement %, decision speed,
    type breakdown, recent activity timeline (last 10 incidents)."""
    ref = await db.referees.find_one({"id": referee_id}, {"_id": 0})
    if not ref:
        raise HTTPException(status_code=404, detail="Referee not found")

    # All incidents this referee decided
    incs = await db.incidents.find(
        {"decided_by": referee_id, "decision_status": {"$ne": "pending"}},
        {"_id": 0},
    ).sort("updated_at", -1).to_list(500)

    total = len(incs)
    confirmed = sum(1 for i in incs if i.get("decision_status") == "confirmed")
    overturned = sum(1 for i in incs if i.get("decision_status") == "overturned")
    ai_agreement_pct = round((confirmed / total * 100), 1) if total else 0.0

    # Per incident-type breakdown
    type_breakdown = {}
    for i in incs:
        t = i.get("incident_type", "other")
        bucket = type_breakdown.setdefault(t, {"total": 0, "confirmed": 0, "overturned": 0})
        bucket["total"] += 1
        st = i.get("decision_status")
        if st in bucket:
            bucket[st] += 1
    for t, b in type_breakdown.items():
        b["agreement_pct"] = round((b["confirmed"] / b["total"] * 100), 1) if b["total"] else 0.0

    # Average AI confidence on this referee's decisions (proxy for case difficulty)
    confs = [i.get("ai_analysis", {}).get("final_confidence", 0) for i in incs if i.get("ai_analysis")]
    avg_ai_confidence = round(sum(confs) / len(confs), 1) if confs else 0.0

    # Recent activity (last 10)
    recent = [{
        "id": i.get("id"),
        "incident_type": i.get("incident_type"),
        "decision_status": i.get("decision_status"),
        "final_decision": i.get("final_decision"),
        "ai_suggestion": i.get("ai_analysis", {}).get("suggested_decision"),
        "ai_confidence": i.get("ai_analysis", {}).get("final_confidence"),
        "cited_clause": i.get("ai_analysis", {}).get("cited_clause"),
        "team_involved": i.get("team_involved"),
        "match_id": i.get("match_id"),
        "decided_at": i.get("updated_at"),
    } for i in incs[:10]]

    return {
        "referee": ref,
        "summary": {
            "total_decisions": total,
            "confirmed": confirmed,
            "overturned": overturned,
            "ai_agreement_pct": ai_agreement_pct,
            "avg_ai_confidence": avg_ai_confidence,
            "avg_decision_time_seconds": ref.get("average_decision_time_seconds", 0),
        },
        "by_incident_type": [
            {"incident_type": t, **b} for t, b in sorted(type_breakdown.items(), key=lambda kv: -kv[1]["total"])
        ],
        "recent_activity": recent,
    }


# ── Per-referee historical comparison vs league average ──
@api_router.get("/analytics/referee/{referee_id}/comparison")
async def referee_comparison(referee_id: str, days: int = Query(30, ge=7, le=180)):
    """Day-by-day AI-agreement % time series for ONE referee vs the LEAGUE
    AVERAGE over the same window. Powers the comparison line chart on the
    scorecard."""
    from datetime import timedelta
    ref = await db.referees.find_one({"id": referee_id}, {"_id": 0})
    if not ref:
        raise HTTPException(status_code=404, detail="Referee not found")
    end = datetime.now(timezone.utc)
    start = end - timedelta(days=days - 1)
    start_iso = start.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()

    # Pull ALL decided incidents in window in one shot (cheaper than 2x query)
    all_incs = await db.incidents.find(
        {"updated_at": {"$gte": start_iso}, "decision_status": {"$in": ["confirmed", "overturned"]}},
        {"_id": 0, "decided_by": 1, "decision_status": 1, "updated_at": 1},
    ).to_list(5000)

    def day_key(iso):
        return (iso or "")[:10]

    series = {}
    for i in range(days):
        d = (start + timedelta(days=i)).date().isoformat()
        series[d] = {
            "date": d,
            "referee_decisions": 0, "referee_confirmed": 0,
            "league_decisions": 0, "league_confirmed": 0,
        }

    for inc in all_incs:
        k = day_key(inc.get("updated_at"))
        if k not in series:
            continue
        st = inc.get("decision_status")
        bucket = series[k]
        bucket["league_decisions"] += 1
        if st == "confirmed":
            bucket["league_confirmed"] += 1
        if inc.get("decided_by") == referee_id:
            bucket["referee_decisions"] += 1
            if st == "confirmed":
                bucket["referee_confirmed"] += 1

    ordered = []
    for d in sorted(series.keys()):
        b = series[d]
        ordered.append({
            "date": d,
            "referee_agreement_pct": round((b["referee_confirmed"] / b["referee_decisions"] * 100), 1) if b["referee_decisions"] else None,
            "league_agreement_pct": round((b["league_confirmed"] / b["league_decisions"] * 100), 1) if b["league_decisions"] else None,
            "referee_decisions": b["referee_decisions"],
            "league_decisions": b["league_decisions"],
        })

    # Headline numbers for the chart caption
    ref_total = sum(d["referee_decisions"] for d in ordered)
    ref_conf = sum(series[d["date"]]["referee_confirmed"] for d in ordered)
    league_total = sum(d["league_decisions"] for d in ordered)
    league_conf = sum(series[d["date"]]["league_confirmed"] for d in ordered)
    return {
        "referee_id": referee_id,
        "referee_name": ref.get("name"),
        "days": days,
        "series": ordered,
        "totals": {
            "referee_decisions": ref_total,
            "referee_agreement_pct": round((ref_conf / ref_total * 100), 1) if ref_total else 0.0,
            "league_decisions": league_total,
            "league_agreement_pct": round((league_conf / league_total * 100), 1) if league_total else 0.0,
        },
    }


# ── Team-level decision history CSV export ────────────────
@api_router.get("/exports/team-incidents.csv")
async def export_team_incidents_csv(
    team: str = Query(..., min_length=1, description="Team name (case-insensitive substring match)"),
    start: Optional[str] = Query(None, description="ISO date YYYY-MM-DD inclusive"),
    end: Optional[str] = Query(None, description="ISO date YYYY-MM-DD exclusive"),
):
    """Stream a CSV of every VAR-reviewable incident involving the given team,
    optionally bounded by date. Useful for end-of-season disciplinary review."""
    query = {"team_involved": {"$regex": team, "$options": "i"}}
    date_cond = {}
    if start:
        date_cond["$gte"] = start
    if end:
        date_cond["$lt"] = end
    if date_cond:
        query["created_at"] = date_cond

    incidents = await db.incidents.find(query, {"_id": 0}).sort("created_at", 1).to_list(2000)

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow([
        "incident_id", "created_at", "match_id", "incident_type",
        "team_involved", "player_involved", "timestamp_in_match",
        "ai_suggestion", "ai_confidence", "ifab_clause",
        "decision_status", "final_decision", "decided_by",
        "ofr_pending", "auto_rescored", "description",
    ])
    for i in incidents:
        ana = i.get("ai_analysis") or {}
        ar = ana.get("auto_rescored") or {}
        writer.writerow([
            i.get("id", ""),
            i.get("created_at", ""),
            i.get("match_id", "") or "",
            i.get("incident_type", ""),
            i.get("team_involved", "") or "",
            i.get("player_involved", "") or "",
            i.get("timestamp_in_match", "") or "",
            (ana.get("suggested_decision") or "")[:200],
            ana.get("final_confidence", ""),
            (ana.get("cited_clause") or "")[:200],
            i.get("decision_status", ""),
            (i.get("final_decision") or "")[:200],
            i.get("decided_by", "") or "",
            "yes" if i.get("ofr_pending") else "",
            ar.get("at", "") if ar else "",
            (i.get("description") or "")[:500].replace("\n", " "),
        ])

    buf.seek(0)
    filename = f"octon-{team.lower().replace(' ', '_')}"
    if start:
        filename += f"-{start}"
    if end:
        filename += f"-to-{end}"
    filename += f"-{datetime.now(timezone.utc).date().isoformat()}.csv"

    return StreamingResponse(
        io.BytesIO(buf.getvalue().encode("utf-8")),
        media_type="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "X-OCTON-Total-Rows": str(len(incidents)),
        },
    )
