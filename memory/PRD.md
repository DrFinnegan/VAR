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
