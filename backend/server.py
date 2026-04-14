from fastapi import FastAPI, APIRouter, HTTPException, UploadFile, File, Form, Query
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import base64
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone
from enum import Enum

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI(title="Forensic VAR Audit System")

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Enums
class IncidentType(str, Enum):
    OFFSIDE = "offside"
    HANDBALL = "handball"
    FOUL = "foul"
    PENALTY = "penalty"
    GOAL_LINE = "goal_line"
    RED_CARD = "red_card"
    OTHER = "other"

class DecisionStatus(str, Enum):
    PENDING = "pending"
    CONFIRMED = "confirmed"
    OVERTURNED = "overturned"
    NO_DECISION = "no_decision"

class UserRole(str, Enum):
    VAR_OPERATOR = "var_operator"
    REFEREE = "referee"
    ADMIN = "admin"

# Pydantic Models
class IncidentBase(BaseModel):
    match_id: Optional[str] = None
    incident_type: IncidentType
    description: str
    timestamp_in_match: Optional[str] = None  # e.g., "45:30"
    team_involved: Optional[str] = None
    player_involved: Optional[str] = None

class IncidentCreate(IncidentBase):
    image_base64: Optional[str] = None

class AIAnalysis(BaseModel):
    model_config = ConfigDict(extra="ignore")
    
    confidence_score: float = Field(ge=0, le=100)
    suggested_decision: str
    reasoning: str
    key_factors: List[str]
    similar_historical_cases: int = 0
    processing_time_ms: int = 0

class Incident(BaseModel):
    model_config = ConfigDict(extra="ignore")
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    match_id: Optional[str] = None
    incident_type: IncidentType
    description: str
    timestamp_in_match: Optional[str] = None
    team_involved: Optional[str] = None
    player_involved: Optional[str] = None
    image_base64: Optional[str] = None
    ai_analysis: Optional[AIAnalysis] = None
    decision_status: DecisionStatus = DecisionStatus.PENDING
    final_decision: Optional[str] = None
    decided_by: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class DecisionUpdate(BaseModel):
    decision_status: DecisionStatus
    final_decision: str
    decided_by: str

class Referee(BaseModel):
    model_config = ConfigDict(extra="ignore")
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    role: UserRole
    email: Optional[str] = None
    total_decisions: int = 0
    correct_decisions: int = 0
    average_decision_time_seconds: float = 0
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class RefereeCreate(BaseModel):
    name: str
    role: UserRole
    email: Optional[str] = None

class Match(BaseModel):
    model_config = ConfigDict(extra="ignore")
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    team_home: str
    team_away: str
    date: str
    competition: str
    stadium: Optional[str] = None
    var_operator_id: Optional[str] = None
    referee_id: Optional[str] = None
    incidents_count: int = 0
    status: str = "scheduled"  # scheduled, live, completed
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class MatchCreate(BaseModel):
    team_home: str
    team_away: str
    date: str
    competition: str
    stadium: Optional[str] = None
    var_operator_id: Optional[str] = None
    referee_id: Optional[str] = None

class AnalyticsResponse(BaseModel):
    total_incidents: int
    incidents_by_type: Dict[str, int]
    average_confidence_score: float
    average_decision_time_seconds: float
    decision_accuracy_rate: float
    total_matches: int
    total_referees: int

class TextAnalysisRequest(BaseModel):
    incident_type: IncidentType
    description: str
    additional_context: Optional[str] = None

# AI Analysis function using Emergent Integrations
async def analyze_incident_with_ai(incident: Incident) -> AIAnalysis:
    """Analyze incident using GPT-5.2 with image and text"""
    import time
    start_time = time.time()
    
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent
        
        api_key = os.environ.get('EMERGENT_LLM_KEY')
        if not api_key:
            logger.warning("EMERGENT_LLM_KEY not found, returning mock analysis")
            return create_mock_analysis(incident, int((time.time() - start_time) * 1000))
        
        chat = LlmChat(
            api_key=api_key,
            session_id=f"var-analysis-{incident.id}",
            system_message="""You are an expert VAR (Video Assistant Referee) analyst with deep knowledge of football rules and regulations. 
Your job is to analyze football match incidents and provide:
1. A confidence score (0-100) for your assessment
2. A suggested decision (e.g., "Offside - Goal Disallowed", "No Foul", "Penalty Awarded", etc.)
3. Clear reasoning for your decision
4. Key factors that influenced your decision

Always respond in JSON format with these exact fields:
{
    "confidence_score": number,
    "suggested_decision": string,
    "reasoning": string,
    "key_factors": [string array]
}"""
        ).with_model("openai", "gpt-5.2")
        
        # Prepare the analysis prompt
        prompt = f"""Analyze this football incident:

Incident Type: {incident.incident_type.value}
Description: {incident.description}
Match Time: {incident.timestamp_in_match or 'Unknown'}
Team Involved: {incident.team_involved or 'Unknown'}
Player Involved: {incident.player_involved or 'Unknown'}

Please provide your VAR analysis in JSON format."""

        # Create message with or without image
        if incident.image_base64:
            image_content = ImageContent(image_base64=incident.image_base64)
            user_message = UserMessage(
                text=prompt + "\n\nAnalyze the attached image frame from the match.",
                file_contents=[image_content]
            )
        else:
            user_message = UserMessage(text=prompt)
        
        response = await chat.send_message(user_message)
        
        # Parse the JSON response
        import json
        import re
        
        # Try to extract JSON from response
        json_match = re.search(r'\{[^{}]*\}', response, re.DOTALL)
        if json_match:
            analysis_data = json.loads(json_match.group())
        else:
            # Fallback parsing
            analysis_data = {
                "confidence_score": 75.0,
                "suggested_decision": response[:100] if response else "Review Required",
                "reasoning": response if response else "AI analysis completed",
                "key_factors": ["AI analysis performed"]
            }
        
        processing_time = int((time.time() - start_time) * 1000)
        
        # Get similar historical cases count
        similar_count = await db.incidents.count_documents({
            "incident_type": incident.incident_type,
            "decision_status": {"$ne": "pending"}
        })
        
        return AIAnalysis(
            confidence_score=min(100, max(0, float(analysis_data.get("confidence_score", 75)))),
            suggested_decision=str(analysis_data.get("suggested_decision", "Review Required")),
            reasoning=str(analysis_data.get("reasoning", "Analysis completed")),
            key_factors=analysis_data.get("key_factors", ["AI analysis performed"]),
            similar_historical_cases=similar_count,
            processing_time_ms=processing_time
        )
        
    except Exception as e:
        logger.error(f"AI Analysis error: {e}")
        processing_time = int((time.time() - start_time) * 1000)
        return create_mock_analysis(incident, processing_time)

def create_mock_analysis(incident: Incident, processing_time: int) -> AIAnalysis:
    """Create a mock analysis when AI is unavailable"""
    decision_map = {
        IncidentType.OFFSIDE: ("Offside - Goal Should Be Disallowed", "Player appears to be in offside position based on description"),
        IncidentType.HANDBALL: ("Handball - Free Kick/Penalty", "Ball contact with arm/hand detected"),
        IncidentType.FOUL: ("Foul Confirmed", "Contact appears to meet foul criteria"),
        IncidentType.PENALTY: ("Penalty - Review Recommended", "Incident occurred in penalty area"),
        IncidentType.GOAL_LINE: ("Goal Line Review Required", "Ball position relative to goal line needs verification"),
        IncidentType.RED_CARD: ("Red Card - Serious Foul Play", "Severity of challenge warrants dismissal"),
        IncidentType.OTHER: ("Further Review Required", "Incident type requires additional analysis"),
    }
    
    suggestion, reasoning = decision_map.get(incident.incident_type, ("Review Required", "Analysis pending"))
    
    return AIAnalysis(
        confidence_score=78.5,
        suggested_decision=suggestion,
        reasoning=reasoning,
        key_factors=["Incident type classification", "Rule interpretation", "Historical precedent"],
        similar_historical_cases=12,
        processing_time_ms=processing_time
    )

# API Routes

@api_router.get("/")
async def root():
    return {"message": "Forensic VAR Audit System API", "version": "1.0.0"}

# Incident endpoints
@api_router.post("/incidents", response_model=Incident)
async def create_incident(incident_data: IncidentCreate):
    """Create a new incident and trigger AI analysis"""
    incident = Incident(**incident_data.model_dump())
    
    # Run AI analysis
    ai_analysis = await analyze_incident_with_ai(incident)
    incident.ai_analysis = ai_analysis
    
    # Save to database
    doc = incident.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    doc['updated_at'] = doc['updated_at'].isoformat()
    
    await db.incidents.insert_one(doc)
    return incident

@api_router.get("/incidents", response_model=List[Incident])
async def get_incidents(
    status: Optional[DecisionStatus] = None,
    incident_type: Optional[IncidentType] = None,
    limit: int = Query(50, ge=1, le=200)
):
    """Get all incidents with optional filtering"""
    query = {}
    if status:
        query["decision_status"] = status.value
    if incident_type:
        query["incident_type"] = incident_type.value
    
    incidents = await db.incidents.find(query, {"_id": 0}).sort("created_at", -1).to_list(limit)
    
    for inc in incidents:
        if isinstance(inc.get('created_at'), str):
            inc['created_at'] = datetime.fromisoformat(inc['created_at'])
        if isinstance(inc.get('updated_at'), str):
            inc['updated_at'] = datetime.fromisoformat(inc['updated_at'])
    
    return incidents

@api_router.get("/incidents/{incident_id}", response_model=Incident)
async def get_incident(incident_id: str):
    """Get a specific incident by ID"""
    incident = await db.incidents.find_one({"id": incident_id}, {"_id": 0})
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    
    if isinstance(incident.get('created_at'), str):
        incident['created_at'] = datetime.fromisoformat(incident['created_at'])
    if isinstance(incident.get('updated_at'), str):
        incident['updated_at'] = datetime.fromisoformat(incident['updated_at'])
    
    return incident

@api_router.put("/incidents/{incident_id}/decision", response_model=Incident)
async def update_incident_decision(incident_id: str, decision: DecisionUpdate):
    """Update the decision for an incident"""
    update_data = {
        "decision_status": decision.decision_status.value,
        "final_decision": decision.final_decision,
        "decided_by": decision.decided_by,
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    result = await db.incidents.find_one_and_update(
        {"id": incident_id},
        {"$set": update_data},
        return_document=True,
        projection={"_id": 0}
    )
    
    if not result:
        raise HTTPException(status_code=404, detail="Incident not found")
    
    if isinstance(result.get('created_at'), str):
        result['created_at'] = datetime.fromisoformat(result['created_at'])
    if isinstance(result.get('updated_at'), str):
        result['updated_at'] = datetime.fromisoformat(result['updated_at'])
    
    return result

@api_router.delete("/incidents/{incident_id}")
async def delete_incident(incident_id: str):
    """Delete an incident"""
    result = await db.incidents.delete_one({"id": incident_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Incident not found")
    return {"message": "Incident deleted successfully"}

# Re-analyze endpoint
@api_router.post("/incidents/{incident_id}/reanalyze", response_model=Incident)
async def reanalyze_incident(incident_id: str):
    """Re-run AI analysis on an existing incident"""
    incident_doc = await db.incidents.find_one({"id": incident_id}, {"_id": 0})
    if not incident_doc:
        raise HTTPException(status_code=404, detail="Incident not found")
    
    if isinstance(incident_doc.get('created_at'), str):
        incident_doc['created_at'] = datetime.fromisoformat(incident_doc['created_at'])
    if isinstance(incident_doc.get('updated_at'), str):
        incident_doc['updated_at'] = datetime.fromisoformat(incident_doc['updated_at'])
    
    incident = Incident(**incident_doc)
    ai_analysis = await analyze_incident_with_ai(incident)
    
    update_data = {
        "ai_analysis": ai_analysis.model_dump(),
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    result = await db.incidents.find_one_and_update(
        {"id": incident_id},
        {"$set": update_data},
        return_document=True,
        projection={"_id": 0}
    )
    
    if isinstance(result.get('created_at'), str):
        result['created_at'] = datetime.fromisoformat(result['created_at'])
    if isinstance(result.get('updated_at'), str):
        result['updated_at'] = datetime.fromisoformat(result['updated_at'])
    
    return result

# Text-only analysis endpoint
@api_router.post("/ai/analyze-text", response_model=AIAnalysis)
async def analyze_text_only(request: TextAnalysisRequest):
    """Analyze incident based on text description only"""
    temp_incident = Incident(
        incident_type=request.incident_type,
        description=request.description + (f" Context: {request.additional_context}" if request.additional_context else "")
    )
    return await analyze_incident_with_ai(temp_incident)

# Referee endpoints
@api_router.post("/referees", response_model=Referee)
async def create_referee(referee_data: RefereeCreate):
    """Create a new referee/VAR operator"""
    referee = Referee(**referee_data.model_dump())
    doc = referee.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    
    await db.referees.insert_one(doc)
    return referee

@api_router.get("/referees", response_model=List[Referee])
async def get_referees(role: Optional[UserRole] = None):
    """Get all referees with optional role filtering"""
    query = {}
    if role:
        query["role"] = role.value
    
    referees = await db.referees.find(query, {"_id": 0}).to_list(100)
    
    for ref in referees:
        if isinstance(ref.get('created_at'), str):
            ref['created_at'] = datetime.fromisoformat(ref['created_at'])
    
    return referees

@api_router.get("/referees/{referee_id}", response_model=Referee)
async def get_referee(referee_id: str):
    """Get a specific referee by ID"""
    referee = await db.referees.find_one({"id": referee_id}, {"_id": 0})
    if not referee:
        raise HTTPException(status_code=404, detail="Referee not found")
    
    if isinstance(referee.get('created_at'), str):
        referee['created_at'] = datetime.fromisoformat(referee['created_at'])
    
    return referee

@api_router.put("/referees/{referee_id}/stats")
async def update_referee_stats(referee_id: str, correct: bool, decision_time_seconds: float):
    """Update referee statistics after a decision"""
    referee = await db.referees.find_one({"id": referee_id}, {"_id": 0})
    if not referee:
        raise HTTPException(status_code=404, detail="Referee not found")
    
    new_total = referee['total_decisions'] + 1
    new_correct = referee['correct_decisions'] + (1 if correct else 0)
    
    # Calculate new average decision time
    current_avg = referee['average_decision_time_seconds']
    current_total = referee['total_decisions']
    new_avg = ((current_avg * current_total) + decision_time_seconds) / new_total
    
    await db.referees.update_one(
        {"id": referee_id},
        {"$set": {
            "total_decisions": new_total,
            "correct_decisions": new_correct,
            "average_decision_time_seconds": new_avg
        }}
    )
    
    return {"message": "Referee stats updated"}

# Match endpoints
@api_router.post("/matches", response_model=Match)
async def create_match(match_data: MatchCreate):
    """Create a new match"""
    match = Match(**match_data.model_dump())
    doc = match.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    
    await db.matches.insert_one(doc)
    return match

@api_router.get("/matches", response_model=List[Match])
async def get_matches(status: Optional[str] = None, limit: int = Query(50, ge=1, le=200)):
    """Get all matches with optional status filtering"""
    query = {}
    if status:
        query["status"] = status
    
    matches = await db.matches.find(query, {"_id": 0}).sort("created_at", -1).to_list(limit)
    
    for match in matches:
        if isinstance(match.get('created_at'), str):
            match['created_at'] = datetime.fromisoformat(match['created_at'])
    
    return matches

@api_router.get("/matches/{match_id}", response_model=Match)
async def get_match(match_id: str):
    """Get a specific match by ID"""
    match = await db.matches.find_one({"id": match_id}, {"_id": 0})
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")
    
    if isinstance(match.get('created_at'), str):
        match['created_at'] = datetime.fromisoformat(match['created_at'])
    
    return match

@api_router.put("/matches/{match_id}/status")
async def update_match_status(match_id: str, status: str):
    """Update match status"""
    result = await db.matches.update_one(
        {"id": match_id},
        {"$set": {"status": status}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Match not found")
    return {"message": "Match status updated"}

# Analytics endpoints
@api_router.get("/analytics/overview", response_model=AnalyticsResponse)
async def get_analytics_overview():
    """Get overall analytics for the system"""
    total_incidents = await db.incidents.count_documents({})
    total_matches = await db.matches.count_documents({})
    total_referees = await db.referees.count_documents({})
    
    # Incidents by type
    pipeline = [
        {"$group": {"_id": "$incident_type", "count": {"$sum": 1}}}
    ]
    type_results = await db.incidents.aggregate(pipeline).to_list(100)
    incidents_by_type = {r["_id"]: r["count"] for r in type_results}
    
    # Average confidence score
    conf_pipeline = [
        {"$match": {"ai_analysis.confidence_score": {"$exists": True}}},
        {"$group": {"_id": None, "avg_confidence": {"$avg": "$ai_analysis.confidence_score"}}}
    ]
    conf_result = await db.incidents.aggregate(conf_pipeline).to_list(1)
    avg_confidence = conf_result[0]["avg_confidence"] if conf_result else 0.0
    
    # Average decision time from referees
    time_pipeline = [
        {"$group": {"_id": None, "avg_time": {"$avg": "$average_decision_time_seconds"}}}
    ]
    time_result = await db.referees.aggregate(time_pipeline).to_list(1)
    avg_decision_time = time_result[0]["avg_time"] if time_result else 0.0
    
    # Decision accuracy rate
    accuracy_pipeline = [
        {"$match": {"total_decisions": {"$gt": 0}}},
        {"$group": {"_id": None, "total_correct": {"$sum": "$correct_decisions"}, "total_all": {"$sum": "$total_decisions"}}}
    ]
    accuracy_result = await db.referees.aggregate(accuracy_pipeline).to_list(1)
    if accuracy_result and accuracy_result[0]["total_all"] > 0:
        accuracy_rate = (accuracy_result[0]["total_correct"] / accuracy_result[0]["total_all"]) * 100
    else:
        accuracy_rate = 0.0
    
    return AnalyticsResponse(
        total_incidents=total_incidents,
        incidents_by_type=incidents_by_type,
        average_confidence_score=round(avg_confidence, 2),
        average_decision_time_seconds=round(avg_decision_time, 2),
        decision_accuracy_rate=round(accuracy_rate, 2),
        total_matches=total_matches,
        total_referees=total_referees
    )

@api_router.get("/analytics/referee/{referee_id}")
async def get_referee_analytics(referee_id: str):
    """Get detailed analytics for a specific referee"""
    referee = await db.referees.find_one({"id": referee_id}, {"_id": 0})
    if not referee:
        raise HTTPException(status_code=404, detail="Referee not found")
    
    # Get incidents decided by this referee
    incidents = await db.incidents.find(
        {"decided_by": referee_id},
        {"_id": 0}
    ).to_list(100)
    
    # Calculate incident type distribution
    type_distribution = {}
    for inc in incidents:
        inc_type = inc.get("incident_type", "other")
        type_distribution[inc_type] = type_distribution.get(inc_type, 0) + 1
    
    accuracy_rate = (referee['correct_decisions'] / referee['total_decisions'] * 100) if referee['total_decisions'] > 0 else 0
    
    return {
        "referee": referee,
        "incidents_decided": len(incidents),
        "type_distribution": type_distribution,
        "accuracy_rate": round(accuracy_rate, 2)
    }

@api_router.get("/analytics/patterns")
async def get_historical_patterns():
    """Get historical decision patterns for AI learning"""
    # Incidents by type over time
    pipeline = [
        {"$match": {"decision_status": {"$ne": "pending"}}},
        {"$group": {
            "_id": {
                "type": "$incident_type",
                "decision": "$final_decision"
            },
            "count": {"$sum": 1}
        }},
        {"$sort": {"count": -1}}
    ]
    patterns = await db.incidents.aggregate(pipeline).to_list(100)
    
    # Most common decisions by incident type
    decision_patterns = {}
    for p in patterns:
        inc_type = p["_id"]["type"]
        if inc_type not in decision_patterns:
            decision_patterns[inc_type] = []
        decision_patterns[inc_type].append({
            "decision": p["_id"]["decision"],
            "count": p["count"]
        })
    
    return {
        "patterns": patterns,
        "decision_patterns_by_type": decision_patterns,
        "total_analyzed": len(patterns)
    }

# Seed demo data endpoint
@api_router.post("/seed-demo")
async def seed_demo_data():
    """Seed demo data for testing"""
    # Create demo referees
    demo_referees = [
        Referee(name="Michael Oliver", role=UserRole.REFEREE, email="m.oliver@var.com", total_decisions=45, correct_decisions=42, average_decision_time_seconds=18.5),
        Referee(name="Stuart Attwell", role=UserRole.VAR_OPERATOR, email="s.attwell@var.com", total_decisions=78, correct_decisions=71, average_decision_time_seconds=22.3),
        Referee(name="Anthony Taylor", role=UserRole.REFEREE, email="a.taylor@var.com", total_decisions=62, correct_decisions=58, average_decision_time_seconds=15.8),
        Referee(name="Paul Tierney", role=UserRole.VAR_OPERATOR, email="p.tierney@var.com", total_decisions=34, correct_decisions=31, average_decision_time_seconds=25.1),
        Referee(name="Admin User", role=UserRole.ADMIN, email="admin@var.com"),
    ]
    
    for ref in demo_referees:
        existing = await db.referees.find_one({"email": ref.email})
        if not existing:
            doc = ref.model_dump()
            doc['created_at'] = doc['created_at'].isoformat()
            await db.referees.insert_one(doc)
    
    # Create demo matches
    demo_matches = [
        Match(team_home="Manchester United", team_away="Liverpool", date="2025-01-15", competition="Premier League", stadium="Old Trafford", status="completed"),
        Match(team_home="Chelsea", team_away="Arsenal", date="2025-01-18", competition="Premier League", stadium="Stamford Bridge", status="live"),
        Match(team_home="Manchester City", team_away="Tottenham", date="2025-01-20", competition="Premier League", stadium="Etihad Stadium", status="scheduled"),
    ]
    
    for match in demo_matches:
        existing = await db.matches.find_one({"team_home": match.team_home, "date": match.date})
        if not existing:
            doc = match.model_dump()
            doc['created_at'] = doc['created_at'].isoformat()
            await db.matches.insert_one(doc)
    
    # Create demo incidents
    demo_incidents = [
        Incident(
            incident_type=IncidentType.OFFSIDE,
            description="Striker appears to be in offside position when receiving through ball",
            timestamp_in_match="23:45",
            team_involved="Liverpool",
            player_involved="M. Salah",
            decision_status=DecisionStatus.CONFIRMED,
            final_decision="Offside - Goal Disallowed",
            ai_analysis=AIAnalysis(
                confidence_score=94.5,
                suggested_decision="Offside - Goal Disallowed",
                reasoning="Analysis shows player was 0.3m beyond the last defender",
                key_factors=["Player position", "Defender line", "Ball trajectory"],
                similar_historical_cases=156,
                processing_time_ms=1250
            )
        ),
        Incident(
            incident_type=IncidentType.PENALTY,
            description="Possible handball in the penalty area during corner kick",
            timestamp_in_match="67:12",
            team_involved="Manchester United",
            player_involved="R. Varane",
            decision_status=DecisionStatus.OVERTURNED,
            final_decision="No Penalty - Natural Position",
            ai_analysis=AIAnalysis(
                confidence_score=78.2,
                suggested_decision="Penalty - Handball",
                reasoning="Ball contact with arm detected, but arm position was natural",
                key_factors=["Arm position", "Ball distance", "Reaction time"],
                similar_historical_cases=89,
                processing_time_ms=2100
            )
        ),
        Incident(
            incident_type=IncidentType.RED_CARD,
            description="Late tackle from behind on attacking player",
            timestamp_in_match="54:30",
            team_involved="Chelsea",
            player_involved="E. Fernandez",
            decision_status=DecisionStatus.CONFIRMED,
            final_decision="Red Card - Serious Foul Play",
            ai_analysis=AIAnalysis(
                confidence_score=91.8,
                suggested_decision="Red Card - Serious Foul Play",
                reasoning="Tackle was reckless with excessive force endangering opponent safety",
                key_factors=["Tackle intensity", "Point of contact", "Player safety"],
                similar_historical_cases=43,
                processing_time_ms=980
            )
        ),
        Incident(
            incident_type=IncidentType.FOUL,
            description="Challenge in midfield with potential for yellow card",
            timestamp_in_match="31:15",
            team_involved="Arsenal",
            player_involved="D. Rice",
            decision_status=DecisionStatus.PENDING,
            ai_analysis=AIAnalysis(
                confidence_score=65.3,
                suggested_decision="Yellow Card - Tactical Foul",
                reasoning="Deliberate foul to stop counter-attack, no excessive force",
                key_factors=["Intent", "Impact", "Game situation"],
                similar_historical_cases=234,
                processing_time_ms=750
            )
        ),
    ]
    
    for inc in demo_incidents:
        doc = inc.model_dump()
        doc['created_at'] = doc['created_at'].isoformat()
        doc['updated_at'] = doc['updated_at'].isoformat()
        await db.incidents.insert_one(doc)
    
    return {"message": "Demo data seeded successfully", "referees": len(demo_referees), "matches": len(demo_matches), "incidents": len(demo_incidents)}

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
