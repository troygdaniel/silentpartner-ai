from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, func
from pydantic import BaseModel
from typing import List, Optional
from uuid import UUID

from auth import require_auth
from database import get_db
from models import ConversationTag, Project, Employee

router = APIRouter(prefix="/api/tags", tags=["tags"])


class TagCreate(BaseModel):
    tag: str
    project_id: Optional[str] = None
    employee_id: Optional[str] = None


@router.get("")
async def list_all_tags(
    user: dict = Depends(require_auth),
    db: AsyncSession = Depends(get_db)
) -> List[str]:
    """Get all unique tags for the user."""
    user_id = UUID(user["sub"])

    result = await db.execute(
        select(ConversationTag.tag)
        .where(ConversationTag.owner_id == user_id)
        .distinct()
        .order_by(ConversationTag.tag)
    )
    return [row[0] for row in result.fetchall()]


@router.get("/project/{project_id}")
async def get_project_tags(
    project_id: str,
    user: dict = Depends(require_auth),
    db: AsyncSession = Depends(get_db)
) -> List[str]:
    """Get all tags for a project."""
    user_id = UUID(user["sub"])

    result = await db.execute(
        select(ConversationTag.tag)
        .where(
            ConversationTag.owner_id == user_id,
            ConversationTag.project_id == UUID(project_id)
        )
        .distinct()
    )
    return [row[0] for row in result.fetchall()]


@router.get("/dm/{employee_id}")
async def get_dm_tags(
    employee_id: str,
    user: dict = Depends(require_auth),
    db: AsyncSession = Depends(get_db)
) -> List[str]:
    """Get all tags for a DM conversation."""
    user_id = UUID(user["sub"])

    result = await db.execute(
        select(ConversationTag.tag)
        .where(
            ConversationTag.owner_id == user_id,
            ConversationTag.employee_id == UUID(employee_id),
            ConversationTag.project_id.is_(None)
        )
        .distinct()
    )
    return [row[0] for row in result.fetchall()]


@router.post("")
async def add_tag(
    data: TagCreate,
    user: dict = Depends(require_auth),
    db: AsyncSession = Depends(get_db)
) -> dict:
    """Add a tag to a conversation."""
    user_id = UUID(user["sub"])

    if not data.project_id and not data.employee_id:
        raise HTTPException(status_code=400, detail="Must specify project_id or employee_id")

    # Check for duplicate
    query = select(ConversationTag).where(
        ConversationTag.owner_id == user_id,
        ConversationTag.tag == data.tag
    )
    if data.project_id:
        query = query.where(ConversationTag.project_id == UUID(data.project_id))
    if data.employee_id and not data.project_id:
        query = query.where(
            ConversationTag.employee_id == UUID(data.employee_id),
            ConversationTag.project_id.is_(None)
        )

    result = await db.execute(query)
    if result.scalar_one_or_none():
        return {"status": "ok", "message": "Tag already exists"}

    # Create tag
    tag = ConversationTag(
        owner_id=user_id,
        project_id=UUID(data.project_id) if data.project_id else None,
        employee_id=UUID(data.employee_id) if data.employee_id else None,
        tag=data.tag
    )
    db.add(tag)
    await db.commit()

    return {"status": "ok", "tag": data.tag}


@router.delete("/project/{project_id}/{tag}")
async def remove_project_tag(
    project_id: str,
    tag: str,
    user: dict = Depends(require_auth),
    db: AsyncSession = Depends(get_db)
):
    """Remove a tag from a project."""
    user_id = UUID(user["sub"])

    await db.execute(
        delete(ConversationTag).where(
            ConversationTag.owner_id == user_id,
            ConversationTag.project_id == UUID(project_id),
            ConversationTag.tag == tag
        )
    )
    await db.commit()

    return {"status": "ok"}


@router.delete("/dm/{employee_id}/{tag}")
async def remove_dm_tag(
    employee_id: str,
    tag: str,
    user: dict = Depends(require_auth),
    db: AsyncSession = Depends(get_db)
):
    """Remove a tag from a DM conversation."""
    user_id = UUID(user["sub"])

    await db.execute(
        delete(ConversationTag).where(
            ConversationTag.owner_id == user_id,
            ConversationTag.employee_id == UUID(employee_id),
            ConversationTag.project_id.is_(None),
            ConversationTag.tag == tag
        )
    )
    await db.commit()

    return {"status": "ok"}
