/**
 * Reconnecting WebSocket hook for the live VAR feed.
 *
 * Tournament isolation: pass a `matchId` to scope the feed to a single
 * fixture (`/api/ws?match_id=<id>`). When omitted (or "all"), the
 * connection acts as a global subscriber and receives every event —
 * used by the Match Wall and admin dashboards.
 *
 * The hook auto-reconnects on close (every 3 s) and tears down + reopens
 * the connection whenever `matchId` changes so booth operators can swap
 * matches without picking up stale traffic.
 */
import { useEffect, useRef, useState } from "react";
import { BACKEND_URL } from "../lib/api";

export function useWebSocket(onMessage, matchId = null) {
  const [connected, setConnected] = useState(false);
  const wsRef = useRef(null);

  useEffect(() => {
    const wsBase = BACKEND_URL.replace("https://", "wss://").replace("http://", "ws://") + "/api/ws";
    const wsUrl = matchId && matchId !== "all"
      ? `${wsBase}?match_id=${encodeURIComponent(matchId)}`
      : wsBase;
    let ws;
    let cancelled = false;
    let retryTimer = null;
    const connect = () => {
      if (cancelled) return;
      ws = new WebSocket(wsUrl);
      ws.onopen = () => setConnected(true);
      ws.onclose = () => {
        setConnected(false);
        if (!cancelled) retryTimer = setTimeout(connect, 3000);
      };
      ws.onmessage = (e) => {
        try { const data = JSON.parse(e.data); if (onMessage) onMessage(data); } catch { /* swallow */ }
      };
      wsRef.current = ws;
    };
    connect();
    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      if (ws) ws.close();
    };
  }, [onMessage, matchId]);

  return connected;
}
