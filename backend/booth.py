"""Booth identity extraction.

Each browser tab/VAR booth sends a stable `X-Booth-Id` header (optional
`X-Booth-Label`) so audit entries, decisions, and WebSocket connections
can be attributed when multiple booths watch the same match.
"""
from fastapi import Request


def get_booth_id(request: Request) -> str | None:
    # Accept lowercase / hyphen variations FastAPI normalises for us.
    h = request.headers
    return h.get("x-booth-id") or h.get("X-Booth-Id") or None


def get_booth_label(request: Request) -> str | None:
    h = request.headers
    return h.get("x-booth-label") or h.get("X-Booth-Label") or None


def get_booth_context(request: Request) -> dict:
    """Convenience: return both fields as a dict for easy spreading."""
    return {
        "booth_id": get_booth_id(request),
        "booth_label": get_booth_label(request),
    }
