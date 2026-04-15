"""
OCTON VAR Forensic AI Engine
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Architect: Dr Finnegan
  Neural Pathway Architecture:

  ┌─────────────┐    ──>    ┌──────────────┐
  │ HIPPOCAMPUS  │           │  NEO CORTEX   │
  │ Fast Match   │    ──>    │  Deep Think   │
  │ ~50ms        │           │  GPT-5.2      │
  └─────────────┘    ──>    └──────────────┘

  The Hippocampus conducts lightning speed analyses,
  performing rapid pattern recognition and initial
  classification in milliseconds.

  The Neo Cortex then performs the heavy cognitive
  lifting, leveraging GPT-5.2 for nuanced reasoning,
  historical context integration, and final
  decision recommendation.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"""
import os
import time
import json
import re
import logging
from typing import Optional, Dict

logger = logging.getLogger(__name__)


class HippocampusAnalyzer:
    """
    HIPPOCAMPUS - Lightning Speed Pattern Matcher

    Conducts rapid initial analysis by matching incident
    characteristics against known decision patterns.
    Processes in <100ms for immediate classification.
    """

    PATTERN_DB = {
        "offside": {
            "keywords": [
                "offside",
                "through ball",
                "last defender",
                "behind",
                "goal scored",
                "onside line",
                "linesman",
                "flag",
            ],
            "common_decisions": [
                "Goal Disallowed - Offside",
                "Onside - Goal Stands",
            ],
            "severity_weight": 0.85,
            "base_confidence": 72.0,
        },
        "handball": {
            "keywords": [
                "handball",
                "hand",
                "arm",
                "ball contact",
                "unnatural",
                "deliberate",
                "raised arm",
                "body position",
            ],
            "common_decisions": [
                "Handball - Free Kick/Penalty",
                "No Handball - Natural Position",
            ],
            "severity_weight": 0.80,
            "base_confidence": 68.0,
        },
        "foul": {
            "keywords": [
                "foul",
                "tackle",
                "challenge",
                "contact",
                "trip",
                "push",
                "pull",
                "obstruction",
                "holding",
            ],
            "common_decisions": [
                "Foul Confirmed",
                "No Foul - Fair Challenge",
                "Yellow Card - Tactical Foul",
            ],
            "severity_weight": 0.70,
            "base_confidence": 65.0,
        },
        "penalty": {
            "keywords": [
                "penalty",
                "box",
                "area",
                "foul in box",
                "spot kick",
                "penalty area",
                "challenge in box",
                "brought down",
            ],
            "common_decisions": [
                "Penalty Awarded",
                "No Penalty",
                "Penalty - Handball in Box",
            ],
            "severity_weight": 0.90,
            "base_confidence": 70.0,
        },
        "goal_line": {
            "keywords": [
                "goal line",
                "crossed",
                "ball over",
                "technology",
                "hawk-eye",
                "crossed the line",
                "cleared",
            ],
            "common_decisions": [
                "Goal Confirmed - Ball Crossed Line",
                "No Goal - Ball Did Not Cross",
            ],
            "severity_weight": 0.95,
            "base_confidence": 85.0,
        },
        "red_card": {
            "keywords": [
                "red card",
                "serious",
                "violent",
                "dangerous",
                "reckless",
                "excessive force",
                "straight red",
                "studs up",
                "elbow",
            ],
            "common_decisions": [
                "Red Card - Serious Foul Play",
                "Red Card - Violent Conduct",
                "Yellow Card Only",
            ],
            "severity_weight": 0.88,
            "base_confidence": 75.0,
        },
        "other": {
            "keywords": [],
            "common_decisions": ["Review Required"],
            "severity_weight": 0.50,
            "base_confidence": 50.0,
        },
    }

    def analyze(
        self,
        incident_type: str,
        description: str,
        historical_data: Optional[Dict] = None,
    ) -> Dict:
        """Lightning speed initial classification - <100ms."""
        start = time.time()

        pattern = self.PATTERN_DB.get(incident_type, self.PATTERN_DB["other"])
        desc_lower = description.lower()

        matched_keywords = [kw for kw in pattern["keywords"] if kw in desc_lower]
        keyword_score = len(matched_keywords) / max(len(pattern["keywords"]), 1)

        confidence = pattern["base_confidence"] + (keyword_score * 15)

        historical_boost = 0
        if historical_data and historical_data.get("total_similar", 0) > 5:
            historical_boost = min(10, historical_data["total_similar"] * 0.4)
            confidence += historical_boost

        confidence = min(98, max(20, confidence))

        if keyword_score > 0.4 and len(pattern["common_decisions"]) > 0:
            initial_decision = pattern["common_decisions"][0]
        elif len(pattern["common_decisions"]) > 1:
            initial_decision = pattern["common_decisions"][-1]
        else:
            initial_decision = "Further Review Required"

        processing_ms = int((time.time() - start) * 1000)

        return {
            "stage": "hippocampus",
            "initial_confidence": round(confidence, 1),
            "initial_decision": initial_decision,
            "matched_keywords": matched_keywords,
            "keyword_match_ratio": round(keyword_score, 2),
            "severity_weight": pattern["severity_weight"],
            "historical_boost": round(historical_boost, 1),
            "processing_time_ms": max(processing_ms, 1),
        }


class NeoCortexAnalyzer:
    """
    NEO CORTEX - Deep Cognitive Analyzer

    Performs the heavy lifting using GPT-5.2 for
    nuanced reasoning, historical context integration,
    and comprehensive decision support.
    """

    async def analyze(
        self,
        incident_type: str,
        description: str,
        hippocampus_result: Dict,
        historical_context: str = "",
        has_image: bool = False,
        image_base64: Optional[str] = None,
    ) -> Dict:
        """Deep analysis with full reasoning via GPT-5.2."""
        start = time.time()

        try:
            from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent

            api_key = os.environ.get("EMERGENT_LLM_KEY")
            if not api_key:
                logger.warning("EMERGENT_LLM_KEY not found, Neo Cortex using heuristics")
                return self._fallback_analysis(incident_type, hippocampus_result, start)

            session_id = f"octon-neocortex-{int(time.time())}"
            chat = LlmChat(
                api_key=api_key,
                session_id=session_id,
                system_message=(
                    "You are the Neo Cortex module of the OCTON VAR system, designed by Dr Finnegan. "
                    "You are an elite VAR analyst performing deep cognitive analysis of football incidents. "
                    "You receive initial findings from the Hippocampus module and perform the heavy cognitive lifting.\n"
                    "ALWAYS respond in this exact JSON format:\n"
                    "{\n"
                    '  "confidence_score": number (0-100),\n'
                    '  "suggested_decision": "string",\n'
                    '  "reasoning": "string",\n'
                    '  "key_factors": ["string array"],\n'
                    '  "risk_level": "low|medium|high|critical",\n'
                    '  "neo_cortex_notes": "string"\n'
                    "}"
                ),
            ).with_model("openai", "gpt-5.2")

            prompt = (
                f"OCTON VAR Deep Analysis Request:\n\n"
                f"HIPPOCAMPUS INITIAL FINDINGS:\n"
                f"- Initial Confidence: {hippocampus_result['initial_confidence']}%\n"
                f"- Initial Decision: {hippocampus_result['initial_decision']}\n"
                f"- Keyword Matches: {', '.join(hippocampus_result['matched_keywords']) or 'None'}\n"
                f"- Severity Weight: {hippocampus_result['severity_weight']}\n\n"
                f"INCIDENT DETAILS:\n"
                f"- Type: {incident_type}\n"
                f"- Description: {description}\n"
            )
            if historical_context:
                prompt += f"\nHISTORICAL CONTEXT:\n{historical_context}\n"
            prompt += "\nPerform deep cognitive analysis. Refine the Hippocampus findings. Respond in JSON only."

            if has_image and image_base64:
                image_content = ImageContent(image_base64=image_base64)
                user_message = UserMessage(
                    text=prompt + "\n\nAn image frame is attached. Analyze it carefully.",
                    file_contents=[image_content],
                )
            else:
                user_message = UserMessage(text=prompt)

            response = await chat.send_message(user_message)

            json_match = re.search(
                r"\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}", response, re.DOTALL
            )
            if json_match:
                analysis_data = json.loads(json_match.group())
            else:
                analysis_data = {
                    "confidence_score": hippocampus_result["initial_confidence"] + 5,
                    "suggested_decision": hippocampus_result["initial_decision"],
                    "reasoning": response[:500] if response else "Neo Cortex analysis completed",
                    "key_factors": ["Deep analysis performed"],
                    "risk_level": "medium",
                    "neo_cortex_notes": "JSON extraction required manual parsing",
                }

            processing_ms = int((time.time() - start) * 1000)

            return {
                "stage": "neo_cortex",
                "confidence_score": min(
                    100, max(0, float(analysis_data.get("confidence_score", 75)))
                ),
                "suggested_decision": str(
                    analysis_data.get("suggested_decision", "Review Required")
                ),
                "reasoning": str(
                    analysis_data.get("reasoning", "Analysis completed")
                ),
                "key_factors": analysis_data.get(
                    "key_factors", ["Deep analysis performed"]
                ),
                "risk_level": analysis_data.get("risk_level", "medium"),
                "neo_cortex_notes": analysis_data.get("neo_cortex_notes", ""),
                "processing_time_ms": processing_ms,
            }

        except Exception as e:
            logger.error(f"Neo Cortex analysis error: {e}")
            return self._fallback_analysis(incident_type, hippocampus_result, start)

    def _fallback_analysis(
        self, incident_type: str, hippocampus_result: Dict, start_time: float
    ) -> Dict:
        processing_ms = int((time.time() - start_time) * 1000)
        decision_map = {
            "offside": (
                "Offside - Goal Should Be Disallowed",
                "Player position analysis suggests offside based on available evidence",
            ),
            "handball": (
                "Handball - Free Kick/Penalty",
                "Ball contact with arm/hand detected in the incident description",
            ),
            "foul": (
                "Foul Confirmed",
                "Contact appears to meet foul criteria based on incident details",
            ),
            "penalty": (
                "Penalty - Review Recommended",
                "Incident occurred in penalty area, warranting further review",
            ),
            "goal_line": (
                "Goal Line Review Required",
                "Ball position relative to goal line needs technology verification",
            ),
            "red_card": (
                "Red Card - Serious Foul Play",
                "Challenge severity warrants dismissal based on description",
            ),
            "other": (
                "Further Review Required",
                "Additional analysis needed for definitive ruling",
            ),
        }
        suggestion, reasoning = decision_map.get(incident_type, decision_map["other"])
        return {
            "stage": "neo_cortex",
            "confidence_score": hippocampus_result["initial_confidence"] + 3,
            "suggested_decision": suggestion,
            "reasoning": reasoning,
            "key_factors": [
                "Incident classification",
                "Rule interpretation",
                "Historical precedent",
            ],
            "risk_level": "medium",
            "neo_cortex_notes": "Heuristic analysis - GPT-5.2 enhancement available",
            "processing_time_ms": processing_ms,
        }


class OctonBrainEngine:
    """
    OCTON Brain Engine - Dr Finnegan's Dual Pathway Architecture

    Mimics the human brain's decision-making:
    1. Hippocampus: Lightning speed initial pattern recognition
    2. Neo Cortex: Deep cognitive analysis and reasoning

    The messaging pathway between Hippocampus and Neo Cortex
    ensures both speed and accuracy in VAR decisions.
    """

    def __init__(self):
        self.hippocampus = HippocampusAnalyzer()
        self.neo_cortex = NeoCortexAnalyzer()
        logger.info(
            "OCTON Brain Engine initialized - Dr Finnegan's Neural Pathway active"
        )

    async def analyze_incident(
        self,
        incident_type: str,
        description: str,
        db,
        image_base64: Optional[str] = None,
    ) -> Dict:
        """Full dual-pathway analysis: Hippocampus (fast) -> Neo Cortex (deep)."""
        total_start = time.time()

        # Step 1: Gather historical data for learning
        historical_data = await self._get_historical_context(incident_type, db)

        # Step 2: Hippocampus lightning speed analysis
        hippocampus_result = self.hippocampus.analyze(
            incident_type, description, historical_data
        )

        # Step 3: Build historical context string for Neo Cortex
        historical_context = ""
        if historical_data["total_similar"] > 0:
            historical_context = (
                f"Historical data: {historical_data['total_similar']} similar {incident_type} incidents analyzed. "
                f"Most common outcome: {historical_data.get('most_common_decision', 'Unknown')}. "
                f"Confirmed rate: {historical_data.get('confirmed_count', 0)}, "
                f"Overturned rate: {historical_data.get('overturned_count', 0)}. "
                f"Historical accuracy: {historical_data.get('accuracy_rate', 0):.1f}%."
            )
        # Feedback loop context
        if historical_data.get("feedback_total", 0) > 0:
            historical_context += (
                f" AI Feedback: {historical_data['feedback_total']} operator reviews, "
                f"{historical_data.get('feedback_accuracy', 0):.1f}% AI accuracy."
            )
        corrections = historical_data.get("recent_corrections", [])
        if corrections:
            correction_text = "; ".join(
                [f"AI said '{c.get('ai_suggestion','')}' but operator chose '{c.get('operator_decision','')}''"
                 for c in corrections[:3]]
            )
            historical_context += f" Recent corrections: {correction_text}"

        # Step 4: Neo Cortex deep analysis (receives Hippocampus findings)
        neo_cortex_result = await self.neo_cortex.analyze(
            incident_type=incident_type,
            description=description,
            hippocampus_result=hippocampus_result,
            historical_context=historical_context,
            has_image=bool(image_base64),
            image_base64=image_base64,
        )

        total_time_ms = int((time.time() - total_start) * 1000)

        return {
            "hippocampus": hippocampus_result,
            "neo_cortex": neo_cortex_result,
            "final_confidence": neo_cortex_result["confidence_score"],
            "suggested_decision": neo_cortex_result["suggested_decision"],
            "reasoning": neo_cortex_result["reasoning"],
            "key_factors": neo_cortex_result["key_factors"],
            "risk_level": neo_cortex_result.get("risk_level", "medium"),
            "neo_cortex_notes": neo_cortex_result.get("neo_cortex_notes", ""),
            "similar_historical_cases": historical_data["total_similar"],
            "historical_accuracy": historical_data.get("accuracy_rate", 0),
            "total_processing_time_ms": total_time_ms,
            "pathway": "hippocampus -> neo_cortex",
            "engine_version": "OCTON v1.0 - Dr Finnegan",
        }

    async def _get_historical_context(
        self, incident_type: str, db
    ) -> Dict:
        """Pull historical decision patterns and AI feedback for self-learning."""
        try:
            total_similar = await db.incidents.count_documents(
                {"incident_type": incident_type, "decision_status": {"$ne": "pending"}}
            )

            pipeline = [
                {
                    "$match": {
                        "incident_type": incident_type,
                        "decision_status": {"$ne": "pending"},
                    }
                },
                {"$group": {"_id": "$final_decision", "count": {"$sum": 1}}},
                {"$sort": {"count": -1}},
                {"$limit": 1},
            ]
            common_decisions = await db.incidents.aggregate(pipeline).to_list(1)
            most_common = (
                common_decisions[0]["_id"] if common_decisions else "No historical data"
            )

            confirmed_count = await db.incidents.count_documents(
                {"incident_type": incident_type, "decision_status": "confirmed"}
            )
            total_decided = await db.incidents.count_documents(
                {
                    "incident_type": incident_type,
                    "decision_status": {"$in": ["confirmed", "overturned"]},
                }
            )
            accuracy_rate = (
                (confirmed_count / total_decided * 100) if total_decided > 0 else 0
            )

            # ── AI Feedback Loop: pull operator corrections ──
            feedback_total = await db.ai_feedback.count_documents(
                {"incident_type": incident_type}
            )
            feedback_correct = await db.ai_feedback.count_documents(
                {"incident_type": incident_type, "was_ai_correct": True}
            )
            feedback_accuracy = (
                (feedback_correct / feedback_total * 100) if feedback_total > 0 else 0
            )

            # Get recent corrections to learn from
            recent_corrections = await db.ai_feedback.find(
                {"incident_type": incident_type, "was_ai_correct": False},
                {"_id": 0, "ai_suggestion": 1, "operator_decision": 1},
            ).sort("created_at", -1).to_list(5)

            return {
                "total_similar": total_similar,
                "most_common_decision": most_common,
                "accuracy_rate": accuracy_rate,
                "confirmed_count": confirmed_count,
                "overturned_count": total_decided - confirmed_count,
                "feedback_total": feedback_total,
                "feedback_accuracy": feedback_accuracy,
                "recent_corrections": recent_corrections,
            }
        except Exception as e:
            logger.error(f"Historical context error: {e}")
            return {
                "total_similar": 0,
                "most_common_decision": "N/A",
                "accuracy_rate": 0,
                "confirmed_count": 0,
                "overturned_count": 0,
                "feedback_total": 0,
                "feedback_accuracy": 0,
                "recent_corrections": [],
            }


# Global engine instance
brain_engine = OctonBrainEngine()
