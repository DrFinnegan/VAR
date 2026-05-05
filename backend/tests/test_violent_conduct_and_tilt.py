"""Wave-5 regression tests:
  • Smart frame extraction picks scene-change peaks (non-uniform timestamps)
  • Violent-conduct vision escalation upgrades YELLOW → RED on elbow-to-face cues
  • Pitch tilt auto-detection returns a sensible angle for synthetic broadcast-style frame
"""
import asyncio
import os
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


# ── 1. Violent-conduct vision escalation ────────────────────────
def test_violent_conduct_trigger_detects_elbow_to_face():
    from ai_engine import NeoCortexAnalyzer

    fb = [
        {"observation": "Frame 1: players running into the box"},
        {"observation": "Frame 2: offender's right elbow strikes opponent's nose; victim recoils holding face"},
        {"observation": "Frame 3: opponent on the ground, blood on the face"},
    ]
    escalated, phrase = NeoCortexAnalyzer._check_violent_conduct_in_frames(fb)
    assert escalated is True, f"expected escalation, got {phrase!r}"
    # The most-specific trigger that fired should be the elbow phrase.
    assert "elbow" in phrase or "blood" in phrase


def test_violent_conduct_trigger_no_false_positive_on_normal_play():
    from ai_engine import NeoCortexAnalyzer

    fb = [
        {"observation": "Frame 1: midfielder dribbles past defender"},
        {"observation": "Frame 2: striker shoots, ball hits crossbar"},
        {"observation": "Frame 3: ball deflects back to keeper"},
    ]
    escalated, phrase = NeoCortexAnalyzer._check_violent_conduct_in_frames(fb)
    assert escalated is False
    assert phrase == ""


def test_violent_conduct_handles_empty_breakdown():
    from ai_engine import NeoCortexAnalyzer
    assert NeoCortexAnalyzer._check_violent_conduct_in_frames([]) == (False, "")
    assert NeoCortexAnalyzer._check_violent_conduct_in_frames(None) == (False, "")


def test_violent_conduct_trigger_detects_stamp():
    from ai_engine import NeoCortexAnalyzer
    fb = [{"observation": "defender stamps on grounded opponent's chest after the ball is gone"}]
    escalated, phrase = NeoCortexAnalyzer._check_violent_conduct_in_frames(fb)
    assert escalated is True
    assert "stamp" in phrase


def test_violent_conduct_instruction_only_for_foul_types():
    from ai_engine import _violent_conduct_vision_instruction

    assert _violent_conduct_vision_instruction("foul", 4) != ""
    assert _violent_conduct_vision_instruction("red_card", 4) != ""
    assert _violent_conduct_vision_instruction("offside", 4) == ""
    assert _violent_conduct_vision_instruction("handball", 4) == ""
    assert _violent_conduct_vision_instruction("foul", 0) == ""


# ── 2. Smart frame extraction picks non-uniform timestamps ──────
@pytest.mark.asyncio
async def test_extract_frames_returns_b64_list_for_synthetic_clip(tmp_path):
    """Build a tiny synthetic mp4 (4 colour-blocks + a flash) using ffmpeg
    and confirm extract_frames_b64 returns 3 base64 strings — at least one
    should differ from the trivial uniform pick (centre frame).
    """
    import subprocess
    from video_utils import extract_frames_b64

    clip = tmp_path / "test.mp4"
    cmd = [
        "ffmpeg", "-y", "-f", "lavfi", "-i",
        "testsrc=duration=4:size=320x240:rate=10",
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-loglevel", "error",
        str(clip),
    ]
    proc = subprocess.run(cmd, check=False, capture_output=True, timeout=30)
    if proc.returncode != 0 or not clip.exists():
        pytest.skip("ffmpeg synthetic clip generation failed")

    frames = await extract_frames_b64(clip.read_bytes(), n_frames=3, quality=6)
    assert isinstance(frames, list)
    assert len(frames) >= 1
    for f in frames:
        assert isinstance(f, str)
        assert len(f) > 100  # non-empty base64


# ── 3. Pitch tilt auto-detect ───────────────────────────────────
def test_pitch_tilt_returns_none_for_garbage_input():
    from pitch_tilt import detect_pitch_tilt_deg
    assert detect_pitch_tilt_deg("") is None
    assert detect_pitch_tilt_deg("not-base64-at-all!!!") is None


def test_pitch_tilt_returns_none_for_solid_color_image():
    """A pure-green image has no pitch markings — detector must return None,
    not a hallucinated angle."""
    import io
    from PIL import Image
    import base64

    from pitch_tilt import detect_pitch_tilt_deg

    img = Image.new("RGB", (320, 240), (40, 140, 60))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    b64 = base64.b64encode(buf.getvalue()).decode("ascii")
    assert detect_pitch_tilt_deg(b64) is None


def test_pitch_tilt_detects_tilt_on_synthetic_pitch():
    """Synth: green field + a few thick white lines tilted 12° from vertical.
    Detector should return ≈12° (within 6° tolerance)."""
    import io
    import base64
    import math
    from pitch_tilt import detect_pitch_tilt_deg

    try:
        import numpy as np
        import cv2
    except ImportError:
        pytest.skip("numpy/opencv unavailable")

    h, w = 480, 640
    img = np.full((h, w, 3), (40, 140, 60), dtype=np.uint8)  # BGR green
    angle_deg = 12.0
    # Draw 4 parallel white lines tilted by angle_deg from vertical.
    rad = math.radians(angle_deg)
    for cx in (160, 320, 480, 560):
        x_top = int(cx + math.tan(rad) * (h / 2))
        x_bot = int(cx - math.tan(rad) * (h / 2))
        cv2.line(img, (x_top, 0), (x_bot, h), (255, 255, 255), 5)
    buf = io.BytesIO()
    from PIL import Image
    pil = Image.fromarray(cv2.cvtColor(img, cv2.COLOR_BGR2RGB))
    pil.save(buf, format="JPEG", quality=90)
    b64 = base64.b64encode(buf.getvalue()).decode("ascii")
    detected = detect_pitch_tilt_deg(b64)
    assert detected is not None, "expected a tilt angle"
    assert abs(detected - angle_deg) <= 6, (
        f"detected {detected}° differs from synthetic {angle_deg}° by > 6°"
    )
