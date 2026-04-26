/**
 * OCTON Connectome
 * ━━━━━━━━━━━━━━━━━
 * Living 3-column neural connectome:
 *   • Left   — Hippocampus column  (#00FF88)  → matched_keywords
 *   • Centre — Lateral binding     (#7CF9FF)  → integration neurons
 *   • Right  — Neo Cortex column   (#00E5FF)  → key_factors / law refs
 *
 * Click any neuron → fires it → ripples through its synapses → reveals
 * which keyword / feature it represents in the underlying analysis.
 *
 * Ambient state: each neuron pulses at slightly different cadence (matches
 * the OCTON brain logo aesthetic). Continuous "data packets" travel along
 * synapses left → right at all times so the panel feels alive.
 */
import { useState, useMemo, useCallback, useEffect } from "react";

const PALETTE = {
  hipp:    "#00FF88",
  lateral: "#7CF9FF",
  neo:     "#00E5FF",
  body:    "rgba(255,255,255,0.04)",
  link:    "rgba(124,249,255,0.22)",
  linkHi:  "#FFB800",
};

// Pseudo-random but deterministic for stable layout per analysis
const seededShuffle = (arr, seed = 1) => {
  const a = [...arr];
  let s = seed;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280;
    const j = Math.floor((s / 233280) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const buildNeurons = (analysis) => {
  if (!analysis) return { left: [], lateral: [], right: [], edges: [] };

  const hippoKeywords = (analysis?.hippocampus?.matched_keywords || []).slice(0, 7);
  const negKeywords   = (analysis?.hippocampus?.matched_negatives || []).slice(0, 2);
  const factors       = (analysis?.key_factors || []).slice(0, 6);
  const laws          = (analysis?.neo_cortex?.law_references_cited || []).slice(0, 2);

  const leftLabels  = [...hippoKeywords, ...negKeywords].filter(Boolean);
  const rightLabels = [...factors, ...laws].filter(Boolean);

  // Pad both columns so the network always feels full
  while (leftLabels.length  < 6) leftLabels.push("ambient-feature");
  while (rightLabels.length < 6) rightLabels.push("law-context");

  const leftCount  = Math.min(8, leftLabels.length);
  const rightCount = Math.min(8, rightLabels.length);
  const lateralCount = 4;

  const layoutCol = (count, x) => Array.from({ length: count }, (_, i) => ({
    x,
    y: 18 + (i * (164 / Math.max(count - 1, 1))),
    r: 2.6 + ((i % 3) * 0.35),
    delay: (i * 0.27) % 2.4,
    duration: 1.6 + (i * 0.13) % 1.4,
  }));

  const left    = layoutCol(leftCount,    18).map((n, i) => ({
    id: `H-${i}`, role: "hipp", label: leftLabels[i] || "feature",
    color: i < hippoKeywords.length ? PALETTE.hipp : "#FF6666",
    ...n,
  }));
  const right   = layoutCol(rightCount,  282).map((n, i) => ({
    id: `N-${i}`, role: "neo", label: rightLabels[i] || "factor",
    color: PALETTE.neo,
    ...n,
  }));
  const lateral = layoutCol(lateralCount, 150).map((n, i) => ({
    id: `L-${i}`, role: "lateral", label: i < laws.length ? laws[i] : "lateral-bind",
    color: PALETTE.lateral,
    ...n, x: 150,
    y: 36 + (i * 35),
    r: 2.2 + (i % 2) * 0.3,
  }));

  // Build edges deterministically (each left/right neuron binds to 2-3 lateral)
  const edges = [];
  let s = 7;
  const next = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  left.forEach((nL) => {
    const targets = seededShuffle(lateral, Math.floor(next() * 99 + 1)).slice(0, 2 + Math.floor(next() * 2));
    targets.forEach(nM => edges.push({ from: nL, to: nM, kind: "h-l" }));
  });
  right.forEach((nR) => {
    const targets = seededShuffle(lateral, Math.floor(next() * 99 + 7)).slice(0, 2 + Math.floor(next() * 2));
    targets.forEach(nM => edges.push({ from: nM, to: nR, kind: "l-n" }));
  });
  // Direct cross-column "long-range" links — visually critical so the panel reads as one network
  left.forEach((nL, i) => {
    const nR = right[i % right.length];
    edges.push({ from: nL, to: nR, kind: "long" });
  });

  return { left, lateral, right, edges };
};


export const Connectome = ({ analysis }) => {
  const { left, lateral, right, edges } = useMemo(() => buildNeurons(analysis), [analysis]);
  const allNeurons = useMemo(() => [...left, ...lateral, ...right], [left, lateral, right]);

  // firingId = id of neuron the user clicked; we also propagate to its 1-hop neighbours
  const [firingId, setFiringId] = useState(null);
  const [hoverId, setHoverId] = useState(null);
  const [tick, setTick] = useState(0);

  // 60-frame heartbeat for ambient packet animation along edges
  useEffect(() => {
    let raf;
    const loop = () => { setTick(t => (t + 1) % 600); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const fire = useCallback((id) => {
    setFiringId(id);
    setTimeout(() => setFiringId(cur => (cur === id ? null : cur)), 1500);
  }, []);

  // Neighbour resolver for ripple + edge-highlight
  const neighboursOf = useCallback((id) => {
    if (!id) return new Set();
    const set = new Set([id]);
    edges.forEach(e => {
      if (e.from.id === id) set.add(e.to.id);
      if (e.to.id   === id) set.add(e.from.id);
    });
    return set;
  }, [edges]);

  const activeIds = neighboursOf(firingId || hoverId);
  const focusNeuron = allNeurons.find(n => n.id === (firingId || hoverId));

  return (
    <div className="relative" data-testid="octon-connectome">
      {/* Header strip — military lockup */}
      <div className="flex items-center justify-between mb-2 px-1">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 bg-[#00FF88] octon-blink" />
            <span className="text-[9px] font-mono uppercase tracking-[0.28em] text-[#00FF88]">CONNECTOME</span>
          </div>
          <span className="text-[9px] font-mono uppercase tracking-[0.28em] text-gray-600">·</span>
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 bg-[#7CF9FF] octon-blink" style={{ animationDelay: "0.4s" }} />
            <span className="text-[9px] font-mono uppercase tracking-[0.28em] text-[#7CF9FF]">ACTION POTENTIALS</span>
          </div>
          <span className="text-[9px] font-mono uppercase tracking-[0.28em] text-gray-600">·</span>
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 bg-[#00E5FF] octon-blink" style={{ animationDelay: "0.8s" }} />
            <span className="text-[9px] font-mono uppercase tracking-[0.28em] text-[#00E5FF]">LATERAL BINDING</span>
          </div>
        </div>
        <span className="text-[9px] font-mono text-gray-600 tracking-[0.2em] uppercase">
          tap a neuron to fire ↗
        </span>
      </div>

      {/* SVG connectome */}
      <div className="relative border border-white/[0.08] bg-[#020608] overflow-hidden mil-corner">
        {/* Tactical grid backdrop */}
        <div className="absolute inset-0 mil-grid pointer-events-none" />
        {/* Scanline */}
        <div className="absolute inset-0 mil-scanline pointer-events-none" />

        <svg viewBox="0 0 300 200" className="relative w-full" style={{ aspectRatio: "300/200" }}>
          <defs>
            <radialGradient id="cnx-glow-h" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#00FF88" stopOpacity="0.95" />
              <stop offset="60%" stopColor="#00FF88" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#00FF88" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="cnx-glow-l" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#7CF9FF" stopOpacity="0.95" />
              <stop offset="60%" stopColor="#7CF9FF" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#7CF9FF" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="cnx-glow-n" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#00E5FF" stopOpacity="0.95" />
              <stop offset="60%" stopColor="#00E5FF" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#00E5FF" stopOpacity="0" />
            </radialGradient>
            <filter id="cnx-soft" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="0.6" />
            </filter>
            {/* Animated dash for ambient signal traffic */}
            <linearGradient id="signal-h" x1="0" x2="1">
              <stop offset="0%" stopColor="#00FF88" stopOpacity="0" />
              <stop offset="50%" stopColor="#00FF88" stopOpacity="1" />
              <stop offset="100%" stopColor="#00FF88" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="signal-n" x1="0" x2="1">
              <stop offset="0%" stopColor="#00E5FF" stopOpacity="0" />
              <stop offset="50%" stopColor="#00E5FF" stopOpacity="1" />
              <stop offset="100%" stopColor="#00E5FF" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Column header lockups */}
          <g style={{ fontFamily: "monospace" }}>
            <text x="22" y="10" textAnchor="start" fontSize="6" fill="#00FF88" letterSpacing="2">HIPPOCAMPUS</text>
            <text x="150" y="10" textAnchor="middle" fontSize="6" fill="#7CF9FF" letterSpacing="2">BIND</text>
            <text x="278" y="10" textAnchor="end" fontSize="6" fill="#00E5FF" letterSpacing="2">NEO·CORTEX</text>
          </g>

          {/* Edges (drawn under nodes) */}
          {edges.map((e, i) => {
            const isActive = activeIds.has(e.from.id) && activeIds.has(e.to.id);
            const isLong = e.kind === "long";
            const stroke = isActive ? PALETTE.linkHi : (isLong ? "rgba(124,249,255,0.12)" : "rgba(124,249,255,0.16)");
            const width  = isActive ? 0.7 : (isLong ? 0.22 : 0.32);

            // Curved bezier — graceful lateral binding
            const dx = e.to.x - e.from.x;
            const cx1 = e.from.x + dx * 0.35;
            const cx2 = e.from.x + dx * 0.65;
            const cy1 = e.from.y;
            const cy2 = e.to.y;
            const d = `M ${e.from.x} ${e.from.y} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${e.to.x} ${e.to.y}`;
            const dashOffset = -((tick + i * 7) % 60);
            return (
              <g key={i} pointerEvents="none">
                <path
                  d={d}
                  stroke={stroke}
                  strokeWidth={width}
                  fill="none"
                  opacity={isActive ? 0.95 : 0.7}
                  style={{ transition: "stroke 250ms, stroke-width 250ms, opacity 250ms" }}
                />
                <path
                  d={d}
                  stroke={isActive ? PALETTE.linkHi : (e.kind === "l-n" ? "#00E5FF" : e.kind === "h-l" ? "#00FF88" : "#7CF9FF")}
                  strokeWidth={isActive ? 0.85 : 0.45}
                  fill="none"
                  strokeDasharray="3 70"
                  strokeDashoffset={dashOffset}
                  opacity={isActive ? 0.95 : 0.6}
                />
              </g>
            );
          })}

          {/* Neurons */}
          {allNeurons.map(n => {
            const isFocus  = (firingId === n.id) || (hoverId === n.id);
            const isInRipple = activeIds.has(n.id);
            const glowId = n.role === "hipp" ? "cnx-glow-h" : n.role === "neo" ? "cnx-glow-n" : "cnx-glow-l";
            const baseR = n.r;
            const pulseR = baseR + (isFocus ? 2.2 : 0);
            return (
              <g
                key={n.id}
                onClick={() => fire(n.id)}
                onMouseEnter={() => setHoverId(n.id)}
                onMouseLeave={() => setHoverId(null)}
                style={{ cursor: "pointer" }}
                data-testid={`connectome-neuron-${n.id}`}
              >
                {/* Outer glow */}
                <circle
                  cx={n.x} cy={n.y} r={pulseR + 4}
                  fill={`url(#${glowId})`}
                  opacity={isFocus ? 0.85 : (isInRipple ? 0.5 : 0.28)}
                  style={{ transition: "opacity 250ms" }}
                />
                {/* Pulsing outer ring (action potential) */}
                <circle
                  cx={n.x} cy={n.y} r={baseR + 0.9}
                  fill="none"
                  stroke={n.color}
                  strokeWidth={isFocus ? 0.7 : 0.35}
                  opacity={isFocus ? 0.9 : 0.5}
                  className="cnx-ring"
                  style={{
                    animationDuration: `${n.duration}s`,
                    animationDelay: `${n.delay}s`,
                  }}
                />
                {/* Core neuron */}
                <circle
                  cx={n.x} cy={n.y} r={baseR}
                  fill={n.color}
                  filter="url(#cnx-soft)"
                  opacity={0.95}
                />
                <circle
                  cx={n.x} cy={n.y} r={baseR * 0.45}
                  fill="#FFFFFF"
                  opacity={isFocus ? 1 : 0.85}
                />
                {/* Hit-area expander for tiny neurons */}
                <circle cx={n.x} cy={n.y} r={baseR + 4} fill="transparent" />
                {/* Ripple wave on fire */}
                {firingId === n.id && (
                  <circle
                    cx={n.x} cy={n.y} r={baseR}
                    fill="none"
                    stroke={n.color}
                    strokeWidth="0.8"
                    className="cnx-ripple"
                  />
                )}
              </g>
            );
          })}

          {/* Vertical column rail markers */}
          <g opacity="0.18">
            <line x1="18" y1="14" x2="18" y2="194" stroke="#00FF88" strokeDasharray="2 4" />
            <line x1="150" y1="14" x2="150" y2="194" stroke="#7CF9FF" strokeDasharray="2 4" />
            <line x1="282" y1="14" x2="282" y2="194" stroke="#00E5FF" strokeDasharray="2 4" />
          </g>
        </svg>

        {/* Corner brackets */}
        <span className="absolute top-0 left-0 w-3 h-3 border-l border-t border-[#00E5FF]/60 pointer-events-none" />
        <span className="absolute top-0 right-0 w-3 h-3 border-r border-t border-[#00E5FF]/60 pointer-events-none" />
        <span className="absolute bottom-0 left-0 w-3 h-3 border-l border-b border-[#00E5FF]/60 pointer-events-none" />
        <span className="absolute bottom-0 right-0 w-3 h-3 border-r border-b border-[#00E5FF]/60 pointer-events-none" />
      </div>

      {/* Focus readout — the "which feature does this neuron represent?" panel */}
      <div className="mt-2 grid grid-cols-[1fr_auto] gap-2 items-center px-1">
        <div className="text-[10px] font-mono text-gray-300 truncate" data-testid="connectome-readout">
          {focusNeuron ? (
            <>
              <span className="text-gray-500">// </span>
              <span style={{ color: focusNeuron.color }} className="font-bold uppercase tracking-[0.18em]">
                {focusNeuron.role === "hipp" ? "FAST PATH" : focusNeuron.role === "neo" ? "DEEP PATH" : "BIND NODE"}
              </span>
              <span className="text-gray-500"> · </span>
              <span className="text-white">{focusNeuron.label}</span>
            </>
          ) : (
            <span className="text-gray-600">// HOVER OR TAP A NEURON TO INSPECT THE BOUND FEATURE</span>
          )}
        </div>
        <div className="flex items-center gap-3 text-[9px] font-mono text-gray-500 tracking-[0.2em] uppercase">
          <span>{left.length} HIPP</span>
          <span>·</span>
          <span>{lateral.length} BIND</span>
          <span>·</span>
          <span>{right.length} NEO</span>
          <span>·</span>
          <span>{edges.length} SYNAPSES</span>
        </div>
      </div>
    </div>
  );
};

export default Connectome;
