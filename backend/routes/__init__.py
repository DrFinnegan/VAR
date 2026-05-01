"""OCTON VAR HTTP routers.

Each module owns a slice of the API surface and registers its endpoints on
the shared `core.api_router`. Importing this package wires every router up.
"""
from . import (  # noqa: F401
    auth_routes,
    incidents,
    matches_referees,
    analytics,
    feedback,
    training,
    audit_routes,
    voice_routes,
    system,
    seed,
    dashboards,
    system_config,
    boost,
    public_verdict,
    quick_fire,
)
