"""
OCTON VAR — Video → Frame extractor

Returns multiple JPEG frames from a clip so the dual-brain vision pathway
sees motion and not a single still. Each frame is base64-encoded JPEG and
capped at 960px wide for payload size.

Selection strategy (2026-02 upgrade):
    Real-world VAR clips are 5-30 s long with ONE decisive moment of impact.
    Uniformly-spaced timestamps almost always miss that moment — the
    elbow-to-face frame, the boot-on-shin frame, the moment the ball
    crosses the line.

    NEW: FFmpeg scene-change detection picks frames at MOTION PEAKS.
    The `select=gt(scene,T),metadata=print` filter prints a scene-change
    score (0..1) for every frame whose differential pixel-change exceeds
    threshold T. We sort by score desc and keep the top-N candidates,
    spread across time so we never return four near-duplicates.

    Fallback: if scene-detect returns < n_frames candidates (rare — happens
    with very static clips), we top up with evenly-spaced timestamps.

Public API:
    extract_frame_b64(video_bytes, at_seconds, quality)  -> str | None     # legacy single-frame
    extract_frames_b64(video_bytes, n_frames, quality)   -> list[str]      # impact-aware burst
"""
import asyncio
import base64
import logging
import os
import re
import tempfile
from typing import List, Optional, Tuple

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


_SCENE_RE = re.compile(
    r"pts_time:(?P<t>\d+(?:\.\d+)?).*?lavfi\.scene_score=(?P<s>\d+(?:\.\d+)?)",
    re.DOTALL,
)


async def _scene_candidates(vp: str, threshold: float = 0.15, time_cap: float = 30.0) -> List[Tuple[float, float]]:
    """Return a list of (timestamp_s, scene_score) tuples for frames whose
    inter-frame change exceeds `threshold`. The list is sorted by time.

    Performance budget (2026-02 fix):
      • Cap analysis to the first `time_cap` seconds of the clip — most
        VAR replays are < 30 s and the operator-relevant moment is at
        the start of the clip.
      • Hard timeout 6 s — if scene-detect can't return in 6 s, the
        caller falls back to uniform sampling. We never block uploads.
      • `-skip_frame nokey` analyses only keyframes which is ≥ 4× faster
        than full decode and still catches the motion peaks we need.
    """
    cmd = [
        "ffmpeg",
        "-skip_frame", "nokey",
        "-t", str(int(time_cap)),
        "-i", vp,
        "-vf", f"select='gt(scene\\,{threshold})',metadata=print",
        "-an", "-sn",
        "-f", "null", "-",
    ]
    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.PIPE,
        )
        _, err = await asyncio.wait_for(proc.communicate(), timeout=6.0)
        text = err.decode("utf-8", errors="ignore")
    except asyncio.TimeoutError:
        logger.info("scene-detect over budget — falling back to uniform")
        try:
            proc.kill()
        except Exception:
            pass
        return []
    except Exception as e:
        logger.warning("scene-detect failed: %s", e)
        return []
    out: List[Tuple[float, float]] = []
    flat = text.replace("\n", " ")
    for m in _SCENE_RE.finditer(flat):
        try:
            out.append((float(m.group("t")), float(m.group("s"))))
        except ValueError:
            continue
    out.sort(key=lambda x: x[0])
    return out


def _pick_top_spread(
    candidates: List[Tuple[float, float]],
    n: int,
    duration: float,
) -> List[float]:
    """Pick `n` candidate timestamps that are (a) the highest-scoring and
    (b) spread across time so we don't return near-duplicates from the
    same camera cut.

    Algorithm: greedy selection sorted by score desc, accept a candidate
    only if its timestamp is at least `min_gap` seconds away from any
    already-picked timestamp. `min_gap` = max(0.4, duration / (n*2)).
    """
    if not candidates:
        return []
    min_gap = max(0.4, duration / max(2 * n, 1))
    by_score = sorted(candidates, key=lambda x: -x[1])
    picked: List[float] = []
    for t, _s in by_score:
        if all(abs(t - p) >= min_gap for p in picked):
            picked.append(t)
            if len(picked) >= n:
                break
    picked.sort()
    return picked


async def _extract_one(vp: str, at_seconds: float, quality: int, td: str, idx: int) -> Optional[str]:
    fp = os.path.join(td, f"frame_{idx}.jpg")
    try:
        proc = await asyncio.create_subprocess_exec(
            "ffmpeg", "-ss", f"{at_seconds:.2f}", "-i", vp,
            "-frames:v", "1", "-q:v", str(quality),
            "-vf", "scale='min(960,iw)':-2",
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
    quality: int = 6,
) -> List[str]:
    """Extract `n_frames` JPEG stills picked at scene-change peaks.

    Returns a list (possibly shorter than `n_frames` if some seeks fail).
    Falls back to uniform spacing when scene-detect yields too few
    candidates (very-static clips). Behaviour is fully deterministic per
    clip — same input → same frames.

    Performance contract (2026-02 wave-8 fix):
      • Single-frame requests skip scene-detect entirely.
      • Multi-frame requests run probe + scene-detect IN PARALLEL.
      • Scene-detect has a hard 6 s timeout; a slow detect never blocks
        the upload — we fall back to uniform spacing instead.
    """
    if not video_bytes or n_frames < 1:
        return []
    n_frames = min(n_frames, 8)

    with tempfile.TemporaryDirectory() as td:
        vp = os.path.join(td, "clip.mp4")
        with open(vp, "wb") as f:
            f.write(video_bytes)

        # Single-frame path: skip scene-detect, just grab the midpoint.
        # Used by the legacy `extract_frame_b64` helper. No reason to pay
        # the scene-detect tax when only one frame is needed.
        if n_frames == 1:
            duration = await _probe_duration(vp)
            mid = duration / 2 if duration > 0 else 1.5
            f1 = await _extract_one(vp, max(0.4, mid), quality, td, 0)
            return [f1] if f1 else []

        # Parallelise: probe duration AND scene-detect run concurrently.
        # The probe is essentially free (~50ms); scene-detect is the
        # expensive call and is now hard-capped at 6 s.
        duration, candidates = await asyncio.gather(
            _probe_duration(vp),
            _scene_candidates(vp, threshold=0.15),
        )
        timestamps: List[float] = []
        if duration <= 0:
            timestamps = [1.5]
        elif duration < 2.0:
            timestamps = [duration / 2]
        else:
            picks = _pick_top_spread(candidates, n=n_frames, duration=duration)
            # Always include the dead centre of the clip — for replays that
            # cut to slow-mo right before impact, the scene-change pulse
            # often misses the actual contact frame which sits between two
            # cuts. The centre frame is a strong default.
            mid = duration / 2
            if all(abs(p - mid) >= max(0.4, duration / (2 * n_frames)) for p in picks):
                picks.append(mid)
            picks = sorted(picks)[:n_frames]

            # Top up with evenly-spaced timestamps if scene-detect was sparse.
            if len(picks) < n_frames:
                start = max(0.4, duration * 0.10)
                end = max(start + 0.5, duration * 0.90)
                step = (end - start) / max(n_frames - 1, 1)
                uniform = [round(start + i * step, 2) for i in range(n_frames)]
                # Merge keeping unique timestamps separated by min_gap
                min_gap = max(0.4, duration / (2 * n_frames))
                merged = list(picks)
                for u in uniform:
                    if all(abs(u - m) >= min_gap for m in merged):
                        merged.append(u)
                    if len(merged) >= n_frames:
                        break
                picks = sorted(merged)[:n_frames]
            timestamps = picks if picks else [duration / 2]

        # Run extractions in parallel — ffmpeg is I/O bound here.
        results = await asyncio.gather(
            *(_extract_one(vp, ts, quality, td, i) for i, ts in enumerate(timestamps)),
            return_exceptions=False,
        )
        return [b for b in results if b]


async def extract_frame_b64(
    video_bytes: bytes,
    at_seconds: float = 1.5,
    quality: int = 6,
) -> Optional[str]:
    """Legacy single-frame helper (kept for callers that only need one)."""
    frames = await extract_frames_b64(video_bytes, n_frames=1, quality=quality)
    return frames[0] if frames else None
