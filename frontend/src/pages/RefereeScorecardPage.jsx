/**
 * RefereesIndexPage — list referees + drill-down link to per-referee scorecard.
 * RefereeScorecardPage — detailed per-referee analytics.
 */
import { useEffect, useState } from "react";
import axios from "axios";
import { Link, useParams } from "react-router-dom";
import {
  Users, ArrowLeft, Award, Activity, Clock, Scale, Download, ChevronRight,
} from "lucide-react";
import { API, BACKEND_URL } from "../lib/api";

// ───────────────────────────────────────────────────────────
// Index list
// ───────────────────────────────────────────────────────────
export function RefereesIndexPage() {
  const [refs, setRefs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await axios.get(`${API}/referees`);
        setRefs(data || []);
      } finally { setLoading(false); }
    })();
  }, []);

  return (
    <div className="min-h-screen bg-[#050505] text-white p-6" data-testid="referees-index-page">
      <header className="mb-6">
        <p className="text-[9px] font-mono tracking-[0.35em] text-[#00E5FF]/80 mb-1">OCTON · REFEREES</p>
        <h1 className="font-heading font-black text-3xl tracking-tight">REFEREE SCORECARDS</h1>
        <p className="text-xs text-gray-500 mt-1 font-mono tracking-[0.2em] uppercase">{refs.length} OFFICIALS TRACKED</p>
      </header>
      {loading ? (
        <p className="text-gray-500 font-mono text-xs tracking-[0.3em] mt-8">LOADING…</p>
      ) : refs.length === 0 ? (
        <div className="border border-white/10 p-12 text-center">
          <Users className="w-10 h-10 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">No referees registered yet.</p>
        </div>
      ) : (
        <div className="grid gap-3 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          {refs.map((r) => {
            const acc = r.total_decisions ? (r.correct_decisions / r.total_decisions * 100) : 0;
            return (
              <Link key={r.id} to={`/referees/${r.id}`}
                    className="group block border border-white/10 p-4 hover:border-[#00E5FF]/40 hover:bg-white/[0.02] transition"
                    data-testid={`referee-tile-${r.id}`}>
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 bg-[#00E5FF]/10 border border-[#00E5FF]/30 flex items-center justify-center">
                    <Users className="w-4 h-4 text-[#00E5FF]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-heading font-bold text-sm leading-tight truncate">{r.name}</p>
                    <p className="text-[9px] font-mono text-gray-500 uppercase tracking-[0.2em] mt-0.5">{r.role?.replace("_", " ")}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-600 group-hover:text-[#00E5FF] transition" />
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="border-l-2 border-[#00E5FF]/40 pl-2">
                    <p className="text-[8px] font-mono uppercase tracking-[0.2em] text-gray-500">DECISIONS</p>
                    <p className="font-mono text-base text-white">{r.total_decisions || 0}</p>
                  </div>
                  <div className="border-l-2 border-[#00FF88]/40 pl-2">
                    <p className="text-[8px] font-mono uppercase tracking-[0.2em] text-gray-500">ACCURACY</p>
                    <p className="font-mono text-base text-[#00FF88]">{Math.round(acc)}%</p>
                  </div>
                  <div className="border-l-2 border-[#FFB800]/40 pl-2">
                    <p className="text-[8px] font-mono uppercase tracking-[0.2em] text-gray-500">AVG TIME</p>
                    <p className="font-mono text-base text-[#FFB800]">{Math.round(r.average_decision_time_seconds || 0)}s</p>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// Detail / scorecard
// ───────────────────────────────────────────────────────────
export function RefereeScorecardPage() {
  const { refereeId } = useParams();
  const [card, setCard] = useState(null);
  const [csvTeam, setCsvTeam] = useState("");
  const [csvDownloading, setCsvDownloading] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await axios.get(`${API}/analytics/referee/${refereeId}/scorecard`);
      setCard(data);
    })();
  }, [refereeId]);

  const downloadTeamCSV = async () => {
    if (!csvTeam.trim()) return;
    setCsvDownloading(true);
    try {
      const url = `${API}/exports/team-incidents.csv?team=${encodeURIComponent(csvTeam.trim())}`;
      const res = await fetch(url, { credentials: "include" });
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = res.headers.get("Content-Disposition")?.split("filename=")[1]?.replace(/"/g, "") || `octon-${csvTeam}.csv`;
      a.click();
    } finally { setCsvDownloading(false); }
  };

  if (!card) {
    return <div className="min-h-screen bg-[#050505] text-gray-500 font-mono text-xs tracking-[0.3em] p-12">LOADING SCORECARD…</div>;
  }

  const { referee: r, summary: s, by_incident_type = [], recent_activity = [] } = card;

  return (
    <div className="min-h-screen bg-[#050505] text-white p-6 space-y-6" data-testid="referee-scorecard-page">
      <Link to="/referees" className="inline-flex items-center gap-2 text-gray-400 hover:text-white text-xs font-mono tracking-[0.25em] uppercase">
        <ArrowLeft className="w-3 h-3" />ALL REFEREES
      </Link>

      <header className="border-b border-white/10 pb-5">
        <p className="text-[9px] font-mono tracking-[0.35em] text-[#00E5FF]/80 mb-1">SCORECARD</p>
        <h1 className="font-heading font-black text-3xl tracking-tight">{r.name}</h1>
        <p className="text-xs font-mono text-gray-500 uppercase tracking-[0.2em] mt-1">{r.role?.replace("_", " ")} · {r.email || "—"}</p>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: "DECISIONS", value: s.total_decisions, icon: Activity, color: "#00E5FF" },
          { label: "AI AGREEMENT", value: `${s.ai_agreement_pct}%`, icon: Award, color: "#00FF88" },
          { label: "AVG AI CONF", value: `${s.avg_ai_confidence}%`, icon: Activity, color: "#B366FF" },
          { label: "AVG TIME", value: `${Math.round(s.avg_decision_time_seconds)}s`, icon: Clock, color: "#FFB800" },
          { label: "OVERTURNED", value: s.overturned, icon: Activity, color: "#FF3B30" },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="border border-white/10 p-3 relative" data-testid={`stat-${label.toLowerCase().replace(/ /g, '-')}`}>
            <div className="absolute top-0 left-0 w-full h-[1px]" style={{ backgroundColor: `${color}55` }} />
            <Icon className="w-3 h-3 mb-2" style={{ color }} />
            <p className="text-[8px] font-mono uppercase tracking-[0.25em] text-gray-500">{label}</p>
            <p className="font-mono text-xl mt-1" style={{ color }}>{value}</p>
          </div>
        ))}
      </section>

      <section>
        <h2 className="font-heading text-sm tracking-[0.2em] uppercase mb-3 text-[#00E5FF]/80">By Incident Type</h2>
        {by_incident_type.length === 0 ? (
          <p className="text-[11px] font-mono text-gray-500">No decisions yet.</p>
        ) : (
          <div className="space-y-2">
            {by_incident_type.map((b) => (
              <div key={b.incident_type} className="flex items-center gap-3 border border-white/10 p-3" data-testid={`type-row-${b.incident_type}`}>
                <span className="font-mono text-[10px] tracking-[0.2em] uppercase w-24">{b.incident_type.replace("_", " ")}</span>
                <div className="flex-1">
                  <div className="h-1.5 bg-white/5 relative overflow-hidden">
                    <div className="absolute inset-y-0 left-0 bg-[#00FF88]" style={{ width: `${b.agreement_pct}%` }} />
                  </div>
                  <p className="text-[9px] font-mono text-gray-500 mt-1">{b.confirmed} confirmed · {b.overturned} overturned</p>
                </div>
                <div className="text-right">
                  <p className="font-mono text-base text-[#00FF88]">{b.agreement_pct}%</p>
                  <p className="text-[8px] font-mono text-gray-600 uppercase tracking-[0.2em]">{b.total} total</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="font-heading text-sm tracking-[0.2em] uppercase mb-3 text-[#00E5FF]/80">Recent Activity</h2>
        {recent_activity.length === 0 ? (
          <p className="text-[11px] font-mono text-gray-500">No recent decisions.</p>
        ) : (
          <div className="space-y-1.5">
            {recent_activity.map((r) => (
              <div key={r.id} className="border border-white/10 p-3 flex items-start gap-3" data-testid={`activity-${r.id}`}>
                <span className={`mt-1 w-2 h-2 rounded-full flex-none ${r.decision_status === "confirmed" ? "bg-[#00FF88]" : "bg-[#FF3B30]"}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-[10px] tracking-[0.25em] uppercase text-gray-400">{r.incident_type?.replace("_", " ")}</span>
                    <span className="font-mono text-[9px] text-gray-600">·</span>
                    <span className="font-mono text-[9px] text-gray-600">{r.team_involved || ""}</span>
                  </div>
                  <p className="text-[11px] text-white/90 mt-1 leading-snug truncate">{r.final_decision || "—"}</p>
                  {r.cited_clause && (
                    <p className="flex items-center gap-1 text-[9px] font-mono text-[#FFB800]/70 mt-1 truncate">
                      <Scale className="w-2.5 h-2.5" />{r.cited_clause}
                    </p>
                  )}
                </div>
                <span className={`font-mono text-[10px] ${r.decision_status === "confirmed" ? "text-[#00FF88]" : "text-[#FF3B30]"}`}>
                  {r.ai_confidence ? `${Math.round(r.ai_confidence)}%` : "—"}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="border border-[#FFB800]/20 bg-[#FFB800]/[0.04] p-4">
        <h2 className="font-heading text-sm tracking-[0.2em] uppercase mb-2 text-[#FFB800]/90 flex items-center gap-2">
          <Download className="w-3.5 h-3.5" />Team-Level CSV Export
        </h2>
        <p className="text-[11px] text-gray-400 mb-3">Pull every VAR-reviewable incident for a club across all matches in this corpus.</p>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Team name (e.g. Liverpool)"
            value={csvTeam}
            onChange={(e) => setCsvTeam(e.target.value)}
            className="flex-1 bg-black border border-white/10 px-3 py-2 text-xs font-mono outline-none focus:border-[#FFB800]/40"
            data-testid="csv-team-input"
          />
          <button
            onClick={downloadTeamCSV}
            disabled={!csvTeam.trim() || csvDownloading}
            className="px-4 py-2 border border-[#FFB800]/40 bg-[#FFB800]/[0.08] text-[#FFB800] font-mono text-[10px] tracking-[0.2em] uppercase hover:bg-[#FFB800]/15 disabled:opacity-40"
            data-testid="csv-download-button"
          >
            {csvDownloading ? "DOWNLOADING…" : "DOWNLOAD"}
          </button>
        </div>
      </section>
    </div>
  );
}
