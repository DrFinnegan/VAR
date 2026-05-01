/**
 * AuditChainPill — Settings widget showing the SHA-256 audit chain's
 * tamper-detection state. Calls `GET /api/audit/verify` and renders:
 *   - green pill   "CHAIN INTACT · N entries"
 *   - red pill     "TAMPER DETECTED · broken at #K · reason"
 *   - amber pill   "VERIFIER ERROR" if the request itself fails
 * Includes a re-verify button + last-checked timestamp + the latest
 * entry hash truncated.
 */
import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { Shield, ShieldAlert, ShieldCheck, RefreshCw, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { API } from "../lib/api";

function shortHash(h) {
  if (!h || typeof h !== "string") return "—";
  return h.length > 22 ? `${h.slice(0, 10)}…${h.slice(-10)}` : h;
}

export default function AuditChainPill() {
  const [state, setState] = useState({ status: "idle", data: null, error: null });
  const [lastChecked, setLastChecked] = useState(null);

  const verify = useCallback(async () => {
    setState((s) => ({ ...s, status: "loading", error: null }));
    try {
      const { data } = await axios.get(`${API}/audit/verify`);
      setState({ status: "ok", data, error: null });
      setLastChecked(new Date());
    } catch (e) {
      setState({ status: "error", data: null, error: e?.response?.data?.detail || e.message });
      setLastChecked(new Date());
    }
  }, []);

  useEffect(() => { verify(); }, [verify]);

  const valid = state.data?.valid === true;
  const tampered = state.data && state.data.valid === false;
  const errored = state.status === "error";
  const loading = state.status === "loading" || state.status === "idle";

  const pillColor = errored ? "#FFB800" : tampered ? "#FF3B30" : "#00FF88";
  const pillIcon = errored ? ShieldAlert : tampered ? ShieldAlert : ShieldCheck;
  const PillIcon = pillIcon;

  return (
    <Card className="bg-[#121212] border-white/10 rounded-none" data-testid="audit-chain-pill-card">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <Shield className="w-4 h-4 text-[#00E5FF]" />
          Audit Chain Integrity
        </CardTitle>
        <CardDescription className="text-gray-400">
          SHA-256 tamper-evident hash chain. Walks every audit entry and
          re-derives each hash; any prior edit breaks the chain.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between">
          <div
            className="inline-flex items-center gap-2 px-3 py-1.5 border"
            style={{
              borderColor: `${pillColor}66`,
              backgroundColor: `${pillColor}14`,
              color: pillColor,
            }}
            data-testid="audit-chain-pill"
          >
            {loading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <PillIcon className="w-3.5 h-3.5" />
            )}
            <span className="font-mono text-[10px] tracking-[0.25em] font-bold uppercase">
              {loading && "VERIFYING…"}
              {!loading && valid && `CHAIN INTACT · ${state.data?.total_entries ?? 0} ENTR${(state.data?.total_entries ?? 0) === 1 ? "Y" : "IES"}`}
              {!loading && tampered && `TAMPER DETECTED · BROKEN AT #${state.data.broken_at} · ${state.data.reason}`}
              {!loading && errored && `VERIFIER ERROR · ${state.error || "unknown"}`}
            </span>
          </div>

          <Button
            size="sm"
            variant="ghost"
            onClick={verify}
            disabled={loading}
            className="text-gray-400 hover:text-white h-8 text-[10px] font-mono tracking-wider"
            data-testid="audit-chain-verify-button"
          >
            <RefreshCw className={`w-3 h-3 mr-1.5 ${loading ? "animate-spin" : ""}`} />
            RE-VERIFY
          </Button>
        </div>

        {!loading && state.data && (
          <div className="grid grid-cols-2 gap-2 text-[10px] font-mono pt-2 border-t border-white/5">
            <div>
              <span className="text-gray-500 block">LATEST HASH</span>
              <span className="text-[#00E5FF]" title={state.data.latest_hash || "—"}>
                {shortHash(state.data.latest_hash)}
              </span>
            </div>
            <div className="text-right">
              <span className="text-gray-500 block">LAST CHECKED</span>
              <span className="text-gray-300">
                {lastChecked ? lastChecked.toLocaleTimeString() : "—"}
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
