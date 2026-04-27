/**
 * Shared config maps for incident types, decision statuses, risk tiers.
 * Imported wherever badges / colour pickers / select boxes are rendered.
 */
import { Clock, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";

export const incidentTypeConfig = {
  offside:   { label: "OFFSIDE",   color: "bg-[#FFB800]/20 text-[#FFB800] border-[#FFB800]/30" },
  handball:  { label: "HANDBALL",  color: "bg-[#FF3333]/20 text-[#FF3333] border-[#FF3333]/30" },
  foul:      { label: "FOUL",      color: "bg-[#00E5FF]/20 text-[#00E5FF] border-[#00E5FF]/30" },
  penalty:   { label: "PENALTY",   color: "bg-[#FF3333]/20 text-[#FF3333] border-[#FF3333]/30" },
  goal_line: { label: "GOAL LINE", color: "bg-[#00FF66]/20 text-[#00FF66] border-[#00FF66]/30" },
  red_card:  { label: "RED CARD",  color: "bg-[#FF3333]/20 text-[#FF3333] border-[#FF3333]/30" },
  other:     { label: "OTHER",     color: "bg-white/20 text-white border-white/30" },
};

export const decisionStatusConfig = {
  pending:     { label: "PENDING",     color: "bg-[#FFB800]/20 text-[#FFB800] border-[#FFB800]/30", icon: Clock },
  confirmed:   { label: "CONFIRMED",   color: "bg-[#00FF66]/20 text-[#00FF66] border-[#00FF66]/30", icon: CheckCircle2 },
  overturned:  { label: "OVERTURNED",  color: "bg-[#FF3333]/20 text-[#FF3333] border-[#FF3333]/30", icon: XCircle },
  no_decision: { label: "NO DECISION", color: "bg-white/20 text-white border-white/30",             icon: AlertTriangle },
};

export const riskColors = { low: "#00FF66", medium: "#FFB800", high: "#FF3333", critical: "#FF3333" };
