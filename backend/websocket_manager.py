"""
OCTON VAR WebSocket Manager
Real-time incident feed for live match monitoring.
Designed by Dr Finnegan for lightning speed event propagation.

Tournament-mode isolation:
    Each connection registers an optional `match_id`. Events tagged with a
    match_id are only delivered to subscribers of that match plus
    "global" subscribers (those that connected with no match_id, e.g. the
    Match Wall and admin views). This lets multiple VAR booths run in
    parallel during tournaments without seeing each other's traffic.
"""
import logging
from typing import Dict, Optional
from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ConnectionManager:
    """Manages WebSocket connections for real-time VAR feed."""

    def __init__(self):
        # WebSocket -> {"match_id": Optional[str], "booth_id": Optional[str]}
        self.subscriptions: Dict[WebSocket, dict] = {}

    async def connect(
        self,
        websocket: WebSocket,
        match_id: Optional[str] = None,
        booth_id: Optional[str] = None,
    ):
        await websocket.accept()
        self.subscriptions[websocket] = {"match_id": match_id, "booth_id": booth_id}
        logger.info(
            "WS connected (match_id=%s booth=%s). Active: %d",
            match_id or "*GLOBAL*",
            booth_id or "-",
            len(self.subscriptions),
        )

    def disconnect(self, websocket: WebSocket):
        self.subscriptions.pop(websocket, None)
        logger.info("WS disconnected. Active: %d", len(self.subscriptions))

    @property
    def active_connections(self):
        # Backwards-compatible accessor (some legacy code reads this).
        return list(self.subscriptions.keys())

    def booths_for_match(self, match_id: str) -> list:
        """Return the list of distinct booth_ids currently scoped to a
        given match. Powers the "presence" pip on the Match Wall."""
        ids = []
        for sub in self.subscriptions.values():
            if sub.get("match_id") == match_id and sub.get("booth_id"):
                if sub["booth_id"] not in ids:
                    ids.append(sub["booth_id"])
        return ids

    async def broadcast(self, message: dict, match_id: Optional[str] = None):
        """Send `message` to:
        - All global subscribers (subscribed match_id == None)
        - Subscribers whose match_id matches the broadcast match_id
        If `match_id` is None the broadcast goes to ALL connections (legacy
        behaviour for non-incident events like system_health).
        """
        # Stamp the match_id on the payload so clients can do client-side
        # secondary filtering when needed.
        if match_id and "match_id" not in message:
            message = {**message, "match_id": match_id}

        disconnected = []
        for connection, sub in self.subscriptions.items():
            sub_match = sub.get("match_id")
            # Routing rules:
            #   broadcast match_id is None  -> deliver to everyone
            #   sub is global (None)        -> deliver everything
            #   else                        -> deliver only when ids match
            if match_id is None or sub_match is None or sub_match == match_id:
                try:
                    await connection.send_json(message)
                except Exception:
                    disconnected.append(connection)
        for conn in disconnected:
            self.disconnect(conn)

    async def send_incident_created(
        self, incident_data: dict, match_id: Optional[str] = None
    ):
        await self.broadcast(
            {
                "type": "incident_created",
                "data": incident_data,
                "message": "New incident submitted for OCTON analysis",
            },
            match_id=match_id,
        )

    async def send_decision_made(
        self,
        incident_id: str,
        decision: str,
        status: str,
        match_id: Optional[str] = None,
    ):
        await self.broadcast(
            {
                "type": "decision_made",
                "data": {
                    "incident_id": incident_id,
                    "decision": decision,
                    "status": status,
                },
                "message": f"Decision recorded: {decision}",
            },
            match_id=match_id,
        )

    async def send_analysis_complete(
        self,
        incident_id: str,
        confidence: float,
        match_id: Optional[str] = None,
    ):
        await self.broadcast(
            {
                "type": "analysis_complete",
                "data": {"incident_id": incident_id, "confidence": confidence},
                "message": f"OCTON analysis complete - {confidence:.1f}% confidence",
            },
            match_id=match_id,
        )

    async def send_system_health(self, payload: dict):
        """Push a real-time system-health update to all connected clients.
        Called whenever an upstream service flips state (e.g. storage 500).
        Always global — every booth needs to know storage is degraded."""
        await self.broadcast(
            {
                "type": "system_health",
                "data": payload,
                "message": "OCTON system health update",
            }
        )


ws_manager = ConnectionManager()
