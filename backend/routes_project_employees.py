from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from pydantic import BaseModel
from typing import List
from uuid import UUID

from auth import require_auth
from database import get_db
from models import ProjectEmployee, Project, Employee

router = APIRouter(prefix="/api/projects", tags=["project-employees"])


class EmployeeAssignment(BaseModel):
    employee_id: str


@router.get("/{project_id}/employees")
async def get_project_employees(
    project_id: str,
    user: dict = Depends(require_auth),
    db: AsyncSession = Depends(get_db)
) -> List[dict]:
    """Get all employees assigned to a project."""
    user_id = UUID(user["sub"])

    # Verify project ownership
    result = await db.execute(
        select(Project).where(Project.id == UUID(project_id), Project.owner_id == user_id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Project not found")

    # Get assigned employees
    result = await db.execute(
        select(Employee)
        .join(ProjectEmployee, ProjectEmployee.employee_id == Employee.id)
        .where(ProjectEmployee.project_id == UUID(project_id))
    )
    employees = result.scalars().all()

    return [
        {
            "id": str(e.id),
            "name": e.name,
            "role": e.role,
            "model": e.model
        }
        for e in employees
    ]


@router.post("/{project_id}/employees")
async def assign_employee_to_project(
    project_id: str,
    data: EmployeeAssignment,
    user: dict = Depends(require_auth),
    db: AsyncSession = Depends(get_db)
) -> dict:
    """Assign an employee to a project."""
    user_id = UUID(user["sub"])

    # Verify project ownership
    result = await db.execute(
        select(Project).where(Project.id == UUID(project_id), Project.owner_id == user_id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Project not found")

    # Verify employee ownership
    result = await db.execute(
        select(Employee).where(Employee.id == UUID(data.employee_id), Employee.owner_id == user_id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Employee not found")

    # Check if already assigned
    result = await db.execute(
        select(ProjectEmployee).where(
            ProjectEmployee.project_id == UUID(project_id),
            ProjectEmployee.employee_id == UUID(data.employee_id)
        )
    )
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Employee already assigned to project")

    # Create assignment
    assignment = ProjectEmployee(
        project_id=UUID(project_id),
        employee_id=UUID(data.employee_id)
    )
    db.add(assignment)
    await db.commit()

    return {"status": "ok", "message": "Employee assigned to project"}


@router.delete("/{project_id}/employees/{employee_id}")
async def remove_employee_from_project(
    project_id: str,
    employee_id: str,
    user: dict = Depends(require_auth),
    db: AsyncSession = Depends(get_db)
):
    """Remove an employee from a project."""
    user_id = UUID(user["sub"])

    # Verify project ownership
    result = await db.execute(
        select(Project).where(Project.id == UUID(project_id), Project.owner_id == user_id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Project not found")

    # Delete assignment
    await db.execute(
        delete(ProjectEmployee).where(
            ProjectEmployee.project_id == UUID(project_id),
            ProjectEmployee.employee_id == UUID(employee_id)
        )
    )
    await db.commit()

    return {"status": "ok"}
