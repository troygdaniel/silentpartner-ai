from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import List, Optional
from uuid import UUID
import json

from auth import require_auth
from database import get_db
from models import RoleTemplate, Employee

router = APIRouter(prefix="/api/roles", tags=["roles"])


class RoleTemplateResponse(BaseModel):
    id: str
    slug: str
    name: str
    description: Optional[str]
    purpose: Optional[str]
    boundaries_does: List[str]
    boundaries_does_not: List[str]
    instructions: Optional[str]
    recommended_integrations: List[str]
    recommended_model: str
    is_default: bool
    is_undeletable: bool
    version: int


def parse_json_list(value: Optional[str]) -> List[str]:
    """Parse JSON string to list, return empty list if invalid."""
    if not value:
        return []
    try:
        return json.loads(value)
    except (json.JSONDecodeError, TypeError):
        return []


def template_to_response(template: RoleTemplate) -> dict:
    """Convert a RoleTemplate model to API response format."""
    return {
        "id": str(template.id),
        "slug": template.slug,
        "name": template.name,
        "description": template.description,
        "purpose": template.purpose,
        "boundaries_does": parse_json_list(template.boundaries_does),
        "boundaries_does_not": parse_json_list(template.boundaries_does_not),
        "instructions": template.instructions,
        "recommended_integrations": parse_json_list(template.recommended_integrations),
        "recommended_model": template.recommended_model or "gpt-4",
        "is_default": template.is_default or False,
        "is_undeletable": template.is_undeletable or False,
        "version": template.version or 1
    }


@router.get("/templates")
async def list_role_templates(
    user: dict = Depends(require_auth),
    db: AsyncSession = Depends(get_db)
) -> List[dict]:
    """Get all available role templates (system-provided roles)."""
    result = await db.execute(
        select(RoleTemplate).order_by(RoleTemplate.name)
    )
    templates = result.scalars().all()
    return [template_to_response(t) for t in templates]


@router.get("/templates/{template_id}")
async def get_role_template(
    template_id: str,
    user: dict = Depends(require_auth),
    db: AsyncSession = Depends(get_db)
) -> dict:
    """Get a specific role template by ID."""
    result = await db.execute(
        select(RoleTemplate).where(RoleTemplate.id == UUID(template_id))
    )
    template = result.scalar_one_or_none()

    if template is None:
        raise HTTPException(status_code=404, detail="Role template not found")

    return template_to_response(template)


@router.get("/templates/by-slug/{slug}")
async def get_role_template_by_slug(
    slug: str,
    user: dict = Depends(require_auth),
    db: AsyncSession = Depends(get_db)
) -> dict:
    """Get a specific role template by slug."""
    result = await db.execute(
        select(RoleTemplate).where(RoleTemplate.slug == slug)
    )
    template = result.scalar_one_or_none()

    if template is None:
        raise HTTPException(status_code=404, detail="Role template not found")

    return template_to_response(template)


class CreateEmployeeFromTemplate(BaseModel):
    name: Optional[str] = None  # Override the default name
    user_instructions: Optional[str] = None  # Additional user customizations


@router.post("/templates/{template_id}/create-employee")
async def create_employee_from_template(
    template_id: str,
    data: CreateEmployeeFromTemplate = CreateEmployeeFromTemplate(),
    user: dict = Depends(require_auth),
    db: AsyncSession = Depends(get_db)
) -> dict:
    """Create a new employee from a role template (one-click add)."""
    user_id = UUID(user["sub"])

    # Get the template
    result = await db.execute(
        select(RoleTemplate).where(RoleTemplate.id == UUID(template_id))
    )
    template = result.scalar_one_or_none()

    if template is None:
        raise HTTPException(status_code=404, detail="Role template not found")

    # Create employee based on template
    employee = Employee(
        owner_id=user_id,
        name=data.name or template.name,
        role=template.name,
        instructions=template.instructions,  # Base instructions from template
        user_instructions=data.user_instructions,  # User's additions
        role_template_id=template.id,
        role_template_version=template.version,
        model=template.recommended_model or "gpt-4",
        is_default=template.is_default
    )

    db.add(employee)
    await db.commit()
    await db.refresh(employee)

    return {
        "id": str(employee.id),
        "name": employee.name,
        "role": employee.role,
        "instructions": employee.instructions,
        "user_instructions": employee.user_instructions,
        "role_template_id": str(employee.role_template_id) if employee.role_template_id else None,
        "role_template_version": employee.role_template_version,
        "model": employee.model,
        "is_default": employee.is_default,
        "created_at": employee.created_at.isoformat() if employee.created_at else None
    }


@router.get("/employee/{employee_id}/template-info")
async def get_employee_template_info(
    employee_id: str,
    user: dict = Depends(require_auth),
    db: AsyncSession = Depends(get_db)
) -> dict:
    """Get template information for an employee, including if updates are available."""
    user_id = UUID(user["sub"])

    # Get the employee
    result = await db.execute(
        select(Employee)
        .where(Employee.id == UUID(employee_id), Employee.owner_id == user_id)
    )
    employee = result.scalar_one_or_none()

    if employee is None:
        raise HTTPException(status_code=404, detail="Employee not found")

    if employee.role_template_id is None:
        return {
            "has_template": False,
            "template": None,
            "employee_version": None,
            "latest_version": None,
            "update_available": False
        }

    # Get the template
    result = await db.execute(
        select(RoleTemplate).where(RoleTemplate.id == employee.role_template_id)
    )
    template = result.scalar_one_or_none()

    if template is None:
        return {
            "has_template": False,
            "template": None,
            "employee_version": employee.role_template_version,
            "latest_version": None,
            "update_available": False,
            "template_deleted": True
        }

    return {
        "has_template": True,
        "template": template_to_response(template),
        "employee_version": employee.role_template_version,
        "latest_version": template.version,
        "update_available": (employee.role_template_version or 0) < (template.version or 1)
    }


class CloneEmployeeRequest(BaseModel):
    new_name: Optional[str] = None


@router.post("/employee/{employee_id}/clone")
async def clone_employee(
    employee_id: str,
    data: CloneEmployeeRequest,
    user: dict = Depends(require_auth),
    db: AsyncSession = Depends(get_db)
) -> dict:
    """Clone an existing employee (creates a copy with the same role template)."""
    user_id = UUID(user["sub"])

    # Get the original employee
    result = await db.execute(
        select(Employee)
        .where(Employee.id == UUID(employee_id), Employee.owner_id == user_id)
    )
    original = result.scalar_one_or_none()

    if original is None:
        raise HTTPException(status_code=404, detail="Employee not found")

    # Create the clone
    clone = Employee(
        owner_id=user_id,
        name=data.new_name or f"{original.name} (Copy)",
        role=original.role,
        instructions=original.instructions,
        user_instructions=original.user_instructions,
        role_template_id=original.role_template_id,
        role_template_version=original.role_template_version,
        model=original.model,
        is_default=False,  # Clones are never default
        starred=False,
        archived=False
    )

    db.add(clone)
    await db.commit()
    await db.refresh(clone)

    return {
        "id": str(clone.id),
        "name": clone.name,
        "role": clone.role,
        "instructions": clone.instructions,
        "user_instructions": clone.user_instructions,
        "role_template_id": str(clone.role_template_id) if clone.role_template_id else None,
        "role_template_version": clone.role_template_version,
        "model": clone.model,
        "is_default": clone.is_default,
        "created_at": clone.created_at.isoformat() if clone.created_at else None
    }


class ResetEmployeeRequest(BaseModel):
    preserve_user_instructions: bool = True  # Keep user's customizations by default


@router.post("/employee/{employee_id}/reset-to-template")
async def reset_employee_to_template(
    employee_id: str,
    data: ResetEmployeeRequest,
    user: dict = Depends(require_auth),
    db: AsyncSession = Depends(get_db)
) -> dict:
    """Reset an employee's instructions to the current template defaults."""
    user_id = UUID(user["sub"])

    # Get the employee
    result = await db.execute(
        select(Employee)
        .where(Employee.id == UUID(employee_id), Employee.owner_id == user_id)
    )
    employee = result.scalar_one_or_none()

    if employee is None:
        raise HTTPException(status_code=404, detail="Employee not found")

    if employee.role_template_id is None:
        raise HTTPException(status_code=400, detail="Employee is not based on a template")

    # Get the template
    result = await db.execute(
        select(RoleTemplate).where(RoleTemplate.id == employee.role_template_id)
    )
    template = result.scalar_one_or_none()

    if template is None:
        raise HTTPException(status_code=404, detail="Template no longer exists")

    # Reset to template defaults
    employee.instructions = template.instructions
    employee.role_template_version = template.version
    employee.model = template.recommended_model or employee.model

    # Optionally clear user instructions
    if not data.preserve_user_instructions:
        employee.user_instructions = None

    await db.commit()
    await db.refresh(employee)

    return {
        "id": str(employee.id),
        "name": employee.name,
        "role": employee.role,
        "instructions": employee.instructions,
        "user_instructions": employee.user_instructions,
        "role_template_id": str(employee.role_template_id) if employee.role_template_id else None,
        "role_template_version": employee.role_template_version,
        "model": employee.model,
        "is_default": employee.is_default,
        "reset_to_version": template.version
    }


@router.get("/employee/{employee_id}/can-delete")
async def can_delete_employee(
    employee_id: str,
    user: dict = Depends(require_auth),
    db: AsyncSession = Depends(get_db)
) -> dict:
    """Check if an employee can be deleted (Project Manager default cannot be deleted)."""
    user_id = UUID(user["sub"])

    # Get the employee
    result = await db.execute(
        select(Employee)
        .where(Employee.id == UUID(employee_id), Employee.owner_id == user_id)
    )
    employee = result.scalar_one_or_none()

    if employee is None:
        raise HTTPException(status_code=404, detail="Employee not found")

    # Check if this is the default Project Manager
    can_delete = not employee.is_default

    reason = None
    if not can_delete:
        reason = "The default Project Manager cannot be deleted. You can customize it or create additional roles."

    return {
        "can_delete": can_delete,
        "reason": reason,
        "is_default": employee.is_default
    }


@router.get("/employee/{employee_id}/composed-instructions")
async def get_composed_instructions(
    employee_id: str,
    project_id: Optional[str] = None,
    user: dict = Depends(require_auth),
    db: AsyncSession = Depends(get_db)
) -> dict:
    """
    Get the final composed instructions for an employee (transparency endpoint).
    Shows exactly what instructions the AI will receive.
    """
    user_id = UUID(user["sub"])

    # Get the employee
    result = await db.execute(
        select(Employee)
        .where(Employee.id == UUID(employee_id), Employee.owner_id == user_id)
    )
    employee = result.scalar_one_or_none()

    if employee is None:
        raise HTTPException(status_code=404, detail="Employee not found")

    # Get role template if applicable
    template = None
    if employee.role_template_id:
        result = await db.execute(
            select(RoleTemplate).where(RoleTemplate.id == employee.role_template_id)
        )
        template = result.scalar_one_or_none()

    # Compose the instructions
    parts = []
    sources = []

    # Base instructions
    if employee.instructions:
        parts.append(employee.instructions)
        sources.append("employee_instructions")
    elif template and template.instructions:
        parts.append(template.instructions)
        sources.append("role_template")

    # User additions
    if employee.user_instructions:
        parts.append("\n\n## Additional Instructions from User:\n" + employee.user_instructions)
        sources.append("user_instructions")

    composed = "\n".join(parts) if parts else ""

    return {
        "employee_id": employee_id,
        "employee_name": employee.name,
        "composed_instructions": composed,
        "sources": sources,
        "has_template": template is not None,
        "template_name": template.name if template else None,
        "template_version": employee.role_template_version,
        "current_template_version": template.version if template else None,
        "update_available": (
            template is not None and
            (employee.role_template_version or 0) < (template.version or 1)
        )
    }


@router.get("/library")
async def get_role_library(
    user: dict = Depends(require_auth),
    db: AsyncSession = Depends(get_db)
) -> dict:
    """Get the full role library with templates and user's current employees."""
    user_id = UUID(user["sub"])

    # Get all templates
    result = await db.execute(
        select(RoleTemplate).order_by(RoleTemplate.name)
    )
    templates = result.scalars().all()

    # Get user's employees with their template associations
    result = await db.execute(
        select(Employee)
        .where(Employee.owner_id == user_id, Employee.archived == False)
        .order_by(Employee.name)
    )
    employees = result.scalars().all()

    # Build a map of template_id -> employees using it
    template_usage = {}
    for emp in employees:
        if emp.role_template_id:
            tid = str(emp.role_template_id)
            if tid not in template_usage:
                template_usage[tid] = []
            template_usage[tid].append({
                "id": str(emp.id),
                "name": emp.name,
                "is_default": emp.is_default
            })

    return {
        "templates": [
            {
                **template_to_response(t),
                "employees_using": template_usage.get(str(t.id), []),
                "in_use": str(t.id) in template_usage
            }
            for t in templates
        ],
        "total_employees": len(employees),
        "employees_with_templates": sum(1 for e in employees if e.role_template_id)
    }


@router.get("/analytics")
async def get_role_analytics(
    user: dict = Depends(require_auth),
    db: AsyncSession = Depends(get_db)
) -> dict:
    """
    Get role usage analytics and gentle recommendations.
    Tracks frequency of use and identifies unused roles.
    """
    from sqlalchemy import func
    from models import UsageLog, Message
    user_id = UUID(user["sub"])

    # Get all employees
    result = await db.execute(
        select(Employee)
        .where(Employee.owner_id == user_id, Employee.archived == False)
    )
    employees = result.scalars().all()

    # Get usage counts per employee (from usage_logs)
    result = await db.execute(
        select(UsageLog.employee_id, func.count(UsageLog.id).label("usage_count"))
        .where(UsageLog.owner_id == user_id)
        .group_by(UsageLog.employee_id)
    )
    usage_by_employee = {row[0]: row[1] for row in result.all()}

    # Get message counts per employee
    result = await db.execute(
        select(Message.employee_id, func.count(Message.id).label("message_count"))
        .where(Message.owner_id == user_id)
        .group_by(Message.employee_id)
    )
    messages_by_employee = {row[0]: row[1] for row in result.all()}

    # Build analytics
    role_stats = []
    unused_roles = []
    for emp in employees:
        usage = usage_by_employee.get(emp.id, 0)
        messages = messages_by_employee.get(emp.id, 0)

        stat = {
            "employee_id": str(emp.id),
            "name": emp.name,
            "role": emp.role,
            "usage_count": usage,
            "message_count": messages,
            "is_default": emp.is_default,
            "has_template": emp.role_template_id is not None
        }
        role_stats.append(stat)

        # Identify unused (but not default)
        if usage == 0 and messages == 0 and not emp.is_default:
            unused_roles.append(emp.name)

    # Sort by usage
    role_stats.sort(key=lambda x: x["usage_count"], reverse=True)

    # Generate gentle recommendations
    recommendations = []

    if unused_roles:
        if len(unused_roles) == 1:
            recommendations.append({
                "type": "unused",
                "message": f"'{unused_roles[0]}' hasn't been used yet. Consider trying it out or archiving if not needed.",
                "severity": "info"
            })
        elif len(unused_roles) <= 3:
            recommendations.append({
                "type": "unused",
                "message": f"You have {len(unused_roles)} unused roles. Consider trying them or archiving: {', '.join(unused_roles)}",
                "severity": "info"
            })
        else:
            recommendations.append({
                "type": "unused",
                "message": f"You have {len(unused_roles)} unused roles. You might want to review your team setup.",
                "severity": "info"
            })

    # Check for similar roles (QA + Beta Tester)
    role_names = [e.role.lower() if e.role else "" for e in employees]
    if "qa engineer" in role_names and "beta tester" in role_names:
        recommendations.append({
            "type": "overlap",
            "message": "You have both QA Engineer and Beta Tester. These roles have similar purposes - you may only need one.",
            "severity": "info"
        })

    return {
        "role_stats": role_stats,
        "total_roles": len(employees),
        "unused_count": len(unused_roles),
        "recommendations": recommendations
    }
