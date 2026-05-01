/**
 * QuickFirePills — two lightning-bolt shortcuts next to NEW INCIDENT.
 *
 *   ⚡ CHECK OFFSIDE   → POST /api/quick/offside
 *   ⚡ CHECK CORNER    → POST /api/quick/corner
 *
 * Behaviour:
 *   1. If a <video> with usable footage exists, capture a 4-frame burst
 *      around the current playback time (-0.6, -0.2, +0.2, +0.6 s).
 *      That gives the engine *motion* — necessary for offside (moment
 *      of pass) and corner (byline crossing).
 *   2. If no <video> is on the stage, fall back to the largest visible
 *      <img> as a single still.
 *   3. If neither exists, surface a toast asking the operator to load
 *      footage instead of firing into the void (which used to produce
 *      hallucinated verdicts).
 */
import { useState } from "react";
import axios from "axios";
import { Zap, Flag, Circle } from "lucide-react";
import { Button } from "./ui/button";
import { toast } from "sonner";
import { API } from "../lib/api";

function frameFromVideoAt(vid, time) {
  // Best-effort: seek + grab. We don't await seeked here because the
  // burst points are within ±0.6s of currentTime, usually in the
  // decoded buffer, so the canvas paint is current.
  try {
    if (!vid || vid.readyState < 2) return null;
    if (Number.isFinite(time) && time !== vid.currentTime) {
      vid.currentTime = Math.max(0, Math.min((vid.duration || time) - 0.05, time));
    }
    const canvas = document.createElement("canvas");
    canvas.width = vid.videoWidth;
    canvas.height = vid.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(vid, 0, 0);
    const data = canvas.toDataURL("image/jpeg", 0.7);
    return data.split(",")[1] || null;
  } catch {
    return null;
  }
}

function imageElementToBase64(img) {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const data = canvas.toDataURL("image/jpeg", 0.75);
    return data.split(",")[1] || null;
  } catch {
    return null;
  }
}

async function captureFrameBurst() {
  // Prefer a playing/paused video on the stage.
  const vids = Array.from(document.querySelectorAll("video"))
    .filter((v) => v.readyState >= 2 && v.videoWidth > 0);
  if (vids.length) {
    const vid = vids[0];
    const t = vid.currentTime;
    const offsets = [-0.6, -0.2, 0.2, 0.6]; // 4-frame motion burst
    const out = [];
    const original = vid.currentTime;
    for (const off of offsets) {
      const target = t + off;
      if (target < 0 || (vid.duration && target > vid.duration - 0.05)) continue;
      const f = frameFromVideoAt(vid, target);
      if (f) out.push(f);
      // tiny pause so canvas paint catches up
      await new Promise((r) => setTimeout(r, 25));
    }
    // Restore playback head so the operator's view doesn't jump
    try { vid.currentTime = original; } catch { /* ignore */ }
    return out;
  }

  // Fallback to the largest visible <img> on the stage area.
  const stage = document.querySelector('[data-stage-area]') || document;
  const imgs = Array.from(stage.querySelectorAll("img"))
    .filter((i) => i.complete && i.naturalWidth > 200)
    .sort((a, b) => (b.naturalWidth || 0) - (a.naturalWidth || 0));
  if (imgs.length) {
    const b = imageElementToBase64(imgs[0]);
    return b ? [b] : [];
  }
  return [];
}

export default function QuickFirePills({ matchId, currentMatch, onIncidentCreated }) {
  const [loading, setLoading] = useState(null);

  const fire = async (kind) => {
    setLoading(kind);
    const t0 = performance.now();
    try {
      const frames = await captureFrameBurst();
      if (frames.length === 0) {
        toast.warning(`No video or still on the stage`, {
          description: `Load match footage before firing the ⚡ ${kind.toUpperCase()} check — running this with no visual evidence will produce a low-confidence text-only verdict.`,
        });
      }
      const body = {
        match_id: matchId && matchId !== "all" ? matchId : null,
        team_involved: currentMatch?.team_home || null,
        timestamp_in_match: new Date().toLocaleTimeString([], { minute: "2-digit", second: "2-digit" }),
        image_base64: frames[0] || null,
        extra_images_base64: frames.slice(1),
      };
      const { data: incident } = await axios.post(`${API}/quick/${kind}`, body);
      const dt = Math.round(performance.now() - t0);
      const conf = incident?.ai_analysis?.final_confidence ?? 0;
      const decision = incident?.ai_analysis?.suggested_decision || "Verdict ready";
      const fc = incident?.ai_analysis?.fast_path_frame_count ?? frames.length;
      toast.success(`${kind.toUpperCase()} · ${conf.toFixed(1)}% · ${fc}-frame · ${dt}ms`, {
        description: decision,
        duration: 6000,
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
        title="Lightning offside check — Law 11 verdict on a 4-frame burst around the playhead"
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
        title="Lightning corner check — Law 17 verdict on a 4-frame burst around the playhead"
      >
        <Zap className="w-3 h-3 mr-1.5" />
        <Circle className="w-3 h-3 mr-1" />
        {loading === "corner" ? "CHECKING…" : "CORNER"}
      </Button>
    </div>
  );
}
