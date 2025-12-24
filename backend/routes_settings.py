from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional
from uuid import UUID

from auth import require_auth
from database import get_db
from models import User
from crypto import encrypt_api_key, decrypt_api_key

router = APIRouter(prefix="/api/settings", tags=["settings"])


class ApiKeysUpdate(BaseModel):
    openai_api_key: Optional[str] = None
    anthropic_api_key: Optional[str] = None


class ApiKeysStatus(BaseModel):
    has_openai_key: bool
    has_anthropic_key: bool


@router.get("/api-keys")
async def get_api_keys_status(
    user: dict = Depends(require_auth),
    db: AsyncSession = Depends(get_db)
) -> ApiKeysStatus:
    """Check which API keys are configured (doesn't reveal the keys)."""
    user_id = UUID(user["sub"])
    result = await db.execute(select(User).where(User.id == user_id))
    db_user = result.scalar_one_or_none()

    if db_user is None:
        raise HTTPException(status_code=404, detail="User not found")

    return ApiKeysStatus(
        has_openai_key=bool(db_user.openai_api_key),
        has_anthropic_key=bool(db_user.anthropic_api_key)
    )


@router.put("/api-keys")
async def update_api_keys(
    data: ApiKeysUpdate,
    user: dict = Depends(require_auth),
    db: AsyncSession = Depends(get_db)
):
    """Update API keys. Pass empty string to remove a key."""
    user_id = UUID(user["sub"])
    result = await db.execute(select(User).where(User.id == user_id))
    db_user = result.scalar_one_or_none()

    if db_user is None:
        raise HTTPException(status_code=404, detail="User not found")

    # Update keys if provided
    if data.openai_api_key is not None:
        if data.openai_api_key == "":
            db_user.openai_api_key = None
        else:
            db_user.openai_api_key = encrypt_api_key(data.openai_api_key)

    if data.anthropic_api_key is not None:
        if data.anthropic_api_key == "":
            db_user.anthropic_api_key = None
        else:
            db_user.anthropic_api_key = encrypt_api_key(data.anthropic_api_key)

    await db.commit()

    return {
        "status": "ok",
        "has_openai_key": bool(db_user.openai_api_key),
        "has_anthropic_key": bool(db_user.anthropic_api_key)
    }
