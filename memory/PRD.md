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
- 2026-02: **Audit Hash Chain (SHA-256)** — New `backend/audit.py` + `audit_chain` Mongo collection. Each PDF export first calls `POST /api/audit/register` which links the current analysis's `content_hash` to the previous entry's `entry_hash` (blockchain-style). PDFs now carry the `entry_hash` and `prev_hash` printed in the footer ("SHA-256 AUDIT SIGNATURE"). `GET /api/audit/verify` walks the full chain and reports any tampering. PDF filename now includes the audit id. Verified 3-entry chain is `valid`.
- 2026-02: **Train from this decision** — New `POST /api/incidents/{id}/promote-to-training` endpoint (admin + var_operator, confirmed/overturned only, idempotent). Purple `TRAIN` button appears on the OCTON Analysis panel for confirmed/overturned incidents and creates a training case from the incident's final decision + AI reasoning + key factors.
- 2026-02: **App.js refactor phase 1** — Extracted `OctonBrainLogo` → `/components/OctonBrainLogo.jsx` and `ConfidenceScore` + `CopyButton` + `CurtainSection` → `/components/OctonAnalysisParts.jsx`. App.js shrank from ~2790 → ~2517 lines. All flows verified working post-move.
- 2026-02: **Video-analysis audit & fix** — Bug: server uploaded video but only ever passed `image_base64` to the AI engine, so the Neo Cortex vision pathway never saw any video frame. Fix: new `backend/video_utils.py` uses `ffmpeg` (installed in container) to extract a representative still (clamped to 1/3 of duration, scaled ≤1280 px, q=4) when no image is provided. Applies to both `POST /incidents` and `POST /incidents/{id}/reanalyze`. Added `analysis.visual_evidence_source` (`image` / `video_frame` / `null`) surfaced as a badge next to "SUGGESTED DECISION". Frontend now enforces a 12 MB clip size guard + upload progress toasts.
- 2026-02: **OCTON voice bot** — New `backend/voice.py` (Whisper STT + GPT-5.2 chat + OpenAI TTS `onyx` voice, all via Emergent LLM key). Endpoints: `POST /voice/transcribe` (multipart audio→text), `POST /voice/chat` (text→text+MP3 base64), `POST /voice/speak` (text→audio stream). Live match context (selected incident + last 6 incidents + training-library counts) is injected into every prompt. Frontend `components/OctonVoiceWidget.jsx` — floating cyan brain launcher (bottom-right, global), dockable panel with mic button, real-time audio-level bars, transcript bubbles, session continuity, auto-stop after 25 s. Persona: calm, authoritative forensic analyst, concise (~35 words). Verified: Whisper round-trip identity-perfect, context-aware replies cite Laws / match time / team correctly.
