# Forensic VAR Audit System - PRD

## Original Problem Statement
Forensic VAR audit employing self-learning AI tools to reduce the time to come to a decision in a football match. This will reduce total time taken by the referee to come to a decision.

## User Personas
1. **VAR Operator** - Reviews incidents in real-time, uses AI analysis to make quick decisions
2. **On-field Referee** - Receives VAR recommendations, makes final call
3. **League Administrator** - Reviews historical data, manages referees, analyzes performance patterns

## Core Requirements (Static)
- Real-time video frame analysis dashboard
- AI-powered incident classification (offside, handball, foul, penalty, goal-line, red card)
- Decision confidence scoring
- Historical decision pattern learning
- Referee performance analytics
- Manual incident upload (video clips/images)
- Text-based incident description
- Admin dashboard for league officials

## What's Been Implemented (April 2026)

### Backend (FastAPI + MongoDB)
- **Incident Management**: Full CRUD operations with AI analysis
- **AI Integration**: OpenAI GPT-5.2 via Emergent LLM Key for incident analysis
- **Referee Management**: Create, list, update statistics
- **Match Management**: Create and track matches
- **Analytics API**: Overview stats, patterns, referee performance
- **Demo Data Seeding**: Pre-populated test data

### Frontend (React + Tailwind + Shadcn)
- **Live VAR Dashboard**: Video stage with AI analysis overlay
- **AI Confidence Scoring**: Visual confidence scores with color-coded thresholds
- **Decision Actions**: Confirm/Overturn buttons for pending incidents
- **Incident Timeline**: Visual scrubber showing all incidents
- **Incident History**: Filterable list of all incidents
- **Referee Analytics**: Charts and tables for performance metrics
- **Settings Page**: System info, AI configuration, admin tools

### API Endpoints
| Endpoint | Method | Description |
|----------|--------|-------------|
| /api/ | GET | Health check |
| /api/incidents | GET/POST | List/Create incidents |
| /api/incidents/{id} | GET/PUT/DELETE | Incident operations |
| /api/incidents/{id}/decision | PUT | Update decision |
| /api/incidents/{id}/reanalyze | POST | Re-run AI analysis |
| /api/ai/analyze-text | POST | Text-only analysis |
| /api/referees | GET/POST | Referee management |
| /api/matches | GET/POST | Match management |
| /api/analytics/overview | GET | System analytics |
| /api/analytics/patterns | GET | Historical patterns |
| /api/seed-demo | POST | Seed demo data |

## Prioritized Backlog

### P0 (Critical) - COMPLETED
- [x] AI-powered incident analysis
- [x] Incident classification
- [x] Decision confidence scoring
- [x] VAR operator interface
- [x] Referee performance tracking

### P1 (High Priority) - Future
- [ ] User authentication (JWT/OAuth)
- [ ] Role-based access control
- [ ] Image/video frame upload
- [ ] Real-time incident feed (WebSockets)
- [ ] Match assignment to referees

### P2 (Medium Priority) - Future
- [ ] AI model training on historical decisions
- [ ] Multi-camera view support
- [ ] Offside line drawing tool
- [ ] Decision replay sharing
- [ ] Mobile-responsive design optimization

### P3 (Nice to Have) - Future
- [ ] Voice commands for VAR operators
- [ ] Integration with official match systems
- [ ] Export reports to PDF
- [ ] Custom AI confidence thresholds per incident type
- [ ] Notification system for critical decisions

## Technical Stack
- **Backend**: FastAPI, MongoDB, Motor (async driver)
- **Frontend**: React 19, Tailwind CSS, Shadcn/UI, Recharts
- **AI**: OpenAI GPT-5.2 via Emergent Integrations
- **Deployment**: Kubernetes (Emergent Platform)

## Next Tasks
1. Add user authentication and role-based access
2. Implement image/video frame upload functionality
3. Add WebSocket for real-time incident updates
4. Enhance AI analysis with historical learning
5. Add match-to-referee assignment workflow
