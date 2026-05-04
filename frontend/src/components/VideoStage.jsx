/**
 * VideoStage — the OCTON video player + scrubber + annotation surface.
 * Drives playback, frame stepping, PNG export, and exposes the current
 * annotated frame to the global PDF export pipeline via `frameCaptureRef`.
 */
import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import {
  Brain, Play, Pause, SkipBack, SkipForward, ChevronLeft, ChevronRight,
} from "lucide-react";
import { Button } from "./ui/button";
import { API } from "../lib/api";
import { frameCaptureRef } from "../contexts/SelectedIncidentContext";
import { AnnotationCanvas, ANNOTATION_TOOLS } from "./AnnotationCanvas";
import { AnnotationToolbar } from "./AnnotationToolbar";

export const VideoStage = ({ incident, onAnalyze, previewImage, previewVideo, onSaveAnnotations, onActiveAngleChange, angleAssessments = [] }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentFrame, setCurrentFrame] = useState(1847);
  const [totalFrames] = useState(3200);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [matchTime, setMatchTime] = useState({ min: 67, sec: 12, ms: 450 });
  const [scrubberHover, setScrubberHover] = useState(null);
  const scrubberRef = useRef(null);
  const videoRef = useRef(null);
  const [annotations, setAnnotations] = useState([]);
  const [activeTool, setActiveTool] = useState(ANNOTATION_TOOLS.NONE);
  const [activeColor, setActiveColor] = useState("#00E5FF");
  const [isAnnotating, setIsAnnotating] = useState(false);
  const [activeFormations, setActiveFormations] = useState({});
  const stageRef = useRef(null);

  // ── Multi-camera-angle support ───────────────────────────
  // `incident.camera_angles` is an array of { angle, storage_path,
  // video_storage_path }. The "primary" tab represents the legacy
  // top-level still/video. When the operator clicks a tab, we re-derive
  // imgSrc / videoSrc from that angle's storage paths.
  const angles = Array.isArray(incident?.camera_angles) ? incident.camera_angles : [];
  const [activeAngle, setActiveAngle] = useState("primary");
  // Reset to primary whenever the incident itself changes.
  useEffect(() => { setActiveAngle("primary"); }, [incident?.id]);
  // Notify parent so the PDF export / analysis panel know which angle is on screen
  useEffect(() => {
    if (onActiveAngleChange) onActiveAngleChange(activeAngle);
  }, [activeAngle, onActiveAngleChange]);
  // Grid view: render all 4 angles simultaneously in a 2×2 mosaic
  const [gridView, setGridView] = useState(false);
  // Auto-disable grid when the incident has no angles
  useEffect(() => { if (angles.length === 0) setGridView(false); }, [angles.length]);
  // Refs to each tile's <video> element so the master scrubber can seek
  // all 4 simultaneously. Indexed by angle key.
  const gridVideoRefs = useRef({ broadcast: null, tactical: null, tight: null, goal_line: null });

  const activeAngleEntry = activeAngle === "primary"
    ? null
    : angles.find(a => a.angle === activeAngle);

  const imgSrc = previewImage
    || (activeAngleEntry?.storage_path ? `${API}/files/${activeAngleEntry.storage_path}` : null)
    || (activeAngle === "primary" && incident?.has_image && incident?.storage_path ? `${API}/files/${incident.storage_path}` : null);
  const videoSrc = previewVideo
    || (activeAngleEntry?.video_storage_path ? `${API}/files/${activeAngleEntry.video_storage_path}` : null)
    || (activeAngle === "primary" && incident?.has_video && incident?.video_storage_path ? `${API}/files/${incident.video_storage_path}` : null);

  useEffect(() => {
    if (incident?.annotations) setAnnotations(incident.annotations);
    else setAnnotations([]);
  }, [incident?.id, incident?.annotations]);

  const timeStr = `${String(matchTime.min).padStart(2,'0')}:${String(matchTime.sec).padStart(2,'0')}.${String(matchTime.ms).padStart(3,'0')}`;

  const handleSaveAnnotations = async () => {
    if (!incident?.id || annotations.length === 0) return;
    try {
      await axios.put(`${API}/incidents/${incident.id}/annotations`, { annotations, frame: currentFrame, match_time: timeStr });
      toast.success(`${annotations.length} annotations saved!`);
      if (onSaveAnnotations) onSaveAnnotations(annotations);
    } catch { toast.error("Failed to save annotations"); }
  };

  // PNG Export for referee reports
  const handleExport = async () => {
    const stage = stageRef.current;
    if (!stage) return;
    try {
      const canvas = document.createElement("canvas");
      const w = 1920, h = 1080;
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");

      ctx.fillStyle = "#050505";
      ctx.fillRect(0, 0, w, h);

      const mediaEl = stage.querySelector("video") || stage.querySelector("img");
      if (mediaEl) {
        try { ctx.drawImage(mediaEl, 0, 0, w, h - 120); } catch { /* cross-origin */ }
      }

      const mainH = h - 120;
      annotations.forEach(a => {
        ctx.lineWidth = 3;
        ctx.strokeStyle = a.color || "#00E5FF";
        ctx.fillStyle = a.color || "#00E5FF";
        if (a.type === "line") {
          ctx.beginPath(); ctx.moveTo(a.x1/100*w, a.y1/100*mainH); ctx.lineTo(a.x2/100*w, a.y2/100*mainH); ctx.stroke();
        } else if (a.type === "circle") {
          ctx.beginPath(); ctx.arc(a.cx/100*w, a.cy/100*mainH, a.r/100*Math.min(w,mainH), 0, Math.PI*2); ctx.stroke();
        } else if (a.type === "marker") {
          ctx.beginPath(); ctx.arc(a.x/100*w, a.y/100*mainH, 8, 0, Math.PI*2); ctx.fill();
          ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(a.x/100*w, a.y/100*mainH, 16, 0, Math.PI*2); ctx.stroke();
        } else if (a.type === "formation_player") {
          ctx.beginPath(); ctx.arc(a.x/100*w, a.y/100*mainH, 12, 0, Math.PI*2); ctx.fill();
          ctx.fillStyle = "#000"; ctx.font = "bold 10px monospace"; ctx.textAlign = "center";
          ctx.fillText(a.label || "", a.x/100*w, a.y/100*mainH + 3.5);
          ctx.fillStyle = a.color;
        } else if (a.type === "offside_line") {
          ctx.setLineDash([12, 6]); ctx.beginPath(); ctx.moveTo(0, a.y/100*mainH); ctx.lineTo(w, a.y/100*mainH); ctx.stroke(); ctx.setLineDash([]);
          ctx.font = "bold 14px monospace"; ctx.fillText("OFFSIDE LINE", 20, a.y/100*mainH - 8);
        } else if (a.type === "offside_line_v") {
          ctx.setLineDash([12, 6]); ctx.beginPath(); ctx.moveTo(a.x/100*w, 0); ctx.lineTo(a.x/100*w, mainH); ctx.stroke(); ctx.setLineDash([]);
          ctx.font = "bold 14px monospace"; ctx.textAlign = "center"; ctx.fillText(a.label || "OFFSIDE", a.x/100*w, 20);
          ctx.textAlign = "start";
        }
      });

      const fy = h - 110;
      ctx.fillStyle = "#0A0A0A"; ctx.fillRect(0, fy, w, 110);
      ctx.strokeStyle = "#00E5FF33"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, fy); ctx.lineTo(w, fy); ctx.stroke();

      ctx.fillStyle = "#00E5FF"; ctx.font = "bold 18px monospace";
      ctx.fillText("OCTON VAR - REFEREE REPORT", 20, fy + 28);
      ctx.fillStyle = "#888"; ctx.font = "12px monospace";
      ctx.fillText(`OCTON VAR Forensic AI | ${new Date().toISOString().split("T")[0]}`, 20, fy + 48);
      if (incident) {
        ctx.fillText(`Incident: ${incident.incident_type?.toUpperCase()} | Match Time: ${incident.timestamp_in_match || "N/A"} | ${incident.team_involved || ""} ${incident.player_involved || ""}`, 20, fy + 68);
        const ai = incident.ai_analysis;
        if (ai) {
          ctx.fillStyle = "#00E5FF"; ctx.font = "bold 14px monospace";
          ctx.fillText(`AI Confidence: ${ai.final_confidence?.toFixed(1) || 0}% | Decision: ${ai.suggested_decision || "N/A"}`, 20, fy + 92);
        }
      }
      ctx.fillStyle = "#333"; ctx.font = "10px monospace";
      ctx.fillText(`Frame: ${currentFrame}/${totalFrames} | ${timeStr} | Annotations: ${annotations.length}`, w - 400, fy + 92);

      const link = document.createElement("a");
      link.download = `OCTON_VAR_Report_${incident?.id?.substring(0,8) || "frame"}_${Date.now()}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
      toast.success("Referee report exported as PNG!");
    } catch (err) {
      toast.error("Export failed: " + err.message);
    }
  };

  useEffect(() => {
    eachVideo((v) => { v.playbackRate = playbackSpeed; });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playbackSpeed, videoSrc, gridView]);

  // Expose frame capture to the module-level ref so PDF export can embed
  // the exact annotated scrubber frame the operator is viewing.
  useEffect(() => {
    frameCaptureRef.current = () => {
      try {
        const canvas = document.createElement("canvas");
        const w = 960, h = 540;
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#050505"; ctx.fillRect(0, 0, w, h);
        const stage = stageRef.current;
        const mediaEl = stage?.querySelector("video") || stage?.querySelector("img");
        if (mediaEl) {
          try { ctx.drawImage(mediaEl, 0, 0, w, h); } catch { /* cross-origin safe */ }
        }
        annotations.forEach(a => {
          ctx.lineWidth = 2;
          ctx.strokeStyle = a.color || "#00E5FF";
          ctx.fillStyle = a.color || "#00E5FF";
          if (a.type === "line") {
            ctx.beginPath(); ctx.moveTo(a.x1/100*w, a.y1/100*h); ctx.lineTo(a.x2/100*w, a.y2/100*h); ctx.stroke();
          } else if (a.type === "circle") {
            ctx.beginPath(); ctx.arc(a.cx/100*w, a.cy/100*h, a.r/100*Math.min(w,h), 0, Math.PI*2); ctx.stroke();
          } else if (a.type === "marker") {
            ctx.beginPath(); ctx.arc(a.x/100*w, a.y/100*h, 6, 0, Math.PI*2); ctx.fill();
            ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(a.x/100*w, a.y/100*h, 10, 0, Math.PI*2); ctx.stroke();
          } else if (a.type === "formation_player") {
            ctx.beginPath(); ctx.arc(a.x/100*w, a.y/100*h, 8, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = "#000"; ctx.font = "bold 8px monospace"; ctx.textAlign = "center";
            ctx.fillText(a.label || "", a.x/100*w, a.y/100*h + 2.8);
            ctx.fillStyle = a.color;
          } else if (a.type === "offside_line") {
            ctx.setLineDash([8, 4]); ctx.beginPath(); ctx.moveTo(0, a.y/100*h); ctx.lineTo(w, a.y/100*h); ctx.stroke(); ctx.setLineDash([]);
          } else if (a.type === "offside_line_v") {
            ctx.setLineDash([8, 4]); ctx.beginPath(); ctx.moveTo(a.x/100*w, 0); ctx.lineTo(a.x/100*w, h); ctx.stroke(); ctx.setLineDash([]);
          }
        });
        return canvas.toDataURL("image/jpeg", 0.75);
      } catch { return null; }
    };
    return () => {
      if (frameCaptureRef.current) frameCaptureRef.current = null;
    };
  }, [annotations]);

  // Apply an action across all tile videos in grid mode (and the master
  // <video> in single mode). Used by play/pause/seek/step/speed handlers
  // so the operator's interaction stays in sync across angles.
  const eachVideo = (fn) => {
    if (gridView) {
      Object.values(gridVideoRefs.current || {}).forEach((v) => { if (v) try { fn(v); } catch {} });
    } else if (videoRef.current) {
      fn(videoRef.current);
    }
  };

  const handleVideoPlay = () => {
    eachVideo((v) => { if (isPlaying) v.pause(); else { v.play().catch(() => {}); } });
    setIsPlaying(!isPlaying);
  };

  const handleVideoTimeUpdate = () => {
    if (!videoRef.current) return;
    const v = videoRef.current;
    const pct = v.currentTime / (v.duration || 1);
    setCurrentFrame(Math.floor(pct * totalFrames));
    const totalSec = v.currentTime;
    setMatchTime({ min: Math.floor(totalSec / 60), sec: Math.floor(totalSec % 60), ms: Math.floor((totalSec % 1) * 1000) });
    // Re-align grid tiles if the master is more than 0.25 s out of phase
    // with any tile. Cheap drift correction without spamming `currentTime`.
    if (gridView) {
      Object.values(gridVideoRefs.current || {}).forEach((tile) => {
        if (tile && Math.abs((tile.currentTime || 0) - v.currentTime) > 0.25) {
          try { tile.currentTime = v.currentTime; } catch {}
        }
      });
    }
  };

  const handleVideoScrub = (pct) => {
    eachVideo((v) => {
      if (v.duration) try { v.currentTime = pct * v.duration; } catch {}
    });
  };

  const stepVideoFrame = (delta) => {
    eachVideo((v) => { try { v.currentTime = Math.max(0, v.currentTime + delta * 0.033); } catch {} });
  };

  useEffect(() => {
    if (incident?.timestamp_in_match) {
      const parts = incident.timestamp_in_match.split(":");
      if (parts.length >= 2) setMatchTime({ min: parseInt(parts[0]) || 0, sec: parseInt(parts[1]) || 0, ms: 0 });
    }
  }, [incident]);

  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      setCurrentFrame(f => { const next = f + playbackSpeed; if (next >= totalFrames) { setIsPlaying(false); return totalFrames; } return next; });
      setMatchTime(t => {
        let ms = t.ms + (33 * playbackSpeed), sec = t.sec, min = t.min;
        if (ms >= 1000) { sec += Math.floor(ms / 1000); ms = ms % 1000; }
        if (sec >= 60) { min += Math.floor(sec / 60); sec = sec % 60; }
        return { min, sec, ms: Math.floor(ms) };
      });
    }, 33);
    return () => clearInterval(interval);
  }, [isPlaying, playbackSpeed, totalFrames]);

  const stepFrame = (delta) => {
    setCurrentFrame(f => Math.max(0, Math.min(totalFrames, f + delta)));
    setMatchTime(t => {
      const total = Math.max(0, (t.min * 60000) + (t.sec * 1000) + t.ms + (delta * 33));
      return { min: Math.floor(total / 60000), sec: Math.floor((total % 60000) / 1000), ms: Math.floor(total % 1000) };
    });
  };

  const handleScrub = (e) => {
    if (!scrubberRef.current) return;
    const rect = scrubberRef.current.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setCurrentFrame(Math.floor(pct * totalFrames));
  };

  const progressPct = (currentFrame / totalFrames) * 100;
  const speeds = [0.25, 0.5, 1, 2, 4];

  // Track media load failures so the stage can fall back to the stadium
  // backdrop when storage gave us a path but the actual asset is missing.
  const [imgBroken, setImgBroken] = useState(false);
  const [videoBroken, setVideoBroken] = useState(false);
  useEffect(() => { setImgBroken(false); }, [imgSrc]);
  useEffect(() => { setVideoBroken(false); }, [videoSrc]);

  return (
    <div ref={stageRef} className="relative border border-white/[0.08] bg-black overflow-hidden" data-testid="video-player-container" data-octon-stage="true">
      {/* ── Camera-angle switcher ───────────────────────────────
          Shown only when the incident has 1+ explicit angle uploads.
          "PRIMARY" toggles back to the legacy top-level still/video.
          GRID toggle renders all 4 angles simultaneously in a 2×2 mosaic. */}
      {angles.length > 0 && (
        <div className="absolute top-2 right-2 z-30 flex items-center gap-0.5 bg-black/70 backdrop-blur-sm border border-white/[0.12] p-0.5" data-testid="camera-angle-switcher">
          <button
            onClick={() => { setGridView(false); setActiveAngle("primary"); }}
            disabled={gridView}
            className={`text-[8px] font-mono px-1.5 py-0.5 transition-all ${!gridView && activeAngle === "primary" ? "bg-[#00E5FF]/20 text-[#00E5FF] border border-[#00E5FF]/40" : "text-gray-500 hover:text-white border border-transparent"} ${gridView ? "opacity-40 cursor-not-allowed" : ""}`}
            data-testid="angle-tab-primary"
            title="Primary view (legacy still/video)"
          >
            PRIMARY
          </button>
          {angles.map(a => (
            <button
              key={a.angle}
              onClick={() => { setGridView(false); setActiveAngle(a.angle); }}
              className={`text-[8px] font-mono px-1.5 py-0.5 transition-all uppercase ${!gridView && activeAngle === a.angle ? "bg-[#00E5FF]/20 text-[#00E5FF] border border-[#00E5FF]/40" : "text-gray-500 hover:text-white border border-transparent"} ${(!a.storage_path && !a.video_storage_path) || gridView ? "opacity-50" : ""}`}
              data-testid={`angle-tab-${a.angle}`}
              title={`${a.angle.replace("_"," ").toUpperCase()} — ${a.has_video ? "still+clip" : a.has_image ? "still" : "no media"}`}
              disabled={(!a.storage_path && !a.video_storage_path) || gridView}
            >
              {a.angle.replace("_", " ")}
            </button>
          ))}
          <div className="h-3 w-[1px] bg-white/[0.08] mx-0.5" />
          <button
            onClick={() => setGridView(g => !g)}
            className={`text-[8px] font-mono px-1.5 py-0.5 transition-all flex items-center gap-1 ${gridView ? "bg-[#B366FF]/25 text-[#B366FF] border border-[#B366FF]/50" : "text-gray-500 hover:text-[#B366FF] border border-transparent"}`}
            data-testid="angle-tab-grid"
            title="Toggle 2×2 mosaic of all 4 angles"
          >
            <span className="inline-block w-2 h-2 grid grid-cols-2 grid-rows-2 gap-[1px]">
              <span className="bg-current opacity-70" /><span className="bg-current opacity-70" />
              <span className="bg-current opacity-70" /><span className="bg-current opacity-70" />
            </span>
            GRID
          </button>
        </div>
      )}
      <div className="aspect-video relative">
        {gridView ? (
          <>
            {/* Hidden master video — drives the scrubber timeline (currentFrame
                state) while the visible 2×2 mosaic mirrors its currentTime. */}
            {(videoSrc || (angles[0] && angles[0].video_storage_path)) && (
              <video
                ref={videoRef}
                src={videoSrc || `${API}/files/${angles.find(a => a.video_storage_path)?.video_storage_path}`}
                className="absolute opacity-0 pointer-events-none"
                style={{ width: 1, height: 1, top: 0, left: 0 }}
                onTimeUpdate={handleVideoTimeUpdate}
                onLoadedMetadata={() => { if (videoRef.current) videoRef.current.playbackRate = playbackSpeed; }}
                muted
                playsInline
              />
            )}
            <div className="absolute inset-0 grid grid-cols-2 grid-rows-2 gap-[2px] bg-white/[0.08] z-10" data-testid="angle-grid-mosaic">
            {(() => {
              // Top-confidence angle (used to highlight the ring with a star)
              const topAngle = angleAssessments.length > 0
                ? angleAssessments.reduce((best, cur) => cur.confidence > (best?.confidence ?? -1) ? cur : best, null)
                : null;
              return ["broadcast", "tactical", "tight", "goal_line"].map(angleKey => {
              const entry = angles.find(a => a.angle === angleKey);
              const hasMedia = entry && (entry.storage_path || entry.video_storage_path);
              const tileImg = entry?.storage_path ? `${API}/files/${entry.storage_path}` : null;
              const tileVid = entry?.video_storage_path ? `${API}/files/${entry.video_storage_path}` : null;
              const ass = angleAssessments.find(aa => aa.angle === angleKey);
              const isTop = ass && topAngle && ass.angle === topAngle.angle && angleAssessments.length > 1;
              return (
                <div key={angleKey} className="relative bg-black overflow-hidden" data-testid={`grid-tile-${angleKey}`}>
                  {tileVid ? (
                    <video
                      ref={(el) => { gridVideoRefs.current[angleKey] = el; }}
                      src={tileVid}
                      className="w-full h-full object-cover"
                      muted
                      playsInline
                      onLoadedMetadata={(e) => { try { e.currentTarget.playbackRate = playbackSpeed; } catch {} }}
                    />
                  ) : tileImg ? (
                    <img src={tileImg} alt={angleKey} className="w-full h-full object-cover" />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <img src="https://images.pexels.com/photos/12201296/pexels-photo-12201296.jpeg" alt="Stadium" className="w-full h-full object-cover opacity-30" />
                      <div className="absolute inset-0 bg-black/60" />
                      <span className="absolute text-[9px] font-mono uppercase tracking-[0.2em] text-gray-500">no feed</span>
                    </div>
                  )}
                  <div className="absolute top-1 left-1 px-1.5 py-0.5 bg-black/75 border-l-2 border-[#00E5FF] text-[8px] font-mono uppercase tracking-[0.2em] text-[#00E5FF]">
                    {angleKey.replace("_", " ")}
                  </div>
                  {hasMedia && entry?.has_video && (
                    <div className="absolute top-1 right-1 px-1 py-0.5 bg-black/75 text-[7px] font-mono text-[#00FF88] border border-[#00FF88]/40">CLIP</div>
                  )}
                  {/* Confidence-by-angle mini ring (bottom-right). Only renders
                      when Neo Cortex returned a per-angle assessment for this
                      camera. Top-scoring angle gets a ★ glow + verdict tooltip. */}
                  {ass && (
                    <div
                      className="absolute bottom-1.5 right-1.5 flex items-center gap-1 px-1 py-0.5 bg-black/80 backdrop-blur-sm border border-white/[0.12]"
                      data-testid={`tile-conf-${angleKey}`}
                      title={`${angleKey.replace("_"," ").toUpperCase()} — ${ass.confidence.toFixed(0)}%${ass.decision ? ' · ' + ass.decision : ''}${isTop ? '\n★ Highest-weighted angle' : ''}`}
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24">
                        <circle cx="12" cy="12" r="9" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="2.5" />
                        <circle
                          cx="12" cy="12" r="9" fill="none"
                          stroke={ass.confidence >= 80 ? "#00FF88" : ass.confidence >= 55 ? "#00E5FF" : "#FFB800"}
                          strokeWidth="2.5"
                          strokeDasharray={`${(ass.confidence / 100) * 56.5} 56.5`}
                          strokeDashoffset="0"
                          strokeLinecap="round"
                          transform="rotate(-90 12 12)"
                        />
                      </svg>
                      <span className={`text-[8px] font-mono leading-none ${ass.confidence >= 80 ? 'text-[#00FF88]' : ass.confidence >= 55 ? 'text-[#00E5FF]' : 'text-[#FFB800]'}`}>
                        {ass.confidence.toFixed(0)}%
                      </span>
                      {isTop && (
                        <span className="text-[10px] text-[#FFD466] -ml-0.5" style={{ filter: "drop-shadow(0 0 3px #FFD46688)" }}>★</span>
                      )}
                    </div>
                  )}
                  <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-[#00E5FF]/40 to-transparent" />
                </div>
              );
            });
            })()}
            {/* Sync indicator — bottom-left of the mosaic */}
            <div
              className="absolute bottom-2 left-2 z-20 flex items-center gap-1 px-2 py-1 bg-black/75 border border-[#00FF88]/40 text-[#00FF88] text-[8px] font-mono uppercase tracking-[0.2em] pointer-events-none"
              data-testid="grid-sync-indicator"
              title="All 4 angles seek together when the master scrubber moves"
            >
              <span className="w-1.5 h-1.5 bg-[#00FF88] animate-pulse" />
              SYNC LOCK · 4 CAMS
            </div>
          </div>
          </>
        ) : (videoSrc && !videoBroken ? (
          <video ref={videoRef} src={videoSrc} className="w-full h-full object-cover" onTimeUpdate={handleVideoTimeUpdate} onEnded={() => setIsPlaying(false)} onError={() => setVideoBroken(true)} onLoadedMetadata={() => { if (videoRef.current) videoRef.current.playbackRate = playbackSpeed; }} playsInline muted />
        ) : imgSrc && !imgBroken ? (
          <img src={imgSrc} alt="Incident" className="w-full h-full object-cover" onError={() => setImgBroken(true)} />
        ) : (
          <>
            <img src="https://images.pexels.com/photos/12201296/pexels-photo-12201296.jpeg" alt="Stadium" className="w-full h-full object-cover opacity-45" />
            <div className="absolute inset-0 bg-gradient-to-b from-[#050505]/30 via-transparent to-[#050505]/85" />
            {(imgBroken || videoBroken) && (
              <div className="absolute top-3 right-3 px-2 py-1 bg-[#FFB800]/15 border border-[#FFB800]/40 text-[#FFB800] text-[9px] font-mono uppercase tracking-[0.2em]" title="Media missing in object storage; analysis still ran on the original frame.">
                ⚠ media offline · stadium fallback
              </div>
            )}
          </>
        ))}
        <div className="absolute inset-0 grid-overlay opacity-50" />
        <AnnotationCanvas width={100} height={100} annotations={annotations} setAnnotations={setAnnotations} activeTool={activeTool} activeColor={activeColor} isDrawing={isAnnotating} setIsDrawing={setIsAnnotating} formations={Object.values(activeFormations)} activeAngle={activeAngle} />
        <div className="absolute inset-0 pointer-events-none overflow-hidden"><div className="w-full h-[2px] bg-gradient-to-r from-transparent via-[#00E5FF]/60 to-transparent animate-scan" /></div>
        {incident?.ai_analysis && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            <div className="w-48 h-48 border-2 border-[#00E5FF]/30 relative reticle-spin" style={{ borderRadius: '50%' }}>
              <div className="absolute top-1/2 left-0 w-3 h-[1px] bg-[#00E5FF]/60 -translate-y-1/2" /><div className="absolute top-1/2 right-0 w-3 h-[1px] bg-[#00E5FF]/60 -translate-y-1/2" />
              <div className="absolute left-1/2 top-0 h-3 w-[1px] bg-[#00E5FF]/60 -translate-x-1/2" /><div className="absolute left-1/2 bottom-0 h-3 w-[1px] bg-[#00E5FF]/60 -translate-x-1/2" />
            </div>
            <div className="absolute w-24 h-24 border border-[#00E5FF]/20"><div className="absolute top-1/2 left-0 w-full h-[1px] bg-[#00E5FF]/10" /><div className="absolute left-1/2 top-0 h-full w-[1px] bg-[#00E5FF]/10" /></div>
            <div className="absolute top-[20%] left-1/2 -translate-x-1/2 px-3 py-1 bg-[#00E5FF]/90 text-black text-[10px] font-mono font-bold tracking-wider">OCTON ANALYSIS ZONE</div>
          </div>
        )}
        <div className="absolute top-0 left-0 right-0 flex items-center justify-between p-3">
          <div className="flex items-center gap-2 bg-black/70 backdrop-blur-sm px-2 py-1">
            <div className={`w-2 h-2 ${isPlaying ? 'bg-[#FF2A2A]' : 'bg-[#00FF88]'} animate-pulse`} />
            <span className="text-[10px] font-mono text-white uppercase tracking-wider">{isPlaying ? 'PLAYING' : 'PAUSED'}</span>
            <span className="text-[10px] font-mono text-[#00E5FF]/60 ml-1">{playbackSpeed}x</span>
          </div>
          <div className="bg-black/70 backdrop-blur-sm px-3 py-1">
            <span className="text-lg font-mono text-white font-bold glow-text-cyan tracking-wider">{timeStr}</span>
          </div>
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-[#00E5FF]/40 to-transparent" />
      </div>

      <AnnotationToolbar activeTool={activeTool} setActiveTool={setActiveTool} activeColor={activeColor} setActiveColor={setActiveColor} annotations={annotations} setAnnotations={setAnnotations} onSave={incident?.id ? handleSaveAnnotations : null} onExport={handleExport} activeFormations={activeFormations} setActiveFormations={setActiveFormations} activeAngle={activeAngle} />

      <div className="bg-[#050505] border-t border-white/[0.06]">
        <div className="px-3 pt-2 pb-1">
          <div ref={scrubberRef} className="relative h-3 bg-white/[0.04] cursor-pointer group" onClick={(e) => { handleScrub(e); if (videoSrc && scrubberRef.current) { const r=scrubberRef.current.getBoundingClientRect(); handleVideoScrub(Math.max(0,Math.min(1,(e.clientX-r.left)/r.width))); } }}
            onMouseMove={(e) => { if (!scrubberRef.current) return; const r=scrubberRef.current.getBoundingClientRect(); const p=Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)); setScrubberHover({pct:p*100,frame:Math.floor(p*totalFrames)}); }}
            onMouseLeave={() => setScrubberHover(null)} data-testid="replay-scrubber-track">
            <div className="absolute top-0 left-0 h-full bg-gradient-to-r from-[#00E5FF]/60 to-[#00E5FF]/30 transition-all duration-75" style={{ width: `${progressPct}%` }} />
            <div className="absolute top-1/2 -translate-y-1/2 w-[3px] h-5 bg-[#00E5FF] transition-all duration-75 group-hover:h-6 group-hover:shadow-[0_0_8px_rgba(0,229,255,0.6)]" style={{ left: `${progressPct}%` }} />
            {scrubberHover && <div className="absolute -top-7 -translate-x-1/2 px-2 py-0.5 bg-black/90 border border-white/10 text-[9px] font-mono text-[#00E5FF] whitespace-nowrap pointer-events-none" style={{ left: `${scrubberHover.pct}%` }}>FRM {scrubberHover.frame}</div>}
            <div className="absolute top-1/2 -translate-y-1/2 w-1.5 h-4 bg-[#FFB800]" style={{ left: '45%' }} title="Incident marker" />
          </div>
        </div>
        <div className="px-3 pb-2 flex items-center justify-between">
          <div className="flex items-center gap-0.5">
            <Button variant="ghost" size="sm" className="text-gray-500 hover:text-white h-7 w-7 p-0" onClick={() => { if (videoSrc) stepVideoFrame(-10); else stepFrame(-10); }} data-testid="step-back-10" title="-10 frames"><SkipBack className="w-3.5 h-3.5" /></Button>
            <Button variant="ghost" size="sm" className="text-gray-500 hover:text-white h-7 w-7 p-0" onClick={() => { if (videoSrc) stepVideoFrame(-1); else stepFrame(-1); }} data-testid="step-back-1" title="-1 frame"><ChevronLeft className="w-3.5 h-3.5" /></Button>
            <Button variant="ghost" size="sm" className="text-white hover:text-[#00E5FF] h-8 w-8 p-0 border border-white/10 hover:border-[#00E5FF]/40 mx-0.5 transition-all" onClick={() => { if (videoSrc) handleVideoPlay(); else setIsPlaying(!isPlaying); }} data-testid="play-pause-button">
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
            </Button>
            <Button variant="ghost" size="sm" className="text-gray-500 hover:text-white h-7 w-7 p-0" onClick={() => { if (videoSrc) stepVideoFrame(1); else stepFrame(1); }} data-testid="step-forward-1" title="+1 frame"><ChevronRight className="w-3.5 h-3.5" /></Button>
            <Button variant="ghost" size="sm" className="text-gray-500 hover:text-white h-7 w-7 p-0" onClick={() => { if (videoSrc) stepVideoFrame(10); else stepFrame(10); }} data-testid="step-forward-10" title="+10 frames"><SkipForward className="w-3.5 h-3.5" /></Button>
            <div className="h-4 w-[1px] bg-white/[0.06] mx-1.5" />
            <div className="flex items-center gap-0.5" data-testid="speed-selector">
              {speeds.map(s => (
                <button key={s} onClick={() => setPlaybackSpeed(s)} className={`text-[9px] font-mono px-1.5 py-0.5 transition-all ${playbackSpeed === s ? 'bg-[#00E5FF]/20 text-[#00E5FF] border border-[#00E5FF]/30' : 'text-gray-600 hover:text-gray-400 border border-transparent'}`} data-testid={`speed-${s}x`}>{s}x</button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right"><span className="text-[10px] font-mono text-gray-600">FRM </span><span className="text-[11px] font-mono text-white font-bold">{currentFrame}</span><span className="text-[10px] font-mono text-gray-600">/{totalFrames}</span></div>
            {onAnalyze && <Button size="sm" className="bg-[#00E5FF] text-black hover:bg-[#00E5FF]/80 h-7 px-3 font-heading font-bold text-[10px] tracking-wider uppercase active:scale-[0.98]" onClick={onAnalyze} data-testid="analyze-frame-button"><Brain className="w-3 h-3 mr-1" />ANALYZE FRAME</Button>}
          </div>
        </div>
      </div>
    </div>
  );
};
