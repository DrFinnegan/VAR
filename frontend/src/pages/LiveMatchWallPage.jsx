/**
 * LiveMatchWallPage — multi-match dashboard for tournament weekends.
 *
 * One tile per active match: latest verdict, confidence ring, OFR-pending
 * pulse, status counts. Click a tile to deep-link into LiveVAR for that match.
 */
import { useEffect, useState, useCallback } from "react";
import axios from "axios";
import { Link } from "react-router-dom";
import {
  Trophy, Activity, AlertTriangle, ChevronRight, Radio, MapPin, Calendar, Scale,
} from "lucide-react";
import { API } from "../lib/api";
import { useWebSocket } from "../hooks/useWebSocket";

function ConfidenceRing({ value = 0, size = 44 }) {
  const v = Math.max(0, Math.min(100, value));
  const r = (size - 6) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (v / 100) * c;
  const color = v >= 85 ? "#00FF88" : v >= 65 ? "#00E5FF" : "#FFB800";
  return (
    <svg width={size} height={size} className="flex-none">
      <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.08)" strokeWidth="3" fill="none" />
      <circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth="3" fill="none"
              strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round"
              transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text x="50%" y="52%" textAnchor="middle" dominantBaseline="middle"
            fill={color} fontFamily="JetBrains Mono, monospace" fontSize="11" fontWeight="700">
        {Math.round(v)}
      </text>
    </svg>
  );
}

export default function LiveMatchWallPage() {
  const [data, setData] = useState({ matches: [], live_count: 0, scheduled_count: 0, completed_count: 0 });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API}/matches/live`);
      setData(data);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  // Real-time refresh — any new incident / decision / OFR → refetch
  useWebSocket(useCallback((msg) => {
    if (!msg || !msg.type) return;
    if (["incident_created", "decision_made", "ofr_bookmark", "analysis_complete"].includes(msg.type)) {
      load();
    }
  }, [load]));

  return (
    <div className="min-h-screen bg-[#050505] text-white p-6" data-testid="live-match-wall-page">
      <header className="mb-6 flex items-end justify-between">
        <div>
          <p className="text-[9px] font-mono tracking-[0.35em] text-[#00E5FF]/80 mb-1">OCTON · MATCH WALL</p>
          <h1 className="font-heading font-black text-3xl tracking-tight">LIVE MATCHES</h1>
          <p className="text-xs text-gray-500 mt-1 font-mono tracking-[0.2em] uppercase">
            <span className="text-[#FF3B30]">{data.live_count} LIVE</span>
            {" · "}
            <span className="text-[#FFB800]">{data.scheduled_count || 0} UPCOMING</span>
            {" · "}
            <span className="text-gray-400">{data.completed_count || 0} COMPLETED</span>
          </p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 border border-[#00E5FF]/30 bg-[#00E5FF]/[0.04]">
          <Radio className="w-3 h-3 text-[#00E5FF] animate-pulse" />
          <span className="font-mono text-[10px] tracking-[0.25em] text-[#00E5FF]">AUTO-REFRESH 15s</span>
        </div>
      </header>

      {loading ? (
        <p className="text-gray-500 font-mono text-xs tracking-[0.3em] mt-12 text-center">LOADING…</p>
      ) : data.matches.length === 0 ? (
        <div className="border border-white/10 p-12 text-center" data-testid="empty-match-wall">
          <Trophy className="w-10 h-10 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">No matches recorded yet.</p>
          <p className="text-[10px] font-mono text-gray-600 mt-1">POST /api/matches to add one</p>
        </div>
      ) : (
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
          {data.matches.map((m, idx) => {
            const mt = m.match;
            const isLive = mt.status === "live";
            const last = m.last_incident;
            const confColor = m.avg_confidence_recent >= 85 ? "#00FF88" : m.avg_confidence_recent >= 65 ? "#00E5FF" : m.avg_confidence_recent > 0 ? "#FFB800" : "#666";
            return (
              <Link
                key={mt.id || idx}
                to={mt.id ? `/?match=${encodeURIComponent(mt.id)}` : "/"}
                className={`group relative block border p-4 transition-all duration-300 hover:border-[#00E5FF]/40 hover:bg-white/[0.02] ${
                  m.ofr_pending ? "border-[#FFB800]/40 bg-[#FFB800]/[0.04]" : "border-white/10 bg-black"
                }`}
                data-testid={`match-tile-${mt.id || idx}`}
              >
                {isLive && (
                  <span className="absolute top-3 right-3 flex items-center gap-1 px-2 py-0.5 bg-[#FF3B30]/20 border border-[#FF3B30]/40">
                    <span className="w-1.5 h-1.5 bg-[#FF3B30] rounded-full animate-pulse" />
                    <span className="font-mono text-[8px] tracking-[0.25em] text-[#FF3B30]">LIVE</span>
                  </span>
                )}
                {mt.status === "scheduled" && (
                  <span className="absolute top-3 right-3 flex items-center gap-1 px-2 py-0.5 bg-[#FFB800]/10 border border-[#FFB800]/30">
                    <span className="font-mono text-[8px] tracking-[0.25em] text-[#FFB800]">UPCOMING</span>
                  </span>
                )}
                {mt.status === "completed" && (
                  <span className="absolute top-3 right-3 flex items-center gap-1 px-2 py-0.5 bg-white/[0.04] border border-white/10">
                    <span className="font-mono text-[8px] tracking-[0.25em] text-gray-400">FULL TIME</span>
                  </span>
                )}
                {m.ofr_pending && (
                  <span className="absolute top-3 left-3 flex items-center gap-1 px-2 py-0.5 bg-[#FFB800]/20 border border-[#FFB800]/40 animate-pulse">
                    <AlertTriangle className="w-3 h-3 text-[#FFB800]" />
                    <span className="font-mono text-[8px] tracking-[0.25em] text-[#FFB800]">OFR</span>
                  </span>
                )}
                <div className="mt-6 mb-3">
                  <p className="font-heading font-bold text-base leading-tight">{mt.team_home}</p>
                  <p className="text-[10px] font-mono text-gray-500 my-0.5">vs</p>
                  <p className="font-heading font-bold text-base leading-tight">{mt.team_away}</p>
                </div>
                <div className="flex items-center gap-3 text-[10px] font-mono text-gray-500 mb-3">
                  <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{mt.date}</span>
                  {mt.stadium && <span className="flex items-center gap-1 truncate"><MapPin className="w-3 h-3" />{mt.stadium}</span>}
                </div>
                <div className="flex items-center justify-between border-t border-white/5 pt-3">
                  <div className="flex items-center gap-3">
                    <ConfidenceRing value={m.avg_confidence_recent} />
                    <div>
                      <p className="text-[9px] font-mono uppercase tracking-[0.25em] text-gray-500">AVG CONF · LAST 5</p>
                      <p className="text-[10px] font-mono mt-0.5" style={{ color: confColor }}>
                        {m.incidents_total} incident{m.incidents_total === 1 ? "" : "s"}
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-600 group-hover:text-[#00E5FF] transition" />
                </div>
                {last ? (
                  <div className="mt-3 pt-3 border-t border-white/5 space-y-1">
                    <div className="flex items-center gap-2">
                      <Activity className="w-3 h-3 text-[#00E5FF]" />
                      <span className="text-[9px] font-mono uppercase tracking-[0.25em] text-[#00E5FF]/80">LATEST</span>
                      <span className="text-[9px] font-mono text-gray-600">{last.timestamp_in_match || ""}</span>
                    </div>
                    <p className="text-[11px] text-white/80 leading-tight line-clamp-2">
                      {last.suggested_decision || last.final_decision || "—"}
                    </p>
                    {last.cited_clause && (
                      <p className="flex items-center gap-1 text-[9px] font-mono text-[#FFB800]/70 truncate">
                        <Scale className="w-2.5 h-2.5 flex-none" />{last.cited_clause}
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="mt-3 pt-3 border-t border-white/5 text-[10px] font-mono text-gray-600">No incidents yet.</p>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
