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
import logging
from typing import Optional, Dict

logger = logging.getLogger(__name__)


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
    "other":     "VAR Protocol — clear and obvious error / serious missed incident",
}


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
            "controls the ball."
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
            "Speed of the challenge? Studs visible? Two-footed? Over-the-top? Off-the-ball?"
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
            "Clear trip / shirt-pull / arm-extended handball inside the box = >= 90 confidence."
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
            "or reckless?) generally stay with the on-field decision unless the on-field call was clearly wrong."
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
                    "You are the Neo Cortex module of OCTON VAR, an elite forensic VAR analyst designed by Dr Finnegan.\n\n"
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
                    "subjective call — you are applying settled law. Confidence MUST be >= 85 in these cases. "
                    "Hedging to 60-70 on a textbook application is WRONG and dilutes referee trust in the system.\n"
                    "  • Daylight offside (>30 cm clear) → 90+\n"
                    "  • Arm extended above shoulder + ball contact → 88+\n"
                    "  • Trip/hold/push inside area, no ball contact → 90+\n"
                    "  • Stud-up over-the-top tackle → 95+\n"
                    "  • Ball wholly over goal line on synced multi-cam → 95+\n"
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
                    "DEPTH OF ANALYSIS:\n"
                    "- Use historical precedents to calibrate your confidence (if 80% of similar cases "
                    "resulted in X, that's informative but not deterministic)\n"
                    "- When corrections show the AI was previously wrong in similar situations, "
                    "actively adjust your reasoning to avoid repeating the same error\n"
                    "- Explain your reasoning step-by-step, citing the specific law and how it applies\n"
                    "- If evidence is ambiguous, say so clearly and lower confidence accordingly\n\n"
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
                    '  ]\n'
                    "}"
                ),
            ).with_model("openai", "gpt-5.2")

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
                "When ground-truth precedents match closely, defer to their rulings and cite them "
                "(e.g. 'per precedent #2') inside your reasoning. "
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
                        f"MULTI-CAMERA EVIDENCE — {len(all_images)} synchronised camera angles attached:\n"
                        f"{angle_lines}\n\n"
                        "Cross-reference the angles before concluding. Resolve occlusions or "
                        "parallax disagreements by citing which angle is most authoritative for "
                        "the specific question (e.g. goal-line camera for offside line, tight "
                        "for point-of-contact, broadcast for context). When all angles agree, "
                        "raise your confidence. When they disagree, name the disagreement in "
                        "`neo_cortex_notes` and lower confidence accordingly."
                    )
                else:
                    text = prompt + "\n\nMatch frame attached. Analyze visual evidence carefully."
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
        """Full dual-pathway analysis: Hippocampus (fast) -> Neo Cortex (deep).

        `extra_images_b64` carries additional camera-angle stills (broadcast,
        tactical, tight, goal-line). When supplied, Neo Cortex receives a
        multi-image vision payload — the LLM cross-references angles, which
        materially improves confidence on close-call incidents.
        """
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
        # Separate transparent additive boost up to +6 % when the fast pathway
        # both (a) has reasonable confidence AND (b) agrees with the Neo Cortex verdict.
        # Scales quadratically with Hippocampus confidence above 50 %.
        if divergence <= 20 and hip_conf >= 55:
            hip_bonus = round(((hip_conf - 50) / 40.0) ** 1.1 * 6.0, 1)  # 0..6
        elif divergence <= 30 and hip_conf >= 50:
            hip_bonus = round(((hip_conf - 50) / 40.0) ** 1.1 * 3.5, 1)  # 0..3.5
        else:
            hip_bonus = 0.0
        hip_bonus = max(0.0, min(6.0, hip_bonus))

        # Apply precedent uplift + hippocampus bonus, both transparent & capped
        base_confidence = weighted_confidence
        final_confidence = round(
            min(99.0, base_confidence + uplift_info["uplift"] + hip_bonus), 1
        )

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
            "precedents_used": precedents,
            "precedents_count": len(precedents),
            "confidence_uplift": uplift_info["uplift"],
            "hippocampus_bonus": hip_bonus,
            "precedent_strong_matches": uplift_info["strong_matches"],
            "precedent_avg_similarity": uplift_info["avg_similarity"],
            "precedent_consensus": uplift_info.get("consensus", False),
            "critical_trigger": critical_trigger,
            "critical_floor_applied": critical_floor_applied,
            "total_processing_time_ms": total_time_ms,
            "pathway": "hippocampus -> neo_cortex (adaptive weight) + precedent-RAG + agreement bonus + ifab-floor",
            "engine_version": "OCTON v2.3 - Dr Finnegan",
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
