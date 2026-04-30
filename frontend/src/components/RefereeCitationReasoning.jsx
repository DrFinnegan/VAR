/**
 * RefereeCitationReasoning — render reasoning text with referee-name spans
 * that, on click/hover, open a mini career-scorecard popover.
 *
 * Scans the text for "referee <FirstName Lastname>" or "referee <Surname>"
 * patterns and turns the name into a clickable span that fetches the
 * referee record by name from the backend and renders a mini card.
 */
import { useState, useEffect, useMemo } from "react";
import axios from "axios";
import { API } from "../lib/api";

export default function RefereeCitationReasoning({ text }) {
  const [refs, setRefs] = useState([]);
  const [hoveredName, setHoveredName] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await axios.get(`${API}/referees?limit=100`);
        setRefs(data || []);
      } catch { /* */ }
    })();
  }, []);

  const byName = useMemo(() => {
    const map = {};
    refs.forEach((r) => { if (r.name) map[r.name.toLowerCase()] = r; });
    return map;
  }, [refs]);

  // Render text with clickable referee spans.
  const segments = useMemo(() => {
    if (!text) return [];
    // Match "referee Firstname Lastname" or known referee names from DB list.
    const refNames = Object.keys(byName);
    if (refNames.length === 0) return [{ type: "text", value: text }];
    // Build a regex that captures any of the known ref names (case-insensitive, word-boundary)
    const escaped = refNames
      .sort((a, b) => b.length - a.length) // longest first
      .map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    const rx = new RegExp(`\\b(${escaped.join("|")})\\b`, "gi");
    const out = [];
    let last = 0;
    let m;
    while ((m = rx.exec(text)) !== null) {
      if (m.index > last) out.push({ type: "text", value: text.slice(last, m.index) });
      out.push({ type: "ref", value: m[0], key: m[0].toLowerCase() });
      last = m.index + m[0].length;
    }
    if (last < text.length) out.push({ type: "text", value: text.slice(last) });
    return out;
  }, [text, byName]);

  if (!text) return null;

  return (
    <p className="text-[12px] text-gray-300 leading-relaxed" data-testid="reasoning-with-citations">
      {segments.map((seg, i) => {
        if (seg.type === "text") return <span key={i}>{seg.value}</span>;
        const ref = byName[seg.key];
        return (
          <span
            key={i}
            className="relative inline-block cursor-help border-b border-dashed border-[#B366FF]/50 text-[#C98AFF] hover:text-[#B366FF]"
            onMouseEnter={() => setHoveredName(seg.key + "-" + i)}
            onMouseLeave={() => setHoveredName(null)}
            data-testid={`referee-mention-${seg.key.replace(/\s+/g, "-")}`}
          >
            {seg.value}
            {hoveredName === seg.key + "-" + i && ref && (
              <span className="absolute z-30 top-5 left-0 w-72 p-3 border border-[#B366FF]/40 bg-[#050505] shadow-xl text-left normal-case tracking-normal">
                <span className="block text-[10px] font-mono tracking-[0.25em] uppercase text-[#B366FF] mb-1">
                  REFEREE SCORECARD
                </span>
                <span className="block font-heading font-bold text-white text-sm mb-1">{ref.name}</span>
                <span className="block text-[10px] font-mono text-gray-400 uppercase tracking-[0.2em] mb-2">
                  {(ref.role || "referee").replace("_", " ")}
                </span>
                <span className="grid grid-cols-3 gap-2 text-center">
                  <span className="block border-l-2 border-[#00E5FF]/40 pl-2">
                    <span className="block text-[8px] font-mono uppercase tracking-[0.2em] text-gray-500">DECISIONS</span>
                    <span className="block font-mono text-base text-white">{ref.total_decisions || 0}</span>
                  </span>
                  <span className="block border-l-2 border-[#00FF88]/40 pl-2">
                    <span className="block text-[8px] font-mono uppercase tracking-[0.2em] text-gray-500">ACCURACY</span>
                    <span className="block font-mono text-base text-[#00FF88]">
                      {ref.total_decisions ? Math.round((ref.correct_decisions / ref.total_decisions) * 100) : 0}%
                    </span>
                  </span>
                  <span className="block border-l-2 border-[#FFB800]/40 pl-2">
                    <span className="block text-[8px] font-mono uppercase tracking-[0.2em] text-gray-500">AVG TIME</span>
                    <span className="block font-mono text-base text-[#FFB800]">
                      {Math.round(ref.average_decision_time_seconds || 0)}s
                    </span>
                  </span>
                </span>
                <span className="block mt-2 text-[9px] font-mono text-gray-600 leading-snug normal-case">
                  Hover-citation from OCTON's institutional-knowledge index.
                </span>
              </span>
            )}
          </span>
        );
      })}
    </p>
  );
}
