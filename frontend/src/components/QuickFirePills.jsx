/**
 * QuickFirePills — two lightning-bolt shortcuts next to NEW INCIDENT.
 *
 *   ⚡ CHECK OFFSIDE   → POST /api/quick/offside
 *   ⚡ CHECK CORNER    → POST /api/quick/corner
 *
 * Each pill:
 *   1. Tries to capture the current video frame (if a <video> element is
 *      available on the stage) as a base64 JPEG,
 *   2. Posts the frame + match context to the fast-path endpoint,
 *   3. Surfaces the returned incident (auto-selected in LiveVAR) and
 *      toasts the confidence + suggested decision.
 *
 * Frame capture is best-effort: if no <video> is visible (operator hasn't
 * uploaded a clip yet), we still fire the text-only fast-path so the
 * operator gets a Law-based verdict instantly.
 */
import { useState } from "react";
import axios from "axios";
import { Zap, Flag, Circle } from "lucide-react";
import { Button } from "./ui/button";
import { toast } from "sonner";
import { API } from "../lib/api";

function captureCurrentFrameBase64() {
  // Grab the first visible, playing/paused <video> on the page.
  const vids = Array.from(document.querySelectorAll("video"));
  const vid = vids.find((v) => v.readyState >= 2 && v.videoWidth > 0);
  if (!vid) return null;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = vid.videoWidth;
    canvas.height = vid.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(vid, 0, 0);
    // JPEG @ 0.7 quality → small payload (~40-80kb) keeps latency low.
    const data = canvas.toDataURL("image/jpeg", 0.7);
    return data.split(",")[1] || null;
  } catch {
    return null;
  }
}

export default function QuickFirePills({ matchId, currentMatch, onIncidentCreated }) {
  const [loading, setLoading] = useState(null); // "offside" | "corner" | null

  const fire = async (kind) => {
    setLoading(kind);
    const t0 = performance.now();
    try {
      const image_base64 = captureCurrentFrameBase64();
      const body = {
        match_id: matchId && matchId !== "all" ? matchId : null,
        team_involved: currentMatch?.team_home || null,
        timestamp_in_match: new Date().toLocaleTimeString([], { minute: "2-digit", second: "2-digit" }),
        image_base64,
      };
      const { data: incident } = await axios.post(`${API}/quick/${kind}`, body);
      const dt = Math.round(performance.now() - t0);
      const conf = incident?.ai_analysis?.final_confidence ?? 0;
      const decision = incident?.ai_analysis?.suggested_decision || "Verdict ready";
      toast.success(`${kind.toUpperCase()} · ${conf.toFixed(1)}% · ${dt}ms`, {
        description: decision,
        duration: 5000,
      });
      if (onIncidentCreated) onIncidentCreated(incident);
    } catch (e) {
      toast.error(`Quick ${kind} failed`, {
        description: e?.response?.data?.detail || e.message,
      });
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="flex items-center gap-1.5">
      <Button
        onClick={() => fire("offside")}
        disabled={loading === "offside"}
        data-testid="quick-offside-button"
        className="rounded-none font-heading font-bold text-[10px] tracking-[0.15em] h-9 px-3 bg-[#FFB800] text-black hover:bg-[#FFB800]/90 active:scale-[0.98] transition-all disabled:opacity-60"
        title="Lightning offside check — Law 11 verdict in <4s"
      >
        <Zap className="w-3 h-3 mr-1.5" />
        <Flag className="w-3 h-3 mr-1" />
        {loading === "offside" ? "CHECKING…" : "OFFSIDE"}
      </Button>
      <Button
        onClick={() => fire("corner")}
        disabled={loading === "corner"}
        data-testid="quick-corner-button"
        className="rounded-none font-heading font-bold text-[10px] tracking-[0.15em] h-9 px-3 bg-[#A855F7] text-black hover:bg-[#A855F7]/90 active:scale-[0.98] transition-all disabled:opacity-60"
        title="Lightning corner check — Law 17 verdict in <4s"
      >
        <Zap className="w-3 h-3 mr-1.5" />
        <Circle className="w-3 h-3 mr-1" />
        {loading === "corner" ? "CHECKING…" : "CORNER"}
      </Button>
    </div>
  );
}
