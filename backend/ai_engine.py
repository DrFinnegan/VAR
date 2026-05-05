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
import asyncio
import base64
import io
import logging
from typing import Optional, Dict, List

logger = logging.getLogger(__name__)


def _build_thumbnail_strip(
    image_base64: Optional[str],
    extra_images_b64: Optional[List[str]],
    max_width: int = 320,
    quality: int = 60,
) -> List[str]:
    """Return small base64 JPEG thumbnails of every frame the model saw.

    Used by the "OCTON SAW" strip on the verdict panel so a referee
    panel can verify the engine analysed actual footage. Pillow is the
    only dependency and it's already pinned for the verdict-card route.
    Falls back to the original base64 if Pillow can't decode (we never
    want to lose evidence in pursuit of compression).
    """
    try:
        from PIL import Image
    except Exception:
        # Last-resort fallback: keep originals (still verifiable but heavier).
        return [b for b in [image_base64, *(extra_images_b64 or [])] if b][:4]

    out: List[str] = []
    sources = [b for b in [image_base64, *(extra_images_b64 or [])] if b][:4]
    for b in sources:
        try:
            raw = base64.b64decode(b)
            im = Image.open(io.BytesIO(raw)).convert("RGB")
            if im.width > max_width:
                ratio = max_width / im.width
                im = im.resize((max_width, int(im.height * ratio)))
            buf = io.BytesIO()
            im.save(buf, format="JPEG", quality=quality, optimize=True)
            out.append(base64.b64encode(buf.getvalue()).decode("ascii"))
        except Exception:
            out.append(b)
    return out


# ── Default IFAB clause references per incident type ───────────────────
# Used when Neo Cortex (LLM) fails to populate `cited_clause` or when the
# heuristic fallback runs. Kept short (~70 chars) so it fits in a single
# UI badge line on the right-rail Analysis panel.
_DEFAULT_CITED_CLAUSE = {
    "offside":   "IFAB Law 11 — Offside (interfering with play / gaining advantage)",
    "handball":  "IFAB Law 12 — Handball (deliberate / unnatural arm position / APP)",
    "foul":      "IFAB Law 12 — Fouls & Misconduct (careless / reckless / excessive force)",
    "penalty":   "IFAB Law 14 — Penalty Kick (direct-FK offence inside the penalty area)",
    "goal_line": "IFAB Law 10 — Goal (whole ball over whole goal line)",
    "red_card":  "IFAB Law 12 — Sending Off (Serious Foul Play / Violent Conduct / DOGSO)",
    "corner":    "IFAB Law 17 — Corner Kick (award + procedure + 1m encroachment)",
    "other":     "VAR Protocol — clear and obvious error / serious missed incident",
}


def _offside_marker_instruction(incident_type: str, n_frames: int) -> str:
    """Inject an explicit, non-optional block into the prompt that forces the
    LLM to populate `offside_markers` for every offside incident with frames
    attached. Without this, GPT silently skips the field and the frontend
    has nothing to draw. Returns '' for non-offside incidents.
    """
    if incident_type != "offside" or n_frames == 0:
        return ""
    return (
        "═══ OFFSIDE LINE MARKERS — NON-NEGOTIABLE ═══\n"
        f"Incident type is OFFSIDE and you have {n_frames} frame(s). You MUST produce "
        f"`offside_markers` with EXACTLY {n_frames} entry/entries — one per frame, in "
        "the order the frames are shown. For EVERY frame:\n"
        "  • `offside_line_x` = horizontal position (0.0 = left edge, 1.0 = right edge "
        "of the image) of the **second-last defender's forward-most body part** at the "
        "moment of the pass. If you can see ANY football action (pitch, players, even "
        "blurry motion), ESTIMATE based on where the defender appears — operators need "
        "a line to calibrate against. This is the AMBER dashed line rendered to the "
        "operator. Only return null if the frame contains genuinely no football "
        "content (stadium exterior, commercials, black frame, colour bars).\n"
        "  • `attacker_x` = horizontal position of the **attacker's forward-most "
        "body part** (usually a knee, chest or shoulder — NOT arms/hands per Law 11). "
        "Same rule: estimate if ANY football action is visible; null only for non-"
        "football frames. This is the CYAN dashed line.\n"
        "  • When estimates are rough (e.g. wide-angle shot, motion blur, partial "
        "occlusion), set both `offside_line_x` and `attacker_x` to your BEST GUESS and "
        "set `verdict: 'unclear'` with a note like 'estimated from wide angle — operator "
        "please verify'. The operator can then drag-calibrate the lines. This is "
        "INFINITELY more useful than returning null, because it shows the operator "
        "what OCTON is seeing.\n"
        "  • `verdict` = 'offside' if attacker_x > offside_line_x by a clear margin "
        "(> 0.01, i.e. > ~1% of image width), 'onside' if attacker_x <= offside_line_x, "
        "else 'unclear' when the estimate has low confidence.\n"
        "  • `daylight_cm` = your best estimate of daylight between the two lines in "
        "centimetres, derived from goalpost/pitch-marking reference scale. Positive "
        "number for offside, negative for onside. Null only when no pitch-scale "
        "reference is visible at all.\n"
        "  • `note` = one short phrase (e.g. 'shoulder past centre-back at pass', "
        "'estimated from wide angle, operator please verify').\n"
        "  • `pitch_angle_deg` (OPTIONAL but recommended) = the perspective "
        "tilt of the goal line in the frame, in degrees, where 0 = vertical "
        "on screen, positive = top of line leans right (broadcast camera "
        "right of midfield), negative = top leans left. Typical broadcast "
        "main-camera angles are between -25 and +25. Estimate from any "
        "visible pitch markings (halfway line, byline, six-yard box, "
        "penalty arc). The frontend will rotate BOTH offside lines by this "
        "angle so they remain parallel to the goal line — without this "
        "value the lines render straight up/down and look 'wrong' on any "
        "broadcast frame. If the frame is a top-down tactical view (rare), "
        "set this to 0.\n"
        "\n"
        "RULE OF THUMB for null vs estimate:\n"
        "  ✓ ESTIMATE (provide numbers, verdict: unclear): grass/pitch visible, "
        "    any player silhouettes visible, any ball visible, a corner/goal/pitch "
        "    line visible → always estimate.\n"
        "  ✗ NULL (set both to null): no pitch at all (stadium exterior, commercial "
        "    break, colour bars, black frame, crowd-only shot).\n"
        "The operator expects dashed lines on every offside review with any football "
        "content and will drag them into place if OCTON's estimate is off. NULL is "
        "the last resort — when in doubt, estimate.\n\n"
    )


def _single_angle_warning(images: list, has_image: bool) -> str:
    """When only 1 frame/angle is available, force Neocortex to prominently
    flag the evidence limitation at the top of `neo_cortex_notes`. This is
    what tells the operator 'I am drawing a conclusion from a single angle;
    consider adding tactical/tight/goal-line before binding the verdict'.
    """
    n = len([i for i in (images or []) if i])
    if n == 0 and not has_image:
        return ""
    if n <= 1:
        return (
            "═══ SINGLE-ANGLE EVIDENCE — MANDATORY CAVEAT ═══\n"
            "Only ONE camera angle is attached to this incident. Your "
            "`neo_cortex_notes` MUST open with EXACTLY the sentence:\n"
            "  '⚠ LIMITED EVIDENCE — single camera angle only. Recommend "
            "loading TACTICAL (high-behind-goal), TIGHT (close-up) and "
            "GOAL-LINE angles before binding the verdict.'\n"
            "Then continue with your caveats. Cap `confidence_score` at 82 "
            "unless the incident is a critical trigger (auto-red, clear "
            "daylight offside > 30cm, ball fully over the line, etc.) — the "
            "referee panel must see that OCTON acknowledges its own "
            "evidence limits.\n\n"
        )
    if n == 2:
        return (
            "═══ TWO-ANGLE EVIDENCE ═══\n"
            "Only 2 camera angles available — good but not complete. In "
            "`neo_cortex_notes`, briefly name which 3rd angle would best "
            "resolve any residual ambiguity (e.g. 'goal-line camera would "
            "confirm the offside line').\n\n"
        )
    return ""


def _default_clause_for(incident_type: str) -> str:
    """Fallback citation when the LLM doesn't populate `cited_clause`."""
    return _DEFAULT_CITED_CLAUSE.get(incident_type, _DEFAULT_CITED_CLAUSE["other"])


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
                "red card", "serious", "violent", "violently", "dangerous", "reckless",
                "excessive force", "straight red", "studs up", "studs-up", "stamp",
                "stamped", "stamping", "two-footed", "two footed", "over the top",
                "follow-through", "follow through", "high boot", "shin", "ankle",
                "elbow", "elbowed", "head butt", "headbutt", "headbutted", "spitting",
                "spat", "spit", "punched", "punch", "kicked out", "kicked-out",
                "dogso", "last man", "denied goal scoring", "brutal", "endangered safety",
                "off the ball", "off-the-ball", "violent conduct", "shoved", "shove",
                "pushed", "grabbed", "confronted", "confrontation", "aggression",
                "aggressive", "attacked", "assaulted", "referee", "official",
                "linesman", "assistant referee", "fourth official", "pushed referee",
                "shoved referee", "grabbed referee", "howled", "screamed at",
                "head-high", "scissor tackle",
            ],
            "negative_keywords": ["first offence", "minor", "accidental", "attempt to play ball", "won the ball", "fair challenge"],
            "common_decisions": [
                "Red Card - Violent Conduct",
                "Red Card - Serious Foul Play",
                "Red Card - Denying Obvious Goal-Scoring Opportunity",
                "Yellow Card - Reckless but Not Excessive",
            ],
            "severity_weight": 0.88,
            "base_confidence": 58.0,
        },
        "other": {
            "keywords": [],
            "negative_keywords": [],
            "common_decisions": ["Review Required"],
            "severity_weight": 0.50,
            "base_confidence": 40.0,
        },
        "corner": {
            "keywords": [
                "corner", "corner kick", "corner flag", "quadrant",
                "last touch", "last touched", "deflected off", "deflection",
                "out of play", "crossed the byline", "goal line out",
                "awarded corner", "wrongly awarded", "should be goal kick",
                "encroachment", "encroached", "inside the arc",
                "block", "blocking", "impeding", "screening",
                "short corner", "swung in", "inswinger", "outswinger",
                "near post", "far post", "flick on", "header from corner",
                "whipped in", "delivered from the corner",
            ],
            "negative_keywords": [
                "throw-in", "free kick", "penalty area infringement unrelated",
            ],
            "common_decisions": [
                "Legal Corner Kick — Last Touch Defender",
                "Goal Kick — Last Touch Attacker",
                "Retake — Encroachment Inside 1m",
                "Corner Stands — No Infringement",
            ],
            "severity_weight": 0.70,
            "base_confidence": 55.0,
        },
    }

    # ── Critical red-card triggers ──
    # When the description explicitly mentions any of these, IFAB Law 12 is
    # not discretionary — confidence must floor at 88 % and the verdict is fixed.
    #
    # Each trigger is either:
    #   ("name", ["phrase_list"], "decision")                                 → any phrase present
    #   ("name", {"any": [...], "plus_any": [...]}, "decision")               → combo: at least one from each list
    CRITICAL_RED_TRIGGERS = [
        # Physical contact / aggression toward a match official (automatic violent conduct).
        # Combo detector: an aggression verb *somewhere* in the description AND a match-official
        # target *somewhere* in the description (not necessarily contiguous).
        ("referee_contact", {
            "any": [
                "pushed", "push ", "shoved", "shove ", "grabbed", "grab ",
                "struck", "strike ", "hit ", "punched", "punch ", "kicked",
                "headbutt", "head-butt", "head butt", "elbowed", "elbow ",
                "spat at", "spat on", "spit at", "spit on",
                "attacked", "assault", "assaulted", "confront", "confronted",
                "aggression", "aggressive", "violence against", "violently",
                "howled", "charged at", "rushed at",
            ],
            "plus_any": [
                "referee", "the ref ", "ref.", " ref,", " ref ",
                "official", "officials", "linesman", "assistant referee",
                "assistant ref", "4th official", "fourth official",
                "var official", "match official",
            ],
        }, "Red Card - Violent Conduct (Referee Contact)"),
        # Spitting at an opponent or any other person.
        ("spitting", [
            "spat at", "spat on", "spit at", "spit on", "spitting at", "spitting on",
        ], "Red Card - Violent Conduct (Spitting)"),
        # Stamping.
        ("stamping", [
            "stamped on", "stamping on", "stamp on", "stamped down",
        ], "Red Card - Serious Foul Play (Stamping)"),
        # Punch / strike off the ball.
        ("off_ball_strike", [
            "struck off the ball", "struck an opponent", "struck the opponent",
            "punched opponent", "punched the opponent",
            "elbowed opponent", "elbowed the opponent", "elbowed the centre-back",
            "elbowed the defender", "elbowed in the face",
            "headbutted", "head-butted", "head butted",
        ], "Red Card - Violent Conduct"),
        # Two-footed / scissor tackle — serious foul play.
        ("two_footed", [
            "two-footed lunge", "two footed lunge", "scissor tackle",
            "studs up over the top", "over-the-top studs",
        ], "Red Card - Serious Foul Play"),
        # Explicit "straight red" / "red card" mention with clear facts.
        ("explicit_red", [
            "straight red", "direct red", "sent off",
        ], "Red Card - Serious Foul Play"),
    ]

    def _check_critical_triggers(self, desc_lower: str):
        """Return (trigger_name, fixed_decision, matched_phrase) or None."""
        for name, rule, decision in self.CRITICAL_RED_TRIGGERS:
            if isinstance(rule, dict):
                hit_any = next((p for p in rule["any"] if p in desc_lower), None)
                hit_plus = next((p for p in rule["plus_any"] if p in desc_lower), None)
                if hit_any and hit_plus:
                    return name, decision, f"{hit_any.strip()} + {hit_plus.strip()}"
            else:
                for p in rule:
                    if p in desc_lower:
                        return name, decision, p
        return None

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

        # ── Critical red-card trigger overrides ──
        # When the description explicitly asserts an offence that IFAB leaves
        # no discretion on (contact with an official, spitting, stamping,
        # off-ball strike), Hippocampus floors confidence at 88 % and locks
        # the initial decision. Only applied when incident_type is red_card
        # (or when triggers fire under a mis-tagged 'foul'/'other').
        critical_trigger = None
        if incident_type in ("red_card", "foul", "other"):
            critical_trigger = self._check_critical_triggers(desc_lower)
            if critical_trigger is not None:
                confidence = max(confidence, 88.0)

        # Decision: if critical trigger fires, use its fixed decision.
        if critical_trigger is not None:
            _, fixed_decision, _ = critical_trigger
            initial_decision = fixed_decision
        # Decision: if negatives outweigh positives, flip to conservative option
        elif negative_score > keyword_score and len(pattern["common_decisions"]) > 1:
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
            "critical_trigger": critical_trigger[0] if critical_trigger else None,
            "critical_trigger_phrase": critical_trigger[2] if critical_trigger else None,
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
            "IFAB LAW 11 — OFFSIDE (Verbatim & Casebook)\n"
            "POSITION: A player is in an offside position if any part of the head, body or feet is "
            "(a) in the opponents' half (excluding the halfway line) AND (b) nearer to the opponents' "
            "goal line than BOTH the ball and the second-last opponent. Hands and arms (up to the bottom "
            "of the armpit) are not considered for offside.\n"
            "OFFENCE: Being in an offside position is NOT itself an offence. An offside OFFENCE occurs at "
            "the moment the ball is played/touched by a teammate AND the offside player either:\n"
            "  (i)  interferes with PLAY by playing/touching a ball passed/touched by a teammate;\n"
            "  (ii) interferes with an OPPONENT by preventing them from playing/being able to play the ball "
            "       by clearly obstructing their line of vision or making an obvious action which clearly "
            "       impacts the opponent's ability to play the ball;\n"
            "  (iii) gains an ADVANTAGE by playing the ball or interfering with an opponent when it has "
            "       (a) rebounded/deflected off the goalpost, crossbar, match official or an opponent, "
            "       (b) been deliberately saved by any opponent.\n"
            "DELIBERATE PLAY: A 'deliberate play' by a defender (not a save, not a deflection) RESETS offside. "
            "IFAB 2022 clarification: a defender's deliberate play is when they have control of the ball, with "
            "time/space to (a) pass it to a teammate, (b) gain possession, (c) clear it. A reflex/stretch/lunge "
            "is NOT a deliberate play.\n"
            "EXCEPTIONS: Player is NOT offside from a goal kick, throw-in, or corner kick.\n"
            "VAR THRESHOLD: Tight (within boot/torso width) = LOW confidence (60-75); semi-automated lines "
            "available = HIGH confidence; daylight (>30cm clear) beyond second-last defender = VERY HIGH "
            "confidence (90+). Frame the decision at the EXACT moment of the kick/touch, not when the receiver "
            "controls the ball.\n"
            "2025-26 UPDATES (IFAB Laws of the Game 2025/26, in force 1 July 2025):\n"
            "  • SEMI-AUTOMATED OFFSIDE TECHNOLOGY (SAOT) is now the standard in elite competitions — "
            "    average offside check time down to ~12 s; decision time down 27 s per event. When SAOT "
            "    data is indicated in the description, treat the line as binary — confidence floor 95.\n"
            "  • Law 11 clarification: for an offside offence from a GOALKEEPER THROW, the OFFSIDE LINE is "
            "    now judged at the LAST POINT OF CONTACT between the goalkeeper's hand and the ball "
            "    (not at the moment of release)."
        ),
        "handball": (
            "IFAB LAW 12 — HANDBALL (Verbatim & Casebook, 2023 update)\n"
            "OFFENCE — it is an offence if a player:\n"
            "  (a) DELIBERATELY touches the ball with their hand/arm — including moving the hand/arm towards "
            "      the ball;\n"
            "  (b) gains POSSESSION/CONTROL of the ball after it has touched their hand/arm and then SCORES "
            "      in the opponents' goal, or CREATES a goal-scoring opportunity (these are the 'APP' — "
            "      Attacking Possession Phase — sub-clauses, applied to the immediate scorer/creator only);\n"
            "  (c) scores in the opponents' goal directly from their hand/arm, even if accidental (the goalkeeper "
            "      is included for shots scored by them);\n"
            "  (d) touches the ball with their hand/arm when it has made the body UNNATURALLY BIGGER — the player "
            "      is considered to have made their body unnaturally bigger when the position of the hand/arm is "
            "      not a consequence of, or justifiable by, the body's movement for that specific situation;\n"
            "  (e) touches the ball with hand/arm when the hand/arm is ABOVE/BEYOND SHOULDER LEVEL (unless the "
            "      player deliberately plays the ball which then touches their hand/arm).\n"
            "NOT AN OFFENCE — it is NOT handball if the ball touches a player's hand/arm:\n"
            "  • DIRECTLY from their own head/body/foot or from the head/body/foot of a nearby player;\n"
            "  • when the hand/arm is close to the body and has NOT made the body unnaturally bigger;\n"
            "  • when the player is falling and the hand/arm is between the body and the ground to support "
            "    the body, but not extended laterally/vertically away from the body.\n"
            "GOALKEEPER: outside their own penalty area is judged like any outfield player. Inside, the "
            "goalkeeper cannot handle (a) a deliberate kick by a teammate, (b) a deliberate throw-in by a "
            "teammate (Law 12.2 backpass) — indirect free kick.\n"
            "KEY DISTINCTION: BALL-TO-HAND vs HAND-TO-BALL. Natural arm position by the side = usually no "
            "offence. Arm extended away from body (silhouette larger than the body) = unnatural = offence.\n"
            "VAR THRESHOLD: Deliberate handle (hand moves to ball) = >= 90 confidence. Unnatural-position handle "
            "(arm extended) = 80-90. APP (deflected handle then goal/assist immediately after) = 85-95. "
            "Ball-to-hand in natural position = clear NO handball, 90+ confidence."
        ),
        "foul": (
            "IFAB LAW 12 — FOULS & MISCONDUCT (Verbatim & Casebook)\n"
            "DIRECT FREE KICK is awarded if a player commits any of the following against an opponent in a "
            "manner considered by the referee to be CARELESS, RECKLESS or USING EXCESSIVE FORCE:\n"
            "  • charges  • jumps at  • kicks/attempts to kick  • pushes  • strikes/attempts to strike "
            "    (including head-butts)  • tackles or challenges  • trips/attempts to trip.\n"
            "Direct free kick is also awarded for: HOLDING, IMPEDING with contact, SPITTING/biting/throwing, "
            "or DELIBERATE handball.\n"
            "DEGREE OF FORCE — three escalating tiers (this is the BACKBONE of the foul vs card decision):\n"
            "  (1) CARELESS — the player shows lack of attention/consideration. NO disciplinary sanction needed.\n"
            "  (2) RECKLESS — the player acts with disregard to the danger to, or consequences for, an opponent. "
            "      Mandatory CAUTION (yellow card).\n"
            "  (3) EXCESSIVE FORCE — the player exceeds the necessary use of force and endangers the safety of "
            "      an opponent. Mandatory SENDING-OFF (red card) — Serious Foul Play.\n"
            "INDIRECT FREE KICK for: dangerous play (no contact), impeding (no contact), preventing the GK "
            "releasing the ball, dissent, simulation.\n"
            "CARDS — yellow for: unsporting behaviour, dissent, persistent infringement, delaying restart, "
            "breaking distance at restart, entering/leaving without permission. Red for: serious foul play, "
            "violent conduct, spitting/biting, DOGSO by foul/handball, offensive language, second yellow.\n"
            "VAR REVIEWABLE: only goal-affecting fouls, penalty fouls, direct red-card fouls, mistaken identity. "
            "VAR threshold = 'clear and obvious error', NOT a re-refereeing of every foul.\n"
            "ASSESS: Was there genuine attempt to play the ball? Point of contact (shin/ankle/chest/face)? "
            "Speed of the challenge? Studs visible? Two-footed? Over-the-top? Off-the-ball?\n"
            "\n"
            "═══ DOGSO / SPA FRAMEWORK — fouls in front of goal (Law 12, structured) ═══\n"
            "DOGSO = Denying an Obvious Goal-Scoring Opportunity. Walk through ALL FOUR 'D's '\n"
            "before classifying as DOGSO — every D must be present:\n"
            "  • DISTANCE between offence and goal (closer = stronger DOGSO)\n"
            "  • DIRECTION of play (towards goal, not parallel/away)\n"
            "  • DEFENDERS — number/position between attacker and goal (typically only the GK to beat)\n"
            "  • DIFFICULTY/likelihood the attacker would have kept or gained possession\n"
            "If any D is missing → it is at most SPA (Stopping a Promising Attack), NOT DOGSO.\n"
            "\n"
            "SANCTION TABLE — the SINGLE MOST IMPORTANT decision for fouls in/near the box:\n"
            "  ┌─────────────────────────────────────────────────────┬─────────────────────────┐\n"
            "  │ Where + type of foul                                │ Verdict                 │\n"
            "  ├─────────────────────────────────────────────────────┼─────────────────────────┤\n"
            "  │ DOGSO outside the penalty area (any kind of foul)   │ RED CARD + free kick    │\n"
            "  │ DOGSO inside box, GENUINE attempt to play the ball  │ YELLOW + PENALTY        │\n"
            "  │   (slide tackle, mistimed challenge that hits ball- │   (double-jeopardy      │\n"
            "  │    player, etc.)                                    │    relief — IFAB 2016)  │\n"
            "  │ DOGSO inside box, NO attempt (hold, shirt-pull,     │ RED CARD + PENALTY      │\n"
            "  │   body-block, deliberate handball, off-ball foul)   │   (full sanction)       │\n"
            "  │ SPA outside the penalty area                        │ YELLOW + free kick      │\n"
            "  │ SPA inside box, GENUINE attempt to play the ball    │ NO CARD + PENALTY       │\n"
            "  │   (e.g. legitimate slide that catches attacker last)│                         │\n"
            "  │ SPA inside box, NO attempt to play the ball         │ YELLOW + PENALTY        │\n"
            "  │ DOGSO + advantage played → goal scored (2025/26)    │ Goal stands, NO card    │\n"
            "  │ Off-the-ball foul on attacker in box                │ DOGSO test on the       │\n"
            "  │   (e.g. blocking attacker behind play)              │   blocked player +      │\n"
            "  │                                                     │   penalty + red/yellow  │\n"
            "  │   Foul on GK while GK controls/releases the ball    │ INDIRECT FREE KICK      │\n"
            "  │     (IFK against attacker, no card unless reckless) │   to defending team     │\n"
            "  │ Last-defender slide that wins the ball CLEANLY      │ NO foul, NO card        │\n"
            "  │   (no follow-through contact)                       │                         │\n"
            "  └─────────────────────────────────────────────────────┴─────────────────────────┘\n"
            "When the description includes phrases like 'slid for the ball', 'got a touch on the ball', "
            "'attempt to play the ball', the GENUINE-ATTEMPT row applies → YELLOW + PENALTY (NOT red). "
            "When the description includes 'shirt-pull', 'wrestled', 'held', 'pushed in the back', "
            "'no attempt at the ball', or 'off the ball', the NO-ATTEMPT row applies → RED + PENALTY. "
            "Always cite the row name in the reasoning so the verdict is auditable.\n"
            "\n"
            "GOALKEEPER-SPECIFIC near goal:\n"
            "  • GK is afforded extra protection while controlling/about-to-release the ball — clattering "
            "    into the GK with no genuine play-the-ball attempt = IFK to defenders (Law 12.2). \n"
            "  • Charge on GK who has clearly distributed = ordinary foul, judged on merits.\n"
            "  • Knocking the ball out of GK's hands = IFK to GK's team.\n"
            "\n"
            "SIMULATION near or inside the box (Law 12.3):\n"
            "  • Clear dive with NO contact → mandatory yellow + IFK to defending team. "
            "    NEVER a penalty.\n"
            "  • Where a player initiates contact with a defender (e.g. throws their leg into a "
            "    defender's standing leg) → simulation, no penalty, yellow.\n"
            "\n"
            "2025-26 UPDATES (IFAB Laws of the Game 2025/26, in force 1 July 2025):\n"
            "  • GOALKEEPER 8-SECOND RULE: a goalkeeper who controls the ball with the hands for more than "
            "    8 seconds is now penalised by a CORNER KICK to the opposing team (replacing the old "
            "    indirect free-kick). The referee signals a visible 5-second countdown before the 8s "
            "    deadline. Verdict for this incident = 'Corner Kick — Goalkeeper 8-Second Violation'.\n"
            "  • SIMULATION / DECEPTION: stronger action — any clear act of simulation is a MANDATORY "
            "    CAUTION (yellow card). No advantage / replay available for the pretend-fouled player.\n"
            "  • DOGSO CAUTION-ON-ADVANTAGE: when a foul that denied a goal-scoring opportunity occurs but "
            "    the referee PLAYS ADVANTAGE and the attacking team SCORES, the caution/red for DOGSO is "
            "    NO LONGER issued (just the goal stands). If the advantage does not result in a goal, "
            "    the original DOGSO sanction applies.\n"
            "  • HOLDING OFFENCE RECOGNITION (2025/26): stronger enforcement of shirt-pulling / body-block "
            "    holds at set-pieces — VAR is now permitted to intervene for penalty-area holding that "
            "    directly denies a clear goal-scoring chance."
        ),
        "penalty": (
            "IFAB LAW 14 — PENALTY KICK (Verbatim & Casebook)\n"
            "AWARDED: when a defending player commits any direct-free-kick offence (Law 12) INSIDE their own "
            "penalty area, regardless of where the ball is, provided the ball is in play.\n"
            "TRIGGER OFFENCES inside the area: trip, kick, jump at, charge, strike, push, hold, impede with "
            "contact, deliberate handball, tackle from behind that contacts player before ball, sliding tackle "
            "that makes contact with the player and not the ball.\n"
            "PROCEDURE: ball placed on penalty mark, taker identified, GK on goal line between posts facing kicker "
            "with at least part of one foot touching/in line with goal line until ball is kicked. All other players "
            "outside the penalty area, behind the penalty mark, at least 9.15 m (10 yds) from the mark.\n"
            "ENCROACHMENT (2019/2024 update):\n"
            "  • If a defender encroaches and goal is scored → goal stands.\n"
            "  • If a defender encroaches and the kick is missed/saved → retake.\n"
            "  • If an attacker encroaches and goal is scored → retake.\n"
            "  • If both encroach → retake regardless of outcome.\n"
            "  • Goalkeeper off the line at moment of kick AND save/miss → retake + caution to GK.\n"
            "DOGSO IN PENALTY AREA: when the foul was a genuine attempt to play the ball, sanction is YELLOW + "
            "penalty (the 'triple-punishment' was reduced in 2016). If the foul was NOT an attempt to play the "
            "ball (e.g. shirt pull, body block, deliberate handball) → RED + penalty.\n"
            "SIMULATION: deliberate attempt to deceive the referee by feigning injury or pretending to be fouled "
            "= caution (Law 12.3), NO penalty.\n"
            "VAR THRESHOLD: clear and obvious. Soft contact with both players going to ground = referee discretion. "
            "Clear trip / shirt-pull / arm-extended handball inside the box = >= 90 confidence.\n"
            "2025-26 UPDATES (IFAB Laws of the Game 2025/26, in force 1 July 2025):\n"
            "  • ACCIDENTAL DOUBLE-TOUCH CLARIFICATION: if the penalty kicker inadvertently double-touches "
            "    the ball (e.g. slipping while striking) AND the kick is SCORED, the goal is disallowed "
            "    and the kick is RETAKEN (not an indirect free-kick, as the double-touch is deemed "
            "    unintentional). If the double-touch was deliberate, the original 'indirect free-kick "
            "    to defending team' sanction still applies. Verdict = 'Retake — Accidental Double-Touch'.\n"
            "  • Assistant referees now position on the touchline IN LINE WITH THE PENALTY MARK (the "
            "    offside line) during penalties, since VAR handles goal/no-goal and GK encroachment."
        ),
        "goal_line": (
            "IFAB LAW 10 — DETERMINING THE OUTCOME OF A MATCH (Goal/No-Goal)\n"
            "GOAL: The whole of the ball must pass over the whole of the goal line, between the goalposts and "
            "under the crossbar, provided no offence has been committed by the team scoring the goal.\n"
            "GOAL-LINE TECHNOLOGY (GLT): provides definitive binary signal to the referee's watch within 1 second. "
            "Where GLT is used, no further VAR review is needed.\n"
            "VAR ROLE: when GLT is unavailable, VAR uses synchronised camera angles. The decision must be "
            "millimetre-accurate: if ANY part of the ball is on or above the line, it is NOT a goal.\n"
            "RELATED CHECKS: VAR must also verify (a) no attacking foul in the build-up, (b) no offside, "
            "(c) ball did not go out of play in the immediate phase, (d) no handball in the APP.\n"
            "VAR THRESHOLD: GLT = 99 confidence. Synchronised multi-cam clear ball over line = 95+. "
            "One angle inconclusive = stay with on-field decision."
        ),
        "red_card": (
            "IFAB LAW 12 — SENDING-OFF OFFENCES (Verbatim, 7 categories)\n"
            "A player, substitute or substituted player is sent off if they commit any of the following:\n"
            "1) SERIOUS FOUL PLAY — a tackle/challenge that uses excessive force or brutality and endangers the "
            "safety of an opponent. Indicators: studs up, over-the-top, two-footed lunge, high boot into head/"
            "chest/neck, stamping with full bodyweight, scissors challenge from behind. Distinct from a normal "
            "yellow-card foul by the FORCE EXCEEDING what was needed.\n"
            "2) VIOLENT CONDUCT — when not challenging for the ball, any use OR ATTEMPT of excessive force or "
            "brutality against an opponent OR ANY other person (team-mate, official, spectator, coach). Includes "
            "punching, elbowing, head-butting, kicking out, pushing, shoving, grabbing, striking. The act does "
            "NOT need to result in injury for it to be VC.\n"
            "3) PHYSICAL CONTACT WITH A MATCH OFFICIAL — ANY deliberate physical contact with a referee, AR, 4th "
            "official or VAR official (push, shove, grab, strike, headbutt, kick) is automatic VIOLENT CONDUCT — "
            "STRAIGHT RED CARD with NO discretion. Confidence floor: 92.\n"
            "4) SPITTING at any person — automatic red.\n"
            "5) DOGSO — Denying an Obvious Goal-Scoring Opportunity. Four-criteria checklist (ALL must apply):\n"
            "    (a) Distance between offence and goal\n"
            "    (b) General direction of play\n"
            "    (c) Likelihood of keeping/gaining control of the ball\n"
            "    (d) Location and number of defenders.\n"
            "   DOGSO outside the penalty area = red. DOGSO inside the area = red ONLY if NOT an attempt to "
            "   play the ball (handball, holding, body-block); a genuine challenge inside the area = yellow + penalty.\n"
            "6) OFFENSIVE / INSULTING / THREATENING LANGUAGE or GESTURES — including racist, discriminatory or "
            "abusive remarks. Single instance is enough.\n"
            "7) RECEIVING A SECOND CAUTION (yellow → second yellow → red) in the same match.\n"
            "BINDING IFAB POSITION ON 'CLEAR AND OBVIOUS': the VAR threshold is intended for ambiguous "
            "incidents. When the description unambiguously asserts a sending-off offence above, the law is "
            "applied directly — the on-field 'soft' decision is overridden. Confidence MUST be >= 92."
        ),
        "corner": (
            "IFAB LAW 17 — THE CORNER KICK (Verbatim-faithful)\n"
            "AWARD: A corner kick is awarded when the WHOLE of the ball — having last been touched by a "
            "defending team player — passes over the goal line (on the ground or in the air) without a "
            "goal having been scored. If the ball was last touched by an attacker, the restart is a GOAL "
            "KICK, not a corner.\n"
            "PROCEDURE: The ball must be placed inside the corner arc nearest to where the ball crossed "
            "the goal line. The corner flag-post must not be moved. The ball is in play when it is kicked "
            "and clearly moves — it does not need to leave the corner arc.\n"
            "OPPONENT DISTANCE: Opponents must remain at least 1 metre (1 yard) from the corner arc until "
            "the ball is in play. Encroachment inside 1 m → retake the corner; repeated offenders are "
            "cautioned.\n"
            "OFFSIDE: A player cannot be in an offside position directly from a corner kick (Law 11).\n"
            "RETAKE triggers: (a) ball not placed correctly in the arc, (b) kicker plays the ball twice "
            "before another player touches it (indirect free-kick to the defending team), (c) opponent "
            "encroachment under 1 m that influences play.\n"
            "DEFENSIVE INFRINGEMENTS commonly reviewed by VAR: (i) blocking/holding/pulling inside the "
            "penalty area at the moment the ball is delivered → penalty if it denies a clear chance; "
            "(ii) goalkeeper impeded by a screen → free kick or penalty depending on where the screen is.\n"
            "VAR THRESHOLD: corner-vs-goal-kick decisions are reviewable only when they lead directly to "
            "a goal. Award-direction errors with no goal fallout stay with the on-field decision. "
            "Encroachment without impact on play = no retake.\n"
            "CONFIDENCE FLOORS (textbook cases):\n"
            "  • Clear defender last touch before ball exits byline → 92+ (legal corner)\n"
            "  • Clear attacker last touch / own shot deflected wide by defender only off the attacker → "
            "    88+ (goal kick)\n"
            "  • Multiple defenders blocking keeper at delivery → 85+ (retake / foul)\n"
            "  • Subjective last touch (multiple deflections, boot-on-boot) → 55-70 (stay with on-field)."
        ),
        "other": (
            "VAR PROTOCOL (IFAB Law VI / VAR Handbook)\n"
            "VAR may intervene ONLY for clear and obvious errors or serious missed incidents in four "
            "MATCH-CHANGING categories:\n"
            "  (1) GOAL / NO GOAL — including offside, foul, handball, ball-out-of-play, encroachment in "
            "      the Attacking Possession Phase (APP);\n"
            "  (2) PENALTY / NO PENALTY — including ball-out-of-play in the APP, offside, foul outside the "
            "      area mistaken for inside (and vice-versa);\n"
            "  (3) DIRECT RED CARD (NOT a second yellow);\n"
            "  (4) MISTAKEN IDENTITY (when the referee cautions/sends off the wrong player).\n"
            "PROTOCOL: VAR checks every reviewable incident silently. If a clear and obvious error is detected, "
            "VAR recommends the referee (a) accept VAR's information, (b) review the footage on the pitch-side "
            "monitor (OFR — On-Field Review). The final decision is always the referee's.\n"
            "THRESHOLD: 'clear and obvious error'. Subjective interpretation matters of degree (was it careless "
            "or reckless?) generally stay with the on-field decision unless the on-field call was clearly wrong.\n"
            "2025-26 UPDATES (IFAB Laws of the Game 2025/26, in force 1 July 2025) — EXPANDED VAR SCOPE:\n"
            "  • VAR may now intervene for SECOND YELLOW CARDS when the second caution was CLEARLY wrong "
            "    (the direct-red restriction has been relaxed for this specific error type).\n"
            "  • VAR may intervene for MISTAKEN IDENTITY in RED OR YELLOW cards (previously red only).\n"
            "  • VAR may intervene for CLEARLY WRONG CORNER KICK awards, BUT only if review is immediate "
            "    (i.e. before the next phase of play) — to preserve match flow.\n"
            "  • REFEREE ANNOUNCEMENTS: competitions may opt in for the referee to announce the VAR "
            "    decision over the stadium PA after a review or lengthy check (transparency feature).\n"
            "  • Optional body cameras for referees and 'captains-only' approach for dissent are trialled."
        ),
    }

    async def analyze(
        self,
        incident_type: str,
        description: str,
        hippocampus_result: Dict,
        historical_context: str = "",
        precedent_block: str = "",
        has_image: bool = False,
        image_base64: Optional[str] = None,
        extra_images_b64: Optional[list] = None,
    ) -> Dict:
        """Deep analysis with full reasoning via GPT-5.2.

        When `extra_images_b64` is non-empty, Neo Cortex receives a
        multi-image vision payload. The LLM is told which camera angle
        each image came from (in slot order: broadcast, tactical, tight,
        goal-line) so it can cross-reference angles in its reasoning.
        """
        start = time.time()
        extra_images_b64 = [b for b in (extra_images_b64 or []) if b]

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
                    "You are the Neo Cortex module of OCTON VAR, an elite forensic VAR analyst. "
                    "CRITICAL BOUNDARY: Do NOT name any individuals (architects, designers, "
                    "operators, users) in your reasoning, cited_clause, key_factors, "
                    "neo_cortex_notes, or frame_breakdown. Your output is referee-grade analysis — "
                    "keep it strictly about (1) the laws of the game, (2) the observed evidence, "
                    "(3) cited precedents by team-names and dates, and (4) the final verdict.\n\n"
                    "YOUR ROLE: Make accurate VAR decisions by applying IFAB Laws of the Game precisely.\n\n"
                    "CRITICAL RULES:\n"
                    "- You MUST apply the specific law relevant to the incident type\n"
                    "- Do NOT default to the Hippocampus suggestion - independently evaluate\n"
                    "- Consider ALL evidence: description details, context, player positions, intent\n"
                    "- Confidence score must reflect actual certainty: 90+ only for clear-cut cases\n"
                    "- 60-75 for borderline cases that could go either way\n"
                    "- Below 50 means you're genuinely uncertain\n"
                    "- The VAR 'clear and obvious error' threshold applies ONLY to ambiguous incidents. "
                    "When the description explicitly asserts an offence (studs up, excessive force, contact "
                    "with a match official, spitting, stamping, off-ball strike), apply the law directly — "
                    "do NOT hedge, do NOT defer to 'on-field decision stands'. Confidence must be >= 92 %.\n\n"
                    "CONFIDENCE-FLOOR FOR TEXTBOOK IFAB CLAUSES (NEW — anti-hedging):\n"
                    "When the operator's description matches a verbatim IFAB clause from the LAW REFERENCE "
                    "block (handball with arm above shoulder, attacker offside with daylight, hold/push inside "
                    "the area, DOGSO 4-criteria checklist met, two-footed lunge, etc.), you are NOT making a "
                    "subjective call — you are applying settled law. Confidence MUST be >= 88 in these cases. "
                    "Hedging to 60-70 on a textbook application is WRONG and dilutes referee trust in the system.\n"
                    "  • Daylight offside (>30 cm clear) → 92+\n"
                    "  • Arm extended above shoulder + ball contact → 90+\n"
                    "  • Trip/hold/push inside area, no ball contact → 92+\n"
                    "  • Stud-up over-the-top tackle → 96+\n"
                    "  • Ball wholly over goal line on synced multi-cam → 96+\n"
                    "  • Contact with match official → 95+ (and floored at 92 by engine)\n\n"
                    "DECISION ACCURACY GUIDELINES:\n"
                    "- For OFFSIDE: focus on the exact moment the ball is played, not when received. "
                    "Consider which body parts are offside. Marginal = suggest on-field decision stands.\n"
                    "- For HANDBALL: distinguish ball-to-hand vs hand-to-ball. Natural position matters. "
                    "Arm tucked in = usually no handball. Arm extended/raised = likely handball.\n"
                    "- For FOULS: assess genuine attempt to play ball, force used, point of contact, "
                    "and whether it stopped a promising attack (yellow) or DOGSO (red).\n"
                    "- For PENALTIES: same as fouls but MUST be inside the penalty area. Check for simulation.\n"
                    "- For RED CARDS: distinguish serious foul play (excessive force) from normal fouls. "
                    "Not every bad tackle is a red card. Studs up + excessive force + endangered safety = red. "
                    "ALWAYS-RED TRIGGERS (no discretion, confidence >= 92 %): any physical contact with a "
                    "match official (push, shove, grab, strike, headbutt, kick, spit); spitting at any person; "
                    "stamping; off-ball punch/elbow/headbutt; two-footed over-the-top lunge. These override "
                    "the 'on-field stands' heuristic.\n"
                    "- For GOAL LINE: the WHOLE ball must cross the WHOLE line. Any doubt = no goal.\n\n"
                    "BIAS FIREWALL (CRITICAL):\n"
                    "- You are provided game history and player/team data for CONTEXT ONLY\n"
                    "- NEVER let a player's reputation, team status, or past incidents influence THIS decision\n"
                    "- A foul by a star player is the same as a foul by any other player\n"
                    "- Historical data informs PATTERNS (e.g., how similar incidents were resolved) but "
                    "must NOT create prejudice against specific players or teams\n"
                    "- Judge ONLY the facts of THIS specific incident as described\n"
                    "- If the description mentions a player's name, evaluate the ACTION not the PERSON\n"
                    "- Use precedents to understand how the laws are typically applied, not to assume guilt\n\n"
                    "DEPTH OF ANALYSIS — FORENSIC FIVE-SECTION REASONING (MANDATORY):\n"
                    "Your `reasoning` field MUST contain FIVE distinct sections, each prefixed by its "
                    "exact §-header below. Operators read this on big-screen displays in the VAR booth — "
                    "thin reasoning destroys their trust. Every section is REQUIRED. Minimum section "
                    "lengths are HARD FLOORS — the referee panel will mark verdicts as weak if you "
                    "write less. Use plain declarative sentences; avoid hedging filler.\n"
                    "\n"
                    "  §1 EVIDENCE ASSESSMENT (≥ 3 sentences) — what is actually visible/described. "
                    "       Frame-by-frame when multi-frame video is provided. Call out body parts, "
                    "       contact points, distances in cm where estimable, angles, ball position "
                    "       relative to the penalty spot / goal line / touchline. State explicitly "
                    "       what is NOT visible (occlusion, off-camera, motion blur, frame rate). If "
                    "       only one angle is available, open this section with the exact phrase "
                    "       '⚠ LIMITED EVIDENCE — single camera angle only.'\n"
                    "  §2 LAW APPLICATION (≥ 4 sentences) — name the exact IFAB law (e.g. 'Law 12 "
                    "       §1 Direct FK offences') and walk through how the facts in §1 map onto "
                    "       the legal test. For DOGSO-class incidents you MUST work through the "
                    "       4-D's (Distance/Direction/Defenders/Difficulty) one by one, stating "
                    "       which D's are met. For handball, apply the 2021 Law 12.1 test: deliberate, "
                    "       unnatural arm position, or arm above shoulder. For offside, identify the "
                    "       exact moment-of-pass and cite Law 11 offside offences (interfering with "
                    "       play / with an opponent / gaining an advantage).\n"
                    "  §3 PRECEDENT CROSS-REFERENCE (≥ 2 sentences) — cite the most relevant 1-2 "
                    "       precedents from the supplied corpus by team-names + date + referee where "
                    "       listed. Note whether the precedent is FRESH (last 7 days) / RECENT "
                    "       (last 30 days) / CANON (older settled). Explain how the precedent's "
                    "       ruling guides — or does NOT guide — this decision (e.g. fact-divergence "
                    "       material). If no precedents supplied, say 'No directly comparable "
                    "       precedent in corpus; applying first-principles IFAB interpretation.'\n"
                    "  §4 VAR THRESHOLD TEST (≥ 2 sentences) — explicitly answer: 'Is there a clear "
                    "       and obvious error on the on-field decision?'. If yes, state which of the "
                    "       4 VAR-reviewable categories applies (goal/no-goal, penalty/no-penalty, "
                    "       direct red, mistaken identity) and the 2025/26 expanded categories "
                    "       (2nd yellow, wrong corner, holding in box). If no, recommend on-field "
                    "       decision stands and explain why the subjective-interpretation margin "
                    "       does NOT meet the clear-and-obvious bar.\n"
                    "  §5 FINAL DETERMINATION (≥ 2 sentences) — verdict + sanction in one sentence, "
                    "       then a 1-2 line confidence justification naming the specific factors "
                    "       that justify the confidence band (e.g. 'Confidence 92 because daylight "
                    "       offside is a textbook IFAB clause AND supporting precedent from 2025-10 "
                    "       PL week 9 matches'). For fouls in the box, name the row of the DOGSO/"
                    "       SPA sanction table you used.\n"
                    "\n"
                    "SCIENTIFIC RIGOUR STANDARDS (failure = weak verdict):\n"
                    "- Every assertion in §1 must be anchored to a visible pixel or the written "
                    "description — if you cannot point to the evidence, do not assert it.\n"
                    "- Every sentence in §2 must reference either an IFAB clause number OR a named "
                    "test (4-Ds, Law 12.1 handball test, Law 11 offside offences).\n"
                    "- Cite precedents by CONCRETE match identity (teams + date), never as "
                    "'per precedent #1' or 'a similar case'. Named citations are infinitely more "
                    "persuasive to on-field officials.\n"
                    "- CRITICAL: do NOT name any individual persons (architects, operators, users) "
                    "in your output. Referee-grade verdicts are evidence-and-law-only.\n"
                    "- Use historical precedents to CALIBRATE confidence (if 80% of similar cases "
                    "ruled X, that's informative but not deterministic).\n"
                    "- When past corrections show OCTON was previously wrong in similar situations, "
                    "actively adjust to avoid repeating the same error and say so in §3.\n"
                    "- Never include hedging filler like 'This is a complex situation', 'It depends', "
                    "or 'In some interpretations' — every sentence must add legal or factual content.\n"
                    "- If evidence is ambiguous, say so clearly in §1 and §4, cap confidence and "
                    "specify in §5 what additional angle/frame/information would resolve the call.\n"
                    "- When the LAW REFERENCE block contains a VERBATIM clause that maps to the facts "
                    "(e.g. the 9-row DOGSO/SPA sanction table for fouls), QUOTE the row label in §5 so "
                    "the verdict is auditable.\n\n"
                    "ALWAYS respond in this exact JSON format:\n"
                    "{\n"
                    '  "confidence_score": number (0-100, calibrated accurately),\n'
                    '  "suggested_decision": "specific decision string",\n'
                    '  "reasoning": "detailed step-by-step reasoning applying the relevant law",\n'
                    '  "key_factors": ["specific factual factors from the description"],\n'
                    '  "cited_clause": "Short reference to the IFAB law/clause applied (e.g. \'Law 12 §1 — Serious Foul Play, two-footed lunge\', \'Law 11 — Offside, daylight beyond second-last defender\', \'Law 14 — DOGSO inside area, no attempt to play ball\'). Max 90 chars.",\n'
                    '  "risk_level": "low|medium|high|critical",\n'
                    '  "neo_cortex_notes": "any caveats, what additional evidence would help",\n'
                    '  "angle_assessments": [\n'
                    '     // OPTIONAL — only populate when 2+ camera angles are attached.\n'
                    '     // One object per angle in the order provided (broadcast, tactical, tight, goal_line).\n'
                    '     // confidence is what THIS angle alone supports, decision is the verdict it suggests.\n'
                    '     {"angle": "broadcast", "confidence": number, "decision": "string"}\n'
                    '  ],\n'
                    '  "frame_breakdown": [\n'
                    '     // REQUIRED when 2+ frames are attached. One object per frame in the order shown.\n'
                    '     // Describe ONLY what is visible in THAT frame. This is the operator-facing\n'
                    '     // evidence trail — be specific (positions, ball location, body parts in\n'
                    '     // contact, score line if visible). 1-2 sentences each.\n'
                    '     {"frame": 1, "observation": "string", "evidence_for_decision": "supports|neutral|contradicts"}\n'
                    '  ],\n'
                    '  "offside_markers": [\n'
                    '     // REQUIRED ONLY when incident_type == "offside" AND visual frames are attached.\n'
                    '     // One object per frame. Estimate the horizontal position (on the image) of the\n'
                    '     // offside-line (second-last-defender\'s forward-most body part) and the attacker\'s\n'
                    '     // forward-most body part, each as a decimal 0.0 (left edge) to 1.0 (right edge).\n'
                    '     // The frontend draws two dashed vertical lines on the frame — amber for defender,\n'
                    '     // cyan for attacker — so the verdict is EVIDENT. If you cannot reliably locate\n'
                    '     // either line in a given frame, set that field to null (do NOT guess).\n'
                    '     // verdict: "offside" | "onside" | "unclear". daylight_cm: positive integer (attacker\n'
                    '     // beyond line when offside) or null. note: 1 short phrase.\n'
                    '     {"frame": 1, "offside_line_x": 0.62, "attacker_x": 0.67, "verdict": "offside", "daylight_cm": 35, "note": "shoulder past the last defender"}\n'
                    '  ]\n'
                    "}"
                ),
            ).with_model("openai", "gpt-5.2" if (incident_type in ("foul", "other") and not (has_image or extra_images_b64)) else "gpt-4o")

            prompt = (
                f"OCTON VAR FORENSIC ANALYSIS:\n\n"
                f"APPLICABLE LAW:\n{rules}\n\n"
                f"HIPPOCAMPUS RAPID SCAN:\n"
                f"- Initial Confidence: {hippocampus_result['initial_confidence']}%\n"
                f"- Initial Decision: {hippocampus_result['initial_decision']}\n"
                f"- Matched Patterns: {', '.join(hippocampus_result['matched_keywords']) or 'None'}\n"
            )
            crit = hippocampus_result.get("critical_trigger")
            if crit:
                prompt += (
                    f"- CRITICAL TRIGGER DETECTED: `{crit}` — phrase matched: "
                    f"\"{hippocampus_result.get('critical_trigger_phrase', '')}\"\n"
                    f"  -> This is an AUTOMATIC sending-off offence under IFAB Law 12. "
                    f"Issue the red card, cite the specific offence, and use confidence >= 92 %.\n"
                )
            prompt += (
                f"\nINCIDENT UNDER REVIEW:\n"
                f"- Category: {incident_type.upper()}\n"
                f"- Full Description: {description}\n"
            )
            if historical_context:
                prompt += f"\nSELF-LEARNING CONTEXT:\n{historical_context}\n"
            if precedent_block:
                prompt += f"\n{precedent_block}\n"
            prompt += (
                "\nINSTRUCTIONS: Apply the law above to the incident description. "
                "Do NOT blindly agree with the Hippocampus - make your own independent assessment. "
                "If the description lacks critical details, lower your confidence and note what's missing. "
                "When ground-truth precedents match closely, defer to their rulings and quote them "
                "concretely in your reasoning: name the clubs/teams, the date, and (if listed) the "
                "officiating referee — e.g. 'consistent with Manchester City vs Arsenal (2023-10-08, "
                "referee Michael Oliver): Law 12 denial of obvious goal-scoring opportunity.' "
                "Named, dated citations of comparable historical rulings demonstrate OCTON's "
                "institutional knowledge and make the verdict infinitely more persuasive to the "
                "on-field official than generic 'per precedent #1' references. "
                "Respond in JSON format only."
            )

            # ── Build multi-image vision payload ───────────────────────
            # Slot order matches the operator's upload tiles: broadcast,
            # tactical, tight, goal-line. We tell the LLM the slot order so
            # it can cross-reference angles in its reasoning.
            all_images: list = []
            if has_image and image_base64:
                all_images.append(image_base64)
            for b in extra_images_b64:
                if b and b not in all_images:
                    all_images.append(b)
            all_images = all_images[:4]   # vision payload cap

            if all_images:
                image_contents = [ImageContent(image_base64=b) for b in all_images]
                if len(all_images) > 1:
                    angle_lines = "\n".join(
                        f"  - Image {i+1}: {label}"
                        for i, label in enumerate([
                            "BROADCAST (main wide angle)",
                            "TACTICAL (high-behind-the-goal)",
                            "TIGHT (close-up of action)",
                            "GOAL-LINE (offside/goal-line view)",
                        ][:len(all_images)])
                    )
                    text = (
                        f"{prompt}\n\n"
                        f"MULTI-FRAME EVIDENCE — {len(all_images)} synchronised frames attached:\n"
                        f"{angle_lines}\n\n"
                        "Cross-reference the frames before concluding. Resolve occlusions or "
                        "parallax disagreements by citing which frame is most authoritative for "
                        "the specific question (e.g. goal-line frame for offside line, tight "
                        "for point-of-contact, broadcast for context). When all frames agree, "
                        "raise your confidence. When they disagree, name the disagreement in "
                        "`neo_cortex_notes` and lower confidence accordingly.\n\n"
                        "REQUIRED — POPULATE `frame_breakdown`: produce one entry PER FRAME in "
                        "the order shown, describing what is visible in THAT specific frame. "
                        "This is the operator-facing audit trail; if you cannot tell what is "
                        "happening in a given frame, say so plainly. Do NOT fabricate. The "
                        "referee panel will read these and challenge any claim that does not "
                        "match the pixels.\n\n"
                        + (_offside_marker_instruction(incident_type, len(all_images)))
                        + _single_angle_warning(all_images, has_image)
                    )
                else:
                    text = (
                        prompt
                        + "\n\nMatch frame attached. Analyze visual evidence carefully. "
                          "Single-frame evidence is a snapshot — the moment of pass / contact "
                          "/ ball-out cannot be confirmed from one image. Cap your confidence "
                          "and explain what additional frame would resolve the call.\n\n"
                        + (_offside_marker_instruction(incident_type, 1))
                        + _single_angle_warning([image_base64] if image_base64 else [], has_image)
                    )
                user_message = UserMessage(text=text, file_contents=image_contents)
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
                    "cited_clause": _default_clause_for(incident_type),
                    "risk_level": "medium",
                    "neo_cortex_notes": "Response required manual extraction",
                }

            processing_ms = int((time.time() - start) * 1000)

            cited_clause = str(
                analysis_data.get("cited_clause") or _default_clause_for(incident_type)
            ).strip()[:120]

            # ── Per-angle confidence assessments (multi-camera analyses) ──
            # Compute the spread between the most/least confident angles so
            # the UI can flag inter-angle disagreement (a useful forensic
            # signal — when the broadcast and the tight cameras disagree
            # by >15%, the operator should look closer rather than trust
            # the headline number).
            angle_assessments = []
            try:
                raw_aa = analysis_data.get("angle_assessments") or []
                for a in raw_aa[:4]:
                    if not isinstance(a, dict):
                        continue
                    ang = str(a.get("angle", "")).lower().strip()
                    if not ang:
                        continue
                    conf = float(a.get("confidence", 0))
                    angle_assessments.append({
                        "angle": ang,
                        "confidence": round(min(100.0, max(0.0, conf)), 1),
                        "decision": str(a.get("decision", ""))[:140],
                    })
            except (TypeError, ValueError):
                angle_assessments = []
            angle_confidence_delta = 0.0
            angle_disagreement = False
            if len(angle_assessments) >= 2:
                confs = [aa["confidence"] for aa in angle_assessments]
                angle_confidence_delta = round(max(confs) - min(confs), 1)
                # Threshold tuned against IFAB "clear and obvious" doctrine —
                # 15% spread roughly matches the moment a referee should call
                # for an OFR rather than trust the on-field call.
                angle_disagreement = angle_confidence_delta >= 15.0

            # Frame-by-frame breakdown — operator-facing evidence trail.
            frame_breakdown = []
            try:
                for fb in analysis_data.get("frame_breakdown") or []:
                    if not isinstance(fb, dict):
                        continue
                    frame_breakdown.append({
                        "frame": int(fb.get("frame", len(frame_breakdown) + 1)),
                        "observation": str(fb.get("observation", ""))[:280],
                        "evidence_for_decision": str(
                            fb.get("evidence_for_decision", "neutral")
                        ).lower(),
                    })
            except (TypeError, ValueError):
                frame_breakdown = []

            # ── Offside markers (for auto-drawn PGMOL-style lines) ───
            offside_markers: List[Dict] = []
            try:
                def _clamp(v):
                    try:
                        v = float(v)
                    except (TypeError, ValueError):
                        return None
                    if v != v:  # NaN
                        return None
                    return max(0.0, min(1.0, v))

                def _clamp_angle(v):
                    """Clamp pitch_angle_deg to a safe broadcast range.
                    None when unparseable so the frontend falls back to 0°."""
                    try:
                        v = float(v)
                    except (TypeError, ValueError):
                        return None
                    if v != v:  # NaN
                        return None
                    return max(-30.0, min(30.0, v))
                for om in analysis_data.get("offside_markers") or []:
                    if not isinstance(om, dict):
                        continue
                    verdict = str(om.get("verdict", "unclear")).lower().strip()
                    if verdict not in ("offside", "onside", "unclear"):
                        verdict = "unclear"
                    dl = om.get("daylight_cm")
                    try:
                        dl = int(dl) if dl is not None else None
                    except (TypeError, ValueError):
                        dl = None
                    offside_markers.append({
                        "frame": int(om.get("frame", len(offside_markers) + 1)),
                        "offside_line_x": _clamp(om.get("offside_line_x")),
                        "attacker_x": _clamp(om.get("attacker_x")),
                        "verdict": verdict,
                        "daylight_cm": dl,
                        "note": str(om.get("note", ""))[:160] if om.get("note") else None,
                        "pitch_angle_deg": _clamp_angle(om.get("pitch_angle_deg")),
                    })
            except (TypeError, ValueError):
                offside_markers = []

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
                "cited_clause": cited_clause,
                "risk_level": analysis_data.get("risk_level", "medium"),
                "neo_cortex_notes": analysis_data.get("neo_cortex_notes", ""),
                "angle_assessments": angle_assessments,
                "angle_confidence_delta": angle_confidence_delta,
                "angle_disagreement": angle_disagreement,
                "frame_breakdown": frame_breakdown,
                "offside_markers": offside_markers,
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
            "corner": [
                ("Legal Corner Kick — Last Touch Defender", "Final deflection by defender before ball left the byline", 70),
                ("Goal Kick — Last Touch Attacker", "Final touch appears to be the attacking team — restart should be a goal kick, not a corner", 60),
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
            "cited_clause": _default_clause_for(incident_type),
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
        extra_images_b64: Optional[list] = None,
    ) -> Dict:
        total_start = time.time()

        # SPEED OPTIMIZATION: Run Hippocampus + historical data fetch concurrently
        # Hippocampus is sync but fast (<5ms); historical is async DB

        # Fetch historical data and ground-truth precedents concurrently.
        from training import retrieve_precedents, compute_confidence_uplift, build_precedent_prompt

        historical_data, precedents = await asyncio.gather(
            self._get_historical_context(incident_type, db),
            retrieve_precedents(db, incident_type, description),
        )
        uplift_info = compute_confidence_uplift(precedents)
        precedent_block = build_precedent_prompt(precedents)

        # Hippocampus is instant (<5ms) so run directly
        hippocampus_result = self.hippocampus.analyze(
            incident_type, description, historical_data
        )
        # Hippocampus boost when strong precedents match (cap +10)
        hip_boost = min(10.0, uplift_info["strong_matches"] * 3.0)
        if hip_boost > 0:
            hippocampus_result["initial_confidence"] = round(
                min(95.0, hippocampus_result["initial_confidence"] + hip_boost), 1
            )
            hippocampus_result["precedent_boost"] = hip_boost

        # Step 3: Build deep historical context for Neo Cortex
        historical_context = ""
        if historical_data["total_similar"] > 0:
            historical_context = (
                f"GAME HISTORY DATABASE ({historical_data['total_similar']} similar {incident_type} incidents):\n"
                f"- Most common outcome: {historical_data.get('most_common_decision', 'Unknown')}\n"
                f"- Decision distribution: {historical_data.get('decision_distribution', [])}\n"
                f"- Confirmed: {historical_data.get('confirmed_count', 0)}, "
                f"Overturned: {historical_data.get('overturned_count', 0)} "
                f"(accuracy: {historical_data.get('accuracy_rate', 0):.1f}%)\n"
            )

        # Recent precedents for contextual learning
        recent = historical_data.get("recent_decided", [])
        if recent:
            historical_context += "RECENT PRECEDENTS (for pattern awareness, NOT to copy blindly):\n"
            for r in recent[:5]:
                historical_context += (
                    f"  - \"{r.get('description', '')[:80]}\" → {r.get('final_decision', 'N/A')} "
                    f"({r.get('decision_status', '')})\n"
                )

        # Feedback loop context
        if historical_data.get("feedback_total", 0) > 0:
            historical_context += (
                f"\nOPERATOR FEEDBACK LOOP: {historical_data['feedback_total']} reviews, "
                f"{historical_data.get('feedback_accuracy', 0):.1f}% AI accuracy for this type.\n"
            )
        corrections = historical_data.get("recent_corrections", [])
        if corrections:
            historical_context += "RECENT CORRECTIONS (learn from these mistakes):\n"
            for c in corrections[:3]:
                historical_context += (
                    f"  - AI suggested: \"{c.get('ai_suggestion', '')}\" "
                    f"but correct answer was: \"{c.get('operator_decision', '')}\"\n"
                )

        # Step 4: Neo Cortex deep analysis (receives Hippocampus findings + precedents)
        neo_cortex_result = await self.neo_cortex.analyze(
            incident_type=incident_type,
            description=description,
            hippocampus_result=hippocampus_result,
            historical_context=historical_context,
            precedent_block=precedent_block,
            has_image=bool(image_base64),
            image_base64=image_base64,
            extra_images_b64=[b for b in (extra_images_b64 or []) if b],
        )

        total_time_ms = int((time.time() - total_start) * 1000)

        # ── Weighted merge with adaptive Hippocampus weighting ──
        # Baseline is 80/20 Neo Cortex / Hippocampus. When Hippocampus is
        # VERY confident (>= 75) AND agrees with Neo Cortex (divergence <= 15),
        # lift Hippocampus weight up to 30 % — our "gut + deliberation agree" case.
        neo_conf = neo_cortex_result["confidence_score"]
        hip_conf = hippocampus_result["initial_confidence"]
        divergence = abs(neo_conf - hip_conf)

        if hip_conf >= 75 and divergence <= 15:
            hip_weight = 0.30
        elif hip_conf >= 65 and divergence <= 25:
            hip_weight = 0.25
        else:
            hip_weight = 0.20
        neo_weight = round(1.0 - hip_weight, 2)
        weighted_confidence = round(neo_conf * neo_weight + hip_conf * hip_weight, 1)

        # ── Hippocampus agreement bonus ──
        # Separate transparent additive boost up to +8 % when the fast pathway
        # both (a) has reasonable confidence AND (b) agrees with the Neo Cortex verdict.
        # Scales quadratically with Hippocampus confidence above 50 %.
        # 2026-02: divergence threshold relaxed 20 → 25 so borderline cases
        # where Hip and Neo are still close-ish (e.g. 65 vs 50) still earn the
        # full bonus.
        if divergence <= 25 and hip_conf >= 55:
            hip_bonus = round(((hip_conf - 50) / 40.0) ** 1.1 * 8.0, 1)  # 0..8
        elif divergence <= 35 and hip_conf >= 50:
            hip_bonus = round(((hip_conf - 50) / 40.0) ** 1.1 * 5.0, 1)  # 0..5
        else:
            hip_bonus = 0.0
        hip_bonus = max(0.0, min(8.0, hip_bonus))

        # ── Strong dual-pathway agreement bonus ──
        # When BOTH pathways are confident (>=70) AND nearly aligned (delta <=8)
        # this is the "gut-check + deliberation both shout YES" signal —
        # add an extra +3 % independent of the uplift/hip_bonus channels.
        strong_agreement_bonus = 0.0
        if hip_conf >= 70 and neo_conf >= 70 and divergence <= 8:
            strong_agreement_bonus = 3.0

        # ── Reasoning-quality bonus ──
        # When Neo Cortex returns a SPECIFIC IFAB clause citation (with a
        # law/section reference, not the generic fallback) AND a populated
        # key_factors list (≥ 2 items), the analysis is properly grounded
        # rather than hand-wavy. Worth +3 % since IFAB-anchored decisions
        # are inherently more defensible at OFR.
        cited_clause = (neo_cortex_result.get("cited_clause") or "").strip()
        kf = neo_cortex_result.get("key_factors") or []
        # Specific clause = mentions Law N or §N or contains a specific keyword.
        has_specific_clause = bool(
            cited_clause and (
                "Law " in cited_clause or "§" in cited_clause
                or any(k in cited_clause.lower() for k in (
                    "offside", "handball", "dogso", "spa", "sfp",
                    "violent", "encroach", "second yellow",
                ))
            )
        )
        reasoning_quality_bonus = 0.0
        if has_specific_clause and len(kf) >= 2 and neo_conf >= 60:
            reasoning_quality_bonus = 3.0

        # ── Vision-evidence bonus ──
        # When real visual frames are attached AND Neo Cortex returned a
        # mid-or-better verdict (>=60), the analysis is grounded in pixel
        # evidence rather than text speculation — that grounding is worth
        # an additional +4 % (capped). Multi-angle uploads earn +6 % since
        # cross-camera triangulation is even more decisive.
        has_any_image = bool(image_base64 or (extra_images_b64 and any(extra_images_b64)))
        n_frames_total = (1 if image_base64 else 0) + len([b for b in (extra_images_b64 or []) if b])
        # Vision bonus is now proportional to actual pixel evidence quality:
        #   • ≥ 4 frames (multi-frame video burst / multi-angle) → +7 %
        #     (full motion grounding — the engine can see what happens before/during/after the moment)
        #   • 3 frames → +5 %
        #   • 2 frames → +3 %
        #   • 1 frame  → +2 % (still a snapshot — no motion grounding)
        #   • 0 frames → 0 %  (text-only — no grounding at all)
        vision_evidence_bonus = 0.0
        if has_any_image and neo_conf >= 60:
            if n_frames_total >= 4:
                vision_evidence_bonus = 7.0
            elif n_frames_total == 3:
                vision_evidence_bonus = 5.0
            elif n_frames_total == 2:
                vision_evidence_bonus = 3.0
            else:
                vision_evidence_bonus = 2.0

        # Apply precedent uplift + hippocampus bonus + agreement bonus + vision bonus + reasoning bonus, all transparent & capped
        base_confidence = weighted_confidence
        final_confidence = round(
            min(99.0, base_confidence + uplift_info["uplift"] + hip_bonus + strong_agreement_bonus + vision_evidence_bonus + reasoning_quality_bonus), 1
        )

        # ── Honesty caps ──
        # Bonuses are seductive but they MUST NOT push a hallucinated /
        # ungrounded verdict into the daylight zone. Apply the caps in
        # order; the strictest one wins.
        confidence_caps_applied = []
        decision_lower = (neo_cortex_result.get("suggested_decision") or "").lower()
        reasoning_lower = (neo_cortex_result.get("reasoning") or "").lower()
        notes_lower = (neo_cortex_result.get("neo_cortex_notes") or "").lower()
        evidence_blob = f"{decision_lower} {reasoning_lower} {notes_lower}"

        # 1) Text-only verdicts max out at 70 — no pixels, no certainty.
        # Text-only honesty cap — raised from 70 → 78 now that the
        # canonical corpus covers 81+ precedents and fresh-PL/UCL
        # lessons flow in every 3 hours. A text-only analysis backed
        # by 3+ agreeing precedents is well-grounded enough to push
        # into the high-70s band when the laws are clear.
        if not has_any_image and final_confidence > 78.0:
            confidence_caps_applied.append({"cap": 78.0, "from": final_confidence, "reason": "text-only — no visual evidence"})
            final_confidence = 78.0

        # 2) Single-frame verdicts on motion-dependent calls (offside,
        #    handball "moment of contact", goal-line) max out at 78.
        motion_dependent = incident_type in ("offside", "handball", "goal_line")
        if has_any_image and n_frames_total == 1 and motion_dependent and final_confidence > 78.0:
            confidence_caps_applied.append({"cap": 78.0, "from": final_confidence, "reason": "single-frame on motion-dependent call"})
            final_confidence = 78.0

        # 3) When the model itself EXPLICITLY flags uncertainty in plain English,
        #    softly cap. The cap is STRICTEST when we have no frames (50) and
        #    LOOSER when we have real visual evidence, because a mature multi-
        #    frame analysis that still hedges is useful signal but not grounds
        #    to drop a decision into the bin.
        rejection_phrases = (
            "no clear", "not visible", "cannot determine", "cannot be determined",
            "insufficient evidence", "unclear", "no offside event visible",
            "no corner event visible", "no discernible", "load the moment",
            "load the byline",
        )
        if any(p in evidence_blob for p in rejection_phrases):
            if not has_any_image:
                rejection_cap = 50.0
            elif n_frames_total >= 4:
                # Multi-frame burst — hedging tolerated; just trim the top.
                rejection_cap = 72.0
            elif n_frames_total >= 2:
                rejection_cap = 65.0
            else:
                rejection_cap = 55.0
            if final_confidence > rejection_cap:
                confidence_caps_applied.append({
                    "cap": rejection_cap,
                    "from": final_confidence,
                    "reason": f"model flagged evidence as unclear ({n_frames_total} frame{'s' if n_frames_total != 1 else ''})",
                })
                final_confidence = rejection_cap

        # ── Critical-trigger floor ──
        # If Hippocampus detected an IFAB-automatic red-card offence (referee
        # contact, spitting, stamping, off-ball strike, explicit straight red),
        # the verdict is not discretionary. Floor the final confidence at 92 %
        # and override the suggested decision if Neo Cortex hedged below it.
        critical_trigger = hippocampus_result.get("critical_trigger")
        critical_floor_applied = False
        suggested_decision = neo_cortex_result["suggested_decision"]
        if critical_trigger:
            # Lock the suggested decision to the Hippocampus fixed verdict
            # unless Neo Cortex also produced a red-card decision.
            neo_decision_lower = (suggested_decision or "").lower()
            if "red card" not in neo_decision_lower:
                suggested_decision = hippocampus_result["initial_decision"]
            if final_confidence < 92.0:
                final_confidence = 92.0
                critical_floor_applied = True

        divergence_flag = divergence > 25

        return {
            "hippocampus": hippocampus_result,
            "neo_cortex": neo_cortex_result,
            "base_confidence": base_confidence,
            "final_confidence": final_confidence,
            "suggested_decision": suggested_decision,
            "reasoning": neo_cortex_result["reasoning"],
            "key_factors": neo_cortex_result["key_factors"],
            "cited_clause": neo_cortex_result.get(
                "cited_clause", _default_clause_for(incident_type)
            ),
            "risk_level": neo_cortex_result.get("risk_level", "medium"),
            "angle_assessments": neo_cortex_result.get("angle_assessments", []),
            "frame_breakdown": neo_cortex_result.get("frame_breakdown", []),
            "offside_markers": neo_cortex_result.get("offside_markers", []),
            "angle_confidence_delta": neo_cortex_result.get("angle_confidence_delta", 0.0),
            "angle_disagreement": neo_cortex_result.get("angle_disagreement", False),
            "neo_cortex_notes": neo_cortex_result.get("neo_cortex_notes", ""),
            "similar_historical_cases": historical_data["total_similar"],
            "historical_accuracy": historical_data.get("accuracy_rate", 0),
            "weighting": {"neo_cortex": neo_weight, "hippocampus": hip_weight},
            "pathway_divergence": round(divergence, 1),
            "divergence_flag": divergence_flag,
            # Multi-angle metadata (0 means single-image / text-only flow).
            "camera_angles_analyzed": len([b for b in (extra_images_b64 or []) if b]) + (1 if image_base64 else 0),
            # Small thumbnails (~32 KB each) of the actual frames the model
            # saw — surfaced in the "OCTON SAW" strip on the verdict panel
            # so referees can verify the engine analysed real footage. Only
            # the first 4 are kept (vision payload cap).
            "analysed_frames_b64": _build_thumbnail_strip(image_base64, extra_images_b64),
            "precedents_used": precedents,
            "precedents_count": len(precedents),
            "confidence_uplift": uplift_info["uplift"],
            "hippocampus_bonus": hip_bonus,
            "strong_agreement_bonus": strong_agreement_bonus,
            "vision_evidence_bonus": vision_evidence_bonus,
            "reasoning_quality_bonus": reasoning_quality_bonus,
            "confidence_caps_applied": confidence_caps_applied,
            "precedent_strong_matches": uplift_info["strong_matches"],
            "precedent_avg_similarity": uplift_info["avg_similarity"],
            "precedent_consensus": uplift_info.get("consensus", False),
            "fresh_precedents": uplift_info.get("fresh_precedents", 0),
            "fresh_bonus": uplift_info.get("fresh_bonus", 0.0),
            "critical_trigger": critical_trigger,
            "critical_floor_applied": critical_floor_applied,
            "total_processing_time_ms": total_time_ms,
            "pathway": "hippocampus -> neo_cortex (adaptive weight) + precedent-RAG + agreement bonus + ifab-floor",
            "engine_version": "OCTON VAR v2.3",
        }

    async def _get_historical_context(
        self, incident_type: str, db
    ) -> Dict:
        """Pull deep historical decision patterns, player/team trends, and AI feedback for self-learning."""
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
                {"$limit": 3},
            ]
            common_decisions = await db.incidents.aggregate(pipeline).to_list(3)
            most_common = (
                common_decisions[0]["_id"] if common_decisions else "No historical data"
            )
            decision_distribution = [
                {"decision": d["_id"], "count": d["count"]} for d in common_decisions
            ]

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

            # ── Deep history: recent decided incidents of same type for learning ──
            recent_decided = await db.incidents.find(
                {"incident_type": incident_type, "decision_status": {"$ne": "pending"}},
                {"_id": 0, "description": 1, "final_decision": 1, "decision_status": 1,
                 "team_involved": 1, "player_involved": 1},
            ).sort("created_at", -1).to_list(8)

            # ── Team/player patterns (factual, not biased) ──
            team_pipeline = [
                {"$match": {"incident_type": incident_type, "team_involved": {"$ne": None}}},
                {"$group": {"_id": "$team_involved", "count": {"$sum": 1}}},
                {"$sort": {"count": -1}},
                {"$limit": 5},
            ]
            team_freq = await db.incidents.aggregate(team_pipeline).to_list(5)

            player_pipeline = [
                {"$match": {"incident_type": incident_type, "player_involved": {"$ne": None}}},
                {"$group": {"_id": "$player_involved", "count": {"$sum": 1}}},
                {"$sort": {"count": -1}},
                {"$limit": 5},
            ]
            player_freq = await db.incidents.aggregate(player_pipeline).to_list(5)

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

            recent_corrections = await db.ai_feedback.find(
                {"incident_type": incident_type, "was_ai_correct": False},
                {"_id": 0, "ai_suggestion": 1, "operator_decision": 1},
            ).sort("created_at", -1).to_list(5)

            return {
                "total_similar": total_similar,
                "most_common_decision": most_common,
                "decision_distribution": decision_distribution,
                "accuracy_rate": accuracy_rate,
                "confirmed_count": confirmed_count,
                "overturned_count": total_decided - confirmed_count,
                "recent_decided": recent_decided,
                "team_frequency": {t["_id"]: t["count"] for t in team_freq},
                "player_frequency": {p["_id"]: p["count"] for p in player_freq},
                "feedback_total": feedback_total,
                "feedback_accuracy": feedback_accuracy,
                "recent_corrections": recent_corrections,
            }
        except Exception as e:
            logger.error(f"Historical context error: {e}")
            return {
                "total_similar": 0,
                "most_common_decision": "N/A",
                "decision_distribution": [],
                "accuracy_rate": 0,
                "confirmed_count": 0,
                "overturned_count": 0,
                "recent_decided": [],
                "team_frequency": {},
                "player_frequency": {},
                "feedback_total": 0,
                "feedback_accuracy": 0,
                "recent_corrections": [],
            }


# Global engine instance
brain_engine = OctonBrainEngine()
