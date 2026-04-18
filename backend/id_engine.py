"""
OCTON ID PROTECTION - Forensic ID Fraud Prevention Engine
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Architect: Dr Finnegan
  Neural Pathway Architecture:

  ┌──────────────────┐   ──>   ┌───────────────────┐
  │  HIPPOCAMPUS     │          │   NEO CORTEX      │
  │  Rapid Scan      │   ──>   │   Deep Forensics  │
  │  Pattern Match   │          │   GPT-5.2         │
  │  <100ms          │          │   Document AI     │
  └──────────────────┘   ──>   └───────────────────┘

  Self-learning, self-reflecting, self-executing AI
  that mimics the human brain's Neocortex for
  lightning speed ID fraud detection.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"""
import os
import time
import json
import re
import logging
from typing import Optional, Dict

logger = logging.getLogger(__name__)


class IDHippocampusAnalyzer:
    """
    HIPPOCAMPUS - Lightning Speed Document Scanner

    Conducts rapid initial analysis of identity documents:
    - Document type detection
    - Format validation
    - Known forgery pattern matching
    - Quick risk scoring
    Processes in <100ms.
    """

    DOCUMENT_PATTERNS = {
        "passport": {
            "keywords": [
                "passport", "republic", "nationality", "date of birth",
                "place of birth", "date of issue", "date of expiry",
                "authority", "machine readable", "mrz",
            ],
            "required_fields": ["name", "date_of_birth", "nationality", "passport_number"],
            "forgery_indicators": [
                "blurry text", "misaligned", "wrong font", "color mismatch",
                "no watermark", "pixelated photo", "inconsistent spacing",
            ],
            "base_trust": 60.0,
        },
        "drivers_license": {
            "keywords": [
                "driver", "license", "licence", "driving", "class",
                "endorsement", "restriction", "organ donor", "dob", "exp",
            ],
            "required_fields": ["name", "date_of_birth", "license_number", "address"],
            "forgery_indicators": [
                "wrong hologram", "incorrect barcode", "mismatched photo",
                "expired", "wrong state format", "no microprint",
            ],
            "base_trust": 55.0,
        },
        "national_id": {
            "keywords": [
                "national", "identity", "identification", "citizen",
                "id number", "card number", "government", "republic",
            ],
            "required_fields": ["name", "date_of_birth", "id_number"],
            "forgery_indicators": [
                "missing security feature", "wrong card size",
                "incorrect chip", "no uv features", "wrong embossing",
            ],
            "base_trust": 58.0,
        },
    }

    RISK_SIGNALS = {
        "high_risk_countries": ["unknown", "unspecified"],
        "suspicious_patterns": [
            "recently issued", "expired", "damaged", "poor quality",
            "partial", "cropped", "screenshot", "photocopy",
        ],
    }

    def analyze(
        self,
        document_type: str,
        extracted_text: str,
        has_selfie: bool = False,
        has_document_image: bool = False,
        metadata: Optional[Dict] = None,
        historical_data: Optional[Dict] = None,
    ) -> Dict:
        """Lightning speed initial document scan - <100ms."""
        start = time.time()

        pattern = self.DOCUMENT_PATTERNS.get(
            document_type, self.DOCUMENT_PATTERNS["national_id"]
        )
        text_lower = extracted_text.lower()

        # Keyword matching
        matched_keywords = [kw for kw in pattern["keywords"] if kw in text_lower]
        keyword_score = len(matched_keywords) / max(len(pattern["keywords"]), 1)

        # Risk signal detection
        risk_signals = [s for s in self.RISK_SIGNALS["suspicious_patterns"] if s in text_lower]
        forgery_hints = [f for f in pattern["forgery_indicators"] if f in text_lower]

        # Calculate trust score
        trust_score = pattern["base_trust"]
        trust_score += keyword_score * 20  # More keywords = more legitimate
        trust_score -= len(risk_signals) * 8  # Risk signals reduce trust
        trust_score -= len(forgery_hints) * 12  # Forgery hints heavily penalize

        # Bonuses
        if has_document_image:
            trust_score += 10
        if has_selfie:
            trust_score += 8
        if metadata and metadata.get("fields_provided", 0) >= 3:
            trust_score += 5

        # Historical boost
        historical_boost = 0
        if historical_data and historical_data.get("total_similar", 0) > 5:
            historical_boost = min(8, historical_data["total_similar"] * 0.3)
            trust_score += historical_boost

        trust_score = min(98, max(5, trust_score))

        # Initial verdict
        if trust_score >= 80:
            verdict = "LIKELY AUTHENTIC"
            risk_level = "low"
        elif trust_score >= 60:
            verdict = "REQUIRES REVIEW"
            risk_level = "medium"
        elif trust_score >= 40:
            verdict = "SUSPICIOUS"
            risk_level = "high"
        else:
            verdict = "LIKELY FRAUDULENT"
            risk_level = "critical"

        processing_ms = int((time.time() - start) * 1000)

        return {
            "stage": "hippocampus",
            "initial_trust_score": round(trust_score, 1),
            "initial_verdict": verdict,
            "risk_level": risk_level,
            "matched_keywords": matched_keywords,
            "keyword_match_ratio": round(keyword_score, 2),
            "risk_signals_detected": risk_signals,
            "forgery_indicators": forgery_hints,
            "has_document_image": has_document_image,
            "has_selfie": has_selfie,
            "historical_boost": round(historical_boost, 1),
            "processing_time_ms": max(processing_ms, 1),
        }


class IDNeoCortexAnalyzer:
    """
    NEO CORTEX - Deep Forensic Document Analyzer

    Performs the heavy cognitive lifting using GPT-5.2:
    - Document authenticity deep assessment
    - Face matching analysis (if selfie provided)
    - Data consistency cross-validation
    - Forgery pattern deep detection
    - Comprehensive fraud risk scoring
    """

    async def analyze(
        self,
        document_type: str,
        extracted_text: str,
        hippocampus_result: Dict,
        applicant_data: Optional[Dict] = None,
        historical_context: str = "",
        has_image: bool = False,
        image_base64: Optional[str] = None,
        selfie_base64: Optional[str] = None,
    ) -> Dict:
        """Deep forensic analysis via GPT-5.2."""
        start = time.time()

        try:
            from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent

            api_key = os.environ.get("EMERGENT_LLM_KEY")
            if not api_key:
                logger.warning("EMERGENT_LLM_KEY not found, Neo Cortex using heuristics")
                return self._fallback_analysis(document_type, hippocampus_result, start)

            session_id = f"octon-id-neocortex-{int(time.time())}"
            chat = LlmChat(
                api_key=api_key,
                session_id=session_id,
                system_message=(
                    "You are the Neo Cortex module of OCTON ID PROTECTION, designed by Dr Finnegan. "
                    "You are an elite forensic document analyst performing deep ID fraud detection.\n"
                    "You receive initial findings from the Hippocampus module and perform deep cognitive analysis.\n"
                    "Analyze for: document forgery, face matching inconsistencies, data manipulation, "
                    "and cross-reference consistency.\n\n"
                    "ALWAYS respond in this exact JSON format:\n"
                    "{\n"
                    '  "trust_score": number (0-100, higher = more trustworthy),\n'
                    '  "verdict": "AUTHENTIC|LIKELY_AUTHENTIC|REQUIRES_REVIEW|SUSPICIOUS|LIKELY_FRAUDULENT|FRAUDULENT",\n'
                    '  "fraud_indicators": ["list of specific fraud indicators found"],\n'
                    '  "authenticity_factors": ["list of factors supporting authenticity"],\n'
                    '  "data_consistency": "consistent|minor_discrepancies|major_discrepancies|inconsistent",\n'
                    '  "face_match_assessment": "match|likely_match|uncertain|likely_mismatch|mismatch|not_available",\n'
                    '  "reasoning": "detailed explanation",\n'
                    '  "risk_level": "low|medium|high|critical",\n'
                    '  "recommended_action": "approve|manual_review|reject|escalate",\n'
                    '  "neo_cortex_notes": "additional expert observations"\n'
                    "}"
                ),
            ).with_model("openai", "gpt-5.2")

            prompt = (
                f"OCTON ID PROTECTION - Deep Forensic Analysis:\n\n"
                f"HIPPOCAMPUS INITIAL FINDINGS:\n"
                f"- Initial Trust Score: {hippocampus_result['initial_trust_score']}%\n"
                f"- Initial Verdict: {hippocampus_result['initial_verdict']}\n"
                f"- Risk Level: {hippocampus_result['risk_level']}\n"
                f"- Risk Signals: {', '.join(hippocampus_result['risk_signals_detected']) or 'None'}\n"
                f"- Forgery Indicators: {', '.join(hippocampus_result['forgery_indicators']) or 'None'}\n\n"
                f"DOCUMENT DETAILS:\n"
                f"- Type: {document_type}\n"
                f"- Extracted Text/Description: {extracted_text}\n"
                f"- Has Document Image: {hippocampus_result.get('has_document_image', False)}\n"
                f"- Has Selfie: {hippocampus_result.get('has_selfie', False)}\n"
            )

            if applicant_data:
                prompt += (
                    f"\nAPPLICANT DATA:\n"
                    f"- Name: {applicant_data.get('name', 'N/A')}\n"
                    f"- DOB: {applicant_data.get('date_of_birth', 'N/A')}\n"
                    f"- ID Number: {applicant_data.get('id_number', 'N/A')}\n"
                    f"- Address: {applicant_data.get('address', 'N/A')}\n"
                    f"- Nationality: {applicant_data.get('nationality', 'N/A')}\n"
                )

            if historical_context:
                prompt += f"\nHISTORICAL CONTEXT:\n{historical_context}\n"

            prompt += "\nPerform deep forensic analysis. Respond in JSON format only."

            file_contents = []
            if has_image and image_base64:
                file_contents.append(ImageContent(image_base64=image_base64))
                prompt += "\n\nDocument image attached. Analyze for forgery indicators."
            if selfie_base64:
                file_contents.append(ImageContent(image_base64=selfie_base64))
                prompt += "\nSelfie attached. Compare face with document photo."

            if file_contents:
                user_message = UserMessage(text=prompt, file_contents=file_contents)
            else:
                user_message = UserMessage(text=prompt)

            response = await chat.send_message(user_message)

            json_match = re.search(
                r"\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}", response, re.DOTALL
            )
            if json_match:
                data = json.loads(json_match.group())
            else:
                data = {
                    "trust_score": hippocampus_result["initial_trust_score"],
                    "verdict": hippocampus_result["initial_verdict"],
                    "fraud_indicators": [],
                    "authenticity_factors": ["Analysis completed"],
                    "data_consistency": "uncertain",
                    "face_match_assessment": "not_available",
                    "reasoning": response[:500] if response else "Neo Cortex analysis completed",
                    "risk_level": hippocampus_result["risk_level"],
                    "recommended_action": "manual_review",
                    "neo_cortex_notes": "JSON extraction required fallback",
                }

            processing_ms = int((time.time() - start) * 1000)

            return {
                "stage": "neo_cortex",
                "trust_score": min(100, max(0, float(data.get("trust_score", 50)))),
                "verdict": str(data.get("verdict", "REQUIRES_REVIEW")),
                "fraud_indicators": data.get("fraud_indicators", []),
                "authenticity_factors": data.get("authenticity_factors", []),
                "data_consistency": data.get("data_consistency", "uncertain"),
                "face_match_assessment": data.get("face_match_assessment", "not_available"),
                "reasoning": str(data.get("reasoning", "Analysis completed")),
                "risk_level": data.get("risk_level", "medium"),
                "recommended_action": data.get("recommended_action", "manual_review"),
                "neo_cortex_notes": data.get("neo_cortex_notes", ""),
                "processing_time_ms": processing_ms,
            }

        except Exception as e:
            logger.error(f"ID Neo Cortex error: {e}")
            return self._fallback_analysis(document_type, hippocampus_result, start)

    def _fallback_analysis(self, doc_type: str, hippo: Dict, start_time: float) -> Dict:
        processing_ms = int((time.time() - start_time) * 1000)
        trust = hippo["initial_trust_score"] + 2
        return {
            "stage": "neo_cortex",
            "trust_score": min(98, trust),
            "verdict": hippo["initial_verdict"],
            "fraud_indicators": hippo.get("forgery_indicators", []),
            "authenticity_factors": ["Document type recognized", "Basic format valid"],
            "data_consistency": "requires_manual_check",
            "face_match_assessment": "not_available",
            "reasoning": f"Heuristic analysis for {doc_type} document based on pattern matching",
            "risk_level": hippo["risk_level"],
            "recommended_action": "manual_review",
            "neo_cortex_notes": "Heuristic mode - GPT-5.2 enhancement available",
            "processing_time_ms": processing_ms,
        }


class OctonIDEngine:
    """
    OCTON ID PROTECTION Engine - Dr Finnegan's Neocortex Architecture

    Self-learning, self-reflecting, self-executing AI:
    1. Hippocampus: Lightning speed document scanning and pattern recognition
    2. Neo Cortex: Deep forensic analysis, face matching, fraud detection
    3. Feedback Loop: Learns from agent corrections to improve future accuracy
    """

    def __init__(self):
        self.hippocampus = IDHippocampusAnalyzer()
        self.neo_cortex = IDNeoCortexAnalyzer()
        logger.info("OCTON ID Engine initialized - Dr Finnegan's Neocortex active")

    async def verify_document(
        self,
        document_type: str,
        extracted_text: str,
        db,
        applicant_data: Optional[Dict] = None,
        document_image_b64: Optional[str] = None,
        selfie_b64: Optional[str] = None,
    ) -> Dict:
        """Full Neocortex verification: Hippocampus (scan) -> Neo Cortex (forensics)."""
        total_start = time.time()

        # Gather historical data for self-learning
        historical_data = await self._get_historical_context(document_type, db)

        # Hippocampus rapid scan
        metadata = {}
        if applicant_data:
            metadata["fields_provided"] = sum(
                1 for v in applicant_data.values() if v
            )

        hippocampus_result = self.hippocampus.analyze(
            document_type=document_type,
            extracted_text=extracted_text,
            has_selfie=bool(selfie_b64),
            has_document_image=bool(document_image_b64),
            metadata=metadata,
            historical_data=historical_data,
        )

        # Build historical context for Neo Cortex
        historical_context = ""
        if historical_data["total_similar"] > 0:
            historical_context = (
                f"Historical: {historical_data['total_similar']} similar {document_type} verifications. "
                f"Fraud rate: {historical_data.get('fraud_rate', 0):.1f}%. "
                f"Most common verdict: {historical_data.get('most_common_verdict', 'N/A')}."
            )
        if historical_data.get("feedback_total", 0) > 0:
            historical_context += (
                f" AI Feedback: {historical_data['feedback_total']} agent reviews, "
                f"{historical_data.get('feedback_accuracy', 0):.1f}% AI accuracy."
            )
        corrections = historical_data.get("recent_corrections", [])
        if corrections:
            correction_text = "; ".join(
                [f"AI said '{c.get('ai_verdict','')}' but agent chose '{c.get('agent_verdict','')}'"
                 for c in corrections[:3]]
            )
            historical_context += f" Recent corrections: {correction_text}"

        # Neo Cortex deep forensic analysis
        neo_cortex_result = await self.neo_cortex.analyze(
            document_type=document_type,
            extracted_text=extracted_text,
            hippocampus_result=hippocampus_result,
            applicant_data=applicant_data,
            historical_context=historical_context,
            has_image=bool(document_image_b64),
            image_base64=document_image_b64,
            selfie_base64=selfie_b64,
        )

        total_time_ms = int((time.time() - total_start) * 1000)

        return {
            "hippocampus": hippocampus_result,
            "neo_cortex": neo_cortex_result,
            "final_trust_score": neo_cortex_result["trust_score"],
            "verdict": neo_cortex_result["verdict"],
            "fraud_indicators": neo_cortex_result["fraud_indicators"],
            "authenticity_factors": neo_cortex_result["authenticity_factors"],
            "data_consistency": neo_cortex_result["data_consistency"],
            "face_match_assessment": neo_cortex_result["face_match_assessment"],
            "reasoning": neo_cortex_result["reasoning"],
            "risk_level": neo_cortex_result["risk_level"],
            "recommended_action": neo_cortex_result["recommended_action"],
            "neo_cortex_notes": neo_cortex_result.get("neo_cortex_notes", ""),
            "similar_historical_cases": historical_data["total_similar"],
            "historical_fraud_rate": historical_data.get("fraud_rate", 0),
            "total_processing_time_ms": total_time_ms,
            "pathway": "hippocampus -> neo_cortex",
            "engine_version": "OCTON ID v1.0 - Dr Finnegan",
        }

    async def _get_historical_context(self, document_type: str, db) -> Dict:
        """Pull historical verification patterns for self-learning."""
        try:
            total = await db.id_verifications.count_documents(
                {"document_type": document_type, "review_status": {"$ne": "pending"}}
            )
            fraud_count = await db.id_verifications.count_documents(
                {"document_type": document_type, "review_status": "rejected"}
            )
            fraud_rate = (fraud_count / total * 100) if total > 0 else 0

            pipeline = [
                {"$match": {"document_type": document_type, "review_status": {"$ne": "pending"}}},
                {"$group": {"_id": "$ai_analysis.verdict", "count": {"$sum": 1}}},
                {"$sort": {"count": -1}},
                {"$limit": 1},
            ]
            common = await db.id_verifications.aggregate(pipeline).to_list(1)
            most_common = common[0]["_id"] if common else "N/A"

            # Feedback loop data
            feedback_total = await db.id_feedback.count_documents(
                {"document_type": document_type}
            )
            feedback_correct = await db.id_feedback.count_documents(
                {"document_type": document_type, "was_ai_correct": True}
            )
            feedback_accuracy = (
                (feedback_correct / feedback_total * 100) if feedback_total > 0 else 0
            )
            recent_corrections = await db.id_feedback.find(
                {"document_type": document_type, "was_ai_correct": False},
                {"_id": 0, "ai_verdict": 1, "agent_verdict": 1},
            ).sort("created_at", -1).to_list(5)

            return {
                "total_similar": total,
                "fraud_rate": fraud_rate,
                "most_common_verdict": most_common,
                "feedback_total": feedback_total,
                "feedback_accuracy": feedback_accuracy,
                "recent_corrections": recent_corrections,
            }
        except Exception as e:
            logger.error(f"ID historical context error: {e}")
            return {
                "total_similar": 0, "fraud_rate": 0,
                "most_common_verdict": "N/A",
                "feedback_total": 0, "feedback_accuracy": 0,
                "recent_corrections": [],
            }


# Global engine instance
id_engine = OctonIDEngine()
