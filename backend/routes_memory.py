from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import List, Optional
from uuid import UUID
from datetime import datetime

from auth import require_auth
from database import get_db
from models import Memory, Employee, Project

router = APIRouter(prefix="/api/memories", tags=["memories"])


class MemoryCreate(BaseModel):
    content: str
    employee_id: Optional[str] = None  # NULL = shared memory
    project_id: Optional[str] = None  # NULL = not project-scoped
    category: Optional[str] = None  # preference, fact, context, instruction, other


class MemoryUpdate(BaseModel):
    content: Optional[str] = None
    category: Optional[str] = None


class MemoryResponse(BaseModel):
    id: str
    content: str
    employee_id: Optional[str]
    employee_name: Optional[str]
    project_id: Optional[str]
    project_name: Optional[str]
    category: Optional[str]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


@router.get("")
async def list_memories(
    employee_id: Optional[str] = None,
    project_id: Optional[str] = None,
    user: dict = Depends(require_auth),
    db: AsyncSession = Depends(get_db)
) -> List[MemoryResponse]:
    """List memories. Supports filtering by employee_id and/or project_id."""
    user_id = UUID(user["sub"])

    query = (
        select(Memory, Employee.name, Project.name)
        .outerjoin(Employee, Memory.employee_id == Employee.id)
        .outerjoin(Project, Memory.project_id == Project.id)
        .where(Memory.owner_id == user_id)
    )

    if employee_id:
        query = query.where(Memory.employee_id == UUID(employee_id))
    if project_id:
        query = query.where(Memory.project_id == UUID(project_id))

    query = query.order_by(Memory.created_at.desc())
    result = await db.execute(query)

    rows = result.all()
    return [
        MemoryResponse(
            id=str(memory.id),
            content=memory.content,
            employee_id=str(memory.employee_id) if memory.employee_id else None,
            employee_name=emp_name,
            project_id=str(memory.project_id) if memory.project_id else None,
            project_name=proj_name,
            category=memory.category,
            created_at=memory.created_at,
            updated_at=memory.updated_at
        )
        for memory, emp_name, proj_name in rows
    ]


@router.get("/all")
async def list_all_memories(
    user: dict = Depends(require_auth),
    db: AsyncSession = Depends(get_db)
) -> List[MemoryResponse]:
    """List all memories (shared + role-specific + project-scoped) for UI display."""
    user_id = UUID(user["sub"])

    result = await db.execute(
        select(Memory, Employee.name, Project.name)
        .outerjoin(Employee, Memory.employee_id == Employee.id)
        .outerjoin(Project, Memory.project_id == Project.id)
        .where(Memory.owner_id == user_id)
        .order_by(Memory.created_at.desc())
    )

    rows = result.all()
    return [
        MemoryResponse(
            id=str(memory.id),
            content=memory.content,
            employee_id=str(memory.employee_id) if memory.employee_id else None,
            employee_name=emp_name,
            project_id=str(memory.project_id) if memory.project_id else None,
            project_name=proj_name,
            category=memory.category,
            created_at=memory.created_at,
            updated_at=memory.updated_at
        )
        for memory, emp_name, proj_name in rows
    ]


@router.post("")
async def create_memory(
    data: MemoryCreate,
    user: dict = Depends(require_auth),
    db: AsyncSession = Depends(get_db)
) -> MemoryResponse:
    """Create a new memory. Can be shared, employee-specific, or project-scoped."""
    user_id = UUID(user["sub"])

    employee_uuid = None
    employee_name = None
    project_uuid = None
    project_name = None

    if data.employee_id:
        # Verify employee belongs to user
        result = await db.execute(
            select(Employee)
            .where(Employee.id == UUID(data.employee_id), Employee.owner_id == user_id)
        )
        employee = result.scalar_one_or_none()
        if employee is None:
            raise HTTPException(status_code=404, detail="Employee not found")
        employee_uuid = employee.id
        employee_name = employee.name

    if data.project_id:
        # Verify project belongs to user
        result = await db.execute(
            select(Project)
            .where(Project.id == UUID(data.project_id), Project.owner_id == user_id)
        )
        project = result.scalar_one_or_none()
        if project is None:
            raise HTTPException(status_code=404, detail="Project not found")
        project_uuid = project.id
        project_name = project.name

    memory = Memory(
        owner_id=user_id,
        employee_id=employee_uuid,
        project_id=project_uuid,
        content=data.content,
        category=data.category
    )
    db.add(memory)
    await db.commit()
    await db.refresh(memory)

    return MemoryResponse(
        id=str(memory.id),
        content=memory.content,
        employee_id=str(memory.employee_id) if memory.employee_id else None,
        employee_name=employee_name,
        project_id=str(memory.project_id) if memory.project_id else None,
        project_name=project_name,
        category=memory.category,
        created_at=memory.created_at,
        updated_at=memory.updated_at
    )


@router.put("/{memory_id}")
async def update_memory(
    memory_id: str,
    data: MemoryUpdate,
    user: dict = Depends(require_auth),
    db: AsyncSession = Depends(get_db)
) -> MemoryResponse:
    """Update a memory."""
    user_id = UUID(user["sub"])

    result = await db.execute(
        select(Memory, Employee.name, Project.name)
        .outerjoin(Employee, Memory.employee_id == Employee.id)
        .outerjoin(Project, Memory.project_id == Project.id)
        .where(Memory.id == UUID(memory_id), Memory.owner_id == user_id)
    )
    row = result.first()

    if row is None:
        raise HTTPException(status_code=404, detail="Memory not found")

    memory, employee_name, project_name = row
    if data.content is not None:
        memory.content = data.content
    if data.category is not None:
        memory.category = data.category
    await db.commit()
    await db.refresh(memory)

    return MemoryResponse(
        id=str(memory.id),
        content=memory.content,
        employee_id=str(memory.employee_id) if memory.employee_id else None,
        employee_name=employee_name,
        project_id=str(memory.project_id) if memory.project_id else None,
        project_name=project_name,
        category=memory.category,
        created_at=memory.created_at,
        updated_at=memory.updated_at
    )


@router.delete("/{memory_id}")
async def delete_memory(
    memory_id: str,
    user: dict = Depends(require_auth),
    db: AsyncSession = Depends(get_db)
):
    """Delete a memory."""
    user_id = UUID(user["sub"])

    result = await db.execute(
        select(Memory)
        .where(Memory.id == UUID(memory_id), Memory.owner_id == user_id)
    )
    memory = result.scalar_one_or_none()

    if memory is None:
        raise HTTPException(status_code=404, detail="Memory not found")

    await db.delete(memory)
    await db.commit()

    return {"status": "ok"}


async def get_memories_for_employee(db: AsyncSession, user_id: UUID, employee_id: UUID, project_id: UUID = None) -> List[str]:
    """Get all relevant memories for an employee (shared + role-specific + project-scoped).
    Used by chat to inject into context."""
    # Get shared memories (no employee, no project)
    shared_result = await db.execute(
        select(Memory.content)
        .where(
            Memory.owner_id == user_id,
            Memory.employee_id.is_(None),
            Memory.project_id.is_(None)
        )
        .order_by(Memory.created_at)
    )
    shared_memories = [row[0] for row in shared_result.all()]

    # Get role-specific memories
    role_result = await db.execute(
        select(Memory.content)
        .where(Memory.owner_id == user_id, Memory.employee_id == employee_id)
        .order_by(Memory.created_at)
    )
    role_memories = [row[0] for row in role_result.all()]

    # Get project-specific memories if project_id provided
    project_memories = []
    if project_id:
        project_result = await db.execute(
            select(Memory.content)
            .where(Memory.owner_id == user_id, Memory.project_id == project_id)
            .order_by(Memory.created_at)
        )
        project_memories = [row[0] for row in project_result.all()]

    return shared_memories + role_memories + project_memories


async def get_memories_for_project(db: AsyncSession, user_id: UUID, project_id: UUID) -> List[str]:
    """Get all memories relevant to a project (shared + project-scoped).
    Used by project chat to inject into context."""
    # Get shared memories
    shared_result = await db.execute(
        select(Memory.content)
        .where(
            Memory.owner_id == user_id,
            Memory.employee_id.is_(None),
            Memory.project_id.is_(None)
        )
        .order_by(Memory.created_at)
    )
    shared_memories = [row[0] for row in shared_result.all()]

    # Get project-specific memories
    project_result = await db.execute(
        select(Memory.content)
        .where(Memory.owner_id == user_id, Memory.project_id == project_id)
        .order_by(Memory.created_at)
    )
    project_memories = [row[0] for row in project_result.all()]

    return shared_memories + project_memories
