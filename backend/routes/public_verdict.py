"""Public verdict-card PNG route.

Renders a watermarked 1080×1080 OCTON verdict card for any incident.
No authentication required — referees, pundits, and media embed these
in match reports, social posts, and broadcast graphics. Every share
carries the OCTON URL footer = passive marketing.

Endpoint: GET /api/v/{incident_id}.png
"""
import io
import logging
from typing import Dict

from PIL import Image, ImageDraw, ImageFont
from fastapi import HTTPException
from starlette.responses import StreamingResponse

from core import api_router, db

logger = logging.getLogger("octon.public_verdict")


# Cached font lookups; falls back to default bitmap if system font missing.
def _load_font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    candidates = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    ]
    for path in candidates:
        try:
            return ImageFont.truetype(path, size=size)
        except Exception:
            continue
    return ImageFont.load_default()


def _wrap_text(draw, text: str, font, max_width: int):
    words = (text or "—").split()
    lines, cur = [], ""
    for w in words:
        test = (cur + " " + w).strip()
        bbox = draw.textbbox((0, 0), test, font=font)
        if (bbox[2] - bbox[0]) > max_width and cur:
            lines.append(cur)
            cur = w
        else:
            cur = test
    if cur:
        lines.append(cur)
    return lines


def _render_verdict_png(incident: Dict) -> bytes:
    """Render a 1080×1080 verdict card from an incident document."""
    ana = incident.get("ai_analysis") or {}
    conf = int(round(float(ana.get("final_confidence") or 0)))
    decision = (ana.get("suggested_decision") or "—").strip()
    clause = (ana.get("cited_clause") or "").strip()
    itype = (incident.get("incident_type") or "incident").upper().replace("_", " ")
    timestamp = (incident.get("timestamp_in_match") or "").strip()
    team = (incident.get("team_involved") or "").strip()
    player = (incident.get("player_involved") or "").strip()

    W, H = 1080, 1080
    img = Image.new("RGB", (W, H), (4, 8, 16))
    draw = ImageDraw.Draw(img)

    # Subtle vertical gradient for depth (solid dark to slightly lighter)
    for y in range(H):
        shade = 4 + int(y / H * 10)
        draw.line([(0, y), (W, y)], fill=(shade, shade + 2, shade + 6))

    # Top accent bar
    draw.rectangle([0, 0, W, 8], fill=(0, 229, 255))

    # Header
    hdr_font = _load_font(28, bold=True)
    draw.text((60, 60), "OCTON · VAR FORENSIC VERDICT", fill=(0, 229, 255), font=hdr_font)

    # Incident-type pill
    pill_font = _load_font(22, bold=True)
    pill_bbox = draw.textbbox((0, 0), itype, font=pill_font)
    pw = pill_bbox[2] - pill_bbox[0] + 40
    draw.rectangle([60, 120, 60 + pw, 170], fill=(0, 35, 55), outline=(0, 229, 255), width=2)
    draw.text((80, 132), itype, fill=(0, 229, 255), font=pill_font)

    # Context line
    ctx = [timestamp, team, player]
    ctx_line = "  ·  ".join([c for c in ctx if c])
    ctx_font = _load_font(24)
    if ctx_line:
        draw.text((60, 200), ctx_line, fill=(156, 163, 175), font=ctx_font)

    # Confidence ring (top right)
    cx, cy, r = 900, 280, 100
    if conf >= 85:
        conf_color = (0, 255, 136)
    elif conf >= 65:
        conf_color = (0, 229, 255)
    else:
        conf_color = (255, 184, 0)
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], outline=(30, 30, 30), width=12)
    # Arc — approximated with a pie slice for simplicity
    start = -90
    end = start + int(conf * 360 / 100)
    draw.arc([cx - r, cy - r, cx + r, cy + r], start=start, end=end, fill=conf_color, width=14)
    conf_font = _load_font(60, bold=True)
    bbox = draw.textbbox((0, 0), str(conf), font=conf_font)
    draw.text((cx - (bbox[2] - bbox[0]) / 2, cy - (bbox[3] - bbox[1]) / 2 - 10), str(conf), fill=conf_color, font=conf_font)
    small_font = _load_font(18)
    draw.text((cx - 54, cy + 52), "CONFIDENCE", fill=conf_color, font=small_font)

    # Verdict section
    label_font = _load_font(18)
    draw.text((60, 370), "SUGGESTED DECISION", fill=(0, 229, 255), font=label_font)

    # Wrap the decision text
    decision_font = _load_font(46, bold=True)
    lines = _wrap_text(draw, decision, decision_font, max_width=W - 180)[:4]
    y = 420
    for line in lines:
        draw.text((60, y), line, fill=(255, 255, 255), font=decision_font)
        y += 60

    # IFAB clause callout
    if clause:
        box_y = 720
        draw.rectangle([60, box_y, W - 60, box_y + 110], fill=(30, 22, 4))
        draw.rectangle([60, box_y, 64, box_y + 110], fill=(255, 184, 0))
        draw.text((80, box_y + 20), "IFAB CLAUSE CITED", fill=(255, 184, 0), font=label_font)
        clause_font = _load_font(22)
        clause_line = clause[:110]
        draw.text((80, box_y + 55), clause_line, fill=(255, 212, 102), font=clause_font)

    # Watermark diagonal — adds to the "public shareable" character
    wm_font = _load_font(42, bold=True)
    draw.text((W - 320, H - 220), "OCTON", fill=(0, 229, 255, 40), font=wm_font)

    # Footer
    foot_font = _load_font(18)
    draw.text((60, H - 60), "Hippocampus → Neo Cortex · Dual-Brain Forensic AI", fill=(107, 114, 128), font=foot_font)
    draw.text((W - 260, H - 60), "octonvar.app", fill=(0, 229, 255), font=foot_font)

    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    buf.seek(0)
    return buf.getvalue()


@api_router.get("/v/{incident_id}.png")
async def public_verdict_png(incident_id: str):
    """Public (no-auth) watermarked verdict-card PNG for embedding in match
    reports, social posts, or broadcast graphics."""
    incident = await db.incidents.find_one({"id": incident_id}, {"_id": 0})
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    try:
        png_bytes = _render_verdict_png(incident)
    except Exception as e:
        logger.exception("verdict-card render failed")
        raise HTTPException(status_code=500, detail=f"Render failed: {e}")
    return StreamingResponse(
        io.BytesIO(png_bytes),
        media_type="image/png",
        headers={
            "Cache-Control": "public, max-age=300",
            "Content-Disposition": f'inline; filename="octon-verdict-{incident_id[:8]}.png"',
        },
    )
