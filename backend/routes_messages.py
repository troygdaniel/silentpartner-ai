from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import List, Optional
from uuid import UUID

from auth import require_auth
from database import get_db
from models import Message, Project, Employee

router = APIRouter(prefix="/api/messages", tags=["messages"])


class MessageCreate(BaseModel):
    content: str
    role: str  # "user" or "assistant"
    project_id: Optional[str] = None
    employee_id: Optional[str] = None


class MessageResponse(BaseModel):
    id: str
    role: str
    content: str
    project_id: Optional[str]
    employee_id: Optional[str]
    created_at: str


@router.get("/project/{project_id}")
async def get_project_messages(
    project_id: str,
    user: dict = Depends(require_auth),
    db: AsyncSession = Depends(get_db)
) -> List[dict]:
    """Get all messages for a project channel."""
    user_id = UUID(user["sub"])

    # Verify project ownership
    result = await db.execute(
        select(Project)
        .where(Project.id == UUID(project_id), Project.owner_id == user_id)
    )
    project = result.scalar_one_or_none()
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")

    # Get messages
    result = await db.execute(
        select(Message)
        .where(Message.project_id == UUID(project_id), Message.owner_id == user_id)
        .order_by(Message.created_at.asc())
    )
    messages = result.scalars().all()

    return [
        {
            "id": str(m.id),
            "role": m.role,
            "content": m.content,
            "project_id": str(m.project_id) if m.project_id else None,
            "employee_id": str(m.employee_id) if m.employee_id else None,
            "created_at": m.created_at.isoformat() if m.created_at else None
        }
        for m in messages
    ]


@router.get("/dm/{employee_id}")
async def get_dm_messages(
    employee_id: str,
    user: dict = Depends(require_auth),
    db: AsyncSession = Depends(get_db)
) -> List[dict]:
    """Get all direct messages with an employee."""
    user_id = UUID(user["sub"])

    # Verify employee ownership
    result = await db.execute(
        select(Employee)
        .where(Employee.id == UUID(employee_id), Employee.owner_id == user_id)
    )
    employee = result.scalar_one_or_none()
    if employee is None:
        raise HTTPException(status_code=404, detail="Employee not found")

    # Get DM messages (project_id is NULL for DMs)
    result = await db.execute(
        select(Message)
        .where(
            Message.employee_id == UUID(employee_id),
            Message.owner_id == user_id,
            Message.project_id.is_(None)
        )
        .order_by(Message.created_at.asc())
    )
    messages = result.scalars().all()

    return [
        {
            "id": str(m.id),
            "role": m.role,
            "content": m.content,
            "project_id": None,
            "employee_id": str(m.employee_id) if m.employee_id else None,
            "created_at": m.created_at.isoformat() if m.created_at else None
        }
        for m in messages
    ]


@router.post("")
async def save_message(
    message: MessageCreate,
    user: dict = Depends(require_auth),
    db: AsyncSession = Depends(get_db)
) -> dict:
    """Save a message to the database."""
    user_id = UUID(user["sub"])

    new_message = Message(
        owner_id=user_id,
        role=message.role,
        content=message.content,
        project_id=UUID(message.project_id) if message.project_id else None,
        employee_id=UUID(message.employee_id) if message.employee_id else None
    )
    db.add(new_message)
    await db.commit()
    await db.refresh(new_message)

    return {
        "id": str(new_message.id),
        "role": new_message.role,
        "content": new_message.content,
        "project_id": str(new_message.project_id) if new_message.project_id else None,
        "employee_id": str(new_message.employee_id) if new_message.employee_id else None,
        "created_at": new_message.created_at.isoformat() if new_message.created_at else None
    }


@router.delete("/project/{project_id}")
async def clear_project_messages(
    project_id: str,
    user: dict = Depends(require_auth),
    db: AsyncSession = Depends(get_db)
):
    """Clear all messages in a project channel."""
    user_id = UUID(user["sub"])

    # Verify project ownership
    result = await db.execute(
        select(Project)
        .where(Project.id == UUID(project_id), Project.owner_id == user_id)
    )
    project = result.scalar_one_or_none()
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")

    # Delete messages
    result = await db.execute(
        select(Message)
        .where(Message.project_id == UUID(project_id), Message.owner_id == user_id)
    )
    messages = result.scalars().all()
    for m in messages:
        await db.delete(m)
    await db.commit()

    return {"status": "ok"}


@router.delete("/dm/{employee_id}")
async def clear_dm_messages(
    employee_id: str,
    user: dict = Depends(require_auth),
    db: AsyncSession = Depends(get_db)
):
    """Clear all direct messages with an employee."""
    user_id = UUID(user["sub"])

    # Verify employee ownership
    result = await db.execute(
        select(Employee)
        .where(Employee.id == UUID(employee_id), Employee.owner_id == user_id)
    )
    employee = result.scalar_one_or_none()
    if employee is None:
        raise HTTPException(status_code=404, detail="Employee not found")

    # Delete DM messages
    result = await db.execute(
        select(Message)
        .where(
            Message.employee_id == UUID(employee_id),
            Message.owner_id == user_id,
            Message.project_id.is_(None)
        )
    )
    messages = result.scalars().all()
    for m in messages:
        await db.delete(m)
    await db.commit()

    return {"status": "ok"}
