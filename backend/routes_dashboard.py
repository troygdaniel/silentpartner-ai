"""
QuietDesk Dashboard API routes.

Provides endpoints for the new dashboard-first UX:
- Dashboard overview (requests, deliverables)
- Request submission and management
- Deliverable viewing and export
- Team status
"""
from datetime import datetime
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, func
from sqlalchemy.orm import selectinload
import json

from auth import require_auth
from database import get_db
from models import User, TeamMember, Request, Deliverable, RequestMessage, Project

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


# ============================================================================
# Pydantic Models
# ============================================================================

class TeamMemberResponse(BaseModel):
    id: str
    role: str
    name: str
    title: str
    is_lead: bool

    class Config:
        from_attributes = True


class RequestSummary(BaseModel):
    id: str
    title: str
    request_type: str
    status: str
    created_at: datetime
    project_name: Optional[str] = None

    class Config:
        from_attributes = True


class DeliverableSummary(BaseModel):
    id: str
    title: str
    deliverable_type: str
    created_at: datetime
    request_title: str

    class Config:
        from_attributes = True


class DashboardResponse(BaseModel):
    team: List[TeamMemberResponse]
    active_requests: List[RequestSummary]
    recent_deliverables: List[DeliverableSummary]
    stats: dict


class CreateRequestBody(BaseModel):
    title: str
    description: str
    request_type: str  # roadmap, analysis, audit, review, research, custom
    project_id: Optional[str] = None
    product_url: Optional[str] = None


class RequestDetailResponse(BaseModel):
    id: str
    title: str
    description: str
    request_type: str
    status: str
    team_involved: Optional[List[str]] = None
    product_url: Optional[str] = None
    created_at: datetime
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    deliverables: List[DeliverableSummary] = []
    project_name: Optional[str] = None


class DeliverableDetailResponse(BaseModel):
    id: str
    title: str
    content: str
    deliverable_type: str
    google_sheet_url: Optional[str] = None
    version: int
    is_draft: bool
    created_at: datetime
    request_id: str
    request_title: str


# ============================================================================
# Dashboard Endpoints
# ============================================================================

@router.get("/", response_model=DashboardResponse)
async def get_dashboard(
    auth_user: dict = Depends(require_auth),
    db: AsyncSession = Depends(get_db)
):
    """Get dashboard overview with team, active requests, and recent deliverables."""
    user_id = auth_user["sub"]

    # Get team members
    team_result = await db.execute(
        select(TeamMember)
        .where(TeamMember.owner_id == user_id)
        .order_by(desc(TeamMember.is_lead), TeamMember.name)
    )
    team_members = team_result.scalars().all()

    # Get active requests (pending or processing)
    requests_result = await db.execute(
        select(Request)
        .where(Request.owner_id == user_id)
        .where(Request.status.in_(["pending", "processing"]))
        .order_by(desc(Request.created_at))
        .limit(10)
    )
    active_requests = requests_result.scalars().all()

    # Get recent deliverables
    deliverables_result = await db.execute(
        select(Deliverable)
        .join(Request)
        .where(Deliverable.owner_id == user_id)
        .order_by(desc(Deliverable.created_at))
        .limit(10)
    )
    recent_deliverables = deliverables_result.scalars().all()

    # Get stats
    total_requests = await db.execute(
        select(func.count(Request.id)).where(Request.owner_id == user_id)
    )
    total_deliverables = await db.execute(
        select(func.count(Deliverable.id)).where(Deliverable.owner_id == user_id)
    )
    completed_requests = await db.execute(
        select(func.count(Request.id))
        .where(Request.owner_id == user_id)
        .where(Request.status == "completed")
    )

    # Build response
    team_response = [
        TeamMemberResponse(
            id=str(m.id),
            role=m.role,
            name=m.name,
            title=m.title or m.role.replace("_", " ").title(),
            is_lead=m.is_lead
        )
        for m in team_members
    ]

    active_requests_response = []
    for r in active_requests:
        # Get project name if associated
        project_name = None
        if r.project_id:
            proj = await db.execute(select(Project.name).where(Project.id == r.project_id))
            project_name = proj.scalar_one_or_none()

        active_requests_response.append(RequestSummary(
            id=str(r.id),
            title=r.title,
            request_type=r.request_type,
            status=r.status,
            created_at=r.created_at,
            project_name=project_name
        ))

    deliverables_response = []
    for d in recent_deliverables:
        # Get request title
        req = await db.execute(select(Request.title).where(Request.id == d.request_id))
        req_title = req.scalar_one_or_none() or "Unknown"

        deliverables_response.append(DeliverableSummary(
            id=str(d.id),
            title=d.title,
            deliverable_type=d.deliverable_type,
            created_at=d.created_at,
            request_title=req_title
        ))

    return DashboardResponse(
        team=team_response,
        active_requests=active_requests_response,
        recent_deliverables=deliverables_response,
        stats={
            "total_requests": total_requests.scalar() or 0,
            "completed_requests": completed_requests.scalar() or 0,
            "total_deliverables": total_deliverables.scalar() or 0
        }
    )


@router.get("/team")
async def get_team(
    auth_user: dict = Depends(require_auth),
    db: AsyncSession = Depends(get_db)
):
    """Get the user's QuietDesk team."""
    user_id = auth_user["sub"]

    result = await db.execute(
        select(TeamMember)
        .where(TeamMember.owner_id == user_id)
        .order_by(desc(TeamMember.is_lead), TeamMember.name)
    )
    team_members = result.scalars().all()

    return [
        {
            "id": str(m.id),
            "role": m.role,
            "name": m.name,
            "title": m.title,
            "is_lead": m.is_lead
        }
        for m in team_members
    ]


# ============================================================================
# Request Endpoints
# ============================================================================

@router.post("/requests", status_code=status.HTTP_201_CREATED)
async def create_request(
    body: CreateRequestBody,
    auth_user: dict = Depends(require_auth),
    db: AsyncSession = Depends(get_db)
):
    """Submit a new request to the QuietDesk team."""
    user_id = auth_user["sub"]

    # Validate request type
    valid_types = ["roadmap", "analysis", "audit", "review", "research", "custom"]
    if body.request_type not in valid_types:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid request_type. Must be one of: {valid_types}"
        )

    # Create the request
    new_request = Request(
        owner_id=user_id,
        project_id=body.project_id if body.project_id else None,
        title=body.title,
        description=body.description,
        request_type=body.request_type,
        product_url=body.product_url,
        status="pending"
    )
    db.add(new_request)
    await db.commit()
    await db.refresh(new_request)

    return {
        "id": str(new_request.id),
        "title": new_request.title,
        "status": new_request.status,
        "message": "Request submitted. Quincy and the team will start working on it."
    }


@router.get("/requests")
async def list_requests(
    status_filter: Optional[str] = None,
    limit: int = 20,
    offset: int = 0,
    auth_user: dict = Depends(require_auth),
    db: AsyncSession = Depends(get_db)
):
    """List all requests for the user."""
    user_id = auth_user["sub"]

    query = select(Request).where(Request.owner_id == user_id)

    if status_filter:
        query = query.where(Request.status == status_filter)

    query = query.order_by(desc(Request.created_at)).offset(offset).limit(limit)

    result = await db.execute(query)
    requests = result.scalars().all()

    response = []
    for r in requests:
        project_name = None
        if r.project_id:
            proj = await db.execute(select(Project.name).where(Project.id == r.project_id))
            project_name = proj.scalar_one_or_none()

        response.append({
            "id": str(r.id),
            "title": r.title,
            "request_type": r.request_type,
            "status": r.status,
            "created_at": r.created_at.isoformat(),
            "completed_at": r.completed_at.isoformat() if r.completed_at else None,
            "project_name": project_name
        })

    return response


@router.get("/requests/{request_id}")
async def get_request(
    request_id: str,
    auth_user: dict = Depends(require_auth),
    db: AsyncSession = Depends(get_db)
):
    """Get details of a specific request."""
    user_id = auth_user["sub"]

    result = await db.execute(
        select(Request)
        .where(Request.id == request_id)
        .where(Request.owner_id == user_id)
    )
    req = result.scalar_one_or_none()

    if not req:
        raise HTTPException(status_code=404, detail="Request not found")

    # Get project name
    project_name = None
    if req.project_id:
        proj = await db.execute(select(Project.name).where(Project.id == req.project_id))
        project_name = proj.scalar_one_or_none()

    # Get deliverables
    deliverables_result = await db.execute(
        select(Deliverable)
        .where(Deliverable.request_id == request_id)
        .order_by(desc(Deliverable.created_at))
    )
    deliverables = deliverables_result.scalars().all()

    return {
        "id": str(req.id),
        "title": req.title,
        "description": req.description,
        "request_type": req.request_type,
        "status": req.status,
        "team_involved": json.loads(req.team_involved) if req.team_involved else None,
        "product_url": req.product_url,
        "created_at": req.created_at.isoformat(),
        "started_at": req.started_at.isoformat() if req.started_at else None,
        "completed_at": req.completed_at.isoformat() if req.completed_at else None,
        "project_name": project_name,
        "deliverables": [
            {
                "id": str(d.id),
                "title": d.title,
                "deliverable_type": d.deliverable_type,
                "created_at": d.created_at.isoformat()
            }
            for d in deliverables
        ]
    }


# ============================================================================
# Deliverable Endpoints
# ============================================================================

@router.get("/deliverables")
async def list_deliverables(
    deliverable_type: Optional[str] = None,
    limit: int = 20,
    offset: int = 0,
    auth_user: dict = Depends(require_auth),
    db: AsyncSession = Depends(get_db)
):
    """List all deliverables for the user."""
    user_id = auth_user["sub"]

    query = (
        select(Deliverable)
        .join(Request)
        .where(Deliverable.owner_id == user_id)
    )

    if deliverable_type:
        query = query.where(Deliverable.deliverable_type == deliverable_type)

    query = query.order_by(desc(Deliverable.created_at)).offset(offset).limit(limit)

    result = await db.execute(query)
    deliverables = result.scalars().all()

    response = []
    for d in deliverables:
        req = await db.execute(select(Request.title).where(Request.id == d.request_id))
        req_title = req.scalar_one_or_none() or "Unknown"

        response.append({
            "id": str(d.id),
            "title": d.title,
            "deliverable_type": d.deliverable_type,
            "created_at": d.created_at.isoformat(),
            "request_title": req_title,
            "google_sheet_url": d.google_sheet_url
        })

    return response


@router.get("/deliverables/{deliverable_id}")
async def get_deliverable(
    deliverable_id: str,
    auth_user: dict = Depends(require_auth),
    db: AsyncSession = Depends(get_db)
):
    """Get full details of a deliverable including content."""
    user_id = auth_user["sub"]

    result = await db.execute(
        select(Deliverable)
        .where(Deliverable.id == deliverable_id)
        .where(Deliverable.owner_id == user_id)
    )
    deliverable = result.scalar_one_or_none()

    if not deliverable:
        raise HTTPException(status_code=404, detail="Deliverable not found")

    # Get request title
    req = await db.execute(select(Request.title).where(Request.id == deliverable.request_id))
    req_title = req.scalar_one_or_none() or "Unknown"

    return {
        "id": str(deliverable.id),
        "title": deliverable.title,
        "content": deliverable.content,
        "deliverable_type": deliverable.deliverable_type,
        "google_sheet_url": deliverable.google_sheet_url,
        "version": deliverable.version,
        "is_draft": deliverable.is_draft,
        "created_at": deliverable.created_at.isoformat(),
        "request_id": str(deliverable.request_id),
        "request_title": req_title
    }


# ============================================================================
# Request Types Reference
# ============================================================================

@router.get("/request-types")
async def get_request_types():
    """Get available request types with descriptions."""
    return [
        {
            "type": "roadmap",
            "name": "Product Roadmap",
            "description": "Create a product roadmap with phases, features, and priorities",
            "team_involved": ["product_manager", "technical_advisor"]
        },
        {
            "type": "analysis",
            "name": "Analysis",
            "description": "Competitive, market, or technical analysis",
            "team_involved": ["research_analyst", "product_manager"]
        },
        {
            "type": "audit",
            "name": "Audit",
            "description": "Review existing feature or product for issues and improvements",
            "team_involved": ["qa_engineer", "ux_expert", "technical_advisor"]
        },
        {
            "type": "review",
            "name": "Review",
            "description": "Get feedback on an idea, document, or design",
            "team_involved": ["product_manager", "ux_expert"]
        },
        {
            "type": "research",
            "name": "Research",
            "description": "Investigate a topic and gather information",
            "team_involved": ["research_analyst"]
        },
        {
            "type": "custom",
            "name": "Custom Request",
            "description": "Ask anything - Quincy will route to the right team members",
            "team_involved": []
        }
    ]
