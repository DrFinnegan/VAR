/**
 * Central API/axios configuration.
 * Every page/component imports BACKEND_URL or API from here so the
 * environment-driven URL is never duplicated across the codebase.
 *
 * Booth identity:
 *   Each browser tab/VAR-booth persists a stable `booth_id` in
 *   localStorage (`X-Booth-Id` header) so two operators analysing the
 *   same match can be told apart in audit logs and the decision trail.
 */
import axios from "axios";

export const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

// Configure axios for cookies (session-based auth)
axios.defaults.withCredentials = true;

// ── Booth identity ────────────────────────────────────────
const BOOTH_ID_KEY = "octon_booth_id";
const BOOTH_LABEL_KEY = "octon_booth_label";

function genBoothId() {
  // Short, readable id. Good enough for audit discrimination.
  return "booth-" + Math.random().toString(36).slice(2, 8) + "-" + Date.now().toString(36);
}

export function getBoothId() {
  try {
    let id = localStorage.getItem(BOOTH_ID_KEY);
    if (!id) {
      id = genBoothId();
      localStorage.setItem(BOOTH_ID_KEY, id);
    }
    return id;
  } catch {
    return "booth-unknown";
  }
}

export function getBoothLabel() {
  try { return localStorage.getItem(BOOTH_LABEL_KEY) || ""; }
  catch { return ""; }
}

export function setBoothLabel(label) {
  try { localStorage.setItem(BOOTH_LABEL_KEY, label || ""); } catch { /* */ }
}

// Stamp every outgoing request with the booth headers so the backend can
// thread them into audit chain entries, WS routing, and decision logs.
axios.interceptors.request.use((cfg) => {
  cfg.headers = cfg.headers || {};
  cfg.headers["X-Booth-Id"] = getBoothId();
  const label = getBoothLabel();
  if (label) cfg.headers["X-Booth-Label"] = label;
  return cfg;
});

/** Normalises FastAPI error payloads (string / array / object) into a string. */
export function formatApiError(detail) {
  if (detail == null) return "Something went wrong.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail.map(e => e?.msg || JSON.stringify(e)).join(" ");
  if (detail?.msg) return detail.msg;
  return String(detail);
}
