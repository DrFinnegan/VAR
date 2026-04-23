/**
 * Confidence Ring + curtain + copy-to-clipboard micro-components
 * Used by the OCTON Analysis right panel.
 */
import { useState } from "react";
import { ChevronDown, Copy, Check, Sparkles } from "lucide-react";
import { toast } from "sonner";

export const ConfidenceScore = ({ score, size = "default", uplift = 0, precedentCount = 0 }) => {
  const s = Number(score) || 0;
  const getColor = (x) => (x >= 90 ? "#00FF88" : x >= 70 ? "#00E5FF" : x >= 50 ? "#FFB800" : "#FF2A2A");
  const getTier = (x) => (x >= 90 ? "HIGH" : x >= 70 ? "STRONG" : x >= 50 ? "MODERATE" : "LOW");
  const color = getColor(s);

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

  return (
    <div className="flex flex-col items-center" data-testid="ai-confidence-score">
      <span className="text-[10px] font-mono uppercase tracking-[0.3em] text-gray-500 mb-2">FINAL CONFIDENCE</span>
      <div className="relative" style={{ width: dim, height: dim }}>
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
        </div>
      </div>
      {uplift > 0 && (
        <div className="mt-2 flex items-center gap-1.5 px-2 py-1 border border-[#B366FF]/30 bg-[#B366FF]/[0.08]" data-testid="uplift-badge">
          <Sparkles className="w-3 h-3 text-[#B366FF]" />
          <span className="text-[9px] font-mono text-[#B366FF] tracking-wider">
            +{uplift.toFixed(1)}% <span className="text-[#B366FF]/70">from {precedentCount} precedent{precedentCount === 1 ? "" : "s"}</span>
          </span>
        </div>
      )}
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
