"""
OCTON VAR WebSocket Manager
Real-time incident feed for live match monitoring.
Designed by Dr Finnegan for lightning speed event propagation.
"""
import logging
from typing import List
from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ConnectionManager:
    """Manages WebSocket connections for real-time VAR feed."""

    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info(f"WS connected. Active: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
        logger.info(f"WS disconnected. Active: {len(self.active_connections)}")

    async def broadcast(self, message: dict):
        disconnected = []
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception:
                disconnected.append(connection)
        for conn in disconnected:
            self.disconnect(conn)

    async def send_incident_created(self, incident_data: dict):
        await self.broadcast(
            {
                "type": "incident_created",
                "data": incident_data,
                "message": "New incident submitted for OCTON analysis",
            }
        )

    async def send_decision_made(
        self, incident_id: str, decision: str, status: str
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
            }
        )

    async def send_analysis_complete(self, incident_id: str, confidence: float):
        await self.broadcast(
            {
                "type": "analysis_complete",
                "data": {"incident_id": incident_id, "confidence": confidence},
                "message": f"OCTON analysis complete - {confidence:.1f}% confidence",
            }
        )


ws_manager = ConnectionManager()
