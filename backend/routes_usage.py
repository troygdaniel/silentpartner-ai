from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import List, Optional
from uuid import UUID
from datetime import datetime, timedelta

from auth import require_auth
from database import get_db
from models import UsageLog, Employee, Project

router = APIRouter(prefix="/api/usage", tags=["usage"])

# Approximate cost per 1K tokens (as of late 2024)
MODEL_COSTS = {
    "gpt-4": {"input": 0.03, "output": 0.06},
    "gpt-4-turbo": {"input": 0.01, "output": 0.03},
    "gpt-4o": {"input": 0.0025, "output": 0.01},
    "gpt-4o-mini": {"input": 0.00015, "output": 0.0006},
    "gpt-3.5-turbo": {"input": 0.0005, "output": 0.0015},
    "claude-3-opus": {"input": 0.015, "output": 0.075},
    "claude-3-sonnet": {"input": 0.003, "output": 0.015},
    "claude-3.5-sonnet": {"input": 0.003, "output": 0.015},
    "claude-3-haiku": {"input": 0.00025, "output": 0.00125},
}


def calculate_cost(model: str, input_tokens: int, output_tokens: int) -> float:
    """Calculate approximate cost for a request."""
    costs = MODEL_COSTS.get(model, {"input": 0.01, "output": 0.03})
    return (input_tokens / 1000 * costs["input"]) + (output_tokens / 1000 * costs["output"])


@router.get("/summary")
async def get_usage_summary(
    days: int = Query(default=30, ge=1, le=365),
    user: dict = Depends(require_auth),
    db: AsyncSession = Depends(get_db)
) -> dict:
    """Get usage summary for the past N days."""
    user_id = UUID(user["sub"])
    since = datetime.utcnow() - timedelta(days=days)

    # Total usage
    result = await db.execute(
        select(
            func.sum(UsageLog.input_tokens).label("total_input"),
            func.sum(UsageLog.output_tokens).label("total_output"),
            func.count(UsageLog.id).label("total_requests")
        )
        .where(UsageLog.owner_id == user_id, UsageLog.created_at >= since)
    )
    row = result.fetchone()
    total_input = row.total_input or 0
    total_output = row.total_output or 0
    total_requests = row.total_requests or 0

    # Usage by model
    result = await db.execute(
        select(
            UsageLog.model,
            func.sum(UsageLog.input_tokens).label("input_tokens"),
            func.sum(UsageLog.output_tokens).label("output_tokens"),
            func.count(UsageLog.id).label("requests")
        )
        .where(UsageLog.owner_id == user_id, UsageLog.created_at >= since)
        .group_by(UsageLog.model)
    )
    by_model = []
    total_cost = 0.0
    for row in result.fetchall():
        cost = calculate_cost(row.model, row.input_tokens or 0, row.output_tokens or 0)
        total_cost += cost
        by_model.append({
            "model": row.model,
            "input_tokens": row.input_tokens or 0,
            "output_tokens": row.output_tokens or 0,
            "requests": row.requests,
            "estimated_cost": round(cost, 4)
        })

    return {
        "period_days": days,
        "total_input_tokens": total_input,
        "total_output_tokens": total_output,
        "total_tokens": total_input + total_output,
        "total_requests": total_requests,
        "estimated_total_cost": round(total_cost, 4),
        "by_model": by_model
    }


@router.get("/by-employee")
async def get_usage_by_employee(
    days: int = Query(default=30, ge=1, le=365),
    user: dict = Depends(require_auth),
    db: AsyncSession = Depends(get_db)
) -> List[dict]:
    """Get usage breakdown by employee."""
    user_id = UUID(user["sub"])
    since = datetime.utcnow() - timedelta(days=days)

    result = await db.execute(
        select(
            UsageLog.employee_id,
            func.sum(UsageLog.input_tokens).label("input_tokens"),
            func.sum(UsageLog.output_tokens).label("output_tokens"),
            func.count(UsageLog.id).label("requests")
        )
        .where(UsageLog.owner_id == user_id, UsageLog.created_at >= since)
        .group_by(UsageLog.employee_id)
    )

    usage_data = result.fetchall()
    employee_ids = [row.employee_id for row in usage_data if row.employee_id]

    # Get employee names
    employees_map = {}
    if employee_ids:
        emp_result = await db.execute(
            select(Employee).where(Employee.id.in_(employee_ids))
        )
        employees_map = {e.id: e.name for e in emp_result.scalars().all()}

    return [
        {
            "employee_id": str(row.employee_id) if row.employee_id else None,
            "employee_name": employees_map.get(row.employee_id, "Unknown"),
            "input_tokens": row.input_tokens or 0,
            "output_tokens": row.output_tokens or 0,
            "total_tokens": (row.input_tokens or 0) + (row.output_tokens or 0),
            "requests": row.requests
        }
        for row in usage_data
    ]


@router.get("/by-project")
async def get_usage_by_project(
    days: int = Query(default=30, ge=1, le=365),
    user: dict = Depends(require_auth),
    db: AsyncSession = Depends(get_db)
) -> List[dict]:
    """Get usage breakdown by project."""
    user_id = UUID(user["sub"])
    since = datetime.utcnow() - timedelta(days=days)

    result = await db.execute(
        select(
            UsageLog.project_id,
            func.sum(UsageLog.input_tokens).label("input_tokens"),
            func.sum(UsageLog.output_tokens).label("output_tokens"),
            func.count(UsageLog.id).label("requests")
        )
        .where(UsageLog.owner_id == user_id, UsageLog.created_at >= since)
        .group_by(UsageLog.project_id)
    )

    usage_data = result.fetchall()
    project_ids = [row.project_id for row in usage_data if row.project_id]

    # Get project names
    projects_map = {}
    if project_ids:
        proj_result = await db.execute(
            select(Project).where(Project.id.in_(project_ids))
        )
        projects_map = {p.id: p.name for p in proj_result.scalars().all()}

    return [
        {
            "project_id": str(row.project_id) if row.project_id else None,
            "project_name": projects_map.get(row.project_id, "Direct Messages"),
            "input_tokens": row.input_tokens or 0,
            "output_tokens": row.output_tokens or 0,
            "total_tokens": (row.input_tokens or 0) + (row.output_tokens or 0),
            "requests": row.requests
        }
        for row in usage_data
    ]


@router.get("/daily")
async def get_daily_usage(
    days: int = Query(default=30, ge=1, le=365),
    user: dict = Depends(require_auth),
    db: AsyncSession = Depends(get_db)
) -> List[dict]:
    """Get daily usage for charting."""
    user_id = UUID(user["sub"])
    since = datetime.utcnow() - timedelta(days=days)

    result = await db.execute(
        select(
            func.date(UsageLog.created_at).label("date"),
            func.sum(UsageLog.input_tokens).label("input_tokens"),
            func.sum(UsageLog.output_tokens).label("output_tokens"),
            func.count(UsageLog.id).label("requests")
        )
        .where(UsageLog.owner_id == user_id, UsageLog.created_at >= since)
        .group_by(func.date(UsageLog.created_at))
        .order_by(func.date(UsageLog.created_at))
    )

    return [
        {
            "date": str(row.date),
            "input_tokens": row.input_tokens or 0,
            "output_tokens": row.output_tokens or 0,
            "total_tokens": (row.input_tokens or 0) + (row.output_tokens or 0),
            "requests": row.requests
        }
        for row in result.fetchall()
    ]
