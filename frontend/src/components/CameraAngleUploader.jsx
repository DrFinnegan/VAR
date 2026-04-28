/**
 * 4-Camera-angle uploader for the New Incident dialog.
 *
 * Renders a 2×2 grid of upload tiles — BROADCAST, TACTICAL, TIGHT, GOAL_LINE —
 * each accepting a still image and (optionally) a short video clip. Per-tile
 * size cap mirrors the legacy single-video cap (12 MB) to keep request payload
 * within proxy limits. The parent gets a single `cameraAngles` array shaped:
 *
 *   [{ angle: "broadcast", image_base64?, video_base64?, image_preview? }, ...]
 *
 * Empty tiles are stripped before submit. Uses lucide icons for each angle so
 * operators can pick at a glance.
 */
import { useState } from "react";
import { Camera, Crosshair, Aperture, Goal, Image as ImageIcon, Video, X } from "lucide-react";
import { toast } from "sonner";

const ANGLES = [
  { key: "broadcast", label: "BROADCAST",  hint: "main wide angle",        icon: Camera     },
  { key: "tactical",  label: "TACTICAL",   hint: "high behind the goal",   icon: Aperture   },
  { key: "tight",     label: "TIGHT",      hint: "close-up of action",     icon: Crosshair  },
  { key: "goal_line", label: "GOAL LINE",  hint: "offside / goal-line",    icon: Goal       },
];

const VIDEO_MAX_BYTES = 12 * 1024 * 1024;
const IMG_MAX_BYTES   = 8 * 1024 * 1024;

export const CameraAngleUploader = ({ value, onChange }) => {
  const [busyKey, setBusyKey] = useState(null);

  const updateSlot = (angle, patch) => {
    const next = { ...(value || {}) };
    next[angle] = { ...(next[angle] || {}), ...patch };
    // Strip slot if it has no media at all
    if (!next[angle].image_base64 && !next[angle].video_base64) delete next[angle];
    onChange(next);
  };

  const handleImage = (angle) => async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > IMG_MAX_BYTES) {
      toast.error(`Image too large for ${angle.toUpperCase()} (max 8 MB).`);
      e.target.value = "";
      return;
    }
    setBusyKey(`${angle}-img`);
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result;
      const b64 = String(dataUrl).split(",")[1];
      updateSlot(angle, { image_base64: b64, image_preview: dataUrl });
      setBusyKey(null);
    };
    reader.onerror = () => { setBusyKey(null); toast.error("Could not read image"); };
    reader.readAsDataURL(file);
  };

  const handleVideo = (angle) => async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > VIDEO_MAX_BYTES) {
      toast.error(`Clip too large for ${angle.toUpperCase()} (${(file.size/1024/1024).toFixed(1)} MB) — max 12 MB.`);
      e.target.value = "";
      return;
    }
    setBusyKey(`${angle}-vid`);
    const url = URL.createObjectURL(file);
    const reader = new FileReader();
    reader.onloadend = () => {
      const b64 = String(reader.result).split(",")[1];
      updateSlot(angle, { video_base64: b64, video_preview: url });
      setBusyKey(null);
      toast.success(`${angle.toUpperCase()} clip ready`);
    };
    reader.onerror = () => { setBusyKey(null); toast.error("Could not read video"); };
    reader.readAsDataURL(file);
  };

  const slotCount = Object.keys(value || {}).length;

  return (
    <div className="space-y-2" data-testid="camera-angle-uploader">
      <div className="flex items-center justify-between">
        <span className="text-[9px] font-mono uppercase tracking-[0.2em] text-gray-500">
          MULTI-CAMERA EVIDENCE
        </span>
        <span className={`text-[9px] font-mono ${slotCount > 0 ? "text-[#00E5FF]" : "text-gray-600"}`}>
          {slotCount}/4 ANGLES
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {ANGLES.map(({ key, label, hint, icon: Icon }) => {
          const slot = (value || {})[key] || {};
          const filled = !!(slot.image_base64 || slot.video_base64);
          const busy = busyKey?.startsWith(key);
          return (
            <div
              key={key}
              className={`border ${filled ? 'border-[#00E5FF]/40 bg-[#00E5FF]/[0.04]' : 'border-white/[0.08] bg-[#0A0A0A]'} relative`}
              data-testid={`angle-tile-${key}`}
            >
              <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-white/[0.06]">
                <Icon className={`w-3 h-3 ${filled ? "text-[#00E5FF]" : "text-gray-500"}`} />
                <span className={`text-[9px] font-heading font-bold tracking-[0.18em] uppercase ${filled ? "text-[#00E5FF]" : "text-gray-400"}`}>
                  {label}
                </span>
                <span className="text-[8px] font-mono text-gray-600 truncate">· {hint}</span>
                {filled && (
                  <button
                    onClick={() => onChange({ ...(value || {}), [key]: undefined })}
                    className="ml-auto text-gray-500 hover:text-[#FF2A2A] focus:outline-none"
                    title="Clear this angle"
                    data-testid={`angle-clear-${key}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

              <div className="p-2 min-h-[80px] flex items-center justify-center">
                {slot.image_preview ? (
                  <div className="relative w-full">
                    <img src={slot.image_preview} alt={label} className="w-full max-h-20 object-cover" />
                    {slot.video_preview && (
                      <span className="absolute top-1 right-1 px-1 py-0.5 bg-black/80 text-[8px] font-mono text-[#00FF88] border border-[#00FF88]/40">
                        + CLIP
                      </span>
                    )}
                  </div>
                ) : slot.video_preview ? (
                  <video src={slot.video_preview} className="w-full max-h-20 object-cover" muted />
                ) : (
                  <div className="flex flex-col items-center gap-1 text-gray-600 text-[9px] font-mono py-3">
                    {busy ? (
                      <span className="text-[#00E5FF] animate-pulse">UPLOADING…</span>
                    ) : (
                      <>
                        <ImageIcon className="w-4 h-4" />
                        <span>STILL OR CLIP</span>
                      </>
                    )}
                  </div>
                )}
              </div>

              <div className="flex border-t border-white/[0.06]">
                <label className="flex-1 cursor-pointer text-center py-1 text-[9px] font-mono text-gray-500 hover:text-[#00E5FF] hover:bg-[#00E5FF]/[0.06] transition-colors border-r border-white/[0.06]" data-testid={`angle-img-btn-${key}`}>
                  <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleImage(key)} className="hidden" />
                  + STILL
                </label>
                <label className="flex-1 cursor-pointer text-center py-1 text-[9px] font-mono text-gray-500 hover:text-[#00FF88] hover:bg-[#00FF88]/[0.06] transition-colors" data-testid={`angle-vid-btn-${key}`}>
                  <input type="file" accept="video/mp4,video/webm" onChange={handleVideo(key)} className="hidden" />
                  + CLIP
                </label>
              </div>
            </div>
          );
        })}
      </div>

      {slotCount > 0 && (
        <p className="text-[9px] font-mono text-gray-600 leading-tight">
          ✓ Neo Cortex will cross-reference {slotCount} synchronised angle{slotCount === 1 ? "" : "s"} for higher-confidence reasoning.
        </p>
      )}
    </div>
  );
};

/** Build the API payload — only slots with media survive. */
export const cameraAnglesToPayload = (value) => {
  if (!value) return [];
  const out = [];
  for (const key of ["broadcast", "tactical", "tight", "goal_line"]) {
    const s = value[key];
    if (!s) continue;
    if (!s.image_base64 && !s.video_base64) continue;
    out.push({
      angle: key,
      image_base64: s.image_base64 || null,
      video_base64: s.video_base64 || null,
    });
  }
  return out;
};
