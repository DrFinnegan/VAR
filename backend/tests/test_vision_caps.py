"""Confidence honesty caps + multi-frame video extraction.

Before this fix:
  - Text-only quick-fire calls hit 91-99 % via uncapped bonuses.
  - Video uploads ran with 0 frames because ffmpeg was missing and
    extract_frame_b64 silently returned None.

After:
  - Text-only is hard-capped at 60-70 %.
  - Model self-rejection ('no clear event visible') caps at 40-50 %.
  - extract_frames_b64 returns N distinct frames per clip.
"""
import asyncio
import os
import shutil
import subprocess
import tempfile

import pytest

from video_utils import extract_frames_b64


def _make_test_clip(seconds: int = 4) -> bytes:
    """Synthesize a tiny moving clip via ffmpeg."""
    if not shutil.which("ffmpeg"):
        pytest.skip("ffmpeg not installed — skipping vision pipeline tests")
    with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as f:
        path = f.name
    try:
        subprocess.run(
            ["ffmpeg", "-y", "-f", "lavfi", "-i", f"testsrc=size=320x240:rate=15",
             "-t", str(seconds), "-pix_fmt", "yuv420p", path],
            capture_output=True, check=True,
        )
        with open(path, "rb") as fh:
            return fh.read()
    finally:
        if os.path.exists(path):
            os.unlink(path)


def test_extract_frames_b64_returns_n_distinct_frames():
    clip = _make_test_clip(seconds=5)
    frames = asyncio.run(extract_frames_b64(clip, n_frames=4))
    assert len(frames) == 4, f"expected 4 frames, got {len(frames)}"
    # All four frames must be different (testsrc shifts content per frame)
    assert len(set(frames)) == 4, "frames are duplicates — extractor seek failed"


def test_extract_frames_b64_handles_short_clip():
    clip = _make_test_clip(seconds=1)
    frames = asyncio.run(extract_frames_b64(clip, n_frames=4))
    # Even a 1s clip should produce at least 1 frame.
    assert len(frames) >= 1


def test_extract_frames_b64_handles_empty_input():
    frames = asyncio.run(extract_frames_b64(b"", n_frames=4))
    assert frames == []


def test_post_process_quick_analysis_caps_no_evidence():
    from routes.quick_fire import _post_process_quick_analysis
    out = _post_process_quick_analysis(
        {
            "final_confidence": 99.0,
            "suggested_decision": "Goal Disallowed - Offside",
            "reasoning": "the attacker was clearly beyond the last defender",
            "neo_cortex_notes": "",
            "neo_cortex": {"confidence_score": 95.0},
        },
        frame_count=0,
    )
    assert out["final_confidence"] <= 60.0, f"expected cap at 60, got {out['final_confidence']}"
    assert out["confidence_caps"][0]["reason"] == "no visual evidence attached"


def test_post_process_quick_analysis_caps_single_frame():
    from routes.quick_fire import _post_process_quick_analysis
    out = _post_process_quick_analysis(
        {
            "final_confidence": 92.0,
            "suggested_decision": "Goal Disallowed - Offside",
            "reasoning": "clear daylight beyond the line",
            "neo_cortex_notes": "",
            "neo_cortex": {"confidence_score": 88.0},
        },
        frame_count=1,
    )
    assert out["final_confidence"] <= 75.0, f"expected cap at 75, got {out['final_confidence']}"


def test_post_process_quick_analysis_respects_self_rejection():
    from routes.quick_fire import _post_process_quick_analysis
    out = _post_process_quick_analysis(
        {
            "final_confidence": 88.0,
            "suggested_decision": "No clear corner event visible — load the byline-cross frame and retry",
            "reasoning": "frames provided do not show the byline crossing moment",
            "neo_cortex_notes": "",
            "neo_cortex": {"confidence_score": 80.0},
        },
        frame_count=2,
    )
    assert out["final_confidence"] <= 40.0, f"expected cap at 40, got {out['final_confidence']}"


def test_post_process_quick_analysis_passes_grounded_high_confidence():
    """When evidence is solid and language is decisive, no cap should apply."""
    from routes.quick_fire import _post_process_quick_analysis
    out = _post_process_quick_analysis(
        {
            "final_confidence": 92.0,
            "suggested_decision": "Goal Disallowed - Offside",
            "reasoning": "Multi-frame burst shows the attacker's torso clearly beyond the second-last defender at the moment of pass; armpit line confirmed across frames 2 and 3.",
            "neo_cortex_notes": "",
            "neo_cortex": {"confidence_score": 91.0},
        },
        frame_count=4,
    )
    assert out["final_confidence"] == 92.0
    assert out.get("confidence_caps") in (None, [])
