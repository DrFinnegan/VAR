/**
 * ChangedMindToaster — Admin-only global toast for the weekly self-audit
 * "OCTON changed its mind after self learning and self reflection" event.
 *
 * Listens to the global WebSocket and pops a rich Sonner toast whenever
 * the backend broadcasts {type: "self_audit_changed_mind"}. Mounted once
 * at App level so it works regardless of which page the admin is on.
 *
 * Architect: Dr Finnegan — visible proof of continuous self-learning.
 */
import { useCallback } from "react";
import { toast } from "sonner";
import { Brain, Sparkles } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useWebSocket } from "../hooks/useWebSocket";

export default function ChangedMindToaster() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const handle = useCallback((msg) => {
    if (!isAdmin) return;
    if (msg?.type !== "self_audit_changed_mind") return;
    const caption = msg.caption || "OCTON changed its mind after self learning and self reflection";
    const drift = msg.drift_count || 0;
    const top = (msg.highlights || [])[0];
    toast.custom(
      (t) => (
        <div
          className="bg-[#0A0A0A] border border-[#00FF88]/40 px-4 py-3 min-w-[360px] max-w-[420px] shadow-[0_0_24px_rgba(0,255,136,0.18)]"
          data-testid="changed-mind-toast"
        >
          <div className="flex items-start gap-3">
            <div className="relative flex-none w-10 h-10 border border-[#00FF88]/40 bg-[#00FF88]/[0.06] flex items-center justify-center">
              <Brain className="w-5 h-5 text-[#00FF88]" />
              <Sparkles className="absolute -top-1 -right-1 w-3 h-3 text-[#FFB800] animate-pulse" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-mono tracking-[0.2em] text-[#00FF88] font-bold uppercase">
                Self-Reflection Complete
              </p>
              <p className="text-[12px] font-body text-white mt-0.5 leading-snug">
                {caption}
              </p>
              <div className="mt-1.5 flex items-center gap-2">
                <span className="text-[9px] font-mono px-1.5 py-0.5 border border-[#00FF88]/30 text-[#00FF88] bg-[#00FF88]/10">
                  {drift} INCIDENT{drift === 1 ? "" : "S"} SHIFTED
                </span>
                {top && (
                  <span className="text-[9px] font-mono text-gray-400 truncate">
                    {top.incident_type?.toUpperCase()} · {top.old_confidence}% → {top.new_confidence_estimate}%
                    {top.confidence_delta != null && (
                      <span className={top.confidence_delta >= 0 ? "text-[#00FF88]" : "text-[#FF3333]"}>
                        {" "}(Δ{top.confidence_delta >= 0 ? "+" : ""}{top.confidence_delta})
                      </span>
                    )}
                  </span>
                )}
              </div>
              {top?.decision_token_changed && (
                <p className="text-[9px] font-mono text-[#FFB800] mt-1">
                  ⚠ Verdict-token may now differ — review recommended
                </p>
              )}
            </div>
            <button
              onClick={() => toast.dismiss(t)}
              className="text-gray-500 hover:text-white text-[14px] leading-none flex-none"
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
        </div>
      ),
      { duration: 12000, position: "top-right" }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  // Subscribe to all-match feed (no match_id filter); only admins consume.
  // Hook is always called to honour the rules-of-hooks; the handler short-
  // circuits non-admins.
  useWebSocket(handle, null);

  return null;
}
