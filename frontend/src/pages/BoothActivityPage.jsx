/**
 * BoothActivityPage — admin-only.
 *
 * Renders one row per booth with: live-now indicator, decisions count,
 * agreement rate (operator-confirmed vs overturned), avg recent
 * confidence, and the matches the booth is currently scoped to.
 */
import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { Users, RefreshCw, Activity, ShieldAlert, ShieldCheck } from "lucide-react";
import { API } from "../lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
import { Button } from "../components/ui/button";

export default function BoothActivityPage() {
  const [data, setData] = useState({ booths: [], count: 0 });
  const [tamper, setTamper] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [a, t] = await Promise.all([
        axios.get(`${API}/admin/booth-activity`),
        axios.get(`${API}/admin/tamper-status`),
      ]);
      setData(a.data);
      setTamper(t.data);
    } catch (e) {
      setError(e?.response?.status === 403 ? "Admin role required" : (e.message || "Load failed"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, [load]);

  const valid = tamper?.valid !== false;
  const TamperIcon = valid ? ShieldCheck : ShieldAlert;
  const tamperColor = valid ? "#00FF88" : "#FF3333";

  return (
    <div className="flex-1 p-6 space-y-4 bg-[#050505] overflow-y-auto h-screen" data-testid="booth-activity-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Users className="w-5 h-5 text-[#00E5FF]" /> Booth Activity
          </h1>
          <p className="text-[11px] text-gray-500 font-mono mt-1">
            Per-booth performance · live presence · agreement rate · audit-chain integrity
          </p>
        </div>
        <Button onClick={load} disabled={loading} className="bg-transparent border border-white/20 text-white hover:bg-white/5 rounded-none h-9" data-testid="booth-activity-refresh">
          <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
          REFRESH
        </Button>
      </div>

      {/* Tamper banner */}
      <div
        className="border p-3 flex items-center gap-2"
        style={{ borderColor: `${tamperColor}66`, backgroundColor: `${tamperColor}10`, color: tamperColor }}
        data-testid="tamper-banner"
      >
        <TamperIcon className="w-4 h-4" />
        <span className="font-mono text-[11px] tracking-[0.2em] font-bold uppercase">
          {valid
            ? `Audit chain INTACT · ${tamper?.result?.total_entries ?? 0} entries · last checked ${tamper?.checked_at ? new Date(tamper.checked_at).toLocaleTimeString() : "—"}`
            : `TAMPER DETECTED · broken at #${tamper?.result?.broken_at} · ${tamper?.result?.reason}`}
        </span>
      </div>

      {error && <p className="text-[11px] text-[#FFB800] font-mono">{error}</p>}

      <Card className="bg-[#121212] border-white/10 rounded-none">
        <CardHeader>
          <CardTitle className="text-white text-base flex items-center gap-2">
            <Activity className="w-4 h-4 text-[#00E5FF]" />
            Booths · {data.count}
          </CardTitle>
          <CardDescription className="text-gray-400">Auto-refreshes every 15 s.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px] font-mono">
              <thead>
                <tr className="text-gray-500 border-b border-white/[0.06]">
                  <th className="text-left py-2 pr-4 font-mono">Booth</th>
                  <th className="text-left py-2 pr-4">Status</th>
                  <th className="text-right py-2 pr-4">Decisions</th>
                  <th className="text-right py-2 pr-4">Agreement</th>
                  <th className="text-right py-2 pr-4">Avg Conf</th>
                  <th className="text-left py-2 pr-4">Live Match(es)</th>
                </tr>
              </thead>
              <tbody>
                {data.booths.map((b) => (
                  <tr key={b.booth_id} className="border-b border-white/[0.04] hover:bg-white/[0.02]" data-testid={`booth-row-${b.booth_id}`}>
                    <td className="py-2 pr-4 text-white">
                      <div className="font-bold text-[#00E5FF]">{b.label || "—"}</div>
                      <div className="text-[9px] text-gray-500">{b.booth_id}</div>
                    </td>
                    <td className="py-2 pr-4">
                      {b.live_now ? (
                        <span className="text-[#00FF88] flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#00FF88] animate-pulse" /> LIVE
                        </span>
                      ) : (
                        <span className="text-gray-500">IDLE</span>
                      )}
                    </td>
                    <td className="py-2 pr-4 text-right text-white">{b.decisions_total}</td>
                    <td className="py-2 pr-4 text-right">
                      {b.agreement_rate != null ? (
                        <span style={{ color: b.agreement_rate >= 80 ? "#00FF88" : b.agreement_rate >= 60 ? "#FFB800" : "#FF3333" }}>
                          {b.agreement_rate}%
                        </span>
                      ) : <span className="text-gray-600">—</span>}
                      <div className="text-[9px] text-gray-500">{b.confirmed}✓ / {b.overturned}✗</div>
                    </td>
                    <td className="py-2 pr-4 text-right">
                      {b.avg_recent_confidence != null ? `${b.avg_recent_confidence}%` : <span className="text-gray-600">—</span>}
                    </td>
                    <td className="py-2 pr-4 text-gray-300">
                      {b.live_match_ids?.length ? b.live_match_ids.map((m) => m.slice(0, 8)).join(", ") : <span className="text-gray-600">—</span>}
                    </td>
                  </tr>
                ))}
                {data.booths.length === 0 && !loading && (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-gray-500">No booth activity recorded yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
