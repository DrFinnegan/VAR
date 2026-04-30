# OCTON VAR — End-to-End Tests (Playwright)

Smoke regression suite for the OCTON VAR control room. Runs against the
live preview deployment so it exercises real auth, WebSocket events,
Mongo writes, and the public PNG share-card route.

## Run locally
```bash
cd /app/frontend
yarn e2e            # headless
yarn e2e:headed     # show the browser
yarn e2e:report     # open the HTML report from the last run
```

## Suites

| Spec | What it covers |
|------|---------------|
| `auth.spec.js` | Admin login lands on `/`; bad password surfaces an error. |
| `match-wall.spec.js` | Tile href is `/?match=<id>`; click cleans the URL and persists the filter to localStorage (regression for the deep-link bug fixed Apr-2026). |
| `comparison.spec.js` | COMPARE button mounts the Decision Comparison overlay. |
| `boost.spec.js` | Boost-Confidence chip surfaces on <80 % incidents and opens the Q&A flow. |

## Credentials

Reads from `OCTON_ADMIN_EMAIL` / `OCTON_ADMIN_PASSWORD` env vars; falls
back to the seeded admin in `/app/memory/test_credentials.md`.

## Notes

- Tests skip gracefully when seed data isn't present (e.g. no incidents
  on the dashboard). They never fabricate fixtures.
- Backend WebSocket isolation is exercised at the unit level in
  `/app/backend/tests/test_ws_tournament_isolation.py` (4 cases).
