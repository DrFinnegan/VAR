/**
 * AuditChainDrawer — curtain that lists every audit-chain entry for the
 * currently-selected incident.
 *
 * Each entry surfaces: booth attribution (label + id), timestamp,
 * truncated SHA-256 hashes (prev → content → entry), and a copy button
 * for the full entry hash. Operators and auditors can see the full
 * forensic provenance of a verdict without leaving the control room.
 */
import { useEffect, useState } from "react";
import axios from "axios";
import { Shield, Copy, ChevronDown, ChevronRight } from "lucide-react";
import { API } from "../lib/api";
import { CurtainSection } from "./OctonAnalysisParts";

function short(hash = "", n = 10) {
  if (!hash) return "—";
  if (hash.length <= n * 2 + 3) return hash;
  return `${hash.slice(0, n)}…${hash.slice(-n)}`;
}

function copy(text) {
  try {
    navigator.clipboard.writeText(text || "");
  } catch { /* ignore */ }
}

export default function AuditChainDrawer({ incidentId }) {
  const [entries, setEntries] = useState(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    if (!incidentId) { setEntries(null); return; }
    setLoading(true);
    axios.get(`${API}/audit/chain/${incidentId}`)
      .then((r) => setEntries(r.data || []))
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  }, [incidentId]);

  const count = Array.isArray(entries) ? entries.length : 0;

  return (
    <CurtainSection
      icon={Shield}
      title="Audit Chain"
      accent="#FFD466"
      count={count}
      testId="audit-chain-curtain"
    >
      <div className="max-h-[340px] overflow-y-auto pr-2 octon-scrollbar space-y-2" data-testid="audit-chain-rows">
        {loading && <p className="text-[10px] font-mono text-gray-500">Fetching chain…</p>}
        {!loading && count === 0 && (
          <p className="text-[10px] font-mono text-gray-500">
            No audit entries yet. Export a PDF or click <span className="text-[#FFD466]">TRAIN</span> to seal this verdict into the chain.
          </p>
        )}
        {(entries || []).map((e, i) => {
          const isOpen = expanded === e.id;
          return (
            <div
              key={e.id}
              className="border border-[#FFD466]/20 bg-[#FFD466]/[0.04] hover:border-[#FFD466]/40 transition-colors"
              data-testid={`audit-entry-${i}`}
            >
              <button
                type="button"
                onClick={() => setExpanded(isOpen ? null : e.id)}
                className="w-full flex items-start gap-2 p-2 text-left"
              >
                {isOpen
                  ? <ChevronDown className="w-3 h-3 text-[#FFD466] mt-0.5 flex-none" />
                  : <ChevronRight className="w-3 h-3 text-[#FFD466] mt-0.5 flex-none" />}
                <div className="flex-1 min-w-0 space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-mono text-[#FFD466] font-bold">#{i + 1}</span>
                    {e.booth_label && (
                      <span className="text-[10px] text-[#00E5FF] font-semibold truncate">
                        {e.booth_label}
                      </span>
                    )}
                    {e.booth_id && (
                      <span className="text-[9px] font-mono text-gray-500 truncate">· {e.booth_id}</span>
                    )}
                  </div>
                  <p className="text-[9px] font-mono text-gray-600">
                    {e.created_at ? new Date(e.created_at).toLocaleString() : "—"}
                  </p>
                  <p className="text-[9px] font-mono text-gray-500">
                    hash · <span className="text-[#FFD466]/80">{short(e.entry_hash, 8)}</span>
                  </p>
                </div>
              </button>
              {isOpen && (
                <div className="border-t border-[#FFD466]/15 px-2 py-2 space-y-1.5 bg-black/40">
                  {[
                    ["prev_hash", e.prev_hash],
                    ["content_hash", e.content_hash],
                    ["entry_hash", e.entry_hash],
                  ].map(([k, v]) => (
                    <div key={k} className="flex items-center justify-between gap-2">
                      <span className="text-[9px] font-mono text-gray-500">{k}</span>
                      <div className="flex items-center gap-1 flex-1 justify-end min-w-0">
                        <span className="text-[9px] font-mono text-gray-300 truncate">{short(v, 12)}</span>
                        <button
                          type="button"
                          onClick={(ev) => { ev.stopPropagation(); copy(v); }}
                          className="text-gray-500 hover:text-[#FFD466] transition-colors flex-none"
                          title={`Copy full ${k}`}
                          data-testid={`audit-copy-${k}-${i}`}
                        >
                          <Copy className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                  {e.user_id && (
                    <p className="text-[9px] font-mono text-gray-600 pt-1 border-t border-white/5">
                      user · {e.user_id}
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </CurtainSection>
  );
}
