"""
OCTON VAR Authentication Module
Architect: Dr Finnegan
Lightning speed identity verification for VAR operations.
"""
import os
import bcrypt
import jwt
from datetime import datetime, timezone, timedelta
from fastapi import HTTPException, Request
from bson import ObjectId
import logging

logger = logging.getLogger(__name__)
JWT_ALGORITHM = "HS256"


def get_jwt_secret():
    return os.environ["JWT_SECRET"]


def hash_password(password: str) -> str:
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


def create_access_token(user_id: str, email: str, role: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(hours=1),
        "type": "access",
    }
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)


def create_refresh_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "exp": datetime.now(timezone.utc) + timedelta(days=7),
        "type": "refresh",
    }
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)


async def get_current_user(request: Request, db) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        user["_id"] = str(user["_id"])
        user.pop("password_hash", None)
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


async def get_optional_user(request: Request, db):
    try:
        return await get_current_user(request, db)
    except HTTPException:
        return None


async def require_role(request: Request, db, allowed_roles: list) -> dict:
    user = await get_current_user(request, db)
    if user.get("role") not in allowed_roles:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    return user


async def seed_admin(db):
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@octonvar.com")
    admin_password = os.environ.get("ADMIN_PASSWORD", "OctonAdmin2026!")
    existing = await db.users.find_one({"email": admin_email})
    if existing is None:
        hashed = hash_password(admin_password)
        await db.users.insert_one(
            {
                "email": admin_email,
                "password_hash": hashed,
                "name": "OCTON Admin",
                "role": "admin",
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
        )
        logger.info(f"Admin user seeded: {admin_email}")
    elif not verify_password(admin_password, existing["password_hash"]):
        await db.users.update_one(
            {"email": admin_email},
            {"$set": {"password_hash": hash_password(admin_password)}},
        )
        logger.info(f"Admin password updated: {admin_email}")

    await db.users.create_index("email", unique=True)
    await db.login_attempts.create_index("identifier")


async def check_brute_force(db, identifier: str):
    record = await db.login_attempts.find_one({"identifier": identifier})
    if record and record.get("attempts", 0) >= 5:
        lockout_until = record.get("lockout_until")
        if lockout_until:
            lockout_dt = (
                datetime.fromisoformat(lockout_until)
                if isinstance(lockout_until, str)
                else lockout_until
            )
            if datetime.now(timezone.utc) < lockout_dt:
                raise HTTPException(
                    status_code=429,
                    detail="Account locked. Try again in 15 minutes.",
                )
        await db.login_attempts.delete_one({"identifier": identifier})


async def record_failed_attempt(db, identifier: str):
    record = await db.login_attempts.find_one({"identifier": identifier})
    if record:
        new_attempts = record.get("attempts", 0) + 1
        update_data = {"attempts": new_attempts}
        if new_attempts >= 5:
            update_data["lockout_until"] = (
                datetime.now(timezone.utc) + timedelta(minutes=15)
            ).isoformat()
        await db.login_attempts.update_one(
            {"identifier": identifier}, {"$set": update_data}
        )
    else:
        await db.login_attempts.insert_one(
            {
                "identifier": identifier,
                "attempts": 1,
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
        )


async def clear_failed_attempts(db, identifier: str):
    await db.login_attempts.delete_many({"identifier": identifier})
