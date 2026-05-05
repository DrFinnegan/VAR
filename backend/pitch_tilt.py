"""
OCTON VAR — Pitch tilt auto-detection (Hough lines on grass).

Given a base64-encoded JPEG of a broadcast frame, return the dominant
near-vertical line angle in degrees, where 0° = perfectly vertical on
screen and positive values lean the top-of-line toward the right of the
frame (broadcast camera positioned right of midfield).

Why this matters:
  Real broadcast main-camera frames are tilted ±10°-25° due to the
  camera's elevated, off-centre position. The OCTON SAW offside lines
  must remain parallel to the goal line, which means they must rotate
  by exactly the perspective tilt of the visible halfway line / byline /
  six-yard box. Up to now the operator dragged a slider; this module
  removes that step on most clips.

Algorithm:
  1. Decode JPEG → grayscale.
  2. Mask the green grass area (HSV hue range) to discard crowd / scoreboards.
  3. Canny edge-detect within the mask.
  4. Hough probabilistic line transform for line segments.
  5. Filter to "near-vertical" segments (within 30° of vertical).
  6. Return the median angle of the surviving segments.

Defensive: returns None on any failure (no cv2 / unparseable image / no
lines / lines all near-horizontal).
"""
from __future__ import annotations

import base64
import logging
import math
from typing import List, Optional, Tuple

logger = logging.getLogger(__name__)


def detect_pitch_tilt_deg(image_b64: str) -> Optional[float]:
    """Return the dominant pitch line tilt in degrees (clamped to ±30°),
    or None if confident detection isn't possible.
    """
    try:
        import cv2  # type: ignore
        import numpy as np  # type: ignore
    except ImportError:
        logger.debug("opencv not installed — auto-tilt disabled")
        return None

    try:
        raw = base64.b64decode(image_b64, validate=False)
    except Exception:
        return None
    if not raw:
        return None
    try:
        arr = np.frombuffer(raw, dtype=np.uint8)
        img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    except Exception:
        return None
    if img is None:
        return None

    h, w = img.shape[:2]
    if h < 64 or w < 64:
        return None

    # ── Mask grass area ──────────────────────────────────────────────
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    # Hue 30-95 covers natural and floodlit grass; Sat≥40, Val≥35.
    grass_mask = cv2.inRange(hsv, (30, 40, 35), (95, 255, 230))
    # Dilate to absorb pitch markings (which sit ON the grass mask).
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))
    grass_mask = cv2.dilate(grass_mask, kernel, iterations=1)
    grass_pct = float((grass_mask > 0).sum()) / (h * w)
    if grass_pct < 0.10:
        # Not enough grass on screen — replay close-up or non-pitch frame.
        return None

    # ── Pitch markings = white-on-green pixels ───────────────────────
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    # White pixel mask: pixels brighter than 200 inside the grass region.
    _, white = cv2.threshold(gray, 200, 255, cv2.THRESH_BINARY)
    white = cv2.bitwise_and(white, white, mask=grass_mask)
    if int(white.sum()) < 1000:
        return None

    # ── Edges + Hough probabilistic transform ────────────────────────
    edges = cv2.Canny(white, 50, 150, apertureSize=3)
    lines = cv2.HoughLinesP(
        edges,
        rho=1,
        theta=math.pi / 360,  # 0.5° resolution
        threshold=80,
        minLineLength=int(min(h, w) * 0.20),
        maxLineGap=10,
    )
    if lines is None:
        return None

    # ── Convert each segment to its angle from vertical ─────────────
    near_vertical: List[Tuple[float, float]] = []  # (angle_deg, length)
    for ln in lines:
        x1, y1, x2, y2 = ln[0]
        dx = x2 - x1
        dy = y2 - y1
        if dy == 0:
            continue
        # Normalize to dy > 0 so we measure "top relative to bottom".
        if dy < 0:
            dx, dy = -dx, -dy
        # angle convention: positive = top of line leans RIGHT (broadcast
        # camera right of midfield). When walking from BOTTOM to TOP the
        # x must DECREASE for that to hold (top has a smaller x). atan2
        # naturally gives the opposite sign so we negate.
        angle = -math.degrees(math.atan2(dx, dy))
        # Filter to near-vertical only (±35° from vertical).
        if -35 <= angle <= 35:
            length = math.hypot(dx, dy)
            near_vertical.append((angle, length))

    if len(near_vertical) < 3:
        return None

    # ── Length-weighted median ───────────────────────────────────────
    near_vertical.sort(key=lambda t: t[0])
    total_len = sum(L for _, L in near_vertical)
    target = total_len / 2
    cum = 0.0
    median = 0.0
    for ang, ln in near_vertical:
        cum += ln
        if cum >= target:
            median = ang
            break

    # Clamp & round to 1dp for the UI slider.
    median = max(-30.0, min(30.0, median))
    return round(median, 1)
