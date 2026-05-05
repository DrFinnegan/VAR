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
import axios from "axios";
import { ChevronLeft, ChevronRight, Play, Pause, X, Download, Eye } from "lucide-react";
import { Button } from "./ui/button";

const API = process.env.REACT_APP_BACKEND_URL + "/api";

const ev = {
  supports:    { color: "#00FF88", label: "SUPPORTS"  },
  neutral:     { color: "#94A3B8", label: "NEUTRAL"   },
  contradicts: { color: "#FF3333", label: "CONTRA"    },
};

export default function OctonSawModal({ open, onClose, analysis, incident, initialCinema = false, autoPlay = false }) {
  const frames = analysis?.analysed_frames_b64 || [];
  const breakdown = analysis?.frame_breakdown || [];
  const tiltLedger = analysis?.tilt_override_history || [];
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [cinema, setCinema] = useState(false);
  const [fading, setFading] = useState(false);
  const dialogRef = useRef(null);
  // ── Offside drag-calibration state — declared BEFORE any early return to
  // comply with rules-of-hooks. Values are computed conditionally below.
  // 2026-02 fix: lines previously rendered purely vertical, which is wrong
  // for any broadcast camera (the goal line and halfway line are tilted in
  // the frame due to camera perspective). `tilt` (degrees) rotates BOTH
  // lines around their midpoint so they stay parallel to the goal line.
  // Operator drags the TILT slider to align with a reference line on the
  // pitch (centre line, byline, six-yard box etc).
  const [dragLines, setDragLines] = useState({ def: 0.48, att: 0.52, tilt: 0 });
  // tiltSource: 'auto' (OpenCV/AI), 'consensus' (median across frames),
  // 'llm' (GPT-5.2 returned a value), 'manual' (operator overrode).
  // Drives the small badge next to the angle chip in the SAW modal so
  // the operator immediately knows whether the line is computed or
  // hand-set. Resets to 'manual' the moment the slider is touched.
  const [tiltSource, setTiltSource] = useState(null);
  const [showLedger, setShowLedger] = useState(false);
  const [dragging, setDragging] = useState(null); // 'def' | 'att' | 'tilt' | null
  const dragRef = useRef(null);

  // ── Persist operator's tilt override so it survives modal re-open ──
  // Hooks must be declared BEFORE the early `if (!open) return null`
  // below to satisfy rules-of-hooks. Debounced so a slider drag
  // generating dozens of onChange events only fires one PATCH.
  const persistTimer = useRef(null);
  const persistTiltOverride = useCallback((degrees) => {
    const id = incident?.id;
    if (!id) return;
    if (persistTimer.current) clearTimeout(persistTimer.current);
    const i = idx;
    persistTimer.current = setTimeout(async () => {
      try {
        await axios.patch(
          `${API}/incidents/${id}/offside-tilt`,
          {
            frame_index: i,
            pitch_angle_deg: degrees,
            tilt_source: "manual",
          },
          { withCredentials: true }
        );
      } catch (e) {
        // Best-effort — don't disrupt operator UX with toast errors.
        // eslint-disable-next-line no-console
        console.warn("tilt-override persist failed", e?.message);
      }
    }, 350);
  }, [incident?.id, idx]);

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
    // pitch_angle_deg is optional — AI may infer broadcast-camera tilt.
    // Clamp to reasonable bounds so we never spin lines absurdly.
    const tilt = m && typeof m.pitch_angle_deg === "number"
      ? Math.max(-30, Math.min(30, m.pitch_angle_deg))
      : 0;
    setDragLines({ def: defX, att: attX, tilt });
    // Source badge: read from server when present; otherwise null until
    // the operator interacts with the slider (which sets to 'manual').
    setTiltSource(m && m.tilt_source ? m.tilt_source : null);
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
    pitch_angle_deg: dragLines.tilt,
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
    if (dragging === "tilt") {
      // Map horizontal cursor displacement from frame centre to ±30° tilt.
      // Drag right of centre → positive tilt (top of line leans right).
      const x = (e.clientX - rect.left) / rect.width; // 0..1
      const deg = Math.max(-30, Math.min(30, (x - 0.5) * 60));
      setDragLines((s) => ({ ...s, tilt: deg }));
      setTiltSource("manual");
      return;
    }
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setDragLines((s) => ({ ...s, [dragging]: x }));
  };
  const onMouseUpFrame = () => {
    // If the operator was tilt-dragging, persist the override now that
    // they've released. We store on every frame so the consensus
    // remains coherent across the clip.
    if (dragging === "tilt" && incident?.id) {
      persistTiltOverride(dragLines.tilt);
    }
    setDragging(null);
  };
  const resetTilt = () => {
    setDragLines((s) => ({ ...s, tilt: 0 }));
    setTiltSource("manual");
    if (incident?.id) persistTiltOverride(0);
  };

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

  // Single-frame referee export — the CURRENT frame with offside lines and
  // verdict overlay burned in. For referee match-report attachments where
  // a single annotated still is preferred over the full multi-frame pack.
  const downloadCurrentFrame = async () => {
    if (!frames.length) return;
    const im = await new Promise((res) => {
      const i = new Image();
      i.onload = () => res(i);
      i.src = `data:image/jpeg;base64,${frames[idx]}`;
    });
    const W = im.width, H = im.height;
    const c = document.createElement("canvas");
    c.width = W; c.height = H + 56;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H + 56);
    ctx.drawImage(im, 0, 0, W, H);

    // Draw offside lines if this is an offside frame and we have markers.
    // Both lines share `pitch_angle_deg` (degrees) so they stay parallel to
    // the goal line under broadcast-camera perspective. We rotate the
    // canvas around each line's midpoint so the line itself tilts but the
    // background image stays untouched.
    if (mk) {
      const tiltDeg = mk.pitch_angle_deg || 0;
      const tiltRad = (tiltDeg * Math.PI) / 180;
      // Defender line — amber dashed
      if (typeof mk.offside_line_x === "number") {
        const x = mk.offside_line_x * W;
        ctx.save();
        ctx.translate(x, H / 2);
        ctx.rotate(tiltRad);
        ctx.strokeStyle = "#FFB800";
        ctx.lineWidth = Math.max(2, W / 600);
        ctx.setLineDash([10, 6]);
        ctx.beginPath(); ctx.moveTo(0, -H / 2); ctx.lineTo(0, H / 2); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = "#000";
        ctx.fillRect(-56, -H / 2 + 8, 112, 22);
        ctx.strokeStyle = "#FFB800"; ctx.lineWidth = 1;
        ctx.strokeRect(-56, -H / 2 + 8, 112, 22);
        ctx.fillStyle = "#FFB800";
        ctx.font = "bold 13px monospace";
        ctx.textAlign = "center";
        ctx.fillText("DEFENDER", 0, -H / 2 + 24);
        ctx.restore();
      }
      // Attacker line — cyan dashed
      if (typeof mk.attacker_x === "number") {
        const x = mk.attacker_x * W;
        ctx.save();
        ctx.translate(x, H / 2);
        ctx.rotate(tiltRad);
        ctx.strokeStyle = "#00E5FF";
        ctx.lineWidth = Math.max(2, W / 600);
        ctx.setLineDash([10, 6]);
        ctx.beginPath(); ctx.moveTo(0, -H / 2); ctx.lineTo(0, H / 2); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = "#000";
        ctx.fillRect(-56, -H / 2 + 36, 112, 22);
        ctx.strokeStyle = "#00E5FF"; ctx.lineWidth = 1;
        ctx.strokeRect(-56, -H / 2 + 36, 112, 22);
        ctx.fillStyle = "#00E5FF";
        ctx.font = "bold 13px monospace";
        ctx.textAlign = "center";
        ctx.fillText("ATTACKER", 0, -H / 2 + 52);
        ctx.restore();
      }
      // Verdict pill (bottom-right of image) — NOT rotated, always level
      if (mk.verdict) {
        const v = mk.verdict.toUpperCase();
        const vc = mk.verdict === "offside" ? "#FF3333"
                  : mk.verdict === "onside" ? "#00FF88"
                  : "#94A3B8";
        ctx.font = "bold 16px monospace";
        const text = mk.daylight_cm != null
          ? `${v}  ${Math.abs(mk.daylight_cm)}cm ${mk.daylight_cm >= 0 ? "BEYOND" : "BEHIND"}`
          : v;
        const tw = ctx.measureText(text).width;
        ctx.fillStyle = "#000";
        ctx.fillRect(W - tw - 36, H - 44, tw + 24, 28);
        ctx.strokeStyle = vc; ctx.lineWidth = 2;
        ctx.strokeRect(W - tw - 36, H - 44, tw + 24, 28);
        ctx.fillStyle = vc;
        ctx.textAlign = "left";
        ctx.fillText(text, W - tw - 24, H - 24);
      }
    }

    // Footer strip — referee report header
    ctx.fillStyle = "#0A0A0F";
    ctx.fillRect(0, H, W, 56);
    ctx.fillStyle = "#00E5FF";
    ctx.font = "bold 11px monospace";
    ctx.textAlign = "left";
    ctx.fillText("OCTON VAR · REFEREE EXPORT", 12, H + 18);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 13px monospace";
    const verdict = (decision || "Verdict").slice(0, 90);
    ctx.fillText(verdict, 12, H + 38);
    ctx.fillStyle = "#94A3B8";
    ctx.font = "11px monospace";
    ctx.textAlign = "right";
    const meta = `Frame ${idx + 1}/${frames.length} · conf ${conf?.toFixed?.(1) || conf || "—"}% · ${incident?.id?.slice(0, 8) || ""}`;
    ctx.fillText(meta, W - 12, H + 38);

    const a = document.createElement("a");
    a.download = `octon-frame-${incident?.id?.slice(0, 8) || "incident"}-${idx + 1}.png`;
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
            {isOffside && frames.length > 0 && (
              <Button size="sm" variant="ghost" onClick={downloadCurrentFrame} className="text-gray-400 hover:text-[#FFB800] h-8 px-2 rounded-none" data-testid="octon-saw-export-frame" title="Export current frame with offside lines + verdict (referee report)">
                <span className="text-[9px] font-mono tracking-[0.2em] mr-1">FRAME</span>
                <Download className="w-3.5 h-3.5" />
              </Button>
            )}
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
            {/* Auto offside markers overlay for offside incidents — draggable.
                Both lines share a single `tilt` (degrees) so they remain
                parallel to the goal line under broadcast-camera perspective.
                The rotation pivot is the midpoint of each line (cx, 50). */}
            {frames.length > 0 && mk && (
              <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none" style={{ pointerEvents: 'none' }}>
                {typeof mk.offside_line_x === "number" && (
                  <g
                    opacity={mk.verdict === "estimate" ? 0.65 : 0.95}
                    style={{ pointerEvents: 'auto', cursor: 'ew-resize' }}
                    onMouseDown={onMouseDownLine('def')}
                    transform={`rotate(${mk.pitch_angle_deg || 0}, ${mk.offside_line_x * 100}, 50)`}
                  >
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
                  <g
                    opacity={mk.verdict === "estimate" ? 0.65 : 0.95}
                    style={{ pointerEvents: 'auto', cursor: 'ew-resize' }}
                    onMouseDown={onMouseDownLine('att')}
                    transform={`rotate(${mk.pitch_angle_deg || 0}, ${mk.attacker_x * 100}, 50)`}
                  >
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
            {/* TILT calibration slider — adjusts perspective angle of both
                offside lines simultaneously so they remain parallel to the
                pitch's goal line under broadcast-camera perspective. */}
            {frames.length > 0 && mk && (
              <div
                className="absolute left-2 bottom-2 flex items-center gap-2 px-2 py-1 bg-black/85 border border-[#94A3B8]/40"
                style={{ pointerEvents: 'auto' }}
                data-testid="octon-offside-tilt-control"
              >
                <span className="text-[9px] font-mono tracking-[0.2em] text-[#94A3B8]">TILT</span>
                <input
                  type="range"
                  min="-30"
                  max="30"
                  step="0.5"
                  value={mk.pitch_angle_deg || 0}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    setDragLines((s) => ({ ...s, tilt: v }));
                    setTiltSource("manual");
                    persistTiltOverride(v);
                  }}
                  className="w-32 accent-[#FFB800]"
                  data-testid="octon-offside-tilt-slider"
                  title="Drag to align lines with the goal line / centre line under camera perspective"
                />
                <button
                  onClick={resetTilt}
                  onDoubleClick={resetTilt}
                  className="text-[8px] font-mono tracking-[0.2em] text-gray-400 hover:text-[#FFB800] px-1 border border-white/10 hover:border-[#FFB800]/40"
                  data-testid="octon-offside-tilt-reset"
                  title="Reset tilt to 0°"
                >
                  {(mk.pitch_angle_deg || 0).toFixed(1)}°
                </button>
                {tiltSource && (
                  <span
                    className={`text-[8px] font-mono tracking-[0.2em] px-1 py-0.5 border ${
                      tiltSource === "auto"
                        ? "text-[#00E5FF] border-[#00E5FF]/40 bg-[#00E5FF]/10"
                        : tiltSource === "consensus"
                        ? "text-[#B366FF] border-[#B366FF]/40 bg-[#B366FF]/10"
                        : tiltSource === "llm"
                        ? "text-[#00FF88] border-[#00FF88]/40 bg-[#00FF88]/10"
                        : "text-[#FFB800] border-[#FFB800]/40 bg-[#FFB800]/10"
                    }`}
                    data-testid={`octon-offside-tilt-source-${tiltSource}`}
                    title={
                      tiltSource === "auto"
                        ? "Computed by OpenCV Hough-line detector on the broadcast frame"
                        : tiltSource === "consensus"
                        ? "Median tilt across multiple frames"
                        : tiltSource === "llm"
                        ? "Pre-filled by GPT-5.2 from visible pitch markings"
                        : "Operator-set"
                    }
                  >
                    {tiltSource.toUpperCase()}
                  </span>
                )}
                {tiltLedger && tiltLedger.length > 0 && (
                  <button
                    onClick={() => setShowLedger((v) => !v)}
                    className="text-[8px] font-mono tracking-[0.2em] text-gray-400 hover:text-[#00E5FF] px-1 border border-white/10 hover:border-[#00E5FF]/40"
                    data-testid="octon-offside-tilt-ledger-toggle"
                    title={`${tiltLedger.length} operator override${tiltLedger.length === 1 ? "" : "s"} on file`}
                  >
                    LEDGER ({tiltLedger.length})
                  </button>
                )}
              </div>
            )}
            {/* Audit ledger popover */}
            {showLedger && tiltLedger && tiltLedger.length > 0 && (
              <div
                className="absolute left-2 bottom-12 w-[340px] max-h-[260px] overflow-y-auto bg-[#0A0A0A] border border-[#00E5FF]/40 p-3 z-30"
                style={{ pointerEvents: 'auto' }}
                data-testid="octon-offside-tilt-ledger"
              >
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[9px] font-mono tracking-[0.28em] text-[#00E5FF] uppercase">
                    Tilt Override Ledger
                  </p>
                  <button
                    onClick={() => setShowLedger(false)}
                    className="text-gray-400 hover:text-white text-[14px] leading-none"
                    aria-label="Close"
                  >
                    ×
                  </button>
                </div>
                <div className="space-y-1.5">
                  {tiltLedger.slice().reverse().map((entry, i) => (
                    <div
                      key={i}
                      className="border border-white/[0.06] p-2"
                      data-testid={`octon-offside-tilt-ledger-row-${i}`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[9px] font-mono text-white truncate">
                          {entry.by || "operator"}
                        </span>
                        <span className="text-[9px] font-mono text-gray-500 flex-none">
                          {entry.at?.replace("T", " ").slice(0, 19)}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-[9px] font-mono">
                        <span className="text-gray-500">
                          {typeof entry.from_pitch_angle_deg === "number"
                            ? `${entry.from_pitch_angle_deg.toFixed(1)}°`
                            : "—"}
                        </span>
                        <span className="text-gray-600">→</span>
                        <span className="text-[#FFB800]">
                          {typeof entry.to_pitch_angle_deg === "number"
                            ? `${entry.to_pitch_angle_deg.toFixed(1)}°`
                            : "—"}
                        </span>
                        <span className="text-gray-600 truncate">
                          [frame {(entry.frame_index ?? 0) + 1}]
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
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
