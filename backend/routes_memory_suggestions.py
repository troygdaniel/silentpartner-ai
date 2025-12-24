from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import List, Optional
from uuid import UUID
from datetime import datetime

from auth import require_auth
from database import get_db
from models import MemorySuggestion, Memory, Employee

router = APIRouter(prefix="/api/memory-suggestions", tags=["memory-suggestions"])


class MemorySuggestionCreate(BaseModel):
    employee_id: str
    project_id: Optional[str] = None
    content: str
    category: Optional[str] = None


class MemorySuggestionResponse(BaseModel):
    id: str
    employee_id: str
    employee_name: str
    project_id: Optional[str]
    content: str
    category: Optional[str]
    status: str
    created_at: str


@router.get("")
async def list_memory_suggestions(
    status: Optional[str] = "pending",
    employee_id: Optional[str] = None,
    user: dict = Depends(require_auth),
    db: AsyncSession = Depends(get_db)
) -> List[dict]:
    """List memory suggestions, optionally filtered by status or employee."""
    user_id = UUID(user["sub"])

    query = select(MemorySuggestion).where(MemorySuggestion.owner_id == user_id)

    if status:
        query = query.where(MemorySuggestion.status == status)
    if employee_id:
        query = query.where(MemorySuggestion.employee_id == UUID(employee_id))

    query = query.order_by(MemorySuggestion.created_at.desc())
    result = await db.execute(query)
    suggestions = result.scalars().all()

    # Get employee names
    employee_ids = list(set(s.employee_id for s in suggestions if s.employee_id))
    employees_map = {}
    if employee_ids:
        result = await db.execute(
            select(Employee).where(Employee.id.in_(employee_ids))
        )
        for emp in result.scalars().all():
            employees_map[emp.id] = emp.name

    return [
        {
            "id": str(s.id),
            "employee_id": str(s.employee_id),
            "employee_name": employees_map.get(s.employee_id, "Unknown"),
            "project_id": str(s.project_id) if s.project_id else None,
            "content": s.content,
            "category": s.category,
            "status": s.status,
            "created_at": s.created_at.isoformat() if s.created_at else None
        }
        for s in suggestions
    ]


@router.post("")
async def create_memory_suggestion(
    data: MemorySuggestionCreate,
    user: dict = Depends(require_auth),
    db: AsyncSession = Depends(get_db)
) -> dict:
    """
    Create a memory suggestion for user approval.
    This enforces the 'suggest then approve' rule from the Role Definition Contract.
    """
    user_id = UUID(user["sub"])

    # Verify employee exists and belongs to user
    result = await db.execute(
        select(Employee)
        .where(Employee.id == UUID(data.employee_id), Employee.owner_id == user_id)
    )
    employee = result.scalar_one_or_none()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")

    suggestion = MemorySuggestion(
        owner_id=user_id,
        employee_id=UUID(data.employee_id),
        project_id=UUID(data.project_id) if data.project_id else None,
        content=data.content,
        category=data.category,
        status="pending"
    )
    db.add(suggestion)
    await db.commit()
    await db.refresh(suggestion)

    return {
        "id": str(suggestion.id),
        "employee_id": str(suggestion.employee_id),
        "employee_name": employee.name,
        "project_id": str(suggestion.project_id) if suggestion.project_id else None,
        "content": suggestion.content,
        "category": suggestion.category,
        "status": suggestion.status,
        "created_at": suggestion.created_at.isoformat() if suggestion.created_at else None
    }


@router.post("/{suggestion_id}/approve")
async def approve_memory_suggestion(
    suggestion_id: str,
    user: dict = Depends(require_auth),
    db: AsyncSession = Depends(get_db)
) -> dict:
    """
    Approve a memory suggestion, converting it to an actual memory.
    Tracks provenance: the memory is linked to the employee that suggested it.
    """
    user_id = UUID(user["sub"])

    # Get the suggestion
    result = await db.execute(
        select(MemorySuggestion)
        .where(MemorySuggestion.id == UUID(suggestion_id), MemorySuggestion.owner_id == user_id)
    )
    suggestion = result.scalar_one_or_none()

    if suggestion is None:
        raise HTTPException(status_code=404, detail="Suggestion not found")

    if suggestion.status != "pending":
        raise HTTPException(status_code=400, detail=f"Suggestion already {suggestion.status}")

    # Create the memory (with provenance - linked to the employee that suggested it)
    memory = Memory(
        owner_id=user_id,
        employee_id=suggestion.employee_id,  # Provenance: who suggested this
        project_id=suggestion.project_id,
        content=suggestion.content,
        category=suggestion.category
    )
    db.add(memory)

    # Mark suggestion as approved
    suggestion.status = "approved"
    suggestion.resolved_at = datetime.utcnow()

    await db.commit()
    await db.refresh(memory)

    return {
        "status": "approved",
        "memory_id": str(memory.id),
        "suggestion_id": str(suggestion.id),
        "content": memory.content,
        "category": memory.category,
        "suggested_by_employee_id": str(suggestion.employee_id)
    }


@router.post("/{suggestion_id}/reject")
async def reject_memory_suggestion(
    suggestion_id: str,
    user: dict = Depends(require_auth),
    db: AsyncSession = Depends(get_db)
) -> dict:
    """Reject a memory suggestion."""
    user_id = UUID(user["sub"])

    # Get the suggestion
    result = await db.execute(
        select(MemorySuggestion)
        .where(MemorySuggestion.id == UUID(suggestion_id), MemorySuggestion.owner_id == user_id)
    )
    suggestion = result.scalar_one_or_none()

    if suggestion is None:
        raise HTTPException(status_code=404, detail="Suggestion not found")

    if suggestion.status != "pending":
        raise HTTPException(status_code=400, detail=f"Suggestion already {suggestion.status}")

    # Mark as rejected
    suggestion.status = "rejected"
    suggestion.resolved_at = datetime.utcnow()

    await db.commit()

    return {
        "status": "rejected",
        "suggestion_id": str(suggestion.id)
    }


@router.get("/pending-count")
async def get_pending_count(
    user: dict = Depends(require_auth),
    db: AsyncSession = Depends(get_db)
) -> dict:
    """Get count of pending memory suggestions (for UI badges)."""
    user_id = UUID(user["sub"])

    result = await db.execute(
        select(MemorySuggestion)
        .where(MemorySuggestion.owner_id == user_id, MemorySuggestion.status == "pending")
    )
    pending = result.scalars().all()

    return {
        "pending_count": len(pending)
    }


@router.post("/bulk-approve")
async def bulk_approve_suggestions(
    suggestion_ids: List[str],
    user: dict = Depends(require_auth),
    db: AsyncSession = Depends(get_db)
) -> dict:
    """Approve multiple memory suggestions at once."""
    user_id = UUID(user["sub"])

    approved = []
    failed = []

    for sid in suggestion_ids:
        result = await db.execute(
            select(MemorySuggestion)
            .where(MemorySuggestion.id == UUID(sid), MemorySuggestion.owner_id == user_id)
        )
        suggestion = result.scalar_one_or_none()

        if suggestion is None or suggestion.status != "pending":
            failed.append(sid)
            continue

        # Create memory
        memory = Memory(
            owner_id=user_id,
            employee_id=suggestion.employee_id,
            project_id=suggestion.project_id,
            content=suggestion.content,
            category=suggestion.category
        )
        db.add(memory)

        # Update suggestion
        suggestion.status = "approved"
        suggestion.resolved_at = datetime.utcnow()

        approved.append(sid)

    await db.commit()

    return {
        "approved": approved,
        "failed": failed,
        "approved_count": len(approved),
        "failed_count": len(failed)
    }


@router.post("/bulk-reject")
async def bulk_reject_suggestions(
    suggestion_ids: List[str],
    user: dict = Depends(require_auth),
    db: AsyncSession = Depends(get_db)
) -> dict:
    """Reject multiple memory suggestions at once."""
    user_id = UUID(user["sub"])

    rejected = []
    failed = []

    for sid in suggestion_ids:
        result = await db.execute(
            select(MemorySuggestion)
            .where(MemorySuggestion.id == UUID(sid), MemorySuggestion.owner_id == user_id)
        )
        suggestion = result.scalar_one_or_none()

        if suggestion is None or suggestion.status != "pending":
            failed.append(sid)
            continue

        suggestion.status = "rejected"
        suggestion.resolved_at = datetime.utcnow()

        rejected.append(sid)

    await db.commit()

    return {
        "rejected": rejected,
        "failed": failed,
        "rejected_count": len(rejected),
        "failed_count": len(failed)
    }
