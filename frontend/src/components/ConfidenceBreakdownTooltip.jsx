/**
 * ConfidenceBreakdownTooltip — hover over the OCTON Analysis confidence ring
 * to reveal every transparent bonus that contributed to the final score.
 *
 * Reads `ai_analysis.{neo_cortex.confidence_score, confidence_uplift,
 * hippocampus_bonus, strong_agreement_bonus, vision_evidence_bonus,
 * reasoning_quality_bonus}` straight off the analysis payload.
 */
import { useState } from "react";
import { HelpCircle } from "lucide-react";

export default function ConfidenceBreakdownTooltip({ analysis }) {
  const [open, setOpen] = useState(false);
  if (!analysis) return null;

  const base = Math.round(analysis.neo_cortex?.confidence_score ?? analysis.base_confidence ?? 0);
  const final = Math.round(analysis.final_confidence ?? 0);
  const rows = [
    { label: "Neo Cortex base", value: base, tone: "cyan", bold: true },
    { label: "Precedent uplift", value: analysis.confidence_uplift || 0, tone: "cyan" },
    { label: "Hippocampus agreement", value: analysis.hippocampus_bonus || 0, tone: "green" },
    { label: "Strong dual-pathway", value: analysis.strong_agreement_bonus || 0, tone: "green" },
    { label: "Vision evidence", value: analysis.vision_evidence_bonus || 0, tone: "violet" },
    { label: "Reasoning quality (IFAB)", value: analysis.reasoning_quality_bonus || 0, tone: "amber" },
  ];

  const colorMap = {
    cyan: "#00E5FF", green: "#00FF88", violet: "#B366FF", amber: "#FFB800",
  };

  return (
    <div className="relative inline-flex" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="ml-1.5 text-gray-500 hover:text-[#00E5FF] transition"
        data-testid="confidence-breakdown-trigger"
        aria-label="Show confidence breakdown"
      >
        <HelpCircle className="w-3 h-3" />
      </button>
      {open && (
        <div
          className="absolute top-6 right-0 z-30 w-72 border border-[#00E5FF]/30 bg-[#050505] shadow-xl p-3"
          data-testid="confidence-breakdown-popover"
        >
          <div className="flex items-center justify-between mb-2 pb-2 border-b border-white/10">
            <p className="text-[9px] font-mono tracking-[0.25em] uppercase text-[#00E5FF]">Confidence Breakdown</p>
            <p className="text-[9px] font-mono text-gray-500">→ {final}%</p>
          </div>
          <div className="space-y-1">
            {rows.map((r) => {
              if (r.value === 0 && !r.bold) return null;
              const color = colorMap[r.tone] || "#00E5FF";
              return (
                <div key={r.label} className="flex items-center justify-between text-[10px] font-mono">
                  <span className={r.bold ? "text-white" : "text-gray-400"}>{r.label}</span>
                  <span style={{ color }} className={r.bold ? "font-bold" : ""}>
                    {r.bold ? `${r.value}%` : (r.value > 0 ? `+${r.value.toFixed(1)}` : `${r.value.toFixed(1)}`)}
                  </span>
                </div>
              );
            })}
          </div>
          {Array.isArray(analysis.confidence_caps_applied) && analysis.confidence_caps_applied.length > 0 && (
            <div
              className="mt-2 pt-2 border-t border-[#FF3333]/30 space-y-1"
              data-testid="confidence-caps-applied"
            >
              <p className="text-[9px] font-mono tracking-[0.2em] uppercase text-[#FF3333]">📉 Caps Applied</p>
              {analysis.confidence_caps_applied.map((cap, i) => (
                <p key={i} className="text-[9px] font-mono text-gray-300 leading-snug">
                  <span className="text-[#FF3333]">{cap.from?.toFixed?.(1) || cap.from}% → {cap.cap?.toFixed?.(1) || cap.cap}%</span>
                  <span className="text-gray-500"> · {cap.reason}</span>
                </p>
              ))}
            </div>
          )}
          <p className="mt-2 pt-2 border-t border-white/10 text-[9px] text-gray-500 leading-snug">
            Every bonus and cap is transparent and logged — referees and
            media can independently reconstruct how OCTON arrived at the
            final score.
          </p>
        </div>
      )}
    </div>
  );
}
