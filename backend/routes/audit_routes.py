"""Audit hash chain (SHA-256 tamper-proof)."""
from fastapi import HTTPException, Request
from pydantic import BaseModel

from audit import register_audit, verify_chain
from auth import get_current_user
from booth import get_booth_id, get_booth_label
from core import api_router, db


class AuditRegisterRequest(BaseModel):
    incident_id: str


@api_router.post("/audit/register")
async def audit_register(body: AuditRegisterRequest, request: Request):
    """Register a new audit chain entry for an incident's current analysis."""
    user = await get_current_user(request, db)
    inc = await db.incidents.find_one({"id": body.incident_id}, {"_id": 0})
    if not inc:
        raise HTTPException(status_code=404, detail="Incident not found")
    analysis = inc.get("ai_analysis") or {}
    return await register_audit(
        db, body.incident_id, analysis,
        user_id=user.get("id"),
        booth_id=get_booth_id(request),
        booth_label=get_booth_label(request),
    )


@api_router.get("/audit/verify")
async def audit_verify():
    """Walk the entire audit chain and report any tampering."""
    return await verify_chain(db)


@api_router.get("/audit/chain/{incident_id}")
async def audit_chain_for_incident(incident_id: str):
    """All audit entries belonging to an incident (in order)."""
    return await db.audit_chain.find(
        {"incident_id": incident_id}, {"_id": 0}
    ).sort("created_at", 1).to_list(100)
