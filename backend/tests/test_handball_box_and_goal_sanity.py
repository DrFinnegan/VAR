"""Wave-9 regression tests:
  • Handball-in-box → PENALTY safety-net detection
  • 'Goal Disallowed' sanity-check rejects when no goal evidence
  • Consequence correlation prompt instruction
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


# ── Handball-in-box detection ────────────────────────────────
def test_handball_in_box_detected():
    from ai_engine import NeoCortexAnalyzer

    fb = [
        {"observation": "Frame 1: cross from the right wing flies into the box"},
        {"observation": "Frame 2: defender's outstretched arm blocks the ball inside the penalty area"},
        {"observation": "Frame 3: ball ricochets away, defenders clear"},
    ]
    in_box, phrase = NeoCortexAnalyzer._check_handball_in_box_in_frames(fb)
    assert in_box is True
    assert "penalty area" in phrase or "box" in phrase


def test_handball_outside_box_not_detected():
    from ai_engine import NeoCortexAnalyzer

    fb = [{"observation": "Defender handles the ball at the edge of his own half"}]
    in_box, phrase = NeoCortexAnalyzer._check_handball_in_box_in_frames(fb)
    assert in_box is False
    assert phrase == ""


def test_handball_in_box_requires_handball_cue():
    """A frame that only mentions 'penalty area' but no handball cue must NOT trigger."""
    from ai_engine import NeoCortexAnalyzer

    fb = [{"observation": "Striker shoots from inside the penalty area, keeper saves"}]
    in_box, _ = NeoCortexAnalyzer._check_handball_in_box_in_frames(fb)
    assert in_box is False


# ── Goal-actually-scored sanity check ────────────────────────
def test_goal_actually_scored_detects_net_cue():
    from ai_engine import NeoCortexAnalyzer

    fb = [
        {"observation": "Striker's shot crosses the line and the ball nestles in the net"},
    ]
    assert NeoCortexAnalyzer._check_goal_actually_scored(fb) is True


def test_goal_actually_scored_returns_false_for_save():
    from ai_engine import NeoCortexAnalyzer

    fb = [
        {"observation": "Striker shoots — the keeper makes a flying save and tips it over"},
        {"observation": "Defenders clear the resulting corner kick"},
    ]
    assert NeoCortexAnalyzer._check_goal_actually_scored(fb) is False


def test_goal_actually_scored_celebration_cue():
    from ai_engine import NeoCortexAnalyzer

    fb = [
        {"observation": "The attacker wheels away in celebration after scoring"},
    ]
    assert NeoCortexAnalyzer._check_goal_actually_scored(fb) is True


# ── Consequence correlation prompt is gated correctly ────────
def test_consequence_correlation_only_for_relevant_types():
    from ai_engine import _consequence_correlation_instruction

    assert _consequence_correlation_instruction("handball") != ""
    assert _consequence_correlation_instruction("foul") != ""
    assert _consequence_correlation_instruction("penalty") != ""
    assert _consequence_correlation_instruction("offside") == ""
    assert _consequence_correlation_instruction("goal_line") == ""


def test_consequence_correlation_includes_hard_rules():
    from ai_engine import _consequence_correlation_instruction

    text = _consequence_correlation_instruction("handball")
    # Must include the explicit hard rules
    assert "PENALTY" in text
    assert "GOAL DISALLOWED" in text
    assert "DELIBERATE handball" in text
    assert "INSIDE their own penalty area" in text
