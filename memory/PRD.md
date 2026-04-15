# OCTON VAR Forensic Audit System - PRD

## Original Problem Statement
Forensic VAR audit employing self-learning AI tools to reduce decision time in football matches. System named OCTON VAR, architect Dr Finnegan, with Hippocampus + Neo Cortex brain architecture for lightning speed analyses.

## Architecture: Dr Finnegan's Neural Pathway
- **Hippocampus**: Lightning speed pattern matching (<100ms)
- **Neo Cortex**: Deep cognitive analysis (GPT-5.2) - heavy lifting
- **Feedback Loop**: Operator corrections fed back to improve future analyses

## What's Been Implemented

### v1.0 - MVP
- AI-powered incident analysis, classification, confidence scoring
- Live VAR dashboard, incident history, referee analytics

### v2.0 - Auth, WebSocket, Storage, Branding
- JWT cookie-based auth with 3 roles (admin, var_operator, referee)
- Dual-brain AI (Hippocampus + Neo Cortex)
- Image upload via Emergent Object Storage
- WebSocket real-time feed
- OCTON VAR branding with Dr Finnegan

### v3.0 - Match Assignment, Feedback Loop, RBAC (Current)
- **Match-to-referee assignment**: Admin can assign referee + VAR operator to matches, change match status
- **AI feedback loop**: Every decision auto-records feedback comparing AI suggestion vs operator decision. Feedback stats show accuracy by type, confidence calibration. Neo Cortex receives correction history for learning.
- **Role-based access**: Admin-only pages (Matches, Admin Tools), VAR operator + admin pages (AI Feedback), nav items filtered by role, access denied page for unauthorized access.

### API Endpoints
| Endpoint | Method | Auth | Roles |
|----------|--------|------|-------|
| /api/auth/* | POST/GET | Various | All |
| /api/incidents | GET/POST | Optional/Yes | All |
| /api/incidents/{id}/decision | PUT | Yes | All auth |
| /api/matches/{id}/assign | PUT | Yes | Admin |
| /api/matches/{id}/status | PUT | Yes | Admin |
| /api/feedback | GET/POST | Yes | All auth |
| /api/feedback/stats | GET | No | All |
| /api/users | GET | Yes | Admin |
| /api/analytics/* | GET | No | All |
| /api/ws | WS | No | All |

## P1 Backlog
- [ ] Email notifications for match assignments
- [ ] Referee performance over time charts
- [ ] Export decision reports as PDF
- [ ] Mobile-responsive optimization
