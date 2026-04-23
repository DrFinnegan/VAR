/**
 * Confidence Ring + curtain + copy-to-clipboard micro-components
 * Used by the OCTON Analysis right panel.
 */
import { useState } from "react";
import { ChevronDown, Copy, Check, Sparkles, Zap } from "lucide-react";
import { toast } from "sonner";

export const ConfidenceScore = ({ score, size = "default", uplift = 0, precedentCount = 0, hipBonus = 0, base = 0, hip = 0, neo = 0, divergence = 0, weighting = null }) => {
  const s = Number(score) || 0;
  const getColor = (x) => (x >= 90 ? "#00FF88" : x >= 70 ? "#00E5FF" : x >= 50 ? "#FFB800" : "#FF2A2A");
  const getTier = (x) => (x >= 90 ? "HIGH" : x >= 70 ? "STRONG" : x >= 50 ? "MODERATE" : "LOW");
  const color = getColor(s);
  const [showBreakdown, setShowBreakdown] = useState(false);

  if (size === "small") {
    return (
      <div className="flex items-baseline gap-0.5" data-testid="ai-confidence-score">
        <span className="font-mono font-bold tracking-tighter text-2xl" style={{ color }}>{s.toFixed(1)}</span>
        <span className="text-sm font-mono" style={{ color, opacity: 0.5 }}>%</span>
      </div>
    );
  }

  const dim = size === "large" ? 140 : 120;
  const stroke = 6;
  const r = (dim - stroke) / 2;
  const c = 2 * Math.PI * r;
  const progress = Math.max(0, Math.min(100, s));
  const dash = (progress / 100) * c;

  const baseVal = Number(base) || Math.max(0, s - uplift - hipBonus);
  const total = Math.max(1, baseVal + uplift + hipBonus);
  const basePct = (baseVal / total) * 100;
  const upliftPct = (uplift / total) * 100;
  const hipPct = (hipBonus / total) * 100;

  return (
    <div className="flex flex-col items-center" data-testid="ai-confidence-score">
      <span className="text-[10px] font-mono uppercase tracking-[0.3em] text-gray-500 mb-2">FINAL CONFIDENCE</span>
      <div
        className="relative cursor-pointer group"
        style={{ width: dim, height: dim }}
        onClick={() => setShowBreakdown(v => !v)}
        role="button"
        tabIndex={0}
        data-testid="confidence-ring-toggle"
        title="Click for confidence breakdown"
      >
        <svg width={dim} height={dim} className="-rotate-90">
          <circle cx={dim / 2} cy={dim / 2} r={r} fill="none" stroke="#ffffff0d" strokeWidth={stroke} />
          <circle
            cx={dim / 2} cy={dim / 2} r={r} fill="none"
            stroke={color} strokeWidth={stroke} strokeLinecap="round"
            strokeDasharray={`${dash} ${c - dash}`}
            style={{ transition: "stroke-dasharray 600ms ease, stroke 300ms ease", filter: `drop-shadow(0 0 6px ${color}80)` }}
          />
          {Array.from({ length: 36 }).map((_, i) => {
            const ang = (i / 36) * 2 * Math.PI;
            const x1 = dim / 2 + (r - stroke - 3) * Math.cos(ang);
            const y1 = dim / 2 + (r - stroke - 3) * Math.sin(ang);
            const x2 = dim / 2 + (r - stroke) * Math.cos(ang);
            const y2 = dim / 2 + (r - stroke) * Math.sin(ang);
            return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#ffffff14" strokeWidth="1" />;
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="flex items-baseline gap-0.5">
            <span className="font-mono font-bold tracking-tighter text-4xl" style={{ color, textShadow: `0 0 10px ${color}80` }}>
              {s.toFixed(1)}
            </span>
            <span className="text-base font-mono" style={{ color, opacity: 0.5 }}>%</span>
          </div>
          <span className="text-[8px] font-mono uppercase tracking-[0.25em] mt-0.5" style={{ color, opacity: 0.7 }}>
            {getTier(s)}
          </span>
          <div className="mt-1.5 opacity-40 group-hover:opacity-90 transition-opacity">
            <ChevronDown className="w-3 h-3" style={{ color, transform: showBreakdown ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 200ms" }} />
          </div>
        </div>
      </div>
      {(uplift > 0 || hipBonus > 0) && (
        <div className="mt-2 flex items-center gap-1.5 flex-wrap justify-center">
          {uplift > 0 && (
            <div className="flex items-center gap-1.5 px-2 py-1 border border-[#B366FF]/30 bg-[#B366FF]/[0.08]" data-testid="uplift-badge">
              <Sparkles className="w-3 h-3 text-[#B366FF]" />
              <span className="text-[9px] font-mono text-[#B366FF] tracking-wider">
                +{uplift.toFixed(1)}% <span className="text-[#B366FF]/70">{precedentCount} precedent{precedentCount === 1 ? "" : "s"}</span>
              </span>
            </div>
          )}
          {hipBonus > 0 && (
            <div className="flex items-center gap-1.5 px-2 py-1 border border-[#00FF88]/30 bg-[#00FF88]/[0.08]" data-testid="hippocampus-agreement-badge" title="Hippocampus and Neo Cortex agree — added agreement bonus">
              <Zap className="w-3 h-3 text-[#00FF88]" />
              <span className="text-[9px] font-mono text-[#00FF88] tracking-wider">
                +{hipBonus.toFixed(1)}% <span className="text-[#00FF88]/70">agreement</span>
              </span>
            </div>
          )}
        </div>
      )}

      {/* Confidence Breakdown — click ring to toggle */}
      <div
        className="w-full overflow-hidden transition-all duration-300 ease-out"
        style={{ maxHeight: showBreakdown ? 260 : 0, opacity: showBreakdown ? 1 : 0 }}
        data-testid="confidence-breakdown"
      >
        <div className="mt-3 border border-white/[0.06] bg-black/30 p-3">
          {/* Stacked bar */}
          <div className="flex items-center gap-1 h-3 w-full bg-white/[0.04] overflow-hidden">
            {basePct > 0 && (
              <div
                className="h-full"
                style={{ width: `${basePct}%`, backgroundColor: "#00E5FF", boxShadow: "inset 0 0 8px #00E5FF88" }}
                title={`Base: ${baseVal.toFixed(1)}%`}
              />
            )}
            {upliftPct > 0 && (
              <div
                className="h-full"
                style={{ width: `${upliftPct}%`, backgroundColor: "#B366FF", boxShadow: "inset 0 0 8px #B366FF88" }}
                title={`Precedents: +${uplift.toFixed(1)}%`}
              />
            )}
            {hipPct > 0 && (
              <div
                className="h-full"
                style={{ width: `${hipPct}%`, backgroundColor: "#00FF88", boxShadow: "inset 0 0 8px #00FF8888" }}
                title={`Agreement: +${hipBonus.toFixed(1)}%`}
              />
            )}
          </div>

          {/* Legend / rows */}
          <div className="mt-3 space-y-1.5">
            <BreakdownRow color="#00E5FF" label="Base (Hip + Neo weighted)" value={baseVal} />
            {uplift > 0 && (
              <BreakdownRow color="#B366FF" label={`Precedents (${precedentCount} match${precedentCount === 1 ? "" : "es"})`} value={uplift} plus />
            )}
            {hipBonus > 0 && (
              <BreakdownRow color="#00FF88" label="Hippocampus ↔ Neo Cortex agreement" value={hipBonus} plus />
            )}
            <div className="flex items-center justify-between pt-2 border-t border-white/[0.06]">
              <span className="text-[9px] font-mono uppercase tracking-[0.2em] text-white">Final Confidence</span>
              <span className="text-[12px] font-mono font-bold tracking-tight" style={{ color, textShadow: `0 0 6px ${color}66` }}>= {s.toFixed(1)}%</span>
            </div>
          </div>

          {/* Pathway details */}
          {(hip > 0 || neo > 0) && (
            <div className="mt-3 grid grid-cols-3 gap-1 text-[8px] font-mono">
              <PathwayCell label="HIP" value={hip} color="#00FF88" weight={weighting?.hippocampus} />
              <PathwayCell label="NEO" value={neo} color="#00E5FF" weight={weighting?.neo_cortex} />
              <PathwayCell label="DIV" value={divergence} color={divergence > 25 ? "#FF2A2A" : "#6b7280"} unit="Δ" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export const CopyButton = ({ text, label = "COPY", accent = "#00E5FF", testId }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = async (e) => {
    e.stopPropagation();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success("Reasoning copied to clipboard");
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("Clipboard unavailable — select text manually");
    }
  };
  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex items-center gap-1 px-2 py-1 text-[9px] font-mono uppercase tracking-[0.2em] border transition-all focus:outline-none"
      style={{
        color: copied ? "#00FF88" : accent,
        borderColor: copied ? "rgba(0,255,136,0.4)" : `${accent}33`,
        backgroundColor: copied ? "rgba(0,255,136,0.08)" : `${accent}0d`,
      }}
      data-testid={testId}
      aria-label="Copy reasoning to clipboard"
    >
      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
      {copied ? "COPIED" : label}
    </button>
  );
};

export const CurtainSection = ({ icon: Icon, title, accent = "#00E5FF", defaultOpen = false, count, children, testId }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-white/[0.06] bg-black/30 hover:border-white/[0.12] transition-colors" data-testid={testId}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2.5 text-left group focus:outline-none"
        data-testid={testId ? `${testId}-toggle` : undefined}
        aria-expanded={open}
      >
        <div className="flex items-center gap-2 min-w-0">
          <div className="h-4 w-[2px] flex-none" style={{ backgroundColor: accent, boxShadow: `0 0 6px ${accent}cc` }} />
          {Icon && <Icon className="w-3.5 h-3.5 flex-none" style={{ color: accent }} />}
          <span className="text-[10px] font-heading font-bold uppercase tracking-[0.22em] text-gray-300 truncate">{title}</span>
          {typeof count === "number" && (
            <span
              className="text-[9px] font-mono px-1.5 py-0.5 border"
              style={{ color: accent, borderColor: `${accent}40`, backgroundColor: `${accent}0d` }}
            >
              {count}
            </span>
          )}
        </div>
        <ChevronDown
          className="w-3.5 h-3.5 text-gray-500 group-hover:text-white transition-all duration-300"
          style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
        />
      </button>
      <div
        className="overflow-hidden transition-all duration-300 ease-out"
        style={{ maxHeight: open ? 500 : 0, opacity: open ? 1 : 0 }}
      >
        <div className="px-3 pb-3 pt-1 border-t border-white/[0.05]">{children}</div>
      </div>
    </div>
  );
};

function BreakdownRow({ color, label, value, plus = false }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-1.5 min-w-0">
        <span className="w-1.5 h-1.5 flex-none" style={{ backgroundColor: color, boxShadow: `0 0 4px ${color}` }} />
        <span className="text-[9px] font-mono text-gray-400 truncate uppercase tracking-wider">{label}</span>
      </div>
      <span className="text-[10px] font-mono font-bold flex-none" style={{ color }}>
        {plus ? "+" : ""}{Number(value).toFixed(1)}%
      </span>
    </div>
  );
}

function PathwayCell({ label, value, color, weight, unit = "%" }) {
  return (
    <div className="border border-white/[0.06] px-2 py-1.5">
      <div className="flex items-baseline justify-between">
        <span className="text-gray-600 tracking-[0.2em]">{label}</span>
        {weight !== undefined && weight !== null && (
          <span className="text-gray-700 text-[7px]">w{(weight * 100).toFixed(0)}</span>
        )}
      </div>
      <div className="mt-1 text-[11px] font-bold" style={{ color }}>
        {Number(value).toFixed(1)}{unit}
      </div>
    </div>
  );
}
