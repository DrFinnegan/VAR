/**
 * Tiny status badges shared by the dashboard, history page, and analysis panel.
 */
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
