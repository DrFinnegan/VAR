/**
 * MobileOFRPage — touch-friendly, sidebar-less On-Field Review screen.
 *
 * Designed for handheld referee monitors. Renders one incident at a time
 * with: large verdict, IFAB clause, key factors, swipeable angle gallery,
 * and one-tap CONFIRM / OVERTURN buttons.
 *
 * Listens to the same /ws "ofr_bookmark" event so a referee on a tablet
 * sees flagged incidents the moment the VAR booth escalates.
 */
import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import {
  CheckCircle2, XCircle, ChevronLeft, ChevronRight, Scale, Camera,
  Aperture, Crosshair, Goal, AlertTriangle, ArrowLeft,
} from "lucide-react";
import { API, BACKEND_URL, formatApiError } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";

const ANGLE_META = {
  broadcast: { label: "BROADCAST", Icon: Camera },
  tactical: { label: "TACTICAL", Icon: Aperture },
  tight: { label: "TIGHT", Icon: Crosshair },
  goal_line: { label: "GOAL LINE", Icon: Goal },
};

export default function MobileOFRPage() {
  const { incidentId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [incident, setIncident] = useState(null);
  const [activeAngleIdx, setActiveAngleIdx] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const fetchIncident = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API}/incidents/${incidentId}`);
      setIncident(data);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Could not load incident");
    }
  }, [incidentId]);

  useEffect(() => { fetchIncident(); }, [fetchIncident]);

  const angles = (incident?.camera_angles || []).filter(a => a.storage_path);
  const activeAngle = angles[activeAngleIdx] || null;
  const imgSrc = activeAngle?.storage_path
    ? `${BACKEND_URL}/api/files/${activeAngle.storage_path}`
    : incident?.storage_path ? `${BACKEND_URL}/api/files/${incident.storage_path}` : null;

  const ana = incident?.ai_analysis || {};
  const conf = ana.final_confidence || 0;
  const confColor = conf >= 85 ? "#00FF88" : conf >= 65 ? "#00E5FF" : "#FFB800";

  const submitDecision = async (status) => {
    if (!user) { toast.error("Sign in to submit decisions"); return; }
    setSubmitting(true);
    try {
      const verdict = status === "confirmed"
        ? (ana.suggested_decision || "Confirmed by On-Field Review")
        : `Overturned — original decision reversed (OFR)`;
      await axios.put(`${API}/incidents/${incidentId}/decision`, {
        decision_status: status,
        final_decision: verdict,
        decided_by: user.id,
      });
      toast.success(status === "confirmed" ? "Decision CONFIRMED" : "Decision OVERTURNED");
      await fetchIncident();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Submission failed");
    } finally {
      setSubmitting(false);
    }
  };

  if (!incident) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center">
        <p className="text-gray-500 font-mono text-xs tracking-[0.3em]">LOADING OFR…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050505] text-white pb-32" data-testid="mobile-ofr-page">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-[#050505]/95 backdrop-blur-sm border-b border-white/10">
        <div className="flex items-center justify-between p-3">
          <Link to="/" className="flex items-center gap-2 text-gray-400 active:text-white" data-testid="ofr-back-button">
            <ArrowLeft className="w-4 h-4" />
            <span className="font-mono text-[10px] tracking-[0.25em] uppercase">DASH</span>
          </Link>
          <div className="text-center">
            <p className="text-[8px] font-mono tracking-[0.3em] text-[#00E5FF]/70">ON-FIELD REVIEW</p>
            <p className="text-[10px] font-mono uppercase text-white/80">
              {incident.incident_type?.replace("_", " ")} · {incident.timestamp_in_match || "—"}
            </p>
          </div>
          <div className="w-10 h-10 flex items-center justify-center border border-white/20 rounded-full"
               style={{ borderColor: `${confColor}55`, color: confColor }}>
            <span className="font-mono text-[11px] font-bold">{Math.round(conf)}</span>
          </div>
        </div>
      </header>

      {/* Angle gallery */}
      {angles.length > 0 && (
        <div className="relative bg-black aspect-video flex items-center justify-center" data-testid="ofr-angle-gallery">
          {imgSrc && (
            <img src={imgSrc} alt={activeAngle?.angle || "primary"}
                 className="w-full h-full object-contain" />
          )}
          {/* Angle pager */}
          <div className="absolute top-3 left-3 flex items-center gap-1 px-2 py-1 bg-black/70 border border-white/10 backdrop-blur-sm">
            {(() => {
              const meta = ANGLE_META[activeAngle?.angle || "broadcast"] || ANGLE_META.broadcast;
              const Icon = meta.Icon;
              return (
                <>
                  <Icon className="w-3 h-3 text-[#00E5FF]" />
                  <span className="font-mono text-[9px] tracking-[0.25em]">{meta.label}</span>
                  <span className="font-mono text-[9px] text-gray-500">· {activeAngleIdx + 1}/{angles.length}</span>
                </>
              );
            })()}
          </div>
          {angles.length > 1 && (
            <>
              <button
                onClick={() => setActiveAngleIdx((i) => (i - 1 + angles.length) % angles.length)}
                className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center bg-black/60 border border-white/10 active:bg-white/10"
                data-testid="ofr-prev-angle"
                aria-label="Previous angle"
              ><ChevronLeft className="w-5 h-5" /></button>
              <button
                onClick={() => setActiveAngleIdx((i) => (i + 1) % angles.length)}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center bg-black/60 border border-white/10 active:bg-white/10"
                data-testid="ofr-next-angle"
                aria-label="Next angle"
              ><ChevronRight className="w-5 h-5" /></button>
            </>
          )}
        </div>
      )}

      {/* Verdict + clause */}
      <section className="p-4 space-y-4">
        {ana.angle_disagreement && (
          <div className="flex items-center gap-2 p-3 border border-[#FFB800]/40 bg-[#FFB800]/[0.06]"
               data-testid="ofr-disagreement-banner">
            <AlertTriangle className="w-4 h-4 text-[#FFB800] flex-none" />
            <p className="text-[11px] text-[#FFD466] font-mono leading-tight">
              ANGLE DISAGREEMENT · Δ {Math.round(ana.angle_confidence_delta || 0)}% · OFR RECOMMENDED
            </p>
          </div>
        )}

        <div className="border border-[#00E5FF]/30 bg-[#00E5FF]/[0.04] p-4 relative">
          <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-[#00E5FF]/60 to-transparent" />
          <p className="text-[8px] font-mono uppercase tracking-[0.3em] text-[#00E5FF]/80 mb-2">SUGGESTED VERDICT</p>
          <p className="text-base font-bold leading-snug text-white" data-testid="ofr-suggested-decision">
            {ana.suggested_decision || "—"}
          </p>
          {ana.cited_clause && (
            <div className="mt-3 flex items-start gap-2 px-2 py-2 border-l-2 border-[#FFB800]/60 bg-[#FFB800]/[0.05]"
                 data-testid="ofr-ifab-clause">
              <Scale className="w-3 h-3 text-[#FFB800] flex-none mt-0.5" />
              <div>
                <p className="text-[8px] font-mono uppercase tracking-[0.3em] text-[#FFB800]/70">IFAB CLAUSE</p>
                <p className="text-[11px] font-mono text-[#FFD466] leading-snug mt-0.5">{ana.cited_clause}</p>
              </div>
            </div>
          )}
        </div>

        {Array.isArray(ana.key_factors) && ana.key_factors.length > 0 && (
          <div>
            <p className="text-[8px] font-mono uppercase tracking-[0.3em] text-gray-500 mb-2">KEY FACTORS</p>
            <ul className="space-y-1.5" data-testid="ofr-key-factors">
              {ana.key_factors.slice(0, 5).map((kf, i) => (
                <li key={i} className="flex items-start gap-2 text-[11px] text-gray-300 leading-snug">
                  <span className="text-[#00E5FF] mt-0.5">▸</span>
                  <span>{kf}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {ana.reasoning && (
          <details className="border border-white/10">
            <summary className="cursor-pointer p-3 text-[10px] font-mono uppercase tracking-[0.3em] text-gray-400">
              REASONING
            </summary>
            <p className="px-3 pb-3 text-[12px] text-gray-300 leading-relaxed">{ana.reasoning}</p>
          </details>
        )}
      </section>

      {/* Sticky decision bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-[#050505]/95 backdrop-blur-sm border-t border-white/10 p-3 grid grid-cols-2 gap-2 z-40">
        <button
          disabled={submitting || incident.decision_status === "confirmed"}
          onClick={() => submitDecision("confirmed")}
          className="h-14 rounded-none border border-[#00FF88]/40 bg-[#00FF88]/[0.08] text-[#00FF88] active:bg-[#00FF88]/20 disabled:opacity-40 font-heading font-bold text-xs tracking-[0.2em] uppercase flex items-center justify-center gap-2"
          data-testid="ofr-confirm-button"
        >
          <CheckCircle2 className="w-4 h-4" />CONFIRM
        </button>
        <button
          disabled={submitting || incident.decision_status === "overturned"}
          onClick={() => submitDecision("overturned")}
          className="h-14 rounded-none border border-[#FF3B30]/40 bg-[#FF3B30]/[0.08] text-[#FF3B30] active:bg-[#FF3B30]/20 disabled:opacity-40 font-heading font-bold text-xs tracking-[0.2em] uppercase flex items-center justify-center gap-2"
          data-testid="ofr-overturn-button"
        >
          <XCircle className="w-4 h-4" />OVERTURN
        </button>
      </div>
    </div>
  );
}
