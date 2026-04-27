/**
 * Reconnecting WebSocket hook for the live VAR feed.
 * Auto-retries every 3 s on close. Returns `connected` so pages can show
 * a green/red sync pill.
 */
import { useEffect, useRef, useState } from "react";
import { BACKEND_URL } from "../lib/api";

export function useWebSocket(onMessage) {
  const [connected, setConnected] = useState(false);
  const wsRef = useRef(null);

  useEffect(() => {
    const wsUrl = BACKEND_URL.replace("https://", "wss://").replace("http://", "ws://") + "/api/ws";
    let ws;
    const connect = () => {
      ws = new WebSocket(wsUrl);
      ws.onopen = () => setConnected(true);
      ws.onclose = () => { setConnected(false); setTimeout(connect, 3000); };
      ws.onmessage = (e) => {
        try { const data = JSON.parse(e.data); if (onMessage) onMessage(data); } catch { /* swallow */ }
      };
      wsRef.current = ws;
    };
    connect();
    return () => { if (ws) ws.close(); };
  }, [onMessage]);

  return connected;
}
