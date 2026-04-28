/**
 * Decision Comparison Mode
 * Side-by-side BEFORE / AFTER frames so the operator can mark up two
 * moments and visualise player movement between them. Includes a
 * Player-Tracking Trail overlay and a one-click PNG export.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Columns, Download, XCircle, ArrowRight, Minus, Circle, Crosshair, Undo2, Trash2 } from "lucide-react";
import { AnnotationCanvas, ANNOTATION_TOOLS, FORMATIONS } from "./AnnotationCanvas";
import { API } from "../lib/api";

const ComparisonPanel = ({ label, color, time, annotations, setAnnotations, activeColor, activeFormations, setActiveFormations, panelId, angles = [], selectedAngle, onSelectAngle, incident }) => {
  const [activeTool, setActiveTool] = useState(ANNOTATION_TOOLS.NONE);
  const [isDrawing, setIsDrawing] = useState(false);

  // Resolve image source from the picked angle (falls back to the legacy
  // primary still on the incident, then to the stock stadium image).
  const angleEntry = selectedAngle && selectedAngle !== "primary"
    ? angles.find(a => a.angle === selectedAngle)
    : null;
  const angleImg = angleEntry?.storage_path
    ? `${API}/files/${angleEntry.storage_path}`
    : null;
  const primaryImg = (selectedAngle === "primary" && incident?.has_image && incident?.storage_path)
    ? `${API}/files/${incident.storage_path}`
    : null;
  const fallbackImg = "https://images.pexels.com/photos/12201296/pexels-photo-12201296.jpeg";
  const imgSrc = angleImg || primaryImg || fallbackImg;
  const isFallback = imgSrc === fallbackImg;

  const placeFormation = (formationKey, team) => {
    const f = FORMATIONS[formationKey];
    if (!f) return;
    const teamColor = team === "home" ? "#00E5FF" : "#FF2A2A";
    const newPlayers = f.positions.map((p, i) => ({
      type: "formation_player", x: p.x + (team === "away" ? 0 : 0), y: p.y + (team === "away" ? -2 : 2),
      color: teamColor, team, formation: formationKey,
      label: (["GK","DEF","DEF","DEF","DEF","DEF","MID","MID","MID","MID","FWD","FWD","FWD"][i] || "").substring(0, 3),
      id: Date.now() + i + (team === "away" ? 1000 : 0),
    }));
    setAnnotations(prev => [...prev.filter(a => !(a.type === "formation_player" && a.team === team)), ...newPlayers]);
    setActiveFormations(prev => ({ ...prev, [team]: formationKey }));
  };

  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-white/[0.06] bg-[#0A0A0A]">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-2 h-2 flex-none" style={{ backgroundColor: color }} />
          <span className="text-[10px] font-heading font-bold uppercase tracking-[0.2em] flex-none" style={{ color }}>{label}</span>
          {/* Angle picker — only when the incident has multi-angle uploads */}
          {angles.length > 0 && (
            <select
              value={selectedAngle || "primary"}
              onChange={e => onSelectAngle?.(e.target.value)}
              className="bg-black/60 border border-white/10 text-[9px] font-mono text-[#00E5FF] px-1 py-0.5 outline-none hover:border-[#00E5FF]/40 focus:border-[#00E5FF]/60 max-w-[110px] truncate"
              data-testid={`comparison-angle-${panelId}`}
              title="Pick which camera angle to compare"
            >
              <option value="primary">PRIMARY</option>
              {angles.map(a => (
                <option key={a.angle} value={a.angle} disabled={!a.storage_path && !a.video_storage_path}>
                  {a.angle.replace("_", " ").toUpperCase()}
                </option>
              ))}
            </select>
          )}
        </div>
        <span className="text-[10px] font-mono text-gray-500 flex-none ml-2">{time}</span>
      </div>

      <div className="aspect-video relative bg-black" data-panel={panelId}>
        <img src={imgSrc} alt={`${label} frame · ${selectedAngle || "primary"}`} className={`w-full h-full object-cover ${isFallback ? "opacity-40" : ""}`} />
        <div className="absolute inset-0 grid-overlay opacity-30" />
        {isFallback && (
          <div className="absolute top-2 right-2 px-1.5 py-0.5 bg-[#FFB800]/15 border border-[#FFB800]/40 text-[#FFB800] text-[8px] font-mono uppercase tracking-[0.2em]">
            ⚠ stadium fallback
          </div>
        )}
        <AnnotationCanvas width={100} height={100} annotations={annotations} setAnnotations={setAnnotations} activeTool={activeTool} activeColor={activeColor} isDrawing={isDrawing} setIsDrawing={setIsDrawing} formations={Object.values(activeFormations)} activeAngle={selectedAngle || "primary"} />
      </div>

      <div className="flex items-center gap-0.5 p-1 bg-[#050505] border-t border-white/[0.06]">
        {[
          { tool: ANNOTATION_TOOLS.LINE, icon: Minus },
          { tool: ANNOTATION_TOOLS.CIRCLE, icon: Circle },
          { tool: ANNOTATION_TOOLS.MARKER, icon: Crosshair },
        ].map(({ tool, icon: Icon }) => (
          <button key={tool} onClick={() => setActiveTool(activeTool === tool ? ANNOTATION_TOOLS.NONE : tool)}
            className={`h-6 w-6 flex items-center justify-center text-[10px] ${activeTool === tool ? 'bg-[#00E5FF]/20 text-[#00E5FF]' : 'text-gray-600 hover:text-white'}`}>
            <Icon className="w-3 h-3" />
          </button>
        ))}
        <div className="h-3 w-[1px] bg-white/[0.06] mx-0.5" />
        <button onClick={() => { const f = Object.keys(FORMATIONS)[0]; placeFormation(f, "home"); }} className="text-[8px] font-mono text-[#00E5FF] hover:bg-[#00E5FF]/10 px-1.5 py-0.5">HOME</button>
        <button onClick={() => { const f = Object.keys(FORMATIONS)[0]; placeFormation(f, "away"); }} className="text-[8px] font-mono text-[#FF2A2A] hover:bg-[#FF2A2A]/10 px-1.5 py-0.5">AWAY</button>
        <button onClick={() => setAnnotations(prev => [...prev, { type: "offside_line", y: 65, color: "#FFB800", id: Date.now() }])} className="text-[8px] font-mono text-[#FFB800] hover:bg-[#FFB800]/10 px-1.5 py-0.5">OFFSIDE</button>
        <div className="h-3 w-[1px] bg-white/[0.06] mx-0.5" />
        <button onClick={() => setAnnotations(prev => prev.slice(0, -1))} className="h-6 w-6 flex items-center justify-center text-gray-600 hover:text-[#FFB800]"><Undo2 className="w-3 h-3" /></button>
        <button onClick={() => setAnnotations([])} className="h-6 w-6 flex items-center justify-center text-gray-600 hover:text-[#FF2A2A]"><Trash2 className="w-3 h-3" /></button>
        <span className="text-[8px] font-mono text-gray-600 ml-auto">{annotations.length}</span>
      </div>
    </div>
  );
};

export const DecisionComparisonMode = ({ incident, onClose }) => {
  const [beforeAnnotations, setBeforeAnnotations] = useState([]);
  const [afterAnnotations, setAfterAnnotations] = useState([]);
  const [activeColor] = useState("#00E5FF");
  const [beforeFormations, setBeforeFormations] = useState({});
  const [afterFormations, setAfterFormations] = useState({});
  const [notes, setNotes] = useState("");
  const [trailEnabled, setTrailEnabled] = useState(true);
  const [trailPairs, setTrailPairs] = useState([]);
  const framesWrapRef = useRef(null);
  // Per-panel camera-angle picks (defaults: BEFORE→broadcast, AFTER→tight,
  // a typical "wide-context vs close-action" forensic comparison).
  const incidentAngles = Array.isArray(incident?.camera_angles) ? incident.camera_angles : [];
  const defaultAngle = (preferred) => {
    const hit = incidentAngles.find(a => a.angle === preferred && (a.storage_path || a.video_storage_path));
    if (hit) return preferred;
    const any = incidentAngles.find(a => a.storage_path || a.video_storage_path);
    return any ? any.angle : "primary";
  };
  const [beforeAngle, setBeforeAngle] = useState(() => defaultAngle("broadcast"));
  const [afterAngle, setAfterAngle] = useState(() => defaultAngle("tight"));
  // Re-default whenever the incident changes
  useEffect(() => {
    setBeforeAngle(defaultAngle("broadcast"));
    setAfterAngle(defaultAngle("tight"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incident?.id]);

  // ── Player Tracking Trail: match players between BEFORE and AFTER ──
  const computePairs = useCallback(() => {
    const wrap = framesWrapRef.current;
    if (!wrap) return [];
    const beforeFrame = wrap.querySelector('[data-panel="before"]');
    const afterFrame = wrap.querySelector('[data-panel="after"]');
    if (!beforeFrame || !afterFrame) return [];
    const wrapRect = wrap.getBoundingClientRect();
    const bRect = beforeFrame.getBoundingClientRect();
    const aRect = afterFrame.getBoundingClientRect();

    const toAbs = (rect, xPct, yPct) => ({
      x: rect.left - wrapRect.left + (xPct / 100) * rect.width,
      y: rect.top - wrapRect.top + (yPct / 100) * rect.height,
    });

    const pairs = [];

    const beforePlayersByTeam = {};
    const afterPlayersByTeam = {};
    beforeAnnotations.filter(a => a.type === "formation_player").forEach(p => {
      (beforePlayersByTeam[p.team] = beforePlayersByTeam[p.team] || []).push(p);
    });
    afterAnnotations.filter(a => a.type === "formation_player").forEach(p => {
      (afterPlayersByTeam[p.team] = afterPlayersByTeam[p.team] || []).push(p);
    });
    ["home", "away"].forEach(team => {
      const bList = (beforePlayersByTeam[team] || []).slice().sort((x, y) => x.id - y.id);
      const aList = (afterPlayersByTeam[team] || []).slice().sort((x, y) => x.id - y.id);
      const n = Math.min(bList.length, aList.length);
      for (let i = 0; i < n; i++) {
        const bp = bList[i], ap = aList[i];
        const from = toAbs(bRect, bp.x, bp.y);
        const to = toAbs(aRect, ap.x, ap.y);
        const deltaPct = Math.hypot(ap.x - bp.x, ap.y - bp.y);
        pairs.push({
          key: `fp-${team}-${i}`,
          from, to, color: bp.color, label: bp.label || "P",
          deltaPct: Math.round(deltaPct * 10) / 10,
        });
      }
    });

    const groupByColor = (list) => {
      const m = {};
      list.filter(a => a.type === "marker").forEach(mk => { (m[mk.color] = m[mk.color] || []).push(mk); });
      return m;
    };
    const bMarkers = groupByColor(beforeAnnotations);
    const aMarkers = groupByColor(afterAnnotations);
    Object.keys(bMarkers).forEach(col => {
      const bList = bMarkers[col] || [];
      const aList = aMarkers[col] || [];
      const n = Math.min(bList.length, aList.length);
      for (let i = 0; i < n; i++) {
        const bp = bList[i], ap = aList[i];
        const from = toAbs(bRect, bp.x, bp.y);
        const to = toAbs(aRect, ap.x, ap.y);
        const deltaPct = Math.hypot(ap.x - bp.x, ap.y - bp.y);
        pairs.push({
          key: `mk-${col}-${i}`,
          from, to, color: col, label: "",
          deltaPct: Math.round(deltaPct * 10) / 10,
        });
      }
    });

    return pairs;
  }, [beforeAnnotations, afterAnnotations]);

  useEffect(() => {
    let rafId;
    const recalc = () => {
      rafId = requestAnimationFrame(() => setTrailPairs(computePairs()));
    };
    recalc();
    window.addEventListener("resize", recalc);
    return () => {
      window.removeEventListener("resize", recalc);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [computePairs]);

  const beforeTime = incident?.timestamp_in_match ? (() => {
    const p = incident.timestamp_in_match.split(":");
    const m = parseInt(p[0]) || 0, s = parseInt(p[1]) || 0;
    const prev = Math.max(0, s - 2);
    return `${String(m).padStart(2,'0')}:${String(prev).padStart(2,'0')}.000`;
  })() : "00:00.000";

  const afterTime = incident?.timestamp_in_match || "00:00.000";

  const handleExportComparison = () => {
    const canvas = document.createElement("canvas");
    const w = 1920, h = 640;
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#050505"; ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = "#00E5FF"; ctx.font = "bold 16px monospace";
    ctx.fillText("OCTON VAR - DECISION COMPARISON REPORT", 20, 25);
    ctx.fillStyle = "#666"; ctx.font = "11px monospace";
    ctx.fillText(`Dr Finnegan's Forensic AI | ${incident?.incident_type?.toUpperCase() || ""} | ${incident?.team_involved || ""} | ${new Date().toISOString().split("T")[0]}`, 20, 42);

    ctx.strokeStyle = "#00E5FF33"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, 50); ctx.lineTo(w, 50); ctx.stroke();

    const pH = 500, pY = 55;
    ctx.fillStyle = "#FFB800"; ctx.font = "bold 12px monospace"; ctx.fillText(`BEFORE (${beforeTime})`, 20, pY + 18);
    ctx.fillStyle = "#00FF88"; ctx.fillText(`AFTER (${afterTime})`, w/2 + 20, pY + 18);

    const drawAnnotations = (annots, offsetX, areaW) => {
      annots.forEach(a => {
        ctx.strokeStyle = a.color || "#00E5FF"; ctx.fillStyle = a.color || "#00E5FF"; ctx.lineWidth = 2;
        if (a.type === "line") { ctx.beginPath(); ctx.moveTo(offsetX + a.x1/100*areaW, pY + 25 + a.y1/100*pH); ctx.lineTo(offsetX + a.x2/100*areaW, pY + 25 + a.y2/100*pH); ctx.stroke(); }
        else if (a.type === "circle") { ctx.beginPath(); ctx.arc(offsetX + a.cx/100*areaW, pY + 25 + a.cy/100*pH, a.r/100*Math.min(areaW, pH), 0, Math.PI*2); ctx.stroke(); }
        else if (a.type === "marker") { ctx.beginPath(); ctx.arc(offsetX + a.x/100*areaW, pY + 25 + a.y/100*pH, 6, 0, Math.PI*2); ctx.fill(); }
        else if (a.type === "formation_player") { ctx.beginPath(); ctx.arc(offsetX + a.x/100*areaW, pY + 25 + a.y/100*pH, 8, 0, Math.PI*2); ctx.fill(); }
        else if (a.type === "offside_line") { ctx.setLineDash([8, 4]); ctx.beginPath(); ctx.moveTo(offsetX, pY + 25 + a.y/100*pH); ctx.lineTo(offsetX + areaW, pY + 25 + a.y/100*pH); ctx.stroke(); ctx.setLineDash([]); }
      });
    };
    drawAnnotations(beforeAnnotations, 0, w/2 - 5);
    drawAnnotations(afterAnnotations, w/2 + 5, w/2 - 5);

    if (trailEnabled) {
      const leftOx = 0, rightOx = w/2 + 5;
      const areaW = w/2 - 5;
      const frameTop = pY + 25;

      const groupByTeam = (list) => {
        const m = { home: [], away: [] };
        list.filter(a => a.type === "formation_player").forEach(p => { if (m[p.team]) m[p.team].push(p); });
        return m;
      };
      const groupByColor = (list) => {
        const m = {};
        list.filter(a => a.type === "marker").forEach(mk => { (m[mk.color] = m[mk.color] || []).push(mk); });
        return m;
      };
      const bTeam = groupByTeam(beforeAnnotations), aTeam = groupByTeam(afterAnnotations);
      const bMk = groupByColor(beforeAnnotations), aMk = groupByColor(afterAnnotations);

      const drawArrow = (fx, fy, tx, ty, color, deltaPct) => {
        const moved = deltaPct >= 0.8;
        ctx.fillStyle = color; ctx.globalAlpha = 0.55; ctx.beginPath(); ctx.arc(fx, fy, 5, 0, Math.PI*2); ctx.fill();
        ctx.globalAlpha = 0.9; ctx.beginPath(); ctx.arc(tx, ty, 5, 0, Math.PI*2); ctx.fill();
        ctx.globalAlpha = 1;
        if (moved) {
          ctx.strokeStyle = "#00E5FF"; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]);
          ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(tx, ty); ctx.stroke();
          ctx.setLineDash([]);
          const ang = Math.atan2(ty - fy, tx - fx);
          ctx.fillStyle = "#00E5FF"; ctx.beginPath();
          ctx.moveTo(tx, ty);
          ctx.lineTo(tx - 9 * Math.cos(ang - Math.PI/7), ty - 9 * Math.sin(ang - Math.PI/7));
          ctx.lineTo(tx - 9 * Math.cos(ang + Math.PI/7), ty - 9 * Math.sin(ang + Math.PI/7));
          ctx.closePath(); ctx.fill();
          const mx = (fx + tx) / 2, my = (fy + ty) / 2 - 8;
          ctx.fillStyle = "rgba(0,0,0,0.75)"; ctx.fillRect(mx - 22, my - 8, 44, 14);
          ctx.fillStyle = "#00E5FF"; ctx.font = "10px monospace"; ctx.textAlign = "center";
          ctx.fillText(`Δ ${deltaPct.toFixed(1)}%`, mx, my + 2);
          ctx.textAlign = "left";
        } else {
          ctx.strokeStyle = "rgba(255,255,255,0.25)"; ctx.lineWidth = 0.75;
          ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(tx, ty); ctx.stroke();
        }
      };

      ["home", "away"].forEach(team => {
        const bList = (bTeam[team] || []).slice().sort((x, y) => x.id - y.id);
        const aList = (aTeam[team] || []).slice().sort((x, y) => x.id - y.id);
        const n = Math.min(bList.length, aList.length);
        for (let i = 0; i < n; i++) {
          const bp = bList[i], ap = aList[i];
          const fx = leftOx + bp.x/100 * areaW, fy = frameTop + bp.y/100 * pH;
          const tx = rightOx + ap.x/100 * areaW, ty = frameTop + ap.y/100 * pH;
          const deltaPct = Math.hypot(ap.x - bp.x, ap.y - bp.y);
          drawArrow(fx, fy, tx, ty, bp.color, deltaPct);
        }
      });
      Object.keys(bMk).forEach(col => {
        const bList = bMk[col] || [], aList = aMk[col] || [];
        const n = Math.min(bList.length, aList.length);
        for (let i = 0; i < n; i++) {
          const bp = bList[i], ap = aList[i];
          const fx = leftOx + bp.x/100 * areaW, fy = frameTop + bp.y/100 * pH;
          const tx = rightOx + ap.x/100 * areaW, ty = frameTop + ap.y/100 * pH;
          const deltaPct = Math.hypot(ap.x - bp.x, ap.y - bp.y);
          drawArrow(fx, fy, tx, ty, col, deltaPct);
        }
      });
    }

    ctx.strokeStyle = "#ffffff22"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(w/2, pY); ctx.lineTo(w/2, h - 40); ctx.stroke();

    ctx.fillStyle = "#333"; ctx.font = "10px monospace";
    ctx.fillText(`Before: ${beforeAnnotations.length} annotations | After: ${afterAnnotations.length} annotations`, 20, h - 15);
    if (notes) { ctx.fillStyle = "#888"; ctx.fillText(`Notes: ${notes.substring(0, 100)}`, w/2, h - 15); }

    const link = document.createElement("a");
    link.download = `OCTON_Comparison_${incident?.id?.substring(0,8) || "report"}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
    toast.success("Comparison report exported!");
  };

  return (
    <div className="border border-white/[0.08] bg-[#050505]" data-testid="comparison-mode">
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/[0.06] bg-[#0A0A0A]">
        <div className="flex items-center gap-3">
          <Columns className="w-4 h-4 text-[#00E5FF]" />
          <span className="text-xs font-heading font-bold uppercase tracking-[0.15em] text-[#00E5FF]">DECISION COMPARISON</span>
          {incident?.incident_type && <span className="text-[10px] font-mono text-gray-500 uppercase">{incident.incident_type} ANALYSIS</span>}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setTrailEnabled(v => !v)} className={`h-7 px-2 flex items-center gap-1 text-[9px] font-mono border transition-all ${trailEnabled ? 'text-[#00E5FF] border-[#00E5FF]/40 bg-[#00E5FF]/10 hover:bg-[#00E5FF]/20' : 'text-gray-500 border-white/10 hover:text-white hover:border-white/30'}`} data-testid="trail-toggle" title="Toggle player tracking trail">
            <ArrowRight className="w-3 h-3" />TRAIL {trailEnabled ? "ON" : "OFF"}
            {trailEnabled && trailPairs.length > 0 && <span className="ml-1 px-1 bg-[#00E5FF]/20">{trailPairs.filter(p => p.deltaPct >= 0.8).length}</span>}
          </button>
          <button onClick={handleExportComparison} className="h-7 px-2 flex items-center gap-1 text-[#FFB800] text-[9px] font-mono border border-[#FFB800]/30 bg-[#FFB800]/10 hover:bg-[#FFB800]/20 transition-all" data-testid="export-comparison"><Download className="w-3 h-3" />EXPORT</button>
          <button onClick={onClose} className="h-7 w-7 flex items-center justify-center text-gray-500 hover:text-white border border-white/10 hover:border-white/30 transition-all" data-testid="close-comparison"><XCircle className="w-4 h-4" /></button>
        </div>
      </div>

      <div ref={framesWrapRef} className="relative flex gap-[1px] bg-white/[0.04]">
        <ComparisonPanel panelId="before" label="BEFORE" color="#FFB800" time={beforeTime} annotations={beforeAnnotations} setAnnotations={setBeforeAnnotations} activeColor={activeColor} activeFormations={beforeFormations} setActiveFormations={setBeforeFormations} angles={incidentAngles} selectedAngle={beforeAngle} onSelectAngle={setBeforeAngle} incident={incident} />
        <ComparisonPanel panelId="after" label="AFTER" color="#00FF88" time={afterTime} annotations={afterAnnotations} setAnnotations={setAfterAnnotations} activeColor={activeColor} activeFormations={afterFormations} setActiveFormations={setAfterFormations} angles={incidentAngles} selectedAngle={afterAngle} onSelectAngle={setAfterAngle} incident={incident} />

        {trailEnabled && trailPairs.length > 0 && (
          <svg className="pointer-events-none absolute inset-0 w-full h-full z-20" data-testid="player-tracking-overlay">
            <defs>
              <marker id="trail-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#00E5FF" />
              </marker>
              <marker id="trail-arrow-static" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4" markerHeight="4" orient="auto">
                <circle cx="5" cy="5" r="3" fill="#FFFFFF" opacity="0.5" />
              </marker>
            </defs>
            {trailPairs.map(p => {
              const moved = p.deltaPct >= 0.8;
              const midX = (p.from.x + p.to.x) / 2;
              const midY = (p.from.y + p.to.y) / 2;
              return (
                <g key={p.key} data-testid={`trail-${p.key}`}>
                  <circle cx={p.from.x} cy={p.from.y} r="4" fill={p.color} opacity="0.55" stroke="#000" strokeWidth="1" />
                  <circle cx={p.to.x} cy={p.to.y} r="4" fill={p.color} opacity="0.9" stroke="#000" strokeWidth="1" />
                  {moved ? (
                    <>
                      <line x1={p.from.x} y1={p.from.y} x2={p.to.x} y2={p.to.y}
                        stroke="#00E5FF" strokeWidth="1.5" strokeDasharray="4 3" opacity="0.85"
                        markerEnd="url(#trail-arrow)" />
                      <g transform={`translate(${midX}, ${midY - 6})`}>
                        <rect x="-16" y="-8" width="32" height="12" fill="#000000" opacity="0.75" />
                        <text x="0" y="1" textAnchor="middle" fontSize="9" fontFamily="monospace" fill="#00E5FF" dominantBaseline="middle">
                          Δ {p.deltaPct.toFixed(1)}%
                        </text>
                      </g>
                    </>
                  ) : (
                    <line x1={p.from.x} y1={p.from.y} x2={p.to.x} y2={p.to.y}
                      stroke="#FFFFFF" strokeWidth="0.75" opacity="0.25" />
                  )}
                  {p.label && (
                    <text x={p.from.x + 6} y={p.from.y - 6} fontSize="8" fontFamily="monospace" fill={p.color} opacity="0.9">
                      {p.label}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        )}
      </div>

      <div className="p-3 border-t border-white/[0.06] bg-[#0A0A0A]">
        <div className="flex items-start gap-3">
          <div className="flex-1">
            <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Add comparison notes for the referee report..." className="w-full bg-transparent border border-white/[0.08] px-3 py-1.5 text-xs text-white placeholder:text-gray-600 font-mono focus:border-[#00E5FF]/40 outline-none" data-testid="comparison-notes" />
          </div>
          <div className="text-[9px] font-mono text-gray-600 whitespace-nowrap pt-1.5">
            {beforeAnnotations.length + afterAnnotations.length} total marks
          </div>
        </div>
      </div>
    </div>
  );
};
