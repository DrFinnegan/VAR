"""Demo data seeding endpoint (idempotent on referee email + match home/date)."""
import uuid
from datetime import datetime, timezone

from core import api_router, db


@api_router.post("/seed-demo")
async def seed_demo():
    demo_referees = [
        {"id": str(uuid.uuid4()), "name": "Michael Oliver", "role": "referee",
         "email": "m.oliver@octonvar.com", "total_decisions": 45, "correct_decisions": 42,
         "average_decision_time_seconds": 18.5,
         "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": str(uuid.uuid4()), "name": "Stuart Attwell", "role": "var_operator",
         "email": "s.attwell@octonvar.com", "total_decisions": 78, "correct_decisions": 71,
         "average_decision_time_seconds": 22.3,
         "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": str(uuid.uuid4()), "name": "Anthony Taylor", "role": "referee",
         "email": "a.taylor@octonvar.com", "total_decisions": 62, "correct_decisions": 58,
         "average_decision_time_seconds": 15.8,
         "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": str(uuid.uuid4()), "name": "Paul Tierney", "role": "var_operator",
         "email": "p.tierney@octonvar.com", "total_decisions": 34, "correct_decisions": 31,
         "average_decision_time_seconds": 25.1,
         "created_at": datetime.now(timezone.utc).isoformat()},
    ]
    for ref in demo_referees:
        if not await db.referees.find_one({"email": ref["email"]}):
            await db.referees.insert_one(ref)

    demo_matches = [
        {"id": str(uuid.uuid4()), "team_home": "Manchester United", "team_away": "Liverpool",
         "date": "2026-01-15", "competition": "Premier League", "stadium": "Old Trafford",
         "status": "completed", "incidents_count": 3,
         "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": str(uuid.uuid4()), "team_home": "Chelsea", "team_away": "Arsenal",
         "date": "2026-01-18", "competition": "Premier League", "stadium": "Stamford Bridge",
         "status": "live", "incidents_count": 1,
         "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": str(uuid.uuid4()), "team_home": "Manchester City", "team_away": "Tottenham",
         "date": "2026-01-20", "competition": "Premier League", "stadium": "Etihad Stadium",
         "status": "scheduled", "incidents_count": 0,
         "created_at": datetime.now(timezone.utc).isoformat()},
    ]
    for m in demo_matches:
        if not await db.matches.find_one({"team_home": m["team_home"], "date": m["date"]}):
            await db.matches.insert_one(m)

    demo_incidents = [
        {
            "id": str(uuid.uuid4()), "incident_type": "offside",
            "description": "Striker appears to be in offside position when receiving through ball behind last defender",
            "timestamp_in_match": "23:45", "team_involved": "Liverpool", "player_involved": "M. Salah",
            "decision_status": "confirmed", "final_decision": "Offside - Goal Disallowed",
            "has_image": False, "storage_path": None,
            "ai_analysis": {
                "hippocampus": {
                    "stage": "hippocampus", "initial_confidence": 82.3,
                    "initial_decision": "Goal Disallowed - Offside",
                    "matched_keywords": ["offside", "through ball", "last defender", "behind"],
                    "keyword_match_ratio": 0.5, "severity_weight": 0.85,
                    "historical_boost": 4.0, "processing_time_ms": 2,
                },
                "neo_cortex": {
                    "stage": "neo_cortex", "confidence_score": 94.5,
                    "suggested_decision": "Offside - Goal Disallowed",
                    "reasoning": "Player was 0.3m beyond the last defender when the ball was played",
                    "key_factors": ["Player position", "Defender line", "Ball trajectory"],
                    "risk_level": "low", "neo_cortex_notes": "Clear offside with minimal margin for error",
                    "processing_time_ms": 1250,
                },
                "final_confidence": 94.5, "suggested_decision": "Offside - Goal Disallowed",
                "reasoning": "Player was 0.3m beyond the last defender when the ball was played",
                "key_factors": ["Player position", "Defender line", "Ball trajectory"],
                "risk_level": "low", "similar_historical_cases": 156,
                "historical_accuracy": 91.2, "total_processing_time_ms": 1252,
                "pathway": "hippocampus -> neo_cortex",
                "engine_version": "OCTON v1.0 - Dr Finnegan",
            },
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        },
        {
            "id": str(uuid.uuid4()), "incident_type": "penalty",
            "description": "Possible handball in the penalty area during corner kick, arm in unnatural position",
            "timestamp_in_match": "67:12", "team_involved": "Manchester United", "player_involved": "R. Varane",
            "decision_status": "overturned", "final_decision": "No Penalty - Natural Position",
            "has_image": False, "storage_path": None,
            "ai_analysis": {
                "hippocampus": {
                    "stage": "hippocampus", "initial_confidence": 76.0,
                    "initial_decision": "Penalty Awarded",
                    "matched_keywords": ["penalty", "area", "handball"],
                    "keyword_match_ratio": 0.38, "severity_weight": 0.90,
                    "historical_boost": 3.6, "processing_time_ms": 1,
                },
                "neo_cortex": {
                    "stage": "neo_cortex", "confidence_score": 78.2,
                    "suggested_decision": "Penalty - Handball",
                    "reasoning": "Ball contact with arm detected but arm position debatable",
                    "key_factors": ["Arm position", "Ball distance", "Reaction time"],
                    "risk_level": "high",
                    "neo_cortex_notes": "Borderline case - arm was transitioning from natural to unnatural",
                    "processing_time_ms": 2100,
                },
                "final_confidence": 78.2, "suggested_decision": "Penalty - Handball",
                "reasoning": "Ball contact with arm detected but arm position debatable",
                "key_factors": ["Arm position", "Ball distance", "Reaction time"],
                "risk_level": "high", "similar_historical_cases": 89,
                "historical_accuracy": 76.4, "total_processing_time_ms": 2101,
                "pathway": "hippocampus -> neo_cortex",
                "engine_version": "OCTON v1.0 - Dr Finnegan",
            },
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        },
        {
            "id": str(uuid.uuid4()), "incident_type": "red_card",
            "description": "Late tackle from behind with studs up on attacking player, excessive force and dangerous play",
            "timestamp_in_match": "54:30", "team_involved": "Chelsea", "player_involved": "E. Fernandez",
            "decision_status": "confirmed", "final_decision": "Red Card - Serious Foul Play",
            "has_image": False, "storage_path": None,
            "ai_analysis": {
                "hippocampus": {
                    "stage": "hippocampus", "initial_confidence": 83.5,
                    "initial_decision": "Red Card - Serious Foul Play",
                    "matched_keywords": ["red card", "excessive force", "dangerous", "studs up"],
                    "keyword_match_ratio": 0.44, "severity_weight": 0.88,
                    "historical_boost": 2.0, "processing_time_ms": 1,
                },
                "neo_cortex": {
                    "stage": "neo_cortex", "confidence_score": 91.8,
                    "suggested_decision": "Red Card - Serious Foul Play",
                    "reasoning": "Tackle was reckless with excessive force endangering opponent safety",
                    "key_factors": ["Tackle intensity", "Point of contact", "Player safety"],
                    "risk_level": "critical",
                    "neo_cortex_notes": "Clear red card situation - studs up with excessive force",
                    "processing_time_ms": 980,
                },
                "final_confidence": 91.8, "suggested_decision": "Red Card - Serious Foul Play",
                "reasoning": "Tackle was reckless with excessive force endangering opponent safety",
                "key_factors": ["Tackle intensity", "Point of contact", "Player safety"],
                "risk_level": "critical", "similar_historical_cases": 43,
                "historical_accuracy": 88.4, "total_processing_time_ms": 981,
                "pathway": "hippocampus -> neo_cortex",
                "engine_version": "OCTON v1.0 - Dr Finnegan",
            },
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        },
        {
            "id": str(uuid.uuid4()), "incident_type": "foul",
            "description": "Challenge in midfield with potential for yellow card, deliberate foul to stop counter-attack",
            "timestamp_in_match": "31:15", "team_involved": "Arsenal", "player_involved": "D. Rice",
            "decision_status": "pending", "final_decision": None,
            "has_image": False, "storage_path": None,
            "ai_analysis": {
                "hippocampus": {
                    "stage": "hippocampus", "initial_confidence": 71.0,
                    "initial_decision": "Foul Confirmed",
                    "matched_keywords": ["foul", "challenge"],
                    "keyword_match_ratio": 0.22, "severity_weight": 0.70,
                    "historical_boost": 6.0, "processing_time_ms": 1,
                },
                "neo_cortex": {
                    "stage": "neo_cortex", "confidence_score": 65.3,
                    "suggested_decision": "Yellow Card - Tactical Foul",
                    "reasoning": "Deliberate foul to stop counter-attack, no excessive force",
                    "key_factors": ["Intent", "Impact", "Game situation"],
                    "risk_level": "medium",
                    "neo_cortex_notes": "Classic tactical foul scenario - yellow card appropriate",
                    "processing_time_ms": 750,
                },
                "final_confidence": 65.3, "suggested_decision": "Yellow Card - Tactical Foul",
                "reasoning": "Deliberate foul to stop counter-attack, no excessive force",
                "key_factors": ["Intent", "Impact", "Game situation"],
                "risk_level": "medium", "similar_historical_cases": 234,
                "historical_accuracy": 82.1, "total_processing_time_ms": 751,
                "pathway": "hippocampus -> neo_cortex",
                "engine_version": "OCTON v1.0 - Dr Finnegan",
            },
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        },
    ]
    for inc in demo_incidents:
        await db.incidents.insert_one(inc)

    # Guaranteed low-confidence pending incident so the Boost-Confidence
    # chip is always visible for the e2e suite (`boost.spec.js`). Keyed
    # off a stable marker so reseeds never create duplicates.
    BOOST_DEMO_MARKER = "OCTON-BOOST-DEMO"
    existing_boost = await db.incidents.find_one({"description": {"$regex": BOOST_DEMO_MARKER}})
    if not existing_boost:
        boost_demo = {
            "id": str(uuid.uuid4()),
            "incident_type": "handball",
            "description": f"{BOOST_DEMO_MARKER} — Attacker's arm brushes the ball at chest height on the edge of the box; camera angle partially obstructed by defender.",
            "timestamp_in_match": "78:04",
            "team_involved": "Manchester City",
            "player_involved": "E. Haaland",
            "decision_status": "pending",
            "final_decision": None,
            "has_image": False,
            "storage_path": None,
            "ai_analysis": {
                "hippocampus": {
                    "stage": "hippocampus", "initial_confidence": 58.0,
                    "initial_decision": "Handball — Undetermined",
                    "matched_keywords": ["handball", "arm", "ball"],
                    "keyword_match_ratio": 0.18, "severity_weight": 0.62,
                    "historical_boost": 2.0, "processing_time_ms": 2,
                },
                "neo_cortex": {
                    "stage": "neo_cortex", "confidence_score": 62.5,
                    "suggested_decision": "Penalty — Handball (marginal)",
                    "reasoning": "Arm-to-ball contact visible but arm position and intent unclear from primary angle; would benefit from tight replay and operator confirmation.",
                    "key_factors": ["Arm position", "Angle obstruction", "Ball trajectory"],
                    "risk_level": "high",
                    "neo_cortex_notes": "Borderline — operator Q&A recommended to push past 80% threshold.",
                    "processing_time_ms": 1420,
                },
                "final_confidence": 62.5,
                "suggested_decision": "Penalty — Handball (marginal)",
                "reasoning": "Arm-to-ball contact visible but arm position and intent unclear from primary angle; would benefit from tight replay and operator confirmation.",
                "key_factors": ["Arm position", "Angle obstruction", "Ball trajectory"],
                "risk_level": "high", "similar_historical_cases": 47,
                "historical_accuracy": 71.0, "total_processing_time_ms": 1422,
                "pathway": "hippocampus -> neo_cortex",
                "engine_version": "OCTON v2.3 - Dr Finnegan (seed)",
            },
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.incidents.insert_one(boost_demo)

    return {
        "message": "OCTON VAR demo data seeded - Dr Finnegan's system ready",
        "referees": len(demo_referees),
        "matches": len(demo_matches),
        "incidents": len(demo_incidents),
    }
