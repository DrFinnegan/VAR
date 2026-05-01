/**
 * Tiny status badges shared by the dashboard, history page, and analysis panel.
 */
import { Zap } from "lucide-react";
import { incidentTypeConfig, decisionStatusConfig } from "../lib/config";

export const IncidentBadge = ({ type }) => {
  const c = incidentTypeConfig[type] || incidentTypeConfig.other;
  return (
    <span
      className={`${c.color} border rounded-full px-2 py-0.5 text-xs font-mono uppercase`}
      data-testid="incident-classification-badge"
    >
      {c.label}
    </span>
  );
};

export const FastPathBadge = () => (
  <span
    className="inline-flex items-center gap-1 border rounded-full px-2 py-0.5 text-[10px] font-mono uppercase bg-[#FFB800]/15 text-[#FFB800] border-[#FFB800]/40"
    title="Generated via one-click quick-fire — Hippocampus + Neo Cortex fast path"
    data-testid="fast-path-badge"
  >
    <Zap className="w-3 h-3" />
    FAST-PATH
  </span>
);

export const DecisionBadge = ({ status }) => {
  const c = decisionStatusConfig[status] || decisionStatusConfig.pending;
  const Icon = c.icon;
  return (
    <span className={`${c.color} border rounded-none px-2 py-1 text-xs font-mono uppercase flex items-center gap-1`}>
      <Icon className="w-3 h-3" />
      {c.label}
    </span>
  );
};
