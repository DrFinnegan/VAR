/**
 * Central API/axios configuration.
 * Every page/component imports BACKEND_URL or API from here so the
 * environment-driven URL is never duplicated across the codebase.
 */
import axios from "axios";

export const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

// Configure axios for cookies (session-based auth)
axios.defaults.withCredentials = true;

/** Normalises FastAPI error payloads (string / array / object) into a string. */
export function formatApiError(detail) {
  if (detail == null) return "Something went wrong.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail.map(e => e?.msg || JSON.stringify(e)).join(" ");
  if (detail?.msg) return detail.msg;
  return String(detail);
}
