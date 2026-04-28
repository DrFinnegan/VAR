"""Auth: register / login / logout / me / refresh."""
import os
from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException, Request, Response
from pydantic import BaseModel

from auth import (
    hash_password,
    verify_password,
    create_access_token,
    create_refresh_token,
    get_current_user,
    check_brute_force,
    record_failed_attempt,
    clear_failed_attempts,
)
from core import api_router, db, set_auth_cookies, user_response


class RegisterInput(BaseModel):
    name: str
    email: str
    password: str
    role: Optional[str] = "referee"


class LoginInput(BaseModel):
    email: str
    password: str


@api_router.post("/auth/register")
async def register(inp: RegisterInput, response: Response):
    email = inp.email.strip().lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email already registered")
    if len(inp.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    allowed_roles = ["var_operator", "referee"]
    role = inp.role if inp.role in allowed_roles else "referee"
    hashed = hash_password(inp.password)
    user_doc = {
        "email": email,
        "password_hash": hashed,
        "name": inp.name.strip(),
        "role": role,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    result = await db.users.insert_one(user_doc)
    user_doc["_id"] = str(result.inserted_id)
    access = create_access_token(user_doc["_id"], email, role)
    refresh = create_refresh_token(user_doc["_id"])
    set_auth_cookies(response, access, refresh)
    return user_response(user_doc)


@api_router.post("/auth/login")
async def login(inp: LoginInput, request: Request, response: Response):
    email = inp.email.strip().lower()
    ip = request.client.host if request.client else "unknown"
    identifier = f"{ip}:{email}"
    await check_brute_force(db, identifier)
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(inp.password, user["password_hash"]):
        await record_failed_attempt(db, identifier)
        raise HTTPException(status_code=401, detail="Invalid email or password")
    await clear_failed_attempts(db, identifier)
    uid = str(user["_id"])
    access = create_access_token(uid, email, user.get("role", "referee"))
    refresh = create_refresh_token(uid)
    set_auth_cookies(response, access, refresh)
    user["_id"] = uid
    return user_response(user)


@api_router.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return {"message": "Logged out"}


@api_router.get("/auth/me")
async def me(request: Request):
    user = await get_current_user(request, db)
    return user_response(user)


@api_router.post("/auth/refresh")
async def refresh_token(request: Request, response: Response):
    import jwt as pyjwt
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(status_code=401, detail="No refresh token")
    try:
        payload = pyjwt.decode(token, os.environ["JWT_SECRET"], algorithms=["HS256"])
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Invalid token type")
        from bson import ObjectId
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        uid = str(user["_id"])
        access = create_access_token(uid, user["email"], user.get("role", "referee"))
        response.set_cookie(
            key="access_token",
            value=access,
            httponly=True,
            secure=False,
            samesite="lax",
            max_age=3600,
            path="/",
        )
        return {"message": "Token refreshed"}
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid refresh token")
