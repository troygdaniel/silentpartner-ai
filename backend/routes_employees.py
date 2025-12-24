from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional
from uuid import UUID

from auth import require_auth
from database import get_db
from models import Employee

router = APIRouter(prefix="/api/employees", tags=["employees"])


class EmployeeCreate(BaseModel):
    name: str
    role: Optional[str] = None
    instructions: Optional[str] = None
    model: str = "gpt-4"


class EmployeeUpdate(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    instructions: Optional[str] = None
    model: Optional[str] = None
    starred: Optional[bool] = None
    archived: Optional[bool] = None


class EmployeeResponse(BaseModel):
    id: str
    name: str
    role: Optional[str]
    instructions: Optional[str]
    model: str
    is_default: bool
    starred: bool
    archived: bool

    class Config:
        from_attributes = True


@router.get("")
async def list_employees(
    user: dict = Depends(require_auth),
    db: AsyncSession = Depends(get_db)
):
    """List all employees for the current user."""
    user_id = UUID(user["sub"])
    result = await db.execute(
        select(Employee)
        .where(Employee.owner_id == user_id)
        .order_by(Employee.is_default.desc(), Employee.created_at)
    )
    employees = result.scalars().all()

    return [
        {
            "id": str(emp.id),
            "name": emp.name,
            "role": emp.role,
            "instructions": emp.instructions,
            "model": emp.model,
            "is_default": emp.is_default,
            "starred": emp.starred or False,
            "archived": emp.archived or False
        }
        for emp in employees
    ]


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_employee(
    data: EmployeeCreate,
    user: dict = Depends(require_auth),
    db: AsyncSession = Depends(get_db)
):
    """Create a new employee."""
    user_id = UUID(user["sub"])

    employee = Employee(
        owner_id=user_id,
        name=data.name,
        role=data.role,
        instructions=data.instructions,
        model=data.model,
        is_default=False
    )
    db.add(employee)
    await db.commit()
    await db.refresh(employee)

    return {
        "id": str(employee.id),
        "name": employee.name,
        "role": employee.role,
        "instructions": employee.instructions,
        "model": employee.model,
        "is_default": employee.is_default,
        "starred": employee.starred or False,
        "archived": employee.archived or False
    }


@router.get("/{employee_id}")
async def get_employee(
    employee_id: UUID,
    user: dict = Depends(require_auth),
    db: AsyncSession = Depends(get_db)
):
    """Get a specific employee."""
    user_id = UUID(user["sub"])

    result = await db.execute(
        select(Employee)
        .where(Employee.id == employee_id, Employee.owner_id == user_id)
    )
    employee = result.scalar_one_or_none()

    if employee is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Employee not found"
        )

    return {
        "id": str(employee.id),
        "name": employee.name,
        "role": employee.role,
        "instructions": employee.instructions,
        "model": employee.model,
        "is_default": employee.is_default,
        "starred": employee.starred or False,
        "archived": employee.archived or False
    }


@router.put("/{employee_id}")
async def update_employee(
    employee_id: UUID,
    data: EmployeeUpdate,
    user: dict = Depends(require_auth),
    db: AsyncSession = Depends(get_db)
):
    """Update an employee. Default PM can be edited but not renamed."""
    user_id = UUID(user["sub"])

    result = await db.execute(
        select(Employee)
        .where(Employee.id == employee_id, Employee.owner_id == user_id)
    )
    employee = result.scalar_one_or_none()

    if employee is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Employee not found"
        )

    # Default PM name cannot be changed
    if employee.is_default and data.name is not None and data.name != "Project Manager":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot rename the default Project Manager"
        )

    # Update fields
    if data.name is not None:
        employee.name = data.name
    if data.role is not None:
        employee.role = data.role
    if data.instructions is not None:
        employee.instructions = data.instructions
    if data.model is not None:
        employee.model = data.model
    if data.starred is not None:
        employee.starred = data.starred
    if data.archived is not None:
        employee.archived = data.archived

    await db.commit()
    await db.refresh(employee)

    return {
        "id": str(employee.id),
        "name": employee.name,
        "role": employee.role,
        "instructions": employee.instructions,
        "model": employee.model,
        "is_default": employee.is_default,
        "starred": employee.starred or False,
        "archived": employee.archived or False
    }


@router.delete("/{employee_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_employee(
    employee_id: UUID,
    user: dict = Depends(require_auth),
    db: AsyncSession = Depends(get_db)
):
    """Delete an employee. Default PM cannot be deleted."""
    user_id = UUID(user["sub"])

    result = await db.execute(
        select(Employee)
        .where(Employee.id == employee_id, Employee.owner_id == user_id)
    )
    employee = result.scalar_one_or_none()

    if employee is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Employee not found"
        )

    if employee.is_default:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete the default Project Manager"
        )

    await db.delete(employee)
    await db.commit()
