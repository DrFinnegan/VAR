/**
 * Analytics Page
 * Match-officials KPIs, OCTON learning metrics, 30-day learning velocity
 * (precedents added / web ingest / auto-rescore / cumulative confidence
 * lift), and a per-referee performance table.
 */
import { useEffect, useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, PieChart, Pie, Cell,
} from "recharts";
import { API } from "../lib/api";

const LegendChip = ({ color, label, dashed }) => (
  <div className="flex items-center gap-2">
    <div
      className="w-6"
      style={{
        height: 2,
        backgroundColor: dashed ? "transparent" : color,
        borderTop: dashed ? `2px dashed ${color}` : "none",
      }}
    />
    <span className="text-gray-400">{label}</span>
  </div>
);

export const AnalyticsPage = () => {
  const [referees, setReferees] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [patterns, setPatterns] = useState(null);
  const [velocity, setVelocity] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch_ = async () => {
      try {
        const [r, a, p, v] = await Promise.all([
          axios.get(`${API}/referees`),
          axios.get(`${API}/analytics/overview`),
          axios.get(`${API}/analytics/patterns`),
          axios.get(`${API}/analytics/learning-velocity?days=30`),
        ]);
        setReferees(r.data); setAnalytics(a.data); setPatterns(p.data); setVelocity(v.data);
      } catch { toast.error("Failed to load analytics"); }
      finally { setLoading(false); }
    };
    fetch_();
  }, []);

  const COLORS = ['#00E5FF', '#00FF66', '#FFB800', '#FF3333', '#A855F7', '#F97316'];
  const typeData = analytics?.incidents_by_type ? Object.entries(analytics.incidents_by_type).map(([name, value]) => ({ name, value })) : [];
  const refData = referees.map(r => ({ name: r.name.split(' ').pop(), accuracy: r.total_decisions > 0 ? ((r.correct_decisions / r.total_decisions) * 100).toFixed(1) : 0, decisions: r.total_decisions }));

  if (loading) return <div className="flex-1 flex items-center justify-center bg-[#050505]"><div className="text-sm font-mono text-[#00E5FF] animate-pulse">LOADING ANALYTICS...</div></div>;

  return (
    <div className="flex-1 min-w-0 p-6 space-y-6 bg-[#050505]" data-testid="analytics-page">
      <div><h1 className="text-3xl font-heading font-black text-white tracking-tight">REFEREE ANALYTICS</h1><p className="text-sm font-body text-gray-400 mt-1">Performance metrics and OCTON learning patterns</p></div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { l: "TOTAL REFEREES", v: analytics?.total_referees || 0 },
          { l: "TOTAL MATCHES", v: analytics?.total_matches || 0 },
          { l: "ACCURACY RATE", v: `${analytics?.decision_accuracy_rate?.toFixed(1) || 0}%`, c: "#00FF66" },
          { l: "AVG DECISION TIME", v: `${analytics?.average_decision_time_seconds?.toFixed(1) || 0}s`, c: "#00E5FF" },
        ].map(({ l, v, c }) => (
          <Card key={l} className="bg-[#121212] border-white/10 rounded-none"><CardContent className="p-4"><p className="text-xs font-mono uppercase tracking-[0.2em] text-gray-400">{l}</p><p className="text-3xl font-mono font-medium mt-1" style={{ color: c || '#fff' }}>{v}</p></CardContent></Card>
        ))}
      </div>

      {/* Learning Metrics */}
      {patterns?.learning_metrics && (
        <Card className="bg-[#121212] border-white/10 rounded-none">
          <CardHeader><CardTitle className="text-sm font-mono uppercase text-gray-400">OCTON LEARNING METRICS</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-4 gap-4">
              <div className="text-center"><p className="text-2xl font-mono text-white">{patterns.learning_metrics.total_decided}</p><p className="text-xs font-mono text-gray-400">TOTAL DECIDED</p></div>
              <div className="text-center"><p className="text-2xl font-mono text-[#00FF66]">{patterns.learning_metrics.confirmed}</p><p className="text-xs font-mono text-gray-400">CONFIRMED</p></div>
              <div className="text-center"><p className="text-2xl font-mono text-[#FF3333]">{patterns.learning_metrics.overturned}</p><p className="text-xs font-mono text-gray-400">OVERTURNED</p></div>
              <div className="text-center"><p className="text-2xl font-mono text-[#00E5FF]">{patterns.learning_metrics.learning_accuracy}%</p><p className="text-xs font-mono text-gray-400">LEARNING ACC</p></div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Learning Velocity (30-day self-improvement) ── */}
      {velocity?.series && (
        <Card className="bg-[#0A0A0A] border-[#B366FF]/20 rounded-none relative overflow-hidden" data-testid="learning-velocity-card">
          <div className="absolute top-0 left-0 w-24 h-[2px] bg-[#B366FF]" style={{ boxShadow: "0 0 8px #B366FF" }} />
          <div className="absolute top-2 right-2 w-2 h-2 border-r border-t border-[#B366FF]/40" />
          <div className="absolute bottom-2 left-2 w-2 h-2 border-l border-b border-[#B366FF]/40" />
          <CardHeader>
            <div className="flex items-baseline justify-between gap-4">
              <CardTitle className="text-sm font-mono uppercase text-gray-400">
                <span className="text-[#B366FF]">LEARNING</span> VELOCITY · 30-DAY
              </CardTitle>
              <span className="text-[9px] font-mono uppercase tracking-[0.2em] text-gray-600">
                // self-improvement over time
              </span>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-4 gap-[1px] bg-white/[0.04] mb-5">
              <div className="bg-[#0A0A0A] p-3">
                <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-gray-500">PRECEDENTS ADDED</p>
                <p className="text-2xl font-mono font-bold text-white mt-1">{velocity.totals.precedents_total}</p>
                <p className="text-[8px] font-mono text-gray-600 mt-1">// all sources</p>
              </div>
              <div className="bg-[#0A0A0A] p-3">
                <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-gray-500">FROM WEB</p>
                <p className="text-2xl font-mono font-bold text-[#B366FF] mt-1" style={{ textShadow: "0 0 12px #B366FF44" }}>{velocity.totals.web_precedents_total}</p>
                <p className="text-[8px] font-mono text-gray-600 mt-1">// ingested</p>
              </div>
              <div className="bg-[#0A0A0A] p-3">
                <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-gray-500">AUTO-RESCORES</p>
                <p className="text-2xl font-mono font-bold text-[#00E5FF] mt-1" style={{ textShadow: "0 0 12px #00E5FF44" }}>{velocity.totals.auto_rescores_total}</p>
                <p className="text-[8px] font-mono text-gray-600 mt-1">// closed-loop fires</p>
              </div>
              <div className="bg-[#0A0A0A] p-3">
                <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-gray-500">CUMULATIVE LIFT</p>
                <p className="text-2xl font-mono font-bold text-[#00FF66] mt-1" style={{ textShadow: "0 0 12px #00FF6644" }}>+{velocity.totals.cumulative_lift_pct?.toFixed?.(1) ?? velocity.totals.cumulative_lift_pct}<span className="text-sm text-[#00FF66]/70">%</span></p>
                <p className="text-[8px] font-mono text-gray-600 mt-1">// Σ confidence gained</p>
              </div>
            </div>

            <div className="h-[280px]" data-testid="learning-velocity-chart">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={velocity.series} margin={{ top: 10, right: 18, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,0.06)" />
                  <XAxis
                    dataKey="date"
                    stroke="#555"
                    fontSize={10}
                    tickFormatter={(d) => d?.slice(5)}
                    tick={{ fontFamily: "monospace" }}
                  />
                  <YAxis yAxisId="left" stroke="#555" fontSize={10} tick={{ fontFamily: "monospace" }} />
                  <YAxis yAxisId="right" orientation="right" stroke="#00FF66" fontSize={10} tick={{ fontFamily: "monospace" }} tickFormatter={(v) => `+${v}%`} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#0B0B0B",
                      border: "1px solid rgba(179,102,255,0.4)",
                      borderRadius: 0,
                      fontFamily: "monospace",
                      fontSize: 11,
                    }}
                    labelStyle={{ color: "#B366FF" }}
                    formatter={(v, n) => [
                      n === "cumulative_lift_pct" ? `+${Number(v).toFixed(1)}%` : v,
                      n === "precedents" ? "Precedents"
                      : n === "web_precedents" ? "Web"
                      : n === "auto_rescores" ? "Auto-rescores"
                      : n === "cumulative_lift_pct" ? "Σ Confidence Lift"
                      : n,
                    ]}
                  />
                  <Line yAxisId="left" type="monotone" dataKey="precedents" stroke="#FFFFFF" strokeWidth={1.5} dot={false} activeDot={{ r: 3 }} name="Precedents" />
                  <Line yAxisId="left" type="monotone" dataKey="web_precedents" stroke="#B366FF" strokeWidth={2} dot={false} activeDot={{ r: 3 }} name="Web" />
                  <Line yAxisId="left" type="monotone" dataKey="auto_rescores" stroke="#00E5FF" strokeWidth={2} dot={false} activeDot={{ r: 3 }} name="Auto-rescores" />
                  <Line yAxisId="right" type="monotone" dataKey="cumulative_lift_pct" stroke="#00FF66" strokeWidth={2.5} strokeDasharray="5 3" dot={false} activeDot={{ r: 4 }} name="Σ Confidence Lift" />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="flex flex-wrap items-center gap-4 mt-3 pt-3 border-t border-white/[0.06] text-[10px] font-mono">
              <LegendChip color="#FFFFFF" label="Precedents added" dashed={false} />
              <LegendChip color="#B366FF" label="From web" dashed={false} />
              <LegendChip color="#00E5FF" label="Auto-rescores" dashed={false} />
              <LegendChip color="#00FF66" label="Σ Confidence Lift (right axis)" dashed={true} />
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="bg-[#121212] border-white/10 rounded-none">
          <CardHeader><CardTitle className="text-sm font-mono uppercase text-gray-400">INCIDENT DISTRIBUTION</CardTitle></CardHeader>
          <CardContent><div className="h-[300px] min-h-[300px]">
            <ResponsiveContainer width="100%" height={300}>
              <PieChart><Pie data={typeData} cx="50%" cy="50%" outerRadius={100} dataKey="value" label={({ name, percent }) => `${name} ${(percent*100).toFixed(0)}%`}>
                {typeData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie><Tooltip contentStyle={{ backgroundColor: '#121212', border: '1px solid rgba(255,255,255,0.1)' }} labelStyle={{ color: '#fff' }} /></PieChart>
            </ResponsiveContainer>
          </div></CardContent>
        </Card>
        <Card className="bg-[#121212] border-white/10 rounded-none">
          <CardHeader><CardTitle className="text-sm font-mono uppercase text-gray-400">REFEREE ACCURACY</CardTitle></CardHeader>
          <CardContent><div className="h-[300px] min-h-[300px]">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={refData}><CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" /><XAxis dataKey="name" stroke="#666" fontSize={12} /><YAxis stroke="#666" fontSize={12} /><Tooltip contentStyle={{ backgroundColor: '#121212', border: '1px solid rgba(255,255,255,0.1)' }} labelStyle={{ color: '#fff' }} /><Bar dataKey="accuracy" fill="#00E5FF" radius={[2,2,0,0]} /></BarChart>
            </ResponsiveContainer>
          </div></CardContent>
        </Card>
      </div>

      <Card className="bg-[#121212] border-white/10 rounded-none">
        <CardHeader><CardTitle className="text-sm font-mono uppercase text-gray-400">REFEREE PERFORMANCE</CardTitle></CardHeader>
        <CardContent><div className="overflow-x-auto"><table className="w-full"><thead><tr className="border-b border-white/10">
          {["Name", "Role", "Decisions", "Correct", "Accuracy", "Avg Time"].map(h => <th key={h} className="text-left py-3 px-4 text-xs font-mono uppercase text-gray-400">{h}</th>)}
        </tr></thead><tbody>
          {referees.map(r => { const acc = r.total_decisions > 0 ? ((r.correct_decisions / r.total_decisions) * 100).toFixed(1) : 0; return (
            <tr key={r.id} className="border-b border-white/5 hover:bg-white/5">
              <td className="py-3 px-4"><div className="flex items-center gap-3"><div className="w-8 h-8 rounded-full bg-[#00E5FF]/20 flex items-center justify-center"><Users className="w-4 h-4 text-[#00E5FF]" /></div><span className="text-sm text-white">{r.name}</span></div></td>
              <td className="py-3 px-4 text-xs font-mono uppercase text-gray-400">{r.role?.replace('_', ' ')}</td>
              <td className="py-3 px-4 text-center text-sm font-mono text-white">{r.total_decisions}</td>
              <td className="py-3 px-4 text-center text-sm font-mono text-[#00FF66]">{r.correct_decisions}</td>
              <td className="py-3 px-4 text-center text-sm font-mono" style={{ color: parseFloat(acc)>=90 ? '#00FF66' : parseFloat(acc)>=70 ? '#FFB800' : '#FF3333' }}>{acc}%</td>
              <td className="py-3 px-4 text-center text-sm font-mono text-[#00E5FF]">{r.average_decision_time_seconds?.toFixed(1)}s</td>
            </tr>
          ); })}
        </tbody></table></div></CardContent>
      </Card>
    </div>
  );
};

export default AnalyticsPage;
