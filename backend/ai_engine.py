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
                "offside", "through ball", "last defender", "behind",
                "goal scored", "onside line", "linesman", "flag",
                "beyond", "ahead of", "forward run", "played onside",
                "marginal", "tight call", "level", "daylight",
            ],
            "negative_keywords": ["onside", "behind the ball", "own half", "goal kick", "throw-in", "corner"],
            "common_decisions": [
                "Goal Disallowed - Offside",
                "Onside - Goal Stands",
            ],
            "severity_weight": 0.85,
            "base_confidence": 55.0,
        },
        "handball": {
            "keywords": [
                "handball", "hand", "arm", "ball contact", "unnatural",
                "deliberate", "raised arm", "body position", "above shoulder",
                "extended arm", "making body bigger", "ball to hand",
                "hand to ball", "natural position", "tucked in",
            ],
            "negative_keywords": ["own head", "own body", "deflection", "close range", "natural", "by side"],
            "common_decisions": [
                "Handball - Free Kick/Penalty",
                "No Handball - Natural Position",
            ],
            "severity_weight": 0.80,
            "base_confidence": 50.0,
        },
        "foul": {
            "keywords": [
                "foul", "tackle", "challenge", "contact", "trip", "push",
                "pull", "obstruction", "holding", "late", "reckless",
                "from behind", "no ball contact", "missed the ball",
                "tactical", "counter-attack", "promising attack",
            ],
            "negative_keywords": ["fair", "clean", "won the ball", "shoulder to shoulder", "ball first"],
            "common_decisions": [
                "Foul Confirmed",
                "No Foul - Fair Challenge",
                "Yellow Card - Tactical Foul",
            ],
            "severity_weight": 0.70,
            "base_confidence": 50.0,
        },
        "penalty": {
            "keywords": [
                "penalty", "box", "area", "foul in box", "spot kick",
                "penalty area", "challenge in box", "brought down",
                "inside the area", "tripped in box", "pushed in box",
                "handball in box", "contact in area",
            ],
            "negative_keywords": ["outside box", "simulation", "dive", "outside the area", "no contact"],
            "common_decisions": [
                "Penalty Awarded",
                "No Penalty - Outside Area / Simulation",
                "Penalty - Handball in Box",
            ],
            "severity_weight": 0.90,
            "base_confidence": 50.0,
        },
        "goal_line": {
            "keywords": [
                "goal line", "crossed", "ball over", "technology", "hawk-eye",
                "crossed the line", "cleared", "on the line", "fully over",
                "goal confirmed", "no goal", "cleared off line",
            ],
            "negative_keywords": ["not crossed", "on the line", "part of ball"],
            "common_decisions": [
                "Goal Confirmed - Ball Crossed Line",
                "No Goal - Ball Did Not Cross",
            ],
            "severity_weight": 0.95,
            "base_confidence": 60.0,
        },
        "red_card": {
            "keywords": [
                "red card", "serious", "violent", "dangerous", "reckless",
                "excessive force", "straight red", "studs up", "elbow",
                "head butt", "spitting", "dogso", "last man",
                "denied goal scoring", "brutal", "endangered safety",
                "off the ball", "violent conduct",
            ],
            "negative_keywords": ["yellow", "first offence", "minor", "accidental", "attempt to play ball"],
            "common_decisions": [
                "Red Card - Serious Foul Play",
                "Red Card - Violent Conduct",
                "Yellow Card Only - Not Excessive Force",
            ],
            "severity_weight": 0.88,
            "base_confidence": 52.0,
        },
        "other": {
            "keywords": [],
            "negative_keywords": [],
            "common_decisions": ["Review Required"],
            "severity_weight": 0.50,
            "base_confidence": 40.0,
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

        # Check negative keywords that suggest the opposite outcome
        negative_keywords = pattern.get("negative_keywords", [])
        matched_negatives = [nk for nk in negative_keywords if nk in desc_lower]
        negative_score = len(matched_negatives) / max(len(negative_keywords), 1)

        # Calculate confidence - start lower, earn it with evidence
        confidence = pattern["base_confidence"]
        confidence += keyword_score * 20
        confidence -= negative_score * 15  # Negatives pull confidence down

        # Description quality bonus: longer, more detailed = more confident
        word_count = len(description.split())
        if word_count > 30:
            confidence += 5
        elif word_count < 10:
            confidence -= 10  # Very short descriptions = low confidence

        # Historical boost (capped)
        historical_boost = 0
        if historical_data and historical_data.get("total_similar", 0) > 5:
            historical_boost = min(8, historical_data["total_similar"] * 0.3)
            confidence += historical_boost

        # Feedback-based calibration
        feedback_adjust = 0
        if historical_data and historical_data.get("feedback_accuracy", 0) > 0:
            fb_acc = historical_data["feedback_accuracy"]
            if fb_acc < 60:
                feedback_adjust = -5  # AI has been wrong often, be less confident
            elif fb_acc > 85:
                feedback_adjust = 3
            confidence += feedback_adjust

        confidence = min(92, max(15, confidence))

        # Decision: if negatives outweigh positives, flip to conservative option
        if negative_score > keyword_score and len(pattern["common_decisions"]) > 1:
            initial_decision = pattern["common_decisions"][-1]  # Conservative
        elif keyword_score > 0.3 and len(pattern["common_decisions"]) > 0:
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
            "matched_negatives": matched_negatives,
            "keyword_match_ratio": round(keyword_score, 2),
            "negative_match_ratio": round(negative_score, 2),
            "severity_weight": pattern["severity_weight"],
            "historical_boost": round(historical_boost, 1),
            "feedback_adjustment": round(feedback_adjust, 1),
            "description_quality": "detailed" if word_count > 30 else "brief" if word_count > 15 else "minimal",
            "processing_time_ms": max(processing_ms, 1),
        }


class NeoCortexAnalyzer:
    """
    NEO CORTEX - Deep Cognitive Analyzer

    Performs the heavy lifting using GPT-5.2 for
    nuanced reasoning, historical context integration,
    and comprehensive decision support.
    """

    # IFAB Laws of the Game reference for accurate decisions
    RULES_REFERENCE = {
        "offside": (
            "IFAB Law 11 - Offside: A player is offside if any part of their head, body or feet "
            "is in the opponents' half (excluding the halfway line) AND nearer to the opponents' "
            "goal line than both the ball and the second-last opponent. Being offside is NOT an "
            "offence itself. An offside offence occurs when the ball is played/touched by a teammate "
            "AND the player is: interfering with play, interfering with an opponent, or gaining an "
            "advantage. A player is NOT offside from a goal kick, throw-in, or corner kick. "
            "Tight/marginal offside = low confidence. Clear offside (>1m beyond) = high confidence."
        ),
        "handball": (
            "IFAB Law 12 - Handball: It is an offence if a player deliberately handles the ball "
            "OR scores/creates a goal-scoring opportunity after touching their hand/arm. "
            "It is usually an offence if the hand/arm makes the body unnaturally bigger, or the "
            "hand/arm is above shoulder height. It is NOT an offence if the ball touches a player's "
            "hand/arm directly from their own head/body/foot, or from a nearby player's head/body/foot. "
            "Natural arm position (by the side) = usually no handball. Arm away from body = likely handball. "
            "Ball-to-hand vs hand-to-ball is a KEY distinction."
        ),
        "foul": (
            "IFAB Law 12 - Fouls: Direct free kick for: kicking, tripping, jumping at, charging, "
            "striking, pushing an opponent, or a tackle that contacts the opponent before the ball. "
            "Yellow card for: persistent offences, dissent, delaying restart, tactical fouls that "
            "stop promising attacks. Red card criteria: serious foul play (excessive force), violent "
            "conduct, denying obvious goal-scoring opportunity (DOGSO). Consider: was there genuine "
            "attempt to play the ball? Amount of force? Impact on the opponent?"
        ),
        "penalty": (
            "IFAB Law 14 - Penalty Kick: Awarded when a direct free-kick offence is committed by "
            "a player inside their own penalty area. The offence must occur INSIDE the penalty area. "
            "Criteria: same as direct free kick fouls (trip, push, hold, kick, handball). "
            "DOGSO in penalty area = penalty + yellow card (not red, unless the foul was not an "
            "attempt to play the ball). Simulation/diving = no penalty + yellow card to attacker."
        ),
        "goal_line": (
            "IFAB Law 10 - Goal: The whole ball must cross the whole goal line between the goalposts "
            "and under the crossbar. Goal-line technology (GLT) provides definitive binary answer. "
            "If GLT unavailable, VAR uses camera angles to determine if ball fully crossed. "
            "Millimeter precision required - if ANY part of the ball is on or above the line, it's NOT a goal."
        ),
        "red_card": (
            "IFAB Law 12 - Sending Off: Red card for: serious foul play (tackle/challenge using "
            "excessive force or brutality), violent conduct, spitting, DOGSO by foul (outside penalty area "
            "or non-ball-playing foul in box), DOGSO by handball, offensive language/gestures, "
            "receiving second yellow. Serious foul play = endangered safety of opponent. "
            "Assess: speed of tackle, use of studs, height of challenge, contact point, "
            "whether from behind, whether ball was playable."
        ),
        "other": (
            "General VAR protocol: VAR can only intervene for clear and obvious errors or serious "
            "missed incidents in four categories: goals, penalty decisions, direct red cards, "
            "and mistaken identity. The threshold is 'clear and obvious error' - borderline "
            "calls should stand as the on-field referee's decision."
        ),
    }

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

            rules = self.RULES_REFERENCE.get(incident_type, self.RULES_REFERENCE["other"])

            session_id = f"octon-neocortex-{int(time.time())}"
            chat = LlmChat(
                api_key=api_key,
                session_id=session_id,
                system_message=(
                    "You are the Neo Cortex module of OCTON VAR, an elite forensic VAR analyst designed by Dr Finnegan.\n\n"
                    "YOUR ROLE: Make accurate VAR decisions by applying IFAB Laws of the Game precisely.\n\n"
                    "CRITICAL RULES:\n"
                    "- You MUST apply the specific law relevant to the incident type\n"
                    "- Do NOT default to the Hippocampus suggestion - independently evaluate\n"
                    "- Consider ALL evidence: description details, context, player positions, intent\n"
                    "- Confidence score must reflect actual certainty: 90+ only for clear-cut cases\n"
                    "- 60-75 for borderline cases that could go either way\n"
                    "- Below 50 means you're genuinely uncertain\n"
                    "- The VAR threshold is 'clear and obvious error' - if the call is marginal, "
                    "the on-field decision should typically stand\n\n"
                    "DECISION ACCURACY GUIDELINES:\n"
                    "- For OFFSIDE: focus on the exact moment the ball is played, not when received. "
                    "Consider which body parts are offside. Marginal = suggest on-field decision stands.\n"
                    "- For HANDBALL: distinguish ball-to-hand vs hand-to-ball. Natural position matters. "
                    "Arm tucked in = usually no handball. Arm extended/raised = likely handball.\n"
                    "- For FOULS: assess genuine attempt to play ball, force used, point of contact, "
                    "and whether it stopped a promising attack (yellow) or DOGSO (red).\n"
                    "- For PENALTIES: same as fouls but MUST be inside the penalty area. Check for simulation.\n"
                    "- For RED CARDS: distinguish serious foul play (excessive force) from normal fouls. "
                    "Not every bad tackle is a red card. Studs up + excessive force + endangered safety = red.\n"
                    "- For GOAL LINE: the WHOLE ball must cross the WHOLE line. Any doubt = no goal.\n\n"
                    "ALWAYS respond in this exact JSON format:\n"
                    "{\n"
                    '  "confidence_score": number (0-100, calibrated accurately),\n'
                    '  "suggested_decision": "specific decision string",\n'
                    '  "reasoning": "detailed step-by-step reasoning applying the relevant law",\n'
                    '  "key_factors": ["specific factual factors from the description"],\n'
                    '  "risk_level": "low|medium|high|critical",\n'
                    '  "neo_cortex_notes": "any caveats, what additional evidence would help"\n'
                    "}"
                ),
            ).with_model("openai", "gpt-5.2")

            prompt = (
                f"OCTON VAR FORENSIC ANALYSIS:\n\n"
                f"APPLICABLE LAW:\n{rules}\n\n"
                f"HIPPOCAMPUS RAPID SCAN:\n"
                f"- Initial Confidence: {hippocampus_result['initial_confidence']}%\n"
                f"- Initial Decision: {hippocampus_result['initial_decision']}\n"
                f"- Matched Patterns: {', '.join(hippocampus_result['matched_keywords']) or 'None'}\n\n"
                f"INCIDENT UNDER REVIEW:\n"
                f"- Category: {incident_type.upper()}\n"
                f"- Full Description: {description}\n"
            )
            if historical_context:
                prompt += f"\nSELF-LEARNING CONTEXT:\n{historical_context}\n"
            prompt += (
                "\nINSTRUCTIONS: Apply the law above to the incident description. "
                "Do NOT blindly agree with the Hippocampus - make your own independent assessment. "
                "If the description lacks critical details, lower your confidence and note what's missing. "
                "Respond in JSON format only."
            )

            if has_image and image_base64:
                image_content = ImageContent(image_base64=image_base64)
                user_message = UserMessage(
                    text=prompt + "\n\nMatch frame attached. Analyze visual evidence carefully.",
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
                    "confidence_score": hippocampus_result["initial_confidence"],
                    "suggested_decision": hippocampus_result["initial_decision"],
                    "reasoning": response[:500] if response else "Neo Cortex analysis completed",
                    "key_factors": ["Analysis performed - JSON parsing fallback"],
                    "risk_level": "medium",
                    "neo_cortex_notes": "Response required manual extraction",
                }

            processing_ms = int((time.time() - start) * 1000)

            return {
                "stage": "neo_cortex",
                "confidence_score": min(
                    100, max(0, float(analysis_data.get("confidence_score", 50)))
                ),
                "suggested_decision": str(
                    analysis_data.get("suggested_decision", "Review Required")
                ),
                "reasoning": str(
                    analysis_data.get("reasoning", "Analysis completed")
                ),
                "key_factors": analysis_data.get(
                    "key_factors", ["Analysis performed"]
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
        hip_conf = hippocampus_result["initial_confidence"]
        has_negatives = hippocampus_result.get("negative_match_ratio", 0) > 0.2

        # More nuanced fallback that respects Hippocampus findings
        decision_map = {
            "offside": [
                ("Offside - Goal Disallowed", "Pattern analysis indicates player beyond last defender", 70),
                ("Marginal - On-Field Decision Stands", "Insufficient evidence for clear offside call", 50),
            ],
            "handball": [
                ("Handball - Free Kick Awarded", "Ball-to-arm contact detected in description", 65),
                ("No Handball - Natural Arm Position", "Arm position appears natural based on context", 55),
            ],
            "foul": [
                ("Foul Confirmed - Free Kick", "Challenge appears to meet foul criteria", 60),
                ("No Foul - Fair Challenge", "Description suggests legitimate attempt to play ball", 50),
            ],
            "penalty": [
                ("Penalty Awarded", "Offence appears to have occurred inside penalty area", 65),
                ("No Penalty - Insufficient Evidence", "Cannot confirm foul occurred inside the area", 50),
            ],
            "goal_line": [
                ("Goal Confirmed", "Evidence suggests ball fully crossed the line", 70),
                ("No Goal - Ball Did Not Fully Cross", "Insufficient evidence ball completely crossed", 55),
            ],
            "red_card": [
                ("Red Card - Serious Foul Play", "Excessive force or endangering safety detected", 70),
                ("Yellow Card - Reckless but Not Excessive", "Foul was reckless but not brutal/excessive", 55),
            ],
            "other": [
                ("Further Review Required", "Insufficient information for definitive ruling", 40),
            ],
        }

        options = decision_map.get(incident_type, decision_map["other"])
        # Pick based on whether negatives were found
        if has_negatives and len(options) > 1:
            suggestion, reasoning, conf = options[1]
        else:
            suggestion, reasoning, conf = options[0]

        # Blend with hippocampus confidence
        final_conf = (hip_conf * 0.4 + conf * 0.6)

        return {
            "stage": "neo_cortex",
            "confidence_score": round(min(85, max(20, final_conf)), 1),
            "suggested_decision": suggestion,
            "reasoning": reasoning,
            "key_factors": [
                "Pattern-based analysis",
                "IFAB Law interpretation",
                "Heuristic confidence calibration",
            ],
            "risk_level": "medium" if final_conf >= 50 else "high",
            "neo_cortex_notes": "Heuristic mode - GPT-5.2 unavailable. Results less reliable.",
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
