"""
OCTON VAR Forensic Audit System
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Architect: Dr Finnegan
Lightning speed analyses powered by dual-brain AI.
Hippocampus -> Neo Cortex messaging pathway.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

This module wires up the FastAPI app, mounts the modular routers under /api,
and owns startup/shutdown lifecycle (admin seed, storage init, scheduler).
All routes themselves live in the `routes/` package.
"""
import os
from pathlib import Path

from fastapi import FastAPI
from starlette.middleware.cors import CORSMiddleware

from auth import seed_admin
from core import api_router, db, logger, mongo_client
from storage import init_storage

# Importing the routes package registers every endpoint on `core.api_router`.
import routes  # noqa: F401

app = FastAPI(title="OCTON VAR Forensic Audit System - Dr Finnegan")
app.include_router(api_router)

frontend_url = os.environ.get(
    "FRONTEND_URL", "https://smart-var-audit.preview.emergentagent.com"
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[frontend_url, "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    await seed_admin(db)
    try:
        init_storage()
    except Exception as e:
        logger.warning(f"Storage init warning: {e}")
    logger.info("OCTON VAR System online - Dr Finnegan's Neural Pathway active")

    creds_path = Path("/app/memory/test_credentials.md")
    creds_path.parent.mkdir(parents=True, exist_ok=True)
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@octonvar.com")
    admin_password = os.environ.get("ADMIN_PASSWORD", "OctonAdmin2026!")
    creds_path.write_text(
        f"# OCTON VAR Test Credentials\n\n"
        f"## Admin\n- Email: {admin_email}\n- Password: {admin_password}\n- Role: admin\n\n"
        f"## Auth Endpoints\n- POST /api/auth/register\n- POST /api/auth/login\n"
        f"- POST /api/auth/logout\n- GET /api/auth/me\n- POST /api/auth/refresh\n"
    )

    try:
        from web_scheduler import start_scheduler as _start_sched
        await _start_sched(db)
    except Exception as e:
        logger.warning(f"Web-learning scheduler init failed: {e}")

    try:
        from tamper_monitor import start_tamper_monitor
        await start_tamper_monitor(db)
    except Exception as e:
        logger.warning(f"Tamper monitor init failed: {e}")


@app.on_event("shutdown")
async def shutdown():
    mongo_client.close()
