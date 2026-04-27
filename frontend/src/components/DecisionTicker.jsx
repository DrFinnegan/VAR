/**
 * Decision Ticker — marquee strip of the latest live verdicts.
 * Used at the top of LiveVARPage; clicking a row selects that incident.
 */
import { Radio, Clock, ArrowRight } from "lucide-react";
import { incidentTypeConfig } from "../lib/config";

export const DecisionTicker = ({ incidents, onSelect }) => {
  const items = (incidents || []).slice(0, 18);
  if (items.length === 0) return null;

  const tierColor = (s) => s >= 90 ? "#00FF88" : s >= 70 ? "#00E5FF" : s >= 50 ? "#FFB800" : "#FF2A2A";
  const statusColor = (status) =>
    status === "confirmed" ? "#00FF88" :
    status === "overturned" ? "#FF2A2A" :
    status === "no_decision" ? "#FFFFFF" : "#FFB800";

  const buildItem = (inc, idx, keyPrefix) => {
    const conf = Math.round(inc.ai_analysis?.final_confidence ?? inc.ai_analysis?.confidence_score ?? 0);
    const decision = inc.final_decision || inc.ai_analysis?.suggested_decision || "Awaiting neocortex analysis";
    const typeCfg = incidentTypeConfig[inc.incident_type] || incidentTypeConfig.other;
    const stColor = statusColor(inc.decision_status);
    return (
      <button
        key={`${keyPrefix}-${inc.id}-${idx}`}
        onClick={() => onSelect?.(inc)}
        className="flex items-center gap-3 px-4 h-full text-left focus:outline-none group"
        data-testid={keyPrefix === "a" ? `ticker-item-${idx}` : undefined}
      >
        <span className="w-2 h-2 flex-none rounded-full" style={{ backgroundColor: stColor, boxShadow: `0 0 6px ${stColor}` }} />
        <span className={`text-[9px] font-mono uppercase tracking-[0.2em] px-1.5 py-0.5 border ${typeCfg.color} flex-none`}>
          {typeCfg.label}
        </span>
        {inc.timestamp_in_match && (
          <span className="text-[9px] font-mono text-gray-500 flex-none">
            <Clock className="inline w-2.5 h-2.5 mr-0.5 -mt-0.5" />{inc.timestamp_in_match}
          </span>
        )}
        {inc.team_involved && (
          <span className="text-[9px] font-mono text-gray-500 uppercase tracking-wider flex-none">
            {inc.team_involved.substring(0, 18)}
          </span>
        )}
        <ArrowRight className="w-3 h-3 text-[#00E5FF]/50 flex-none" />
        <span className="text-[11px] font-body text-gray-200 group-hover:text-white transition-colors truncate max-w-[360px]">
          {decision}
        </span>
        <span
          className="text-[10px] font-mono font-bold tracking-tight flex-none px-1.5 py-0.5 border"
          style={{ color: tierColor(conf), borderColor: `${tierColor(conf)}55`, backgroundColor: `${tierColor(conf)}12` }}
        >
          {conf.toFixed(0)}%
        </span>
        <span className="text-gray-700 flex-none mx-1">•</span>
      </button>
    );
  };

  return (
    <div
      className="relative flex items-stretch h-9 border border-white/[0.08] bg-gradient-to-r from-[#050505] via-[#080808] to-[#050505] overflow-hidden"
      data-testid="decision-ticker"
    >
      <div className="flex items-center gap-2 px-3 bg-[#00E5FF]/10 border-r border-[#00E5FF]/20 flex-none z-10">
        <div className="relative flex items-center justify-center">
          <Radio className="w-3 h-3 text-[#00E5FF]" />
          <span className="absolute w-3 h-3 rounded-full bg-[#00E5FF]/40 animate-ping" />
        </div>
        <span className="text-[9px] font-heading font-bold tracking-[0.25em] text-[#00E5FF] uppercase">LIVE VERDICTS</span>
      </div>

      <div className="flex-1 relative overflow-hidden">
        <div className="absolute top-0 left-0 h-full w-8 bg-gradient-to-r from-[#050505] to-transparent z-10 pointer-events-none" />
        <div className="absolute top-0 right-0 h-full w-8 bg-gradient-to-l from-[#050505] to-transparent z-10 pointer-events-none" />
        <div className="ticker-track flex items-stretch whitespace-nowrap h-full w-max">
          <div className="flex items-stretch">
            {items.map((inc, i) => buildItem(inc, i, "a"))}
          </div>
          <div className="flex items-stretch" aria-hidden="true">
            {items.map((inc, i) => buildItem(inc, i, "b"))}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1.5 px-3 bg-white/[0.03] border-l border-white/[0.08] flex-none z-10">
        <span className="text-[9px] font-mono tracking-wider text-gray-500">TRACKING</span>
        <span className="text-[11px] font-mono font-bold text-[#00E5FF]" data-testid="ticker-count">{items.length}</span>
      </div>
    </div>
  );
};
