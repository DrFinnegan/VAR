/**
 * OctonSawStrip — operator-facing evidence trail.
 *
 * Renders the actual frame thumbnails the engine analysed plus a
 * per-frame observation pulled from `ai_analysis.frame_breakdown`. Killing
 * the "imaginary verdict" suspicion dead — referees can verify that the
 * model looked at real pixels and that the reasoning maps to specific
 * frames rather than a generic narrative.
 *
 * Color coding for `evidence_for_decision`:
 *   supports     → green
 *   neutral      → gray
 *   contradicts  → red
 */
import { Camera, Eye } from "lucide-react";

const ev = {
  supports:    { color: "#00FF88", label: "SUPPORTS" },
  neutral:     { color: "#94A3B8", label: "NEUTRAL"  },
  contradicts: { color: "#FF3333", label: "CONTRA"   },
};

export default function OctonSawStrip({ analysis, onExplain }) {
  const frames = analysis?.analysed_frames_b64 || [];
  const breakdown = analysis?.frame_breakdown || [];
  const frameCount = analysis?.camera_angles_analyzed
    ?? frames.length
    ?? 0;

  if (frameCount === 0 && frames.length === 0) {
    return (
      <div className="border border-[#FFB800]/30 bg-gradient-to-r from-[#FFB800]/[0.06] to-transparent p-3" data-testid="octon-saw-strip">
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <div className="flex items-center gap-2">
            <Eye className="w-3.5 h-3.5 text-[#FFB800]" />
            <span className="text-[10px] font-mono tracking-[0.2em] text-[#FFB800] font-bold">
              OCTON SAW · TEXT-ONLY ANALYSIS
            </span>
          </div>
          <span className="text-[8px] font-mono tracking-[0.2em] text-[#FFB800]/70 px-1.5 py-0.5 border border-[#FFB800]/30 bg-[#FFB800]/10">
            ⚠ NO VISUAL EVIDENCE
          </span>
        </div>
        <p className="text-[10px] text-gray-300 leading-snug">
          This verdict was produced from <span className="text-[#FFB800] font-bold">text only</span> — no video or
          image was attached when the incident was created. Confidence is hard-capped at 70%. To unlock
          high-confidence multi-frame analysis, click <span className="text-[#00E5FF] font-bold">RE-ANALYSE</span> after
          uploading footage, or use <span className="text-[#FF3333] font-bold">GO LIVE</span> to capture the
          last 8 s of a broadcast directly.
        </p>
      </div>
    );
  }

  return (
    <div className="border border-white/[0.08] bg-[#0A0A0A]" data-testid="octon-saw-strip">
      <div className="px-3 py-2 border-b border-white/[0.06] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Eye className="w-3 h-3 text-[#00E5FF]" />
          <span className="text-[10px] font-mono tracking-[0.2em] text-[#00E5FF] font-bold">
            OCTON SAW · {frames.length} FRAME{frames.length === 1 ? "" : "S"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {onExplain && frames.length > 0 && (
            <button
              onClick={onExplain}
              className="text-[9px] font-mono tracking-[0.2em] text-[#00E5FF] hover:text-white border border-[#00E5FF]/30 hover:border-[#00E5FF]/60 px-2 py-0.5 transition-colors"
              data-testid="octon-saw-explain-button"
              title="Show me how OCTON saw this — frame-by-frame walkthrough (press C for cinema)"
            >
              EXPLAIN ▶
            </button>
          )}
          {frames.length > 0 && (
            <kbd
              className="hidden md:inline-flex text-[9px] font-mono tracking-[0.15em] text-[#B366FF]/80 border border-[#B366FF]/30 bg-[#B366FF]/5 px-1.5 py-0.5"
              title="Press C from anywhere on the LiveVAR page to open this evidence in cinema auto-play"
            >
              C · CINEMA
            </kbd>
          )}
          <span className="text-[9px] font-mono text-gray-500">forensic evidence trail</span>
        </div>
      </div>

      {frames.length > 0 && (
        <div className="grid grid-cols-4 gap-1 p-2 bg-black">
          {frames.map((b64, i) => (
            <div key={i} className="relative group" data-testid={`octon-saw-frame-${i}`}>
              <img
                src={`data:image/jpeg;base64,${b64}`}
                alt={`Frame ${i + 1}`}
                className="w-full aspect-video object-cover border border-white/10 transition-transform duration-200 group-hover:scale-[1.02]"
                loading="lazy"
                decoding="async"
              />
              <span className="absolute top-1 left-1 px-1 bg-black/70 text-[8px] font-mono text-[#00E5FF]">
                #{i + 1}
              </span>
              {breakdown[i]?.evidence_for_decision && ev[breakdown[i].evidence_for_decision] && (
                <span
                  className="absolute top-1 right-1 px-1 bg-black/70 text-[8px] font-mono"
                  style={{ color: ev[breakdown[i].evidence_for_decision].color }}
                >
                  {ev[breakdown[i].evidence_for_decision].label}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {breakdown.length > 0 && (
        <div className="border-t border-white/[0.06] p-3 space-y-2" data-testid="frame-breakdown-list">
          <div className="flex items-center gap-1.5 mb-1">
            <Camera className="w-3 h-3 text-gray-500" />
            <span className="text-[9px] font-mono tracking-[0.2em] text-gray-500">PER-FRAME OBSERVATIONS</span>
          </div>
          {breakdown.map((b, i) => {
            const evd = ev[b.evidence_for_decision] || ev.neutral;
            return (
              <div key={i} className="flex gap-2 items-start text-[11px] leading-snug">
                <span
                  className="font-mono text-[9px] flex-none px-1.5 py-0.5 mt-0.5"
                  style={{ color: evd.color, borderColor: `${evd.color}55`, borderWidth: 1 }}
                >
                  #{b.frame || i + 1}
                </span>
                <p className="text-gray-300">{b.observation || "—"}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
