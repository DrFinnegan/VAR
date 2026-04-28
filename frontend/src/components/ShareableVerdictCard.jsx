/**
 * ShareableVerdictCard — modal dialog with two share modes:
 *   1. Copy a referee-ready summary to clipboard (1-tap)
 *   2. Generate a 1080×1080 social-media PNG snapshot
 *
 * Mounted from the OCTON Analysis panel via a SHARE button.
 */
import { useEffect, useRef, useState } from "react";
import { Copy, Download, X, Share2, CheckCircle2, Scale } from "lucide-react";
import { toast } from "sonner";

function buildSummary(incident) {
  const ana = incident?.ai_analysis || {};
  const conf = Math.round(ana.final_confidence || 0);
  const lines = [
    `OCTON VAR Verdict — ${(incident?.incident_type || "incident").replace("_", " ").toUpperCase()}`,
    incident?.timestamp_in_match ? `${incident.timestamp_in_match} · ${incident.team_involved || "—"}${incident.player_involved ? ` · ${incident.player_involved}` : ""}` : "",
    "",
    `Verdict: ${ana.suggested_decision || "—"}`,
    `Confidence: ${conf}%`,
    ana.cited_clause ? `IFAB clause: ${ana.cited_clause}` : "",
    ana.precedent_consensus ? `Precedent consensus: 3+ ground-truth precedents agree` : "",
    "",
    ana.reasoning ? `Reasoning: ${String(ana.reasoning).slice(0, 280)}` : "",
    "",
    "Powered by OCTON VAR · Hippocampus → Neo Cortex dual-brain forensic AI",
  ].filter(Boolean);
  return lines.join("\n");
}

export default function ShareableVerdictCard({ incident, open, onClose }) {
  const canvasRef = useRef(null);
  const [copied, setCopied] = useState(false);

  // Render the 1080×1080 verdict canvas whenever the dialog opens
  useEffect(() => {
    if (!open || !incident) return;
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    const W = 1080, H = 1080;
    c.width = W; c.height = H;

    const ana = incident.ai_analysis || {};
    const conf = Math.round(ana.final_confidence || 0);
    const confColor = conf >= 85 ? "#00FF88" : conf >= 65 ? "#00E5FF" : "#FFB800";

    // Background gradient
    const grad = ctx.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, "#020611");
    grad.addColorStop(1, "#040a18");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // Top accent bar
    ctx.fillStyle = "#00E5FF";
    ctx.fillRect(0, 0, W, 6);

    // OCTON header
    ctx.fillStyle = "#00E5FF";
    ctx.font = "700 22px 'JetBrains Mono', monospace";
    ctx.fillText("OCTON · VAR FORENSIC VERDICT", 60, 90);

    // Incident type pill
    const typeText = (incident.incident_type || "incident").replace("_", " ").toUpperCase();
    ctx.font = "700 18px 'JetBrains Mono', monospace";
    const tw = ctx.measureText(typeText).width + 36;
    ctx.fillStyle = "rgba(0,229,255,0.15)";
    ctx.fillRect(60, 120, tw, 36);
    ctx.strokeStyle = "rgba(0,229,255,0.5)";
    ctx.lineWidth = 1;
    ctx.strokeRect(60, 120, tw, 36);
    ctx.fillStyle = "#00E5FF";
    ctx.fillText(typeText, 78, 145);

    // Match context
    ctx.fillStyle = "#9CA3AF";
    ctx.font = "400 22px 'JetBrains Mono', monospace";
    const ctxLine = [
      incident.timestamp_in_match,
      incident.team_involved,
      incident.player_involved,
    ].filter(Boolean).join("  ·  ");
    if (ctxLine) ctx.fillText(ctxLine, 60, 195);

    // Confidence ring
    const cx = W - 200, cy = 280, r = 100;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.lineWidth = 14;
    ctx.strokeStyle = "rgba(255,255,255,0.08)"; ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + (conf / 100) * Math.PI * 2);
    ctx.strokeStyle = confColor; ctx.lineCap = "round"; ctx.stroke();
    ctx.fillStyle = confColor;
    ctx.font = "900 56px Manrope, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`${conf}`, cx, cy + 10);
    ctx.font = "400 16px 'JetBrains Mono', monospace";
    ctx.fillText("CONFIDENCE", cx, cy + 50);
    ctx.textAlign = "left";

    // Verdict block
    ctx.fillStyle = "#00E5FF";
    ctx.font = "400 16px 'JetBrains Mono', monospace";
    ctx.fillText("SUGGESTED DECISION", 60, 360);

    // Wrap verdict text
    const verdict = ana.suggested_decision || "—";
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "800 44px Manrope, sans-serif";
    const maxW = W - 360;
    const words = verdict.split(" ");
    let line = ""; let y = 415;
    for (const w of words) {
      const test = line + w + " ";
      if (ctx.measureText(test).width > maxW && line) {
        ctx.fillText(line.trim(), 60, y);
        line = w + " "; y += 56;
        if (y > 600) { ctx.fillText(line + "…", 60, y); line = ""; break; }
      } else { line = test; }
    }
    if (line) ctx.fillText(line.trim(), 60, y);

    // IFAB clause callout
    if (ana.cited_clause) {
      const boxY = 700;
      ctx.fillStyle = "rgba(255,184,0,0.07)";
      ctx.fillRect(60, boxY, W - 120, 110);
      ctx.fillStyle = "#FFB800";
      ctx.fillRect(60, boxY, 4, 110);
      ctx.fillStyle = "rgba(255,184,0,0.7)";
      ctx.font = "400 16px 'JetBrains Mono', monospace";
      ctx.fillText("IFAB CLAUSE CITED", 84, boxY + 30);
      ctx.fillStyle = "#FFD466";
      ctx.font = "400 22px 'JetBrains Mono', monospace";
      const clause = String(ana.cited_clause).slice(0, 110);
      ctx.fillText(clause, 84, boxY + 65);
    }

    // Footer
    ctx.fillStyle = "#6B7280";
    ctx.font = "400 18px 'JetBrains Mono', monospace";
    ctx.fillText("Hippocampus → Neo Cortex · Dual-Brain Forensic AI", 60, H - 60);
    ctx.fillStyle = "#00E5FF";
    ctx.fillText("octonvar.app", W - 240, H - 60);
  }, [open, incident]);

  if (!open || !incident) return null;

  const summary = buildSummary(incident);
  const ana = incident.ai_analysis || {};

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(summary);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success("Verdict summary copied");
    } catch {
      toast.error("Could not copy — please copy manually");
    }
  };

  const handleDownloadPng = () => {
    const c = canvasRef.current;
    if (!c) return;
    c.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `octon-verdict-${incident.id?.slice(0, 8) || "card"}.png`;
      a.click();
      toast.success("Verdict card PNG downloaded");
    }, "image/png");
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
         data-testid="share-verdict-modal" onClick={onClose}>
      <div className="bg-[#050505] border border-[#00E5FF]/30 max-w-2xl w-full p-5 my-8" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Share2 className="w-4 h-4 text-[#00E5FF]" />
            <h3 className="font-heading text-sm tracking-[0.2em] uppercase text-white">Share Verdict</h3>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white" data-testid="share-modal-close">
            <X className="w-4 h-4" />
          </button>
        </header>

        {/* Live preview — scaled-down */}
        <div className="border border-white/10 bg-black mb-4 overflow-hidden" style={{ aspectRatio: "1 / 1", maxHeight: 360 }}>
          <canvas ref={canvasRef} className="w-full h-full block" data-testid="share-canvas" />
        </div>

        {/* Plain-text preview */}
        <div className="border border-white/10 bg-black/40 p-3 mb-4 max-h-44 overflow-y-auto" data-testid="share-text-preview">
          <pre className="text-[11px] font-mono text-gray-300 leading-relaxed whitespace-pre-wrap">{summary}</pre>
        </div>

        {ana.cited_clause && (
          <div className="flex items-start gap-2 px-2 py-1.5 border-l-2 border-[#FFB800]/60 bg-[#FFB800]/[0.04] mb-4">
            <Scale className="w-3 h-3 text-[#FFB800] flex-none mt-0.5" />
            <p className="text-[10px] font-mono text-[#FFD466] leading-snug">{ana.cited_clause}</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={handleCopy}
            className="h-12 border border-[#00E5FF]/40 bg-[#00E5FF]/[0.06] text-[#00E5FF] hover:bg-[#00E5FF]/15 font-heading font-bold text-xs tracking-[0.2em] uppercase flex items-center justify-center gap-2 transition"
            data-testid="share-copy-button"
          >
            {copied ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copied ? "COPIED" : "COPY SUMMARY"}
          </button>
          <button
            onClick={handleDownloadPng}
            className="h-12 border border-[#B366FF]/40 bg-[#B366FF]/[0.06] text-[#B366FF] hover:bg-[#B366FF]/15 font-heading font-bold text-xs tracking-[0.2em] uppercase flex items-center justify-center gap-2 transition"
            data-testid="share-download-button"
          >
            <Download className="w-4 h-4" />DOWNLOAD PNG
          </button>
        </div>
      </div>
    </div>
  );
}
