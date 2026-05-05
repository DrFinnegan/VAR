/**
 * QuickCornerPill — lightning corner-kick verdict, scoped strictly to the stage video.
 *
 * Re-introduced 2026-02 once the corpus crossed the 5+ corner-incident
 * threshold (training/stats: by_type[corner] >= 5). Mirrors QuickFirePills
 * (offside) — same stage-only capture contract — but posts to
 * `/api/quick/corner` and cites IFAB Law 17.
 *
 * Capture: 4-frame motion burst (-0.6, -0.2, +0.2, +0.6 s around the
 * playhead). Posts `image_base64` + `extra_images_base64`. The backend
 * fast-path returns a fully-fledged incident with confidence + cited clause.
 */
import { useState } from "react";
import axios from "axios";
import { Zap, Crosshair } from "lucide-react";
import { Button } from "./ui/button";
import { toast } from "sonner";
import { API } from "../lib/api";

async function captureStageBurst() {
  const stage = document.querySelector('[data-octon-stage="true"]');
  if (!stage) return { frames: [], reason: "no-stage" };
  const vid = stage.querySelector("video");
  const frameFromVideoAt = (v, time) => {
    try {
      if (!v || v.readyState < 2) return null;
      if (Number.isFinite(time) && time !== v.currentTime) {
        v.currentTime = Math.max(0, Math.min((v.duration || time) - 0.05, time));
      }
      const canvas = document.createElement("canvas");
      canvas.width = v.videoWidth;
      canvas.height = v.videoHeight;
      canvas.getContext("2d").drawImage(v, 0, 0);
      return canvas.toDataURL("image/jpeg", 0.7).split(",")[1] || null;
    } catch { return null; }
  };
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
  const img = stage.querySelector("img");
  if (img && img.complete && img.naturalWidth) {
    try {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext("2d").drawImage(img, 0, 0);
      const f = canvas.toDataURL("image/jpeg", 0.75).split(",")[1] || null;
      return { frames: f ? [f] : [], reason: f ? "still-image" : "image-failed" };
    } catch { return { frames: [], reason: "image-failed" }; }
  }
  return { frames: [], reason: "no-media" };
}

export default function QuickCornerPill({ matchId, currentMatch, onIncidentCreated }) {
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
      const { data: incident } = await axios.post(`${API}/quick/corner`, body);
      const dt = Math.round(performance.now() - t0);
      const conf = incident?.ai_analysis?.final_confidence ?? 0;
      const decision = incident?.ai_analysis?.suggested_decision || "Verdict ready";
      const fc = incident?.ai_analysis?.fast_path_frame_count ?? frames.length;
      toast.success(`CORNER · ${conf.toFixed(1)}% · ${fc}-frame · ${dt}ms`, {
        description: decision,
        duration: 6000,
      });
      if (onIncidentCreated) onIncidentCreated(incident);
    } catch (e) {
      toast.error("Quick corner failed", {
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
      data-testid="quick-corner-button"
      className="rounded-none font-heading font-bold text-[10px] tracking-[0.15em] h-9 px-3 bg-[#B366FF] text-white hover:bg-[#B366FF]/90 active:scale-[0.98] transition-all disabled:opacity-60"
      title="Lightning corner check — Law 17 verdict on a 4-frame burst from the stage video"
    >
      <Zap className="w-3 h-3 mr-1.5" />
      <Crosshair className="w-3 h-3 mr-1" />
      {loading ? "CHECKING…" : "CORNER"}
    </Button>
  );
}
