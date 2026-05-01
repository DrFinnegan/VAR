"""
OCTON VAR — Video → Frame extractor

Returns multiple evenly-spaced frames from a clip so the dual-brain
vision pathway sees motion and not a single still. Each frame is
JPEG-encoded base64 and capped at 1280px wide for payload size.

Public API:
    extract_frame_b64(video_bytes, at_seconds, quality)  -> str | None     # legacy single-frame
    extract_frames_b64(video_bytes, n_frames, quality)   -> list[str]      # multi-frame burst
"""
import asyncio
import base64
import logging
import os
import tempfile
from typing import List, Optional

logger = logging.getLogger(__name__)


async def _probe_duration(vp: str) -> float:
    """Return clip duration in seconds (0 on failure)."""
    try:
        proc = await asyncio.create_subprocess_exec(
            "ffprobe", "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            vp,
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
        )
        out, _ = await asyncio.wait_for(proc.communicate(), timeout=10)
        return float(out.decode().strip() or 0)
    except Exception:
        return 0.0


async def _extract_one(vp: str, at_seconds: float, quality: int, td: str, idx: int) -> Optional[str]:
    fp = os.path.join(td, f"frame_{idx}.jpg")
    try:
        proc = await asyncio.create_subprocess_exec(
            "ffmpeg", "-ss", f"{at_seconds:.2f}", "-i", vp,
            "-frames:v", "1", "-q:v", str(quality),
            "-vf", "scale='min(1280,iw)':-2",
            "-y", fp,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.PIPE,
        )
        _, err = await asyncio.wait_for(proc.communicate(), timeout=25)
        if proc.returncode != 0:
            logger.warning("ffmpeg frame %d failed: %s", idx, err.decode()[:200])
            return None
    except asyncio.TimeoutError:
        logger.warning("ffmpeg timed out for frame %d", idx)
        return None
    except Exception as e:
        logger.warning("ffmpeg invocation failed (%d): %s", idx, e)
        return None
    if not os.path.exists(fp):
        return None
    with open(fp, "rb") as f:
        return base64.b64encode(f.read()).decode("utf-8")


async def extract_frames_b64(
    video_bytes: bytes,
    n_frames: int = 4,
    quality: int = 4,
) -> List[str]:
    """Extract `n_frames` evenly-spaced JPEG stills from `video_bytes`.

    Returns a list (possibly shorter than `n_frames` if some seeks fail).
    For very short clips, the timestamps are clamped to span the available
    duration. Falls back to a single frame at 1.5s if duration probe
    fails — VAR clips are usually 5-30s so this is rare.
    """
    if not video_bytes or n_frames < 1:
        return []
    n_frames = min(n_frames, 8)

    with tempfile.TemporaryDirectory() as td:
        vp = os.path.join(td, "clip.mp4")
        with open(vp, "wb") as f:
            f.write(video_bytes)

        duration = await _probe_duration(vp)
        # Choose timestamps that bracket the action — skip the first
        # 10% (logos/static intro) and the last 10% (slow-mo replays).
        if duration <= 0:
            timestamps = [1.5]
        elif duration < 2.0:
            timestamps = [duration / 2]
        else:
            start = max(0.4, duration * 0.10)
            end = max(start + 0.5, duration * 0.90)
            if n_frames == 1:
                timestamps = [(start + end) / 2]
            else:
                step = (end - start) / (n_frames - 1)
                timestamps = [round(start + i * step, 2) for i in range(n_frames)]

        # Run extractions in parallel — ffmpeg is I/O bound here.
        results = await asyncio.gather(
            *(_extract_one(vp, ts, quality, td, i) for i, ts in enumerate(timestamps)),
            return_exceptions=False,
        )
        return [b for b in results if b]


async def extract_frame_b64(
    video_bytes: bytes,
    at_seconds: float = 1.5,
    quality: int = 4,
) -> Optional[str]:
    """Legacy single-frame helper (kept for callers that only need one)."""
    frames = await extract_frames_b64(video_bytes, n_frames=1, quality=quality)
    return frames[0] if frames else None
