# OCTON VAR Forensic Audit System - PRD

## Original Problem Statement
Forensic VAR audit employing self-learning AI tools to reduce the time to come to a decision in a football match. System named OCTON VAR, architect Dr Finnegan, with Hippocampus + Neo Cortex brain architecture for lightning speed analyses.

## Architecture: Dr Finnegan's Neural Pathway
- **Hippocampus**: Lightning speed pattern matching (<100ms) - initial classification
- **Neo Cortex**: Deep cognitive analysis (GPT-5.2) - heavy lifting, reasoning, image analysis
- Messaging pathway: Hippocampus -> Neo Cortex signal propagation

## User Personas
1. **VAR Operator** - Reviews incidents, uses OCTON analysis, makes decisions
2. **On-field Referee** - Receives VAR recommendations, limited access
3. **League Administrator (Admin)** - Full access, analytics, system management, Dr Finnegan role

## What's Been Implemented (April 2026)

### v2.0 - Major Enhancement
- **Authentication**: JWT cookie-based auth with 3 roles (admin, var_operator, referee)
- **Dual-Brain AI**: Hippocampus (fast pattern match) -> Neo Cortex (GPT-5.2 deep analysis)
- **Image Upload**: Incident frame upload via Emergent Object Storage
- **WebSocket**: Real-time incident feed for live match monitoring
- **Historical Learning**: AI pulls past decisions to inform new analyses
- **OCTON Branding**: Dr Finnegan attribution, lightning speed language

### API Endpoints
| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| /api/auth/register | POST | No | Register user |
| /api/auth/login | POST | No | Login |
| /api/auth/logout | POST | Yes | Logout |
| /api/auth/me | GET | Yes | Current user |
| /api/incidents | GET/POST | Optional/Yes | Incident CRUD |
| /api/incidents/{id}/decision | PUT | Yes | Record decision |
| /api/incidents/{id}/reanalyze | POST | Yes | Re-run OCTON |
| /api/ai/analyze-text | POST | No | Text analysis |
| /api/referees | GET/POST | No | Referees |
| /api/matches | GET/POST | No | Matches |
| /api/analytics/overview | GET | No | Dashboard stats |
| /api/analytics/patterns | GET | No | Learning patterns |
| /api/ws | WS | No | Real-time feed |

## Technical Stack
- **Backend**: FastAPI, MongoDB, Motor, PyJWT, bcrypt
- **Frontend**: React 19, Tailwind, Shadcn/UI, Recharts, WebSocket
- **AI**: OpenAI GPT-5.2 via Emergent Integrations (Neo Cortex)
- **Storage**: Emergent Object Storage API
- **Auth**: JWT httpOnly cookies

## P1 Backlog
- [ ] Role-based route protection on frontend (admin-only pages)
- [ ] Match assignment to referees workflow
- [ ] Multi-camera view support
- [ ] AI model training feedback loop
- [ ] Mobile-responsive optimization
