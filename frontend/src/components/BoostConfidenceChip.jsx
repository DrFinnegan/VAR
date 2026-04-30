/**
 * BoostConfidenceChip + BoostConfidenceModal
 *
 * Rendered next to the OCTON Analysis confidence ring whenever
 * `final_confidence < 80` AND the incident is still pending.
 *
 * Click the chip → modal pulls 2-4 IFAB-targeted follow-up questions →
 * operator answers → backend re-runs analysis with answers appended →
 * confidence typically jumps from 65 → 85 in one click.
 */
import { useEffect, useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Sparkles, X, ArrowRight, TrendingUp, Loader2 } from "lucide-react";
import { API, formatApiError } from "../lib/api";

export function BoostConfidenceChip({ incident, onBoosted }) {
  const [open, setOpen] = useState(false);
  const conf = incident?.ai_analysis?.final_confidence ?? 0;
  const isPending = incident?.decision_status === "pending";

  if (!incident || !isPending || conf >= 80 || conf <= 0) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 px-2 py-1 border border-[#B366FF]/40 bg-[#B366FF]/[0.08] text-[#B366FF] hover:bg-[#B366FF]/15 hover:border-[#B366FF]/70 transition-all text-[9px] font-mono tracking-[0.2em] uppercase font-bold animate-[pulse_3s_ease-in-out_infinite]"
        title="Answer 2-4 quick questions to push confidence above 80%"
        data-testid="boost-confidence-chip"
      >
        <Sparkles className="w-3 h-3" />
        BOOST
      </button>
      <BoostConfidenceModal
        incident={incident}
        open={open}
        onClose={() => setOpen(false)}
        onBoosted={(updated) => {
          setOpen(false);
          if (onBoosted) onBoosted(updated);
        }}
      />
    </>
  );
}

function BoostConfidenceModal({ incident, open, onClose, onBoosted }) {
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open || !incident?.id) return;
    setQuestions([]);
    setAnswers({});
    setLoading(true);
    (async () => {
      try {
        const { data } = await axios.post(`${API}/incidents/${incident.id}/boost-confidence`);
        setQuestions(data.questions || []);
      } catch (e) {
        toast.error(formatApiError(e.response?.data?.detail) || "Could not load follow-up questions");
        onClose();
      } finally { setLoading(false); }
    })();
  }, [open, incident?.id, onClose]);

  const submit = async () => {
    const filled = questions
      .map((q) => ({ question: q, answer: (answers[q] || "").trim() }))
      .filter((qa) => qa.answer);
    if (filled.length === 0) {
      toast.error("Answer at least one question to boost confidence");
      return;
    }
    setSubmitting(true);
    try {
      const { data } = await axios.post(
        `${API}/incidents/${incident.id}/boost-confidence/answer`,
        { answers: filled },
      );
      const lift = data.ai_analysis?.confidence_lift_from_boost || 0;
      const newConf = data.ai_analysis?.final_confidence || 0;
      const archived = !!data.ai_analysis?.training_case_archived_id;
      const liftMsg = lift > 0
        ? `Confidence boosted to ${newConf}% (+${lift.toFixed(1)})`
        : `Re-analysed — confidence now ${newConf}%`;
      toast.success(
        archived ? `${liftMsg} · archived to Training Library` : liftMsg,
      );
      if (onBoosted) onBoosted(data);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Boost failed");
    } finally { setSubmitting(false); }
  };

  if (!open) return null;

  const conf = incident?.ai_analysis?.final_confidence ?? 0;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
         data-testid="boost-modal" onClick={onClose}>
      <div
        className="bg-[#050505] border border-[#B366FF]/30 max-w-xl w-full p-5 my-8"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#B366FF]" />
            <h3 className="font-heading text-sm tracking-[0.2em] uppercase text-white">Boost Confidence</h3>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white" data-testid="boost-modal-close" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </header>

        <div className="border border-white/10 bg-black/40 p-3 mb-4">
          <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-[0.25em]">
            <span className="text-gray-500">CURRENT CONFIDENCE</span>
            <span className="text-[#FFB800]">{conf.toFixed(1)}%</span>
          </div>
          <div className="h-1.5 bg-white/5 mt-2 overflow-hidden">
            <div className="h-full bg-[#FFB800]" style={{ width: `${conf}%` }} />
          </div>
          <p className="text-[10px] font-mono text-gray-500 mt-2 leading-snug">
            Answer 2-4 quick IFAB-targeted questions and OCTON re-runs the
            forensic analysis with your clarifications. Most boosts push
            confidence above 80%.
          </p>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 p-6 justify-center text-gray-500 font-mono text-[11px]">
            <Loader2 className="w-4 h-4 animate-spin" />Loading questions…
          </div>
        ) : questions.length === 0 ? (
          <p className="text-[11px] font-mono text-gray-500 text-center py-6">
            No follow-up questions available for this incident type.
          </p>
        ) : (
          <div className="space-y-3 mb-4" data-testid="boost-questions-list">
            {questions.map((q, i) => (
              <div key={i} className="border border-white/10 p-3" data-testid={`boost-q-${i}`}>
                <p className="text-[11px] text-white/90 mb-2 leading-snug font-medium">
                  <span className="text-[#B366FF] font-mono mr-2">Q{i + 1}.</span>{q}
                </p>
                <textarea
                  value={answers[q] || ""}
                  onChange={(e) => setAnswers({ ...answers, [q]: e.target.value })}
                  placeholder="Type the operator's answer (skip if not relevant)…"
                  rows={2}
                  className="w-full bg-black border border-white/10 px-2 py-1.5 text-[12px] font-mono text-gray-200 outline-none focus:border-[#B366FF]/50 resize-none"
                  data-testid={`boost-a-${i}`}
                />
              </div>
            ))}
          </div>
        )}

        <button
          onClick={submit}
          disabled={loading || submitting || questions.length === 0}
          className="w-full h-12 border border-[#B366FF]/50 bg-[#B366FF]/10 text-[#B366FF] hover:bg-[#B366FF]/20 disabled:opacity-40 font-heading font-bold text-xs tracking-[0.2em] uppercase flex items-center justify-center gap-2 transition"
          data-testid="boost-submit"
        >
          {submitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />RE-ANALYSING…
            </>
          ) : (
            <>
              <TrendingUp className="w-4 h-4" />
              BOOST CONFIDENCE
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </div>
    </div>
  );
}
