/**
 * OCTON System Health Pip
 * ────────────────────────
 * Tiny status-bar widget shown in the dashboard top-nav. Polls
 * `GET /api/system/health` every 30s and renders one coloured dot per
 * upstream dependency (storage, LLM, scheduler). Click it to expand a
 * popover with latency, last storage warning, and scheduler cadence.
 *
 * Colour scheme:
 *   green  = ok
 *   amber  = degraded (recent failure within 5 min, but service responsive)
 *   red    = down (key missing / probe failed)
 *   grey   = scheduler disabled (informational, not an error)
 */
import { useEffect, useState, useRef } from "react";
import axios from "axios";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const STATUS_COLOR = {
  ok:       { bg: "#00FF66", glow: "rgba(0,255,102,0.65)", label: "ONLINE" },
  degraded: { bg: "#FFB800", glow: "rgba(255,184,0,0.7)",  label: "DEGRADED" },
  down:     { bg: "#FF2A2A", glow: "rgba(255,42,42,0.75)", label: "DOWN" },
  unknown:  { bg: "#666",    glow: "rgba(120,120,120,0.5)", label: "UNKNOWN" },
};

const dotStyle = (status) => {
  const c = STATUS_COLOR[status] || STATUS_COLOR.unknown;
  return {
    backgroundColor: c.bg,
    boxShadow: `0 0 8px ${c.glow}, 0 0 0 1px ${c.bg}`,
  };
};

export const SystemHealthPip = () => {
  const [health, setHealth] = useState(null);
  const [open, setOpen]   = useState(false);
  const popRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const r = await axios.get(`${API}/system/health`);
        if (!cancelled) setHealth(r.data);
      } catch { /* offline — keep last known state */ }
    };
    tick();
    const id = setInterval(tick, 30000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const onClick = (e) => {
      if (popRef.current && !popRef.current.contains(e.target)) setOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [open]);

  if (!health) {
    return (
      <div className="flex items-center gap-1.5 px-2 py-1 border border-white/10 bg-white/[0.02]" data-testid="system-health-pip">
        <span className="w-1.5 h-1.5 rounded-full bg-gray-600 animate-pulse" />
        <span className="text-[8px] font-mono uppercase tracking-[0.22em] text-gray-500">SYS</span>
      </div>
    );
  }

  const sStatus = health.storage?.status || "unknown";
  const lStatus = health.llm?.status || "unknown";
  const schedEnabled = !!health.scheduler?.enabled;
  // Worst status drives the overall colour
  const overall =
    sStatus === "down" || lStatus === "down" ? "down" :
    sStatus === "degraded" || lStatus === "degraded" ? "degraded" :
    "ok";
  const overallColor = STATUS_COLOR[overall];

  return (
    <div className="relative" ref={popRef}>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 px-2.5 py-1 border border-white/10 bg-white/[0.02] hover:bg-white/[0.05] transition-colors"
        data-testid="system-health-pip"
        aria-label={`System ${overallColor.label}`}
        aria-expanded={open}
      >
        <span className="w-1.5 h-1.5 rounded-full" style={dotStyle(sStatus)}    title={`Storage: ${sStatus}`} />
        <span className="w-1.5 h-1.5 rounded-full" style={dotStyle(lStatus)}    title={`LLM: ${lStatus}`} />
        <span className="w-1.5 h-1.5 rounded-full" style={dotStyle(schedEnabled ? "ok" : "unknown")} title={`Scheduler: ${schedEnabled ? "armed" : "paused"}`} />
        <span className="text-[8px] font-mono uppercase tracking-[0.22em]" style={{ color: overallColor.bg }}>
          SYS · {overallColor.label}
        </span>
      </button>

      {open && (
        <div
          className="absolute top-full right-0 mt-2 w-80 z-[80] bg-[#050505]/98 border border-[#00E5FF]/25 backdrop-blur-md octon-fade-in"
          style={{ boxShadow: "0 0 30px rgba(0,229,255,0.18)" }}
          data-testid="system-health-popover"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.08]">
            <span className="text-[10px] font-heading font-bold uppercase tracking-[0.25em] text-[#00E5FF]">
              SYSTEM HEALTH
            </span>
            <span className="text-[8px] font-mono text-gray-500 tracking-[0.18em] uppercase">
              checked {new Date(health.checked_at).toLocaleTimeString()}
            </span>
          </div>

          {/* Rows */}
          <div className="divide-y divide-white/[0.04]">
            {/* Storage */}
            <div className="px-3 py-2.5 flex items-center gap-3">
              <span className="w-2 h-2 rounded-full flex-none" style={dotStyle(sStatus)} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[11px] font-mono font-bold tracking-wide text-white">OBJECT STORAGE</span>
                  <span className="text-[8px] font-mono uppercase tracking-[0.2em]" style={{ color: STATUS_COLOR[sStatus]?.bg }}>
                    {STATUS_COLOR[sStatus]?.label}
                  </span>
                </div>
                <div className="text-[9px] font-mono text-gray-500 mt-0.5">
                  Emergent Object Storage · {health.storage?.latency_ms != null ? `${health.storage.latency_ms} ms` : "—"}
                </div>
                {health.storage?.error && (
                  <div className="text-[9px] font-mono text-[#FFB800] mt-0.5 truncate" title={health.storage.error}>
                    ⚠ {health.storage.error}
                  </div>
                )}
              </div>
            </div>

            {/* LLM */}
            <div className="px-3 py-2.5 flex items-center gap-3">
              <span className="w-2 h-2 rounded-full flex-none" style={dotStyle(lStatus)} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[11px] font-mono font-bold tracking-wide text-white">UNIVERSAL LLM KEY</span>
                  <span className="text-[8px] font-mono uppercase tracking-[0.2em]" style={{ color: STATUS_COLOR[lStatus]?.bg }}>
                    {STATUS_COLOR[lStatus]?.label}
                  </span>
                </div>
                <div className="text-[9px] font-mono text-gray-500 mt-0.5">
                  Emergent · GPT-5.2, GPT-4o-mini, Whisper, TTS
                </div>
                {health.llm?.error && (
                  <div className="text-[9px] font-mono text-[#FF6666] mt-0.5">⚠ {health.llm.error}</div>
                )}
              </div>
            </div>

            {/* Scheduler */}
            <div className="px-3 py-2.5 flex items-center gap-3">
              <span className="w-2 h-2 rounded-full flex-none" style={dotStyle(schedEnabled ? "ok" : "unknown")} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[11px] font-mono font-bold tracking-wide text-white">AUTO-LEARN SCHEDULER</span>
                  <span className="text-[8px] font-mono uppercase tracking-[0.2em]" style={{ color: schedEnabled ? STATUS_COLOR.ok.bg : "#888" }}>
                    {schedEnabled ? "ARMED" : "PAUSED"}
                  </span>
                </div>
                <div className="text-[9px] font-mono text-gray-500 mt-0.5">
                  Cron · {health.scheduler?.cron || "—"}
                  {health.scheduler?.last_run_at && (
                    <> · last run {new Date(health.scheduler.last_run_at).toLocaleString()}</>
                  )}
                </div>
              </div>
            </div>

            {/* Recent storage warning */}
            {health.recent_storage_warning && (
              <div className="px-3 py-2.5 bg-[#FFB800]/[0.05]">
                <div className="text-[9px] font-mono text-[#FFB800] uppercase tracking-[0.2em] mb-1">⚠ recent upload failure</div>
                <div className="text-[10px] font-mono text-gray-400 leading-relaxed">
                  {health.recent_storage_warning.warnings?.[0]?.message}
                </div>
                <div className="text-[8px] font-mono text-gray-600 mt-1 uppercase tracking-[0.2em]">
                  {health.recent_storage_warning.age_seconds}s ago
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-3 py-1.5 border-t border-white/[0.06] text-[8px] font-mono text-gray-600 tracking-[0.22em] uppercase flex justify-between">
            <span>// poll every 30s</span>
            <span>octon · sys diag</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default SystemHealthPip;
