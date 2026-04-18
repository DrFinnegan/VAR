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
