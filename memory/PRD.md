# OCTON VAR Forensic Audit System - PRD

## Overview
Pure football VAR audit system. ID PROTECTION module has been separated into its own standalone application.

## Current App: OCTON VAR (this workspace)
- Live VAR Analysis with Hippocampus + Neo Cortex AI
- Incident management (CRUD, AI analysis, decisions)
- Match-to-referee assignment workflow
- AI feedback loop (self-learning from operator corrections)
- Role-based access (admin, var_operator, referee)
- JWT auth, WebSocket real-time feed, image upload
- Referee analytics and historical patterns

## Separated App: OCTON ID PROTECT (new workspace needed)
- ID fraud prevention with same Neocortex architecture
- Document forgery detection, face matching, data consistency
- Verification agent workflow (approve/reject)
- AI feedback loop for ID verification accuracy
- To build: Start new Emergent workspace and request OCTON ID PROTECT

## Tech Stack
- Backend: FastAPI, MongoDB, Motor, PyJWT, bcrypt
- Frontend: React 19, Tailwind, Shadcn/UI, Recharts
- AI: GPT-5.2 via Emergent Integrations
- Storage: Emergent Object Storage

## Changelog
- 2026-02: Player Tracking Trail added to Decision Comparison Mode — SVG overlay draws dashed cyan arrows with Δ distance labels between matching BEFORE/AFTER player positions (formation players matched by team+id order; markers matched by color+index). Toggle (TRAIL ON/OFF) with moved-count badge; trail also rendered in PNG export for referee report.
- 2026-02: Dashboard professional polish — (a) right-side OCTON ANALYSIS panel redesigned with radial confidence ring, HUD corner brackets, always-visible Decision tile, and collapsible "curtain" sections (Reasoning / Neo Cortex / Key Factors) instead of always-visible long text. (b) LIVE VAR page header got a glowing cyan accent bar, version chip, and live-sync pulse indicator. (c) Stat tiles got radial hover glow, corner tick marks, and contextual hint labels.
- 2026-02: LIVE VERDICTS decision ticker added — marquee-style scrolling bar at the top of Live VAR dashboard showing the latest 18 incidents with status dot, type badge, time, team, AI verdict text, and color-coded confidence %. Hover pauses the scroll; clicking an item selects that incident and loads it into the OCTON ANALYSIS panel.
- 2026-02: **Training Library + Precedent-RAG confidence uplift** — New admin-only `/training` page (CRUD + media upload + GPT-5.2 Vision auto-tagging) + `training_cases` Mongo collection + 20-case canonical seed. AI engine now retrieves top-K similar ground-truth precedents per analysis, feeds them to both Hippocampus (confidence boost) and Neo Cortex (as binding precedent in the prompt), and applies a transparent capped uplift (+0-20 %). Live VAR panel shows a purple `+X% from N precedents` badge under the confidence ring and a new `PRECEDENTS` curtain listing the matched cases with similarity scores. New endpoints: POST/GET/PUT/DELETE `/api/training/cases`, POST `/api/training/cases/{id}/media`, POST `/api/training/seed`, GET `/api/training/stats`, POST `/api/training/retrieve`. Engine version bumped to v2.1.
- 2026-02: Reasoning curtain scroll fix (explicit `max-h` on plain overflow-y-auto div + OCTON-branded cyan scrollbar in App.css). Copy-reasoning-to-clipboard button added to the REASONING curtain (flashes `✓ COPIED`).
- 2026-02: **Export-to-PDF** — new `utils/pdfExport.js` builds a branded one-page A4 forensic report (dark header strip + brain logo, audit ID, confidence ring with uplift chip, suggested decision tile, neural pathway 5-stat strip, full reasoning, key factors pills, precedents cards, referee signature line, disclaimer footer) using jsPDF vector primitives. Triggered from a new `PDF` button in the OCTON Analysis panel header. ~25 KB per report, crisp at any zoom.
