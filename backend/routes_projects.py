from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import List, Optional
from uuid import UUID

from auth import require_auth
from database import get_db
from models import Project

router = APIRouter(prefix="/api/projects", tags=["projects"])


class ProjectCreate(BaseModel):
    name: str
    description: Optional[str] = None


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    starred: Optional[bool] = None


class ProjectResponse(BaseModel):
    id: str
    name: str
    description: Optional[str]
    status: str
    starred: bool
    created_at: str

    class Config:
        from_attributes = True


@router.get("")
async def list_projects(
    user: dict = Depends(require_auth),
    db: AsyncSession = Depends(get_db)
) -> List[dict]:
    """List all projects for the current user."""
    user_id = UUID(user["sub"])
    result = await db.execute(
        select(Project)
        .where(Project.owner_id == user_id)
        .order_by(Project.created_at.desc())
    )
    projects = result.scalars().all()
    return [
        {
            "id": str(p.id),
            "name": p.name,
            "description": p.description,
            "status": p.status,
            "starred": p.starred or False,
            "created_at": p.created_at.isoformat() if p.created_at else None
        }
        for p in projects
    ]


@router.post("")
async def create_project(
    project: ProjectCreate,
    user: dict = Depends(require_auth),
    db: AsyncSession = Depends(get_db)
) -> dict:
    """Create a new project."""
    user_id = UUID(user["sub"])

    new_project = Project(
        owner_id=user_id,
        name=project.name,
        description=project.description
    )
    db.add(new_project)
    await db.commit()
    await db.refresh(new_project)

    return {
        "id": str(new_project.id),
        "name": new_project.name,
        "description": new_project.description,
        "status": new_project.status,
        "starred": new_project.starred or False,
        "created_at": new_project.created_at.isoformat() if new_project.created_at else None
    }


@router.get("/{project_id}")
async def get_project(
    project_id: str,
    user: dict = Depends(require_auth),
    db: AsyncSession = Depends(get_db)
) -> dict:
    """Get a specific project."""
    user_id = UUID(user["sub"])
    result = await db.execute(
        select(Project)
        .where(Project.id == UUID(project_id), Project.owner_id == user_id)
    )
    project = result.scalar_one_or_none()

    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")

    return {
        "id": str(project.id),
        "name": project.name,
        "description": project.description,
        "status": project.status,
        "starred": project.starred or False,
        "created_at": project.created_at.isoformat() if project.created_at else None
    }


@router.put("/{project_id}")
async def update_project(
    project_id: str,
    update: ProjectUpdate,
    user: dict = Depends(require_auth),
    db: AsyncSession = Depends(get_db)
) -> dict:
    """Update a project."""
    user_id = UUID(user["sub"])
    result = await db.execute(
        select(Project)
        .where(Project.id == UUID(project_id), Project.owner_id == user_id)
    )
    project = result.scalar_one_or_none()

    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")

    if update.name is not None:
        project.name = update.name
    if update.description is not None:
        project.description = update.description
    if update.status is not None:
        if update.status not in ["active", "completed", "archived"]:
            raise HTTPException(status_code=400, detail="Invalid status")
        project.status = update.status
    if update.starred is not None:
        project.starred = update.starred

    await db.commit()
    await db.refresh(project)

    return {
        "id": str(project.id),
        "name": project.name,
        "description": project.description,
        "status": project.status,
        "starred": project.starred or False,
        "created_at": project.created_at.isoformat() if project.created_at else None
    }


@router.delete("/{project_id}")
async def delete_project(
    project_id: str,
    user: dict = Depends(require_auth),
    db: AsyncSession = Depends(get_db)
):
    """Delete a project."""
    user_id = UUID(user["sub"])
    result = await db.execute(
        select(Project)
        .where(Project.id == UUID(project_id), Project.owner_id == user_id)
    )
    project = result.scalar_one_or_none()

    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")

    await db.delete(project)
    await db.commit()

    return {"status": "ok"}
