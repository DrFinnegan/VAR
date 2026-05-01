/**
 * LiveIngestPanel — Settings → Admin Tools.
 *
 * Lets operators register an RTMP push endpoint and surfaces:
 *   - the RTMP URL + stream key to paste into OBS
 *   - the HLS playback URL the LiveVAR stage can attach to
 *
 * Pairs with the GO LIVE button (browser screen-share). RTMP is for
 * permanent control-room rigs; GO LIVE is for ad-hoc demos.
 */
import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { Radio, Plus, Trash2, Copy, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { API } from "../lib/api";

function copy(t) { try { navigator.clipboard.writeText(t || ""); toast.success("Copied"); } catch { /* */ } }

export default function LiveIngestPanel() {
  const [streams, setStreams] = useState([]);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [help, setHelp] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [a, b] = await Promise.all([
        axios.get(`${API}/live/ingest`),
        axios.get(`${API}/live/ingest/setup-help`),
      ]);
      setStreams(a.data || []);
      setHelp(b.data);
    } catch { /* user not admin yet, ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!name.trim()) return;
    try {
      const { data } = await axios.post(`${API}/live/ingest`, { name: name.trim() });
      setStreams((s) => [data, ...s]);
      setName("");
      toast.success("Stream created", { description: data.rtmp_full_url });
    } catch (e) {
      toast.error("Couldn't create stream", { description: e?.response?.data?.detail || e.message });
    }
  };

  const remove = async (key) => {
    try {
      await axios.delete(`${API}/live/ingest/${key}`);
      setStreams((s) => s.filter((x) => x.id !== key));
      toast.success("Stream removed");
    } catch (e) {
      toast.error("Delete failed");
    }
  };

  return (
    <Card className="bg-[#121212] border-white/10 rounded-none" data-testid="live-ingest-panel">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <Radio className="w-4 h-4 text-[#FF3333]" />
          Live RTMP Ingest
        </CardTitle>
        <CardDescription className="text-gray-400">
          Push a broadcast from OBS into OCTON. Pairs with the GO LIVE
          screen-share for permanent control-room rigs.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Stream name (e.g. CHE vs ARS — Studio A)"
            className="bg-black border-white/10 text-white rounded-none"
            data-testid="live-ingest-name"
          />
          <Button onClick={create} className="bg-[#FF3333] text-black hover:bg-[#FF3333]/90 rounded-none" data-testid="live-ingest-create">
            <Plus className="w-3.5 h-3.5 mr-1" /> CREATE
          </Button>
          <Button variant="ghost" onClick={load} className="text-gray-400" data-testid="live-ingest-refresh">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>

        {streams.length === 0 && (
          <p className="text-[11px] text-gray-500 font-mono">
            No live ingests yet. Create one and paste the RTMP URL + key into OBS.
          </p>
        )}

        {streams.map((s) => (
          <div key={s.id} className="border border-white/10 p-3 bg-black/40 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-[11px] text-white font-bold">{s.name}</p>
                <p className="text-[9px] text-gray-500 font-mono">created {new Date(s.created_at).toLocaleString()}</p>
              </div>
              <div className="flex items-center gap-1">
                <span className={`text-[9px] font-mono px-1.5 py-0.5 border ${s.active ? "text-[#00FF88] border-[#00FF88]/40 bg-[#00FF88]/10" : "text-gray-500 border-white/10"}`}>
                  {s.active ? "ACTIVE" : "IDLE"}
                </span>
                <Button variant="ghost" size="sm" onClick={() => remove(s.id)} className="text-[#FF3333] h-7 w-7 p-0">
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
            <div className="text-[10px] font-mono space-y-1 pt-1 border-t border-white/5">
              <KV k="OBS Server" v={s.rtmp_url} />
              <KV k="Stream Key" v={s.stream_key} />
              <KV k="HLS URL" v={s.hls_url} />
            </div>
          </div>
        ))}

        {help && (
          <details className="text-[10px] font-mono text-gray-500 border border-white/5 p-2">
            <summary className="cursor-pointer text-gray-400">OBS quick-setup cheat-sheet</summary>
            <pre className="mt-2 whitespace-pre-wrap leading-relaxed">{JSON.stringify(help.obs_settings, null, 2)}</pre>
            {help.notes?.map((n, i) => <p key={i} className="mt-1">• {n}</p>)}
          </details>
        )}
      </CardContent>
    </Card>
  );
}

function KV({ k, v }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-gray-500">{k}</span>
      <div className="flex items-center gap-1 flex-1 justify-end min-w-0">
        <span className="text-[#00E5FF] truncate">{v}</span>
        <button onClick={() => copy(v)} className="text-gray-500 hover:text-[#00E5FF] flex-none" title="Copy">
          <Copy className="w-2.5 h-2.5" />
        </button>
      </div>
    </div>
  );
}
