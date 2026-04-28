"""Analytics: overview, patterns, per-referee, learning-velocity time series."""
from datetime import datetime, timedelta, timezone
from typing import Dict

from fastapi import HTTPException

from core import api_router, db


@api_router.get("/analytics/overview")
async def analytics_overview():
    total_incidents = await db.incidents.count_documents({})
    total_matches = await db.matches.count_documents({})
    total_referees = await db.referees.count_documents({})

    type_pipeline = [{"$group": {"_id": "$incident_type", "count": {"$sum": 1}}}]
    type_results = await db.incidents.aggregate(type_pipeline).to_list(100)
    incidents_by_type = {r["_id"]: r["count"] for r in type_results}

    conf_pipeline = [
        {"$match": {"ai_analysis.final_confidence": {"$exists": True}}},
        {"$group": {"_id": None, "avg": {"$avg": "$ai_analysis.final_confidence"}}},
    ]
    conf_result = await db.incidents.aggregate(conf_pipeline).to_list(1)
    avg_confidence = conf_result[0]["avg"] if conf_result else 0.0

    if avg_confidence == 0:
        conf_pipeline2 = [
            {"$match": {"ai_analysis.confidence_score": {"$exists": True}}},
            {"$group": {"_id": None, "avg": {"$avg": "$ai_analysis.confidence_score"}}},
        ]
        conf_result2 = await db.incidents.aggregate(conf_pipeline2).to_list(1)
        if conf_result2:
            avg_confidence = conf_result2[0]["avg"]

    time_pipeline = [
        {"$match": {"average_decision_time_seconds": {"$gt": 0}}},
        {"$group": {"_id": None, "avg": {"$avg": "$average_decision_time_seconds"}}},
    ]
    time_result = await db.referees.aggregate(time_pipeline).to_list(1)
    avg_time = time_result[0]["avg"] if time_result else 0.0

    acc_pipeline = [
        {"$match": {"total_decisions": {"$gt": 0}}},
        {"$group": {
            "_id": None,
            "correct": {"$sum": "$correct_decisions"},
            "total": {"$sum": "$total_decisions"},
        }},
    ]
    acc_result = await db.referees.aggregate(acc_pipeline).to_list(1)
    accuracy = (
        (acc_result[0]["correct"] / acc_result[0]["total"] * 100)
        if acc_result and acc_result[0]["total"] > 0
        else 0.0
    )

    return {
        "total_incidents": total_incidents,
        "incidents_by_type": incidents_by_type,
        "average_confidence_score": round(avg_confidence, 2),
        "average_decision_time_seconds": round(avg_time, 2),
        "decision_accuracy_rate": round(accuracy, 2),
        "total_matches": total_matches,
        "total_referees": total_referees,
    }


@api_router.get("/analytics/patterns")
async def analytics_patterns():
    pipeline = [
        {"$match": {"decision_status": {"$ne": "pending"}}},
        {"$group": {
            "_id": {"type": "$incident_type", "decision": "$final_decision"},
            "count": {"$sum": 1},
        }},
        {"$sort": {"count": -1}},
    ]
    patterns = await db.incidents.aggregate(pipeline).to_list(100)

    decision_patterns: Dict = {}
    for p in patterns:
        t = p["_id"]["type"]
        decision_patterns.setdefault(t, []).append(
            {"decision": p["_id"]["decision"], "count": p["count"]}
        )

    total_decided = await db.incidents.count_documents({"decision_status": {"$ne": "pending"}})
    total_confirmed = await db.incidents.count_documents({"decision_status": "confirmed"})
    total_overturned = await db.incidents.count_documents({"decision_status": "overturned"})

    return {
        "patterns": patterns,
        "decision_patterns_by_type": decision_patterns,
        "total_analyzed": len(patterns),
        "learning_metrics": {
            "total_decided": total_decided,
            "confirmed": total_confirmed,
            "overturned": total_overturned,
            "learning_accuracy": round(
                (total_confirmed / total_decided * 100) if total_decided > 0 else 0, 2
            ),
        },
    }


@api_router.get("/analytics/referee/{referee_id}")
async def referee_analytics(referee_id: str):
    ref = await db.referees.find_one({"id": referee_id}, {"_id": 0})
    if not ref:
        raise HTTPException(status_code=404, detail="Referee not found")
    incidents = await db.incidents.find({"decided_by": referee_id}, {"_id": 0}).to_list(100)
    type_dist: Dict[str, int] = {}
    for inc in incidents:
        t = inc.get("incident_type", "other")
        type_dist[t] = type_dist.get(t, 0) + 1
    accuracy = (
        (ref["correct_decisions"] / ref["total_decisions"] * 100)
        if ref["total_decisions"] > 0
        else 0
    )
    return {
        "referee": ref,
        "incidents_decided": len(incidents),
        "type_distribution": type_dist,
        "accuracy_rate": round(accuracy, 2),
    }


@api_router.get("/analytics/learning-velocity")
async def learning_velocity(days: int = 30):
    """30-day time series of OCTON's self-improvement velocity."""
    days = max(7, min(90, int(days)))
    end = datetime.now(timezone.utc)
    start = end - timedelta(days=days - 1)
    start_iso = start.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()

    cases = await db.training_cases.find(
        {"created_at": {"$gte": start_iso}},
        {"_id": 0, "created_at": 1, "incident_type": 1, "source_url": 1, "tags": 1},
    ).to_list(2000)

    logs = await db.web_ingestion_log.find(
        {"ingested_at": {"$gte": start_iso}},
        {"_id": 0, "ingested_at": 1, "auto_rescored_count": 1},
    ).to_list(2000)

    rescored_incidents = await db.incidents.find(
        {"ai_analysis.auto_rescored.at": {"$gte": start_iso}},
        {"_id": 0, "ai_analysis": 1},
    ).to_list(2000)

    def day_key(iso: str) -> str:
        return (iso or "")[:10]

    series: Dict[str, Dict] = {}
    for i in range(days):
        d = (start + timedelta(days=i)).date().isoformat()
        series[d] = {"date": d, "precedents": 0, "web_precedents": 0,
                     "auto_rescores": 0, "daily_lift_pct": 0.0}

    for c in cases:
        k = day_key(c.get("created_at"))
        if k in series:
            series[k]["precedents"] += 1
            if c.get("source_url") or "web-ingested" in (c.get("tags") or []):
                series[k]["web_precedents"] += 1

    for log in logs:
        k = day_key(log.get("ingested_at"))
        if k in series:
            series[k]["auto_rescores"] += int(log.get("auto_rescored_count") or 0)

    for inc in rescored_incidents:
        ar = ((inc.get("ai_analysis") or {}).get("auto_rescored") or {})
        k = day_key(ar.get("at"))
        if k in series:
            d_val = float(ar.get("delta") or 0)
            if d_val > 0:
                series[k]["daily_lift_pct"] = round(series[k]["daily_lift_pct"] + d_val, 1)

    ordered = [series[d] for d in sorted(series.keys())]
    running = 0.0
    for row in ordered:
        running = round(running + row["daily_lift_pct"], 1)
        row["cumulative_lift_pct"] = running

    totals = {
        "precedents_total": sum(r["precedents"] for r in ordered),
        "web_precedents_total": sum(r["web_precedents"] for r in ordered),
        "auto_rescores_total": sum(r["auto_rescores"] for r in ordered),
        "cumulative_lift_pct": running,
        "days_in_window": days,
    }
    return {"series": ordered, "totals": totals}
