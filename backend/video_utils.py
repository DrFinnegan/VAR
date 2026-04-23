"""
OCTON VAR — Video → Frame extractor
Extracts a representative still frame from an uploaded video so the
Neo Cortex vision pathway has something to look at.
"""
import asyncio
import base64
import logging
import os
import tempfile

logger = logging.getLogger(__name__)


async def extract_frame_b64(video_bytes: bytes, at_seconds: float = 1.5, quality: int = 4) -> str | None:
    """Return a base-64 JPEG of a representative frame, or None on failure.

    at_seconds — timestamp to grab (seeking forward from start).
                 We also probe the video duration and, if shorter,
                 clamp to 1/3 of its length (captures the action).
    quality   — ffmpeg JPEG quality (2 best, 31 worst). 4 = very high.
    """
    if not video_bytes:
        return None

    with tempfile.TemporaryDirectory() as td:
        vp = os.path.join(td, "clip.mp4")
        fp = os.path.join(td, "frame.jpg")
        with open(vp, "wb") as f:
            f.write(video_bytes)

        # Probe duration (best-effort; fall back to the requested timestamp)
        try:
            proc = await asyncio.create_subprocess_exec(
                "ffprobe", "-v", "error",
                "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=1",
                vp,
                stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
            )
            out, _ = await asyncio.wait_for(proc.communicate(), timeout=10)
            duration = float(out.decode().strip() or 0)
            if duration > 0:
                at_seconds = min(at_seconds, max(0.5, duration / 3))
        except Exception:
            pass

        # Extract single frame
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
                logger.warning(f"ffmpeg failed: {err.decode()[:200]}")
                return None
        except asyncio.TimeoutError:
            logger.warning("ffmpeg timed out during frame extraction")
            return None
        except Exception as e:
            logger.warning(f"ffmpeg invocation failed: {e}")
            return None

        if not os.path.exists(fp):
            return None
        with open(fp, "rb") as f:
            return base64.b64encode(f.read()).decode("utf-8")
