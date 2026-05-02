/**
 * HippocampusNeocortexHeader — the dual-brain visual identity for the
 * LiveVAR control room.
 *
 * Visual narrative: two cooperating brain regions (Hippocampus = fast
 * pattern recall, Neocortex = deep forensic reasoning) wired by a live
 * synapse "bridge". Designed to make the neuroscience-meets-AI thesis
 * legible at a glance to referees, board observers, and broadcasters.
 *
 * Pure SVG + CSS animation, no external libs. The "synapse" pulses in
 * sync with the OCTON system status pill so when WS traffic arrives you
 * see the bridge fire.
 */
import { useEffect, useState } from "react";
import { Brain, Zap } from "lucide-react";

export default function HippocampusNeocortexHeader({ wsConnected, recentActivity = false, lastEvent = null }) {
  // Periodic synapse pulse — slower when idle, faster when traffic flows.
  const [tick, setTick] = useState(0);
  const [fireTick, setFireTick] = useState(0);
  const [fireKind, setFireKind] = useState(null);
  useEffect(() => {
    const intvl = setInterval(() => setTick((t) => t + 1), recentActivity ? 800 : 2200);
    return () => clearInterval(intvl);
  }, [recentActivity]);

  // Fire-flash: every distinct WS event bumps fireTick → triggers a 1.4s
  // colour pulse on the synapse that maps the event type to a hue:
  //   incident_created   → cyan      (new evidence ingested)
  //   decision_made      → green     (verdict locked in)
  //   analysis_complete  → magenta   (Neo Cortex finished)
  //   presence_update    → amber     (booth presence change)
  //   ofr_bookmark       → red       (OFR threshold crossed)
  useEffect(() => {
    if (!lastEvent || !lastEvent.type) return;
    setFireKind(lastEvent.type);
    setFireTick((n) => n + 1);
    const t = setTimeout(() => setFireKind(null), 1400);
    return () => clearTimeout(t);
  }, [lastEvent]);

  return (
    <div
      className="relative border-b border-white/[0.06] bg-gradient-to-r from-[#050505] via-[#0A0A0F] to-[#050505] overflow-hidden"
      data-testid="hippo-neo-header"
    >
      {/* Subtle grid texture */}
      <div className="absolute inset-0 opacity-[0.04] pointer-events-none"
           style={{ backgroundImage: "linear-gradient(rgba(0,229,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(0,229,255,1) 1px, transparent 1px)", backgroundSize: "32px 32px" }} />
      <div className="relative px-4 py-3 flex items-center justify-between gap-3">
        {/* Left: Hippocampus icon + label */}
        <div className="flex items-center gap-2.5 min-w-0" data-testid="hippocampus-region">
          <div className="relative">
            <div className="w-7 h-7 border border-[#FFB800]/40 bg-[#FFB800]/10 flex items-center justify-center">
              <Zap className={`w-3.5 h-3.5 text-[#FFB800] ${recentActivity ? "animate-pulse" : ""}`} />
            </div>
            <span className="absolute -top-1 -right-1 w-1.5 h-1.5 rounded-full bg-[#FFB800] animate-ping opacity-75" />
          </div>
          <div className="min-w-0">
            <p className="text-[9px] font-mono tracking-[0.25em] text-[#FFB800]/80">HIPPOCAMPUS · FAST RECALL</p>
            <p className="text-[10px] text-gray-500 font-mono truncate">precedent matching · keyword binding · ≤ 50ms</p>
          </div>
        </div>

        {/* Centre: animated synapse bridge + tagline */}
        <div className="flex-1 max-w-2xl mx-2 flex flex-col items-center gap-1.5">
          <Synapse tick={tick} fireTick={fireTick} fireKind={fireKind} active={wsConnected} />
          <p className="text-[10px] text-gray-400 font-mono tracking-[0.18em] text-center">
            <span className="text-white">OCTON</span>
            <span className="mx-2 text-gray-600">·</span>
            <span>BRIDGING NEUROSCIENCE & AI FOR FOOTBALL'S DECISIVE MOMENTS</span>
          </p>
        </div>

        {/* Right: Neocortex icon + label */}
        <div className="flex items-center gap-2.5 min-w-0 justify-end" data-testid="neocortex-region">
          <div className="text-right min-w-0">
            <p className="text-[9px] font-mono tracking-[0.25em] text-[#00E5FF]/80">NEOCORTEX · DEEP REASONING</p>
            <p className="text-[10px] text-gray-500 font-mono truncate">multi-frame · IFAB-cited · 4-frame burst</p>
          </div>
          <div className="relative">
            <div className="w-7 h-7 border border-[#00E5FF]/40 bg-[#00E5FF]/10 flex items-center justify-center">
              <Brain className="w-3.5 h-3.5 text-[#00E5FF]" />
            </div>
            <span className="absolute -top-1 -left-1 w-1.5 h-1.5 rounded-full bg-[#00E5FF] animate-ping opacity-75" />
          </div>
        </div>
      </div>
    </div>
  );
}

function Synapse({ tick, active, fireTick, fireKind }) {
  // Two parallel lines with a moving "spike" travelling left → right
  // when WS traffic is alive, signalling the dual-brain handoff.
  // When a WS event fires, the spike paints in an event-coloured hue
  // for ~1.4s so referees literally see the brain firing in real time.
  const offset = tick % 100;
  const fireColors = {
    incident_created: "#00E5FF",
    decision_made: "#00FF88",
    analysis_complete: "#FF6BD6",
    presence_update: "#FFB800",
    ofr_bookmark: "#FF3333",
  };
  const fireColor = fireKind ? (fireColors[fireKind] || "#FFFFFF") : null;
  return (
    <svg
      width="100%"
      height="22"
      viewBox="0 0 400 22"
      preserveAspectRatio="none"
      className="overflow-visible"
      role="presentation"
      aria-hidden="true"
      data-testid="hippo-neo-synapse"
      data-fire-tick={fireTick}
      data-fire-kind={fireKind || ""}
    >
      <defs>
        <linearGradient id="synapseGrad" x1="0" x2="1">
          <stop offset="0" stopColor="#FFB800" stopOpacity="0.7" />
          <stop offset="0.5" stopColor="#FFFFFF" stopOpacity="0.15" />
          <stop offset="1" stopColor="#00E5FF" stopOpacity="0.7" />
        </linearGradient>
      </defs>
      <line x1="0" y1="11" x2="400" y2="11" stroke="url(#synapseGrad)" strokeWidth="1" strokeDasharray="3 4" />
      {fireColor && (
        <line
          x1="0" y1="11" x2="400" y2="11"
          stroke={fireColor}
          strokeWidth="2"
          opacity="0.85"
          style={{ filter: `drop-shadow(0 0 8px ${fireColor})`, animation: "octonFireFlash 1.4s ease-out forwards" }}
        />
      )}
      {active && (
        <circle
          cx={offset * 4}
          cy="11"
          r={fireColor ? 4.5 : 3}
          fill={fireColor || "#fff"}
          opacity="0.9"
          style={{ filter: `drop-shadow(0 0 ${fireColor ? 8 : 4}px ${fireColor || "#00E5FF"})` }}
        />
      )}
      {/* Side dendrites — small visual accents that connect to the icons */}
      <path d="M0 11 Q -8 11, -10 6 M0 11 Q -8 11, -10 16" stroke="#FFB800" strokeWidth="1" fill="none" opacity="0.5" />
      <path d="M400 11 Q 408 11, 410 6 M400 11 Q 408 11, 410 16" stroke="#00E5FF" strokeWidth="1" fill="none" opacity="0.5" />
    </svg>
  );
}
