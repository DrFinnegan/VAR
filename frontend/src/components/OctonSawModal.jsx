/**
 * OctonSawModal — interactive evidence walkthrough.
 *
 * Steps the operator (or a referee in a post-match briefing) through
 * each captured frame one at a time, with the per-frame observation
 * pinned alongside. Includes:
 *   - left/right arrows + keyboard ←/→ navigation
 *   - "play" mode that auto-advances every 2.2s
 *   - per-frame evidence chip (SUPPORTS / NEUTRAL / CONTRA)
 *   - confidence + final decision pinned in the header
 *   - a "save evidence pack" button (queues a tiny PNG montage download)
 *
 * Triggered by the operator clicking the radial-ring on the verdict
 * panel, or by clicking the "EXPLAIN" button on the SELECTED INCIDENT.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Play, Pause, X, Download, Eye } from "lucide-react";
import { Button } from "./ui/button";

const ev = {
  supports:    { color: "#00FF88", label: "SUPPORTS"  },
  neutral:     { color: "#94A3B8", label: "NEUTRAL"   },
  contradicts: { color: "#FF3333", label: "CONTRA"    },
};

export default function OctonSawModal({ open, onClose, analysis, incident, initialCinema = false, autoPlay = false }) {
  const frames = analysis?.analysed_frames_b64 || [];
  const breakdown = analysis?.frame_breakdown || [];
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [cinema, setCinema] = useState(false);
  const [fading, setFading] = useState(false);
  const dialogRef = useRef(null);
  // Offside drag-calibration state — declared BEFORE any early return to
  // comply with rules-of-hooks. Values are computed conditionally below.
  const [dragLines, setDragLines] = useState({ def: 0.48, att: 0.52 });
  const [dragging, setDragging] = useState(null); // 'def' | 'att' | null
  const dragRef = useRef(null);

  useEffect(() => {
    if (open) {
      setIdx(0);
      setCinema(initialCinema);
      setPlaying(autoPlay);
    }
  }, [open, initialCinema, autoPlay]);

  // Preload all frame images as soon as the modal opens so navigation
  // feels instant and the cinema crossfade is smooth.
  // Reset drag-calibration lines when frame changes or markers arrive.
  // Hook lives at top level; reads from props directly.
  useEffect(() => {
    if (!open) return;
    const markers = analysis?.offside_markers || [];
    const m = markers[idx];
    const defX = m && typeof m.offside_line_x === "number" ? m.offside_line_x : 0.48;
    const attX = m && typeof m.attacker_x === "number" ? m.attacker_x : 0.52;
    setDragLines({ def: defX, att: attX });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, idx, analysis?.offside_markers]);

  useEffect(() => {
    if (!open || !frames.length) return;
    frames.forEach((b) => {
      const im = new Image();
      im.src = `data:image/jpeg;base64,${b}`;
    });
  }, [open, frames]);

  const next = useCallback(() => {
    setFading(true);
    setTimeout(() => {
      setIdx((i) => (frames.length ? (i + 1) % frames.length : 0));
      setFading(false);
    }, 120);
  }, [frames.length]);
  const prev = useCallback(() => {
    setFading(true);
    setTimeout(() => {
      setIdx((i) => (frames.length ? (i - 1 + frames.length) % frames.length : 0));
      setFading(false);
    }, 120);
  }, [frames.length]);

  // Auto-play — cinema mode speeds up for a filmic walk-through.
  useEffect(() => {
    if (!playing || !open) return;
    const t = setInterval(next, cinema ? 700 : 2200);
    return () => clearInterval(t);
  }, [playing, open, next, cinema]);

  // Keyboard
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") prev();
      else if (e.key === "Escape") onClose?.();
      else if (e.key === " ") { e.preventDefault(); setPlaying((p) => !p); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, next, prev, onClose]);

  if (!open) return null;
  const cur = breakdown[idx] || {};
  const evd = ev[cur.evidence_for_decision] || ev.neutral;
  const conf = analysis?.final_confidence;
  const decision = analysis?.suggested_decision;
  const offsideMarkers = analysis?.offside_markers || [];
  const isOffside = (analysis?.cited_clause || "").toLowerCase().includes("offside")
    || (decision || "").toLowerCase().includes("offside")
    || (analysis?.incident_type === "offside");
  const rawMk = offsideMarkers[idx];
  const hasLlmCoords = rawMk && (typeof rawMk.offside_line_x === "number" || typeof rawMk.attacker_x === "number");
  const mk = isOffside ? {
    offside_line_x: dragLines.def,
    attacker_x: dragLines.att,
    verdict: hasLlmCoords ? rawMk.verdict : "estimate",
    daylight_cm: hasLlmCoords ? rawMk.daylight_cm : null,
    note: hasLlmCoords ? rawMk.note : "ESTIMATE — drag the amber DEFENDER and cyan ATTACKER lines to calibrate",
  } : null;

  // Drag handlers (capture plain fns — no hooks, safe after early return)
  const onMouseDownLine = (which) => (e) => {
    e.stopPropagation();
    setDragging(which);
  };
  const onMouseMoveFrame = (e) => {
    if (!dragging || !dragRef.current) return;
    const rect = dragRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setDragLines((s) => ({ ...s, [dragging]: x }));
  };
  const onMouseUpFrame = () => setDragging(null);

  const downloadEvidence = async () => {
    if (!frames.length) return;
    // Stitch all frames vertically into a PNG and trigger download.
    const imgs = await Promise.all(frames.map((b) => new Promise((res) => {
      const im = new Image();
      im.onload = () => res(im);
      im.src = `data:image/jpeg;base64,${b}`;
    })));
    const w = Math.max(...imgs.map((i) => i.width));
    const h = imgs.reduce((a, i) => a + i.height + 28, 24);
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, w, h);
    let y = 8;
    ctx.font = "bold 14px monospace";
    ctx.fillStyle = "#00E5FF";
    ctx.fillText(`OCTON SAW · ${frames.length} frames · conf ${conf?.toFixed?.(1) || conf}%`, 12, 18);
    y = 28;
    imgs.forEach((im, i) => {
      ctx.drawImage(im, 0, y, w, im.height * (w / im.width));
      y += im.height * (w / im.width);
      ctx.font = "bold 11px monospace";
      ctx.fillStyle = "#fff";
      ctx.fillText(`#${i + 1}: ${(breakdown[i]?.observation || "").slice(0, 110)}`, 12, y + 14);
      y += 20;
    });
    const a = document.createElement("a");
    a.download = `octon-evidence-${incident?.id?.slice(0, 8) || "incident"}.png`;
    a.href = c.toDataURL("image/png");
    a.click();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
      data-testid="octon-saw-modal"
      ref={dialogRef}
    >
      <div className="w-full max-w-5xl bg-[#0A0A0F] border border-[#00E5FF]/30 rounded-none flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-white/[0.06]">
          <div className="flex items-center gap-2 min-w-0">
            <Eye className="w-4 h-4 text-[#00E5FF]" />
            <div className="min-w-0">
              <p className="text-[10px] font-mono tracking-[0.25em] text-[#00E5FF]">OCTON SAW · EVIDENCE WALKTHROUGH</p>
              <p className="text-[11px] text-white truncate">
                {decision || "Verdict"}
                {conf != null && (
                  <span className="ml-2 text-gray-400 font-mono">{conf.toFixed?.(1) || conf}% conf</span>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-none">
            <Button size="sm" variant="ghost" onClick={downloadEvidence} className="text-gray-400 hover:text-[#00E5FF] h-8 px-2 rounded-none" data-testid="octon-saw-download" title="Download evidence pack PNG">
              <Download className="w-3.5 h-3.5" />
            </Button>
            <Button size="sm" variant="ghost" onClick={onClose} className="text-gray-400 hover:text-white h-8 px-2 rounded-none" data-testid="octon-saw-close">
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-3 p-4 overflow-auto">
          {/* Frame */}
          <div
            className="lg:col-span-2 relative bg-black border border-white/10 flex items-center justify-center min-h-[280px] select-none"
            ref={dragRef}
            onMouseMove={onMouseMoveFrame}
            onMouseUp={onMouseUpFrame}
            onMouseLeave={onMouseUpFrame}
          >
            {frames.length ? (
              <img
                key={idx}
                src={`data:image/jpeg;base64,${frames[idx]}`}
                alt={`Frame ${idx + 1}`}
                decoding="async"
                draggable="false"
                className={`w-full max-h-[60vh] object-contain transition-opacity duration-200 ${fading ? "opacity-0" : "opacity-100"}`}
                data-testid={`octon-saw-modal-frame-${idx}`}
              />
            ) : (
              <p className="text-[11px] text-gray-500 font-mono p-6 text-center">
                No frames were captured. This verdict was produced from text only.
              </p>
            )}
            {frames.length > 0 && (
              <span className="absolute top-2 left-2 px-2 py-0.5 bg-black/70 text-[10px] font-mono text-[#00E5FF]">
                #{idx + 1} / {frames.length}
              </span>
            )}
            {/* Auto offside markers overlay for offside incidents — draggable */}
            {frames.length > 0 && mk && (
              <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none" style={{ pointerEvents: 'none' }}>
                {typeof mk.offside_line_x === "number" && (
                  <g opacity={mk.verdict === "estimate" ? 0.65 : 0.95} style={{ pointerEvents: 'auto', cursor: 'ew-resize' }} onMouseDown={onMouseDownLine('def')}>
                    {/* 3-wide transparent hit zone so the 0.35 stroke is grab-able */}
                    <line x1={mk.offside_line_x * 100} y1="0" x2={mk.offside_line_x * 100} y2="100" stroke="transparent" strokeWidth="3" />
                    <line x1={mk.offside_line_x * 100} y1="0" x2={mk.offside_line_x * 100} y2="100" stroke="#FFB800" strokeWidth="0.35" strokeDasharray="1.5 0.8" />
                    <rect x={mk.offside_line_x * 100 - 7} y="2" width="14" height="4" fill="#000" stroke="#FFB800" strokeWidth="0.15" />
                    <text x={mk.offside_line_x * 100} y="5.2" textAnchor="middle" fill="#FFB800" fontSize="2.6" fontFamily="monospace" fontWeight="bold">DEFENDER</text>
                    <rect x={mk.offside_line_x * 100 - 2.5} y="94" width="5" height="3.2" fill="#FFB800" opacity="0.6" />
                    <text x={mk.offside_line_x * 100} y="96.3" textAnchor="middle" fill="#000" fontSize="1.9" fontFamily="monospace" fontWeight="bold">↔</text>
                  </g>
                )}
                {typeof mk.attacker_x === "number" && (
                  <g opacity={mk.verdict === "estimate" ? 0.65 : 0.95} style={{ pointerEvents: 'auto', cursor: 'ew-resize' }} onMouseDown={onMouseDownLine('att')}>
                    <line x1={mk.attacker_x * 100} y1="0" x2={mk.attacker_x * 100} y2="100" stroke="transparent" strokeWidth="3" />
                    <line x1={mk.attacker_x * 100} y1="0" x2={mk.attacker_x * 100} y2="100" stroke="#00E5FF" strokeWidth="0.35" strokeDasharray="1.5 0.8" />
                    <rect x={mk.attacker_x * 100 - 7} y="8" width="14" height="4" fill="#000" stroke="#00E5FF" strokeWidth="0.15" />
                    <text x={mk.attacker_x * 100} y="11.2" textAnchor="middle" fill="#00E5FF" fontSize="2.6" fontFamily="monospace" fontWeight="bold">ATTACKER</text>
                    <rect x={mk.attacker_x * 100 - 2.5} y="90" width="5" height="3.2" fill="#00E5FF" opacity="0.6" />
                    <text x={mk.attacker_x * 100} y="92.3" textAnchor="middle" fill="#000" fontSize="1.9" fontFamily="monospace" fontWeight="bold">↔</text>
                  </g>
                )}
              </svg>
            )}
            {mk?.verdict && (
              <div className="absolute bottom-2 right-2 px-2 py-1 bg-black/90 border pointer-events-none"
                style={{ borderColor: mk.verdict === "offside" ? "#FF333399" : mk.verdict === "onside" ? "#00FF8899" : mk.verdict === "estimate" ? "#94A3B899" : "#94A3B899" }}
                data-testid="octon-offside-verdict-chip"
              >
                <span className="text-[10px] font-mono font-bold tracking-[0.15em]"
                  style={{ color: mk.verdict === "offside" ? "#FF3333" : mk.verdict === "onside" ? "#00FF88" : mk.verdict === "estimate" ? "#94A3B8" : "#94A3B8" }}
                >
                  {mk.verdict.toUpperCase()}
                </span>
                {mk.daylight_cm != null ? (
                  <span className="ml-2 text-[10px] font-mono text-white">
                    {Math.abs(mk.daylight_cm)} cm {mk.daylight_cm >= 0 ? "beyond line" : "behind line"}
                  </span>
                ) : (
                  <span className="ml-2 text-[10px] font-mono text-gray-400">
                    drag lines to calibrate
                  </span>
                )}
              </div>
            )}
            {cur.evidence_for_decision && (
              <span
                className="absolute top-2 right-2 px-2 py-0.5 bg-black/70 text-[10px] font-mono"
                style={{ color: evd.color }}
              >
                {evd.label}
              </span>
            )}
          </div>

          {/* Per-frame observation + filmstrip */}
          <div className="space-y-3 min-w-0">
            <div className="border border-white/10 p-3 bg-black/40">
              <p className="text-[9px] font-mono tracking-[0.2em] text-gray-500 mb-1">FRAME OBSERVATION</p>
              <p className="text-[12px] text-white leading-snug" data-testid="octon-saw-modal-observation">
                {cur.observation || (frames.length ? "—" : "No frames analysed.")}
              </p>
              {cur.evidence_for_decision && (
                <p className="mt-2 text-[10px] font-mono" style={{ color: evd.color }}>
                  Evidence: {evd.label}
                </p>
              )}
            </div>
            {/* Filmstrip */}
            {frames.length > 1 && (
              <div className="grid grid-cols-4 gap-1">
                {frames.map((b, i) => (
                  <button
                    key={i}
                    onClick={() => setIdx(i)}
                    className={`relative border ${i === idx ? "border-[#00E5FF]" : "border-white/10"} hover:border-[#00E5FF]/60 transition-colors`}
                    data-testid={`octon-saw-modal-thumb-${i}`}
                  >
                    <img src={`data:image/jpeg;base64,${b}`} alt={`Frame ${i + 1}`} className="w-full aspect-video object-cover opacity-90" />
                    <span className="absolute top-0.5 left-0.5 px-1 bg-black/70 text-[8px] font-mono text-[#00E5FF]">#{i + 1}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer controls */}
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-white/[0.06]">
          <p className="text-[9px] font-mono text-gray-500 hidden sm:block">← / → to step · SPACE to play · ESC to close</p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCinema((c) => !c)}
              className={`text-[9px] font-mono tracking-[0.2em] border px-2 h-8 transition-all ${cinema ? "text-[#B366FF] border-[#B366FF]/60 bg-[#B366FF]/10" : "text-gray-500 border-white/10 hover:border-[#B366FF]/40 hover:text-[#B366FF]"}`}
              data-testid="octon-saw-cinema-toggle"
              title="Cinema mode — fast crossfade walk-through for demos"
            >
              CINEMA {cinema ? "ON" : "OFF"}
            </button>
            <Button size="sm" onClick={prev} disabled={frames.length < 2} className="bg-transparent text-[#00E5FF] border border-[#00E5FF]/30 hover:bg-[#00E5FF]/10 rounded-none h-8" data-testid="octon-saw-prev">
              <ChevronLeft className="w-3.5 h-3.5" />
            </Button>
            <Button size="sm" onClick={() => setPlaying((p) => !p)} disabled={frames.length < 2} className="bg-transparent text-[#00E5FF] border border-[#00E5FF]/30 hover:bg-[#00E5FF]/10 rounded-none h-8" data-testid="octon-saw-play">
              {playing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            </Button>
            <Button size="sm" onClick={next} disabled={frames.length < 2} className="bg-transparent text-[#00E5FF] border border-[#00E5FF]/30 hover:bg-[#00E5FF]/10 rounded-none h-8" data-testid="octon-saw-next">
              <ChevronRight className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
