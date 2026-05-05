/**
 * VisionEscalationToaster — Admin-only global toast for live RED-card
 * upgrades fired by OCTON's post-LLM violent-conduct safety-net.
 *
 * Listens to the global WebSocket and pops a Sonner toast whenever the
 * backend broadcasts {type: "vision_escalation"}. Mounted once at App
 * level so it works regardless of which page the admin is on. Mirrors
 * the ChangedMindToaster contract.
 */
import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ShieldAlert, AlertTriangle } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useWebSocket } from "../hooks/useWebSocket";

export default function VisionEscalationToaster() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isPrivileged = ["admin", "var_official", "operator", "var_operator"].includes(user?.role);

  const handle = useCallback(
    (msg) => {
      if (!isPrivileged) return;
      if (msg?.type !== "vision_escalation") return;

      const trigger = msg.trigger_phrase || "violent conduct cue";
      const upgrade = msg.upgraded_decision || "Red Card";
      const conf = msg.upgraded_confidence;
      const team = msg.team_involved;
      const ts = msg.timestamp_in_match;

      // ── Audible cue for the booth ──
      // Two-tone WebAudio beep — distinctive enough to grab attention
      // in a noisy referee booth without being startling. Best-effort:
      // browsers that block audio without user gesture silently no-op.
      try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (Ctx) {
          const ctx = new Ctx();
          const gain = ctx.createGain();
          gain.gain.setValueAtTime(0.15, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.0);
          gain.connect(ctx.destination);
          const make = (freq, start) => {
            const o = ctx.createOscillator();
            o.type = "square";
            o.frequency.setValueAtTime(freq, ctx.currentTime + start);
            o.connect(gain);
            o.start(ctx.currentTime + start);
            o.stop(ctx.currentTime + start + 0.18);
          };
          make(880, 0);    // E5-ish
          make(1175, 0.22); // D6-ish, urgent rise
          setTimeout(() => { try { ctx.close(); } catch { /* */ } }, 1300);
        }
      } catch { /* audio blocked — visual toast still fires */ }

      toast.custom(
        (t) => (
          <div
            className="bg-[#0A0A0A] border border-[#FF3333]/60 px-4 py-3 min-w-[380px] max-w-[440px] shadow-[0_0_28px_rgba(255,51,51,0.22)]"
            data-testid="vision-escalation-toast"
          >
            <div className="flex items-start gap-3">
              <div className="relative flex-none w-10 h-10 border border-[#FF3333]/60 bg-[#FF3333]/[0.08] flex items-center justify-center">
                <ShieldAlert className="w-5 h-5 text-[#FF3333]" />
                <AlertTriangle className="absolute -top-1 -right-1 w-3 h-3 text-[#FFB800] animate-pulse" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-mono tracking-[0.2em] text-[#FF3333] font-bold uppercase">
                  Red Card Auto-Escalated
                </p>
                <p className="text-[12px] font-body text-white mt-0.5 leading-snug">
                  Vision safety-net upgraded to <span className="text-[#FF6B6B] font-bold">{upgrade}</span>.
                </p>
                <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                  <span
                    className="text-[9px] font-mono px-1.5 py-0.5 border border-[#FF3333]/40 text-[#FF6B6B] bg-[#FF3333]/10 truncate max-w-[200px]"
                    title={trigger}
                  >
                    TRIGGER: {trigger.toUpperCase()}
                  </span>
                  {typeof conf === "number" && (
                    <span className="text-[9px] font-mono px-1.5 py-0.5 border border-[#FFB800]/40 text-[#FFB800] bg-[#FFB800]/10">
                      {conf.toFixed(0)}% CONF
                    </span>
                  )}
                </div>
                {(team || ts) && (
                  <p className="text-[9px] font-mono text-gray-400 mt-1 truncate">
                    {team && <span>{team}</span>}
                    {team && ts && " · "}
                    {ts && <span>{ts}</span>}
                  </p>
                )}
                <p className="text-[9px] font-mono text-[#FFB800] mt-1.5">
                  ⚠ Operator must confirm or overturn — review now.
                </p>
              </div>
              <div className="flex flex-col gap-1 flex-none">
                <button
                  onClick={() => {
                    if (msg.incident_id) {
                      // Deep-link to LiveVAR with incident pre-selected.
                      navigate(`/?incident=${encodeURIComponent(msg.incident_id)}`);
                    }
                    toast.dismiss(t);
                  }}
                  className="text-[9px] font-mono tracking-[0.2em] px-2 py-1 border border-[#FF3333]/40 text-[#FF3333] hover:bg-[#FF3333]/10"
                  data-testid="vision-escalation-toast-review"
                >
                  REVIEW
                </button>
                <button
                  onClick={() => toast.dismiss(t)}
                  className="text-gray-500 hover:text-white text-[14px] leading-none"
                  aria-label="Dismiss"
                >
                  ×
                </button>
              </div>
            </div>
          </div>
        ),
        { duration: 14000, position: "top-right" }
      );
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [isPrivileged]
  );

  // All-match feed — only privileged users consume.
  useWebSocket(handle, null);
  return null;
}
