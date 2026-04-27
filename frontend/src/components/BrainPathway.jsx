/**
 * Brain Pathway Visualization
 * Collapsible neural pathway panel that wraps the OCTON Connectome plus
 * the compact hipp/neo confidence stat strip and footer telemetry.
 */
import { useState } from "react";
import { Brain, Zap, AlertTriangle, ChevronDown } from "lucide-react";
import { Connectome } from "./Connectome";

export const BrainPathway = ({ analysis }) => {
  const [open, setOpen] = useState(false);
  if (!analysis) return null;
  const hippo = analysis.hippocampus;
  const neo = analysis.neo_cortex;
  if (!hippo || !neo) return null;

  return (
    <div className="relative border border-white/[0.08] bg-black/60 backdrop-blur-xl overflow-hidden corner-brackets" data-testid="brain-pathway-viz">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-[#00E5FF]/[0.04] transition-colors group"
        data-testid="brain-pathway-toggle"
        aria-expanded={open}
      >
        <div className="flex items-center gap-2">
          <Brain className="w-3.5 h-3.5 text-[#00E5FF] glow-cyan" />
          <span className="text-[10px] font-heading font-bold uppercase tracking-[0.22em] text-[#00E5FF]">OCTON NEURAL PATHWAY</span>
          <span className="text-[8px] font-mono text-gray-600 tracking-[0.2em] uppercase">
            ·  hipp {hippo.initial_confidence}%  →  neo {neo.confidence_score}%
          </span>
          {analysis.divergence_flag && (
            <span className="text-[9px] font-mono text-[#FF2A2A] animate-pulse flex items-center gap-1 ml-1">
              <AlertTriangle className="w-2.5 h-2.5" />Δ{analysis.pathway_divergence}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[8px] font-mono uppercase tracking-[0.2em] text-gray-500 group-hover:text-[#00E5FF] transition-colors">
            {open ? "collapse" : "expand connectome"}
          </span>
          <ChevronDown className={`w-3.5 h-3.5 text-[#00E5FF] transition-transform ${open ? "rotate-180" : ""}`} />
        </div>
      </button>

      {open && (
        <div
          className="relative border-t border-white/[0.06]"
          style={{ backgroundImage: 'url(https://images.unsplash.com/photo-1737505599159-5ffc1dcbc08f?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA2MjJ8MHwxfHNlYXJjaHwxfHxuZXVyYWwlMjBuZXR3b3JrJTIwYWJzdHJhY3QlMjBkYXRhfGVufDB8fHx8MTc3Njg2Nzk2NHww&ixlib=rb-4.1.0&q=85)', backgroundSize: 'cover', backgroundPosition: 'center' }}
        >
          <div className="absolute inset-0 bg-black/88" />

          <div className="relative z-10 p-4 octon-fade-in">
            <div className="flex items-center justify-end mb-2">
              <span className="text-[9px] font-mono text-gray-600">{analysis.engine_version}</span>
            </div>

            <Connectome analysis={analysis} />

            <div className="grid grid-cols-2 gap-2 mt-3">
              <div className="px-3 py-2 border border-[#00FF88]/20 bg-[#00FF88]/[0.04]">
                <div className="flex items-center gap-2 mb-1">
                  <Zap className="w-3 h-3 text-[#00FF88]" />
                  <span className="text-[9px] font-heading font-bold uppercase tracking-[0.18em] text-[#00FF88]">FAST PATH · HIPP</span>
                  <span className="ml-auto text-[8px] font-mono text-gray-500">{hippo.processing_time_ms}ms</span>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-mono font-bold text-[#00FF88] glow-text-green">{hippo.initial_confidence}</span>
                  <span className="text-xs font-mono text-[#00FF88]/60">%</span>
                  <span className="ml-auto text-[9px] font-mono text-gray-600">w {(analysis.weighting?.hippocampus * 100).toFixed(0)}%</span>
                </div>
                <p className="text-[10px] text-gray-400 mt-0.5 leading-tight truncate">{hippo.initial_decision}</p>
              </div>

              <div className="px-3 py-2 border border-[#00E5FF]/20 bg-[#00E5FF]/[0.04]">
                <div className="flex items-center gap-2 mb-1">
                  <Brain className="w-3 h-3 text-[#00E5FF]" />
                  <span className="text-[9px] font-heading font-bold uppercase tracking-[0.18em] text-[#00E5FF]">DEEP PATH · NEO</span>
                  <span className="ml-auto text-[8px] font-mono text-gray-500">{neo.processing_time_ms}ms</span>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-mono font-bold text-[#00E5FF] glow-text-cyan">{neo.confidence_score}</span>
                  <span className="text-xs font-mono text-[#00E5FF]/60">%</span>
                  <span className="ml-auto text-[9px] font-mono text-gray-600">w {(analysis.weighting?.neo_cortex * 100).toFixed(0)}%</span>
                </div>
                <p className="text-[10px] text-gray-400 mt-0.5 leading-tight truncate">{neo.suggested_decision}</p>
              </div>
            </div>

            <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/[0.06]">
              <div className="flex items-center gap-4 text-[10px] font-mono text-gray-500">
                <span>TOTAL: <span className="text-white">{analysis.total_processing_time_ms}ms</span></span>
                <span>PRECEDENTS: <span className="text-white">{analysis.similar_historical_cases}</span></span>
                <span>ACCURACY: <span className="text-[#00FF88]">{analysis.historical_accuracy?.toFixed(0)}%</span></span>
              </div>
              <div className="text-[10px] font-mono">
                <span className="text-gray-500">FINAL: </span>
                <span className="text-white font-bold glow-text-cyan">{analysis.final_confidence}%</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
