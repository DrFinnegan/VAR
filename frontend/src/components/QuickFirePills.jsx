/**
 * QuickFirePills — lightning offside check, scoped strictly to the stage video.
 *
 * The pill ONLY targets the element marked `data-octon-stage` (the LiveVAR
 * stage video). It will NEVER fire against random videos elsewhere on the
 * page. If the stage has no playable video / image, we toast a hard
 * warning and refuse to fire so the model never hallucinates from a void.
 *
 * Capture: 4-frame motion burst (-0.6, -0.2, +0.2, +0.6 s around the
 * playhead). Posts `image_base64` + `extra_images_base64` to /api/quick/offside.
 *
 * Note: the corner pill was removed pending IFAB Law-17 demo coverage —
 * the backend endpoint stays for future re-introduction.
 */
import { useState } from "react";
import axios from "axios";
import { Zap, Flag } from "lucide-react";
import { Button } from "./ui/button";
import { toast } from "sonner";
import { API } from "../lib/api";

function getStageMedia() {
  // Strict scope: only the stage element opts in via data-octon-stage="true".
  return document.querySelector('[data-octon-stage="true"] video, [data-octon-stage="true"] img')
    || document.querySelector('[data-octon-stage="true"]');
}

function frameFromVideoAt(vid, time) {
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
    return canvas.toDataURL("image/jpeg", 0.7).split(",")[1] || null;
  } catch { return null; }
}

function frameFromImage(img) {
  try {
    if (!img.complete || !img.naturalWidth) return null;
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);
    return canvas.toDataURL("image/jpeg", 0.75).split(",")[1] || null;
  } catch { return null; }
}

async function captureStageBurst() {
  const stage = document.querySelector('[data-octon-stage="true"]');
  if (!stage) return { frames: [], reason: "no-stage" };

  // Prefer the stage's own <video>
  const vid = stage.querySelector("video");
  if (vid && vid.readyState >= 2 && vid.videoWidth > 0) {
    const t = vid.currentTime;
    const wasPlaying = !vid.paused;
    const offsets = [-0.6, -0.2, 0.2, 0.6];
    const out = [];
    if (wasPlaying) { try { vid.pause(); } catch { /* */ } }
    for (const off of offsets) {
      const target = t + off;
      if (target < 0 || (vid.duration && target > vid.duration - 0.05)) continue;
      const f = frameFromVideoAt(vid, target);
      if (f) out.push(f);
      await new Promise((r) => setTimeout(r, 35));
    }
    try { vid.currentTime = t; if (wasPlaying) await vid.play(); } catch { /* */ }
    return { frames: out, reason: out.length ? "video-burst" : "video-empty" };
  }

  // Fall back to the stage <img>
  const img = stage.querySelector("img");
  if (img) {
    const f = frameFromImage(img);
    return { frames: f ? [f] : [], reason: f ? "still-image" : "image-failed" };
  }
  return { frames: [], reason: "no-media" };
}

export default function QuickFirePills({ matchId, currentMatch, onIncidentCreated }) {
  const [loading, setLoading] = useState(false);

  const fire = async () => {
    setLoading(true);
    const t0 = performance.now();
    try {
      const { frames, reason } = await captureStageBurst();
      if (frames.length === 0) {
        toast.error("No footage on the stage", {
          description: `OCTON refuses to analyse without visual evidence. Click GO LIVE or upload a clip first. (${reason})`,
          duration: 5000,
        });
        return;
      }
      const body = {
        match_id: matchId && matchId !== "all" ? matchId : null,
        team_involved: currentMatch?.team_home || null,
        timestamp_in_match: new Date().toLocaleTimeString([], { minute: "2-digit", second: "2-digit" }),
        image_base64: frames[0],
        extra_images_base64: frames.slice(1),
      };
      const { data: incident } = await axios.post(`${API}/quick/offside`, body);
      const dt = Math.round(performance.now() - t0);
      const conf = incident?.ai_analysis?.final_confidence ?? 0;
      const decision = incident?.ai_analysis?.suggested_decision || "Verdict ready";
      const fc = incident?.ai_analysis?.fast_path_frame_count ?? frames.length;
      toast.success(`OFFSIDE · ${conf.toFixed(1)}% · ${fc}-frame · ${dt}ms`, {
        description: decision,
        duration: 6000,
      });
      if (onIncidentCreated) onIncidentCreated(incident);
    } catch (e) {
      toast.error("Quick offside failed", {
        description: e?.response?.data?.detail || e.message,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      onClick={fire}
      disabled={loading}
      data-testid="quick-offside-button"
      className="rounded-none font-heading font-bold text-[10px] tracking-[0.15em] h-9 px-3 bg-[#FFB800] text-black hover:bg-[#FFB800]/90 active:scale-[0.98] transition-all disabled:opacity-60"
      title="Lightning offside check — Law 11 verdict on a 4-frame burst from the stage video"
    >
      <Zap className="w-3 h-3 mr-1.5" />
      <Flag className="w-3 h-3 mr-1" />
      {loading ? "CHECKING…" : "OFFSIDE"}
    </Button>
  );
}
