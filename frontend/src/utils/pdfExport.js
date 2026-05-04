/**
 * OCTON VAR — Forensic Analysis PDF Report
 * Client-side vector PDF built with jsPDF primitives (no HTML rasterisation).
 * One page, A4 portrait, branded dark-accent layout.
 */
import jsPDF from "jspdf";

// ── Theme ────────────────────────────────────────────────
const CYAN = [0, 192, 220];
const DARK = [10, 10, 12];
const GRAY_MUTED = [140, 140, 145];
const GRAY_TEXT = [55, 55, 60];
const GREEN = [0, 180, 100];
const AMBER = [200, 140, 0];
const RED = [200, 42, 42];
const PURPLE = [140, 90, 200];

const tierColor = (s) => {
  if (s >= 90) return GREEN;
  if (s >= 70) return CYAN;
  if (s >= 50) return AMBER;
  return RED;
};
const tierLabel = (s) => (s >= 90 ? "HIGH" : s >= 70 ? "STRONG" : s >= 50 ? "MODERATE" : "LOW");

const fmtDate = (d = new Date()) =>
  d.toISOString().replace("T", " ").slice(0, 19) + " UTC";

// Short audit id derived from incident id
const shortId = (id) => (id ? String(id).replace(/-/g, "").slice(0, 10).toUpperCase() : "—");

// ── Helpers ──────────────────────────────────────────────
function drawConfidenceRing(doc, cx, cy, r, score) {
  const color = tierColor(score);
  // Track
  doc.setDrawColor(230, 230, 232);
  doc.setLineWidth(3);
  doc.circle(cx, cy, r, "S");
  // Progress arc (approx with bezier segments)
  const pct = Math.max(0, Math.min(100, score)) / 100;
  const startAng = -Math.PI / 2;
  const endAng = startAng + pct * 2 * Math.PI;
  doc.setDrawColor(color[0], color[1], color[2]);
  doc.setLineWidth(3);
  // Approximate arc with short line segments
  const steps = Math.max(8, Math.floor(48 * pct));
  for (let i = 0; i < steps; i++) {
    const a1 = startAng + (i / steps) * (endAng - startAng);
    const a2 = startAng + ((i + 1) / steps) * (endAng - startAng);
    doc.line(
      cx + r * Math.cos(a1),
      cy + r * Math.sin(a1),
      cx + r * Math.cos(a2),
      cy + r * Math.sin(a2)
    );
  }
  // Center text: score %
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(color[0], color[1], color[2]);
  const label = `${score.toFixed(1)}%`;
  const w = doc.getTextWidth(label);
  doc.text(label, cx - w / 2, cy + 2);
  // Tier
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(color[0], color[1], color[2]);
  const tier = tierLabel(score);
  const tw = doc.getTextWidth(tier);
  doc.text(tier, cx - tw / 2, cy + 12);
}

function wrapAndDraw(doc, text, x, y, maxW, lineH, maxLines = 9999) {
  if (!text) return y;
  const lines = doc.splitTextToSize(String(text), maxW);
  const slice = lines.slice(0, maxLines);
  slice.forEach((ln, i) => doc.text(ln, x, y + i * lineH));
  let cursor = y + slice.length * lineH;
  if (lines.length > maxLines) {
    doc.setTextColor(GRAY_MUTED[0], GRAY_MUTED[1], GRAY_MUTED[2]);
    doc.setFontSize(7);
    doc.text("… (truncated for one-page format)", x, cursor + 2);
    cursor += 6;
  }
  return cursor;
}

function sectionHeader(doc, x, y, title, accent = CYAN) {
  // Accent block
  doc.setFillColor(accent[0], accent[1], accent[2]);
  doc.rect(x, y - 3.2, 2, 4, "F");
  // Title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(DARK[0], DARK[1], DARK[2]);
  doc.text(title.toUpperCase(), x + 4, y);
  // Underline
  doc.setDrawColor(230, 230, 230);
  doc.setLineWidth(0.2);
  doc.line(x, y + 1.5, x + 180, y + 1.5);
}

// ── Main export ──────────────────────────────────────────
export function exportAnalysisPDF(incident, analysis, audit = null, opts = {}) {
  const { frameImage = null, activeAngle = null } = opts;
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const pageW = 210;
  const pageH = 297;
  const margin = 14;
  const contentW = pageW - margin * 2;
  const score = Number(
    analysis?.final_confidence ?? analysis?.confidence_score ?? 0
  );
  const decision = analysis?.suggested_decision || "—";
  const reasoning = analysis?.reasoning || "—";
  const keyFactors = Array.isArray(analysis?.key_factors) ? analysis.key_factors : [];
  const precedents = Array.isArray(analysis?.precedents_used) ? analysis.precedents_used : [];
  const uplift = Number(analysis?.confidence_uplift || 0);
  const baseConf = Number(analysis?.base_confidence || score);

  // ── Top header strip (dark) ─────────────────────────────
  doc.setFillColor(DARK[0], DARK[1], DARK[2]);
  doc.rect(0, 0, pageW, 22, "F");
  // Cyan accent line
  doc.setFillColor(CYAN[0], CYAN[1], CYAN[2]);
  doc.rect(0, 22, pageW, 0.8, "F");

  // Logo (simple brain glyph — three stacked arcs)
  doc.setDrawColor(CYAN[0], CYAN[1], CYAN[2]);
  doc.setLineWidth(0.6);
  doc.circle(margin + 4, 11, 5, "S");
  doc.line(margin + 0.4, 11, margin + 7.6, 11);
  doc.line(margin + 4, 6.6, margin + 4, 15.4);
  // Title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(255, 255, 255);
  doc.text("OCTON VAR", margin + 12, 10);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(CYAN[0], CYAN[1], CYAN[2]);
  doc.text("FORENSIC ANALYSIS REPORT  ·  OCTON Neocortex  ·  v2.1", margin + 12, 14);
  // Right-top meta
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(180, 180, 180);
  const headerAuditId = audit?.audit_id
    ? `AUDIT ID: ${String(audit.audit_id).replace(/-/g, "").slice(0, 10).toUpperCase()}`
    : `AUDIT ID: ${shortId(incident?.id)}`;
  doc.text(headerAuditId, pageW - margin, 9, { align: "right" });
  doc.text(`GENERATED: ${fmtDate()}`, pageW - margin, 13, { align: "right" });
  doc.setTextColor(CYAN[0], CYAN[1], CYAN[2]);
  doc.text(
    `ENGINE: ${analysis?.engine_version || "OCTON v2.1"}`,
    pageW - margin,
    17,
    { align: "right" }
  );

  // ── Incident meta row ───────────────────────────────────
  let y = 30;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(DARK[0], DARK[1], DARK[2]);
  const incidentTitle = `${(incident?.incident_type || "incident")
    .replace("_", " ")
    .toUpperCase()} REVIEW`;
  doc.text(incidentTitle, margin, y);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(GRAY_MUTED[0], GRAY_MUTED[1], GRAY_MUTED[2]);
  const metaBits = [];
  if (incident?.timestamp_in_match) metaBits.push(`Time ${incident.timestamp_in_match}`);
  if (incident?.team_involved) metaBits.push(`Team: ${incident.team_involved}`);
  if (incident?.player_involved) metaBits.push(`Player: ${incident.player_involved}`);
  if (incident?.match_id) metaBits.push(`Match #${String(incident.match_id).slice(0, 8)}`);
  if (metaBits.length) {
    doc.text(metaBits.join("   ·   "), margin, y + 5);
  }

  // ── IFAB Clause Cited (legal-grade traceability) ────────
  // Renders directly under the incident meta row so any printed copy of
  // the report carries the precise IFAB law/clause OCTON applied.
  const citedClause = (analysis?.cited_clause || "").trim();
  if (citedClause) {
    const clauseY = y + 9.5;
    const clauseBoxW = pageW - margin * 2 - 50; // leave room for the ring on the right
    const clauseBoxH = 7;
    doc.setFillColor(252, 247, 230);                // very pale amber wash
    doc.setDrawColor(AMBER[0], AMBER[1], AMBER[2]);
    doc.setLineWidth(0.25);
    doc.rect(margin, clauseY, clauseBoxW, clauseBoxH, "FD");
    // Vertical accent bar (amber) on the left edge to match the UI badge
    doc.setFillColor(AMBER[0], AMBER[1], AMBER[2]);
    doc.rect(margin, clauseY, 1.2, clauseBoxH, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(AMBER[0], AMBER[1], AMBER[2]);
    doc.text("IFAB CLAUSE CITED", margin + 3, clauseY + 2.6);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(80, 60, 0);
    // jsPDF doesn't truncate, so cap to ~95 chars to keep it on one line
    const safeClause = citedClause.length > 95 ? citedClause.slice(0, 92) + "…" : citedClause;
    doc.text(safeClause, margin + 3, clauseY + 5.6);
  }

  // ── Confidence Ring (right side of header zone) ─────────
  const ringCx = pageW - margin - 20;
  const ringCy = 50;
  drawConfidenceRing(doc, ringCx, ringCy, 18, score);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(GRAY_MUTED[0], GRAY_MUTED[1], GRAY_MUTED[2]);
  doc.text("FINAL CONFIDENCE", ringCx, ringCy - 23, { align: "center" });
  if (uplift > 0) {
    // Purple uplift chip
    doc.setFillColor(PURPLE[0], PURPLE[1], PURPLE[2]);
    doc.setDrawColor(PURPLE[0], PURPLE[1], PURPLE[2]);
    doc.roundedRect(ringCx - 18, ringCy + 21, 36, 5, 0.5, 0.5, "S");
    doc.setTextColor(PURPLE[0], PURPLE[1], PURPLE[2]);
    doc.setFontSize(6.5);
    doc.text(
      `+${uplift.toFixed(1)}%  /  ${analysis?.precedent_strong_matches || 0} PRECEDENT${(analysis?.precedent_strong_matches || 0) === 1 ? "" : "S"}`,
      ringCx,
      ringCy + 24.3,
      { align: "center" }
    );
  }
  const hipBonus = Number(analysis?.hippocampus_bonus || 0);
  if (hipBonus > 0) {
    // Green agreement chip
    doc.setDrawColor(GREEN[0], GREEN[1], GREEN[2]);
    doc.roundedRect(ringCx - 18, ringCy + 27.5, 36, 5, 0.5, 0.5, "S");
    doc.setTextColor(GREEN[0], GREEN[1], GREEN[2]);
    doc.setFontSize(6.5);
    doc.text(`+${hipBonus.toFixed(1)}%  AGREEMENT`, ringCx, ringCy + 30.8, { align: "center" });
  }

  // ── Confidence Breakdown stacked bar (mirrors the UI panel) ──
  const baseConfVal = Number(analysis?.base_confidence ?? Math.max(0, score - uplift - hipBonus));
  const totalParts = Math.max(0.1, baseConfVal + uplift + hipBonus);
  const barY = ringCy + (hipBonus > 0 ? 36 : uplift > 0 ? 30 : 24);
  const barX = ringCx - 20;
  const barW = 40;
  const barH = 2.2;
  doc.setFillColor(238, 238, 242);
  doc.rect(barX, barY, barW, barH, "F");
  let cursorX = barX;
  const basePx = (baseConfVal / totalParts) * barW;
  const upliftPx = (uplift / totalParts) * barW;
  const hipPx = (hipBonus / totalParts) * barW;
  doc.setFillColor(CYAN[0], CYAN[1], CYAN[2]);
  doc.rect(cursorX, barY, basePx, barH, "F"); cursorX += basePx;
  if (upliftPx > 0) {
    doc.setFillColor(PURPLE[0], PURPLE[1], PURPLE[2]);
    doc.rect(cursorX, barY, upliftPx, barH, "F"); cursorX += upliftPx;
  }
  if (hipPx > 0) {
    doc.setFillColor(GREEN[0], GREEN[1], GREEN[2]);
    doc.rect(cursorX, barY, hipPx, barH, "F");
  }
  // Tiny legend beneath the bar
  doc.setFont("helvetica", "normal");
  doc.setFontSize(5.5);
  doc.setTextColor(GRAY_MUTED[0], GRAY_MUTED[1], GRAY_MUTED[2]);
  const legY = barY + barH + 2.4;
  // base
  doc.setFillColor(CYAN[0], CYAN[1], CYAN[2]);
  doc.rect(barX, legY - 1.2, 1.6, 1.6, "F");
  doc.text(`BASE ${baseConfVal.toFixed(1)}%`, barX + 2.4, legY);
  // uplift
  if (uplift > 0) {
    doc.setFillColor(PURPLE[0], PURPLE[1], PURPLE[2]);
    doc.rect(barX + 14, legY - 1.2, 1.6, 1.6, "F");
    doc.text(`+${uplift.toFixed(1)}%`, barX + 16.4, legY);
  }
  // agreement
  if (hipBonus > 0) {
    doc.setFillColor(GREEN[0], GREEN[1], GREEN[2]);
    doc.rect(barX + 26, legY - 1.2, 1.6, 1.6, "F");
    doc.text(`+${hipBonus.toFixed(1)}%`, barX + 28.4, legY);
  }

  // ── Decision block ──────────────────────────────────────
  // Push the body down when the IFAB clause box is present so it doesn't
  // collide with the amber strip in the header.
  y = citedClause ? 52 : 48;
  sectionHeader(doc, margin, y, "Suggested Decision", CYAN);
  y += 5;
  doc.setFillColor(240, 250, 252);
  doc.rect(margin, y, contentW - 46, 14, "F");
  doc.setDrawColor(CYAN[0], CYAN[1], CYAN[2]);
  doc.setLineWidth(0.4);
  doc.line(margin, y, margin, y + 14);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(DARK[0], DARK[1], DARK[2]);
  wrapAndDraw(doc, decision, margin + 3, y + 5.5, contentW - 52, 4.2, 2);

  // ── IFAB Critical Trigger callout (non-discretionary red card) ──
  const critTrigger = analysis?.critical_trigger;
  if (critTrigger) {
    const critY = y + 16;
    doc.setFillColor(255, 235, 235);
    doc.setDrawColor(RED[0], RED[1], RED[2]);
    doc.setLineWidth(0.4);
    doc.roundedRect(margin, critY, contentW - 46, 9, 0.6, 0.6, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(RED[0], RED[1], RED[2]);
    doc.text(`⚠  IFAB AUTOMATIC RED  ·  TRIGGER: ${String(critTrigger).replace(/_/g, " ").toUpperCase()}`, margin + 3, critY + 4);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(120, 60, 60);
    const note = analysis?.critical_floor_applied
      ? "IFAB Law 12 — non-discretionary offence. Confidence floored at 92 %."
      : "IFAB Law 12 — non-discretionary offence. Red card mandated by rule.";
    doc.text(note, margin + 3, critY + 7.4);
  }

  // ── Brain Pathway metrics strip ─────────────────────────
  y += 20;
  sectionHeader(doc, margin, y, "Neural Pathway", CYAN);
  y += 5;
  const hipConfStat = analysis?.hippocampus?.initial_confidence ?? 0;
  const neoConfStat = analysis?.neo_cortex?.confidence_score ?? 0;
  const totalMs = analysis?.total_processing_time_ms ?? 0;
  const histCount = analysis?.similar_historical_cases ?? 0;
  const neoWeightPct = Math.round((analysis?.weighting?.neo_cortex ?? 0.8) * 100);
  const hipWeightPct = Math.round((analysis?.weighting?.hippocampus ?? 0.2) * 100);
  const stats = [
    { label: "Hippocampus", value: `${hipConfStat.toFixed(1)}%`, hint: `weight ${hipWeightPct}%`, color: GREEN },
    { label: "Neo Cortex", value: `${neoConfStat.toFixed(1)}%`, hint: `weight ${neoWeightPct}%`, color: CYAN },
    { label: "Base Conf", value: `${baseConf.toFixed(1)}%`, hint: "pre-boost", color: GRAY_TEXT },
    { label: "Boost", value: `+${(uplift + hipBonus).toFixed(1)}%`, hint: `${precedents.length} prec · ${hipBonus > 0 ? "agree" : "no agree"}`, color: PURPLE },
    { label: "Latency", value: `${totalMs}ms`, hint: `history: ${histCount}`, color: AMBER },
  ];
  const cellW = contentW / stats.length;
  stats.forEach((s, i) => {
    const x0 = margin + i * cellW;
    doc.setDrawColor(225, 225, 228);
    doc.setLineWidth(0.2);
    doc.rect(x0, y, cellW - 1.5, 16, "S");
    // Top accent
    doc.setFillColor(s.color[0], s.color[1], s.color[2]);
    doc.rect(x0, y, 8, 0.6, "F");
    // Value
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(s.color[0], s.color[1], s.color[2]);
    doc.text(s.value, x0 + 3, y + 7);
    // Label
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(GRAY_MUTED[0], GRAY_MUTED[1], GRAY_MUTED[2]);
    doc.text(s.label.toUpperCase(), x0 + 3, y + 11.5);
    doc.setFontSize(6);
    doc.text(s.hint, x0 + 3, y + 14.5);
  });
  y += 20;

  // ── Annotated operator frame (scrubber snapshot with offside lines/circles) ──
  if (frameImage && typeof frameImage === "string" && frameImage.startsWith("data:image/")) {
    sectionHeader(doc, margin, y, "Annotated Frame (Operator Snapshot)", AMBER);
    y += 5;
    const imgW = 72;   // mm — ~ 70-75 mm as requested
    const imgH = 40;   // mm
    try {
      doc.addImage(frameImage, "JPEG", margin, y, imgW, imgH, undefined, "FAST");
    } catch {
      // Fallback: render empty frame box with warning
      doc.setDrawColor(GRAY_MUTED[0], GRAY_MUTED[1], GRAY_MUTED[2]);
      doc.rect(margin, y, imgW, imgH, "S");
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(GRAY_MUTED[0], GRAY_MUTED[1], GRAY_MUTED[2]);
      doc.text("frame unavailable (cross-origin)", margin + 2, y + imgH / 2);
    }
    // Caption + thin border
    doc.setDrawColor(AMBER[0], AMBER[1], AMBER[2]);
    doc.setLineWidth(0.3);
    doc.rect(margin, y, imgW, imgH, "S");

    // ── Active-angle ribbon — top-left of the thumbnail ────────────
    // Tells the reader which camera view drove the verdict (legal-grade
    // traceability when multiple angles were ingested).
    const ang = (activeAngle || "primary").toString().replace(/_/g, " ").toUpperCase();
    const angleLabel = ang === "PRIMARY" ? "PRIMARY VIEW" : `${ang} ANGLE`;
    const ribbonW = Math.max(28, doc.getTextWidth(angleLabel) * 1.2 + 6);
    doc.setFillColor(AMBER[0], AMBER[1], AMBER[2]);
    doc.rect(margin, y, ribbonW, 4.2, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6);
    doc.setTextColor(15, 12, 0);
    doc.text(angleLabel, margin + 2, y + 3);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(GRAY_MUTED[0], GRAY_MUTED[1], GRAY_MUTED[2]);
    const capBits = [];
    if (incident?.timestamp_in_match) capBits.push(`T ${incident.timestamp_in_match}`);
    if (incident?.team_involved) capBits.push(incident.team_involved);
    const cap = capBits.length ? capBits.join(" · ") : "operator scrubber frame";
    doc.text(cap, margin, y + imgH + 3.5);
    // Side-note (right of frame)
    const noteX = margin + imgW + 4;
    const noteW = contentW - imgW - 4;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(DARK[0], DARK[1], DARK[2]);
    doc.text("VISUAL EVIDENCE", noteX, y + 3);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(GRAY_TEXT[0], GRAY_TEXT[1], GRAY_TEXT[2]);
    const evSrc = analysis?.visual_evidence_source;
    const srcLabel = evSrc === "multi_angle"
      ? `Multi-angle (${analysis?.camera_angles_analyzed || "?"} cameras analysed)`
      : evSrc === "video_frame" ? "Extracted video still"
      : evSrc === "image" ? "Uploaded still frame"
      : "Text-only analysis";
    doc.text(srcLabel, noteX, y + 7);
    // Provenance of the video: GO LIVE 8s rolling buffer capture vs. standard upload.
    const vidSource = incident?.video_source;
    if (vidSource === "go_live_capture") {
      doc.setFontSize(6);
      doc.setTextColor(AMBER[0], AMBER[1], AMBER[2]);
      doc.text("GO LIVE · 8s rolling buffer auto-attached", noteX, y + 10);
    } else if (vidSource === "upload") {
      doc.setFontSize(6);
      doc.setTextColor(GRAY_MUTED[0], GRAY_MUTED[1], GRAY_MUTED[2]);
      doc.text("Standard upload", noteX, y + 10);
    }
    doc.setFontSize(6);
    doc.setTextColor(GRAY_MUTED[0], GRAY_MUTED[1], GRAY_MUTED[2]);
    wrapAndDraw(doc, "Operator-drawn offside lines / circles / player markers as rendered on the Live VAR scrubber at the moment of export.", noteX, y + 13.2, noteW, 3.4, 4);
    y += imgH + 8;
  }

  // ── Reasoning ───────────────────────────────────────────
  sectionHeader(doc, margin, y, "Reasoning", CYAN);
  y += 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(GRAY_TEXT[0], GRAY_TEXT[1], GRAY_TEXT[2]);
  const reasoningEndY = wrapAndDraw(doc, reasoning, margin, y + 2, contentW, 4.2, 18);
  y = reasoningEndY + 4;

  // ── Key Factors (inline pills) ──────────────────────────
  if (keyFactors.length) {
    sectionHeader(doc, margin, y, `Key Factors (${keyFactors.length})`, AMBER);
    y += 5;
    let xPill = margin;
    const pillY = y;
    keyFactors.slice(0, 12).forEach((f) => {
      doc.setFontSize(7.5);
      const w = doc.getTextWidth(String(f)) + 4;
      if (xPill + w > pageW - margin) {
        xPill = margin;
        y += 7;
      }
      doc.setDrawColor(AMBER[0], AMBER[1], AMBER[2]);
      doc.setFillColor(255, 247, 225);
      doc.roundedRect(xPill, y - 3.5, w, 5.5, 0.6, 0.6, "FD");
      doc.setTextColor(AMBER[0], AMBER[1], AMBER[2]);
      doc.text(String(f), xPill + 2, y);
      xPill += w + 2;
    });
    y = Math.max(y, pillY) + 6;
  }

  // ── Precedents ──────────────────────────────────────────
  if (precedents.length) {
    sectionHeader(doc, margin, y, `Precedents Applied (${precedents.length})`, PURPLE);
    y += 5;
    precedents.slice(0, 4).forEach((p, i) => {
      const rowH = 12;
      doc.setDrawColor(225, 220, 240);
      doc.setFillColor(250, 247, 255);
      doc.rect(margin, y, contentW, rowH, "FD");
      // Index
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(PURPLE[0], PURPLE[1], PURPLE[2]);
      doc.text(`#${i + 1}`, margin + 2, y + 5);
      // Title
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(DARK[0], DARK[1], DARK[2]);
      const title = String(p.title || "Precedent").slice(0, 75);
      doc.text(title, margin + 10, y + 4.5);
      // Correct decision
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(GREEN[0], GREEN[1], GREEN[2]);
      const dec = `→ ${p.correct_decision || "—"}`;
      doc.text(String(dec).slice(0, 110), margin + 10, y + 8.3);
      // Context
      const ctx = p.match_context || {};
      const ctxLine = [ctx.teams, ctx.competition, ctx.year].filter(Boolean).join(" · ");
      if (ctxLine) {
        doc.setFontSize(6.5);
        doc.setTextColor(GRAY_MUTED[0], GRAY_MUTED[1], GRAY_MUTED[2]);
        doc.text(ctxLine, margin + 10, y + 11);
      }
      // Similarity %
      const sim = `${((p.similarity || 0) * 100).toFixed(1)}%`;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(PURPLE[0], PURPLE[1], PURPLE[2]);
      doc.text(sim, pageW - margin - 2, y + 6.5, { align: "right" });
      y += rowH + 1.5;
    });
    y += 2;
  }

  // ── Signature footer ────────────────────────────────────
  const footY = pageH - 30;
  doc.setDrawColor(220, 220, 220);
  doc.setLineWidth(0.3);
  doc.line(margin, footY, pageW - margin, footY);

  // Tamper-proof hash chain block (if audit entry provided)
  if (audit?.entry_hash) {
    doc.setFont("courier", "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(PURPLE[0], PURPLE[1], PURPLE[2]);
    doc.text("SHA-256 AUDIT SIGNATURE", margin, footY + 4);
    doc.setFont("courier", "normal");
    doc.setFontSize(6);
    doc.setTextColor(80, 80, 90);
    doc.text(`ENTRY  ${audit.entry_hash}`, margin, footY + 7.8);
    doc.text(`PREV   ${audit.prev_hash}`, margin, footY + 11);
    // Booth attribution (right-aligned) — shown when the audit entry
    // carries the X-Booth-Id / X-Booth-Label headers.
    if (audit.booth_id || incident?.decided_by_booth) {
      const boothLabel = audit.booth_label || incident?.decided_by_booth_label || "";
      const boothId = audit.booth_id || incident?.decided_by_booth || "";
      doc.setFont("courier", "bold");
      doc.setFontSize(6.5);
      doc.setTextColor(CYAN[0], CYAN[1], CYAN[2]);
      doc.text("DECIDED BY BOOTH", pageW - margin, footY + 4, { align: "right" });
      doc.setFont("courier", "normal");
      doc.setFontSize(6);
      doc.setTextColor(80, 80, 90);
      if (boothLabel) {
        doc.text(boothLabel, pageW - margin, footY + 7.8, { align: "right" });
      }
      doc.text(boothId, pageW - margin, footY + 11, { align: "right" });
      if (incident?.decided_by) {
        doc.text(`operator · ${incident.decided_by}`, pageW - margin, footY + 14, { align: "right" });
      }
    }
    // small purple marker to the left of the block
    doc.setFillColor(PURPLE[0], PURPLE[1], PURPLE[2]);
    doc.rect(margin - 2, footY + 2, 0.6, 10, "F");
  }

  // Signature line (slightly higher to accommodate hash block)
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(GRAY_MUTED[0], GRAY_MUTED[1], GRAY_MUTED[2]);
  doc.text("REFEREE SIGNATURE", margin, footY + 17);
  doc.setDrawColor(180, 180, 180);
  doc.line(margin + 32, footY + 17, margin + 92, footY + 17);
  doc.text("DATE", margin + 96, footY + 17);
  doc.line(margin + 104, footY + 17, margin + 132, footY + 17);

  // Bottom strip
  doc.setFillColor(DARK[0], DARK[1], DARK[2]);
  doc.rect(0, pageH - 8, pageW, 8, "F");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(CYAN[0], CYAN[1], CYAN[2]);
  doc.text("OCTON VAR · DR FINNEGAN", margin, pageH - 3);
  doc.setTextColor(200, 200, 200);
  doc.text(
    "AI-ASSISTED DECISION SUPPORT · NOT A SUBSTITUTE FOR ON-FIELD RULING · AUDIT TRAIL RETAINED",
    pageW / 2,
    pageH - 3,
    { align: "center" }
  );
  doc.setTextColor(CYAN[0], CYAN[1], CYAN[2]);
  doc.text("PAGE 1 / 1", pageW - margin, pageH - 3, { align: "right" });

  // Save
  const auditSuffix = audit?.audit_id
    ? String(audit.audit_id).replace(/-/g, "").slice(0, 8).toUpperCase()
    : shortId(incident?.id);
  const fileName = `OCTON_VAR_Report_${auditSuffix}_${new Date()
    .toISOString()
    .slice(0, 10)}.pdf`;
  doc.save(fileName);
  return fileName;
}
