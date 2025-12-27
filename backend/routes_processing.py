"""
QuietDesk Request Processing Engine.

Handles the orchestration of requests through the consulting team:
1. Quincy receives requests and determines which team members to consult
2. Team members provide their input based on their expertise
3. Quincy synthesizes all input into a polished deliverable
"""
from datetime import datetime
from typing import List, Dict, Optional
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from uuid import UUID
import json
import asyncio

from auth import require_auth
from database import get_db, get_engine
from models import User, TeamMember, Request, Deliverable, RequestMessage
from crypto import decrypt_api_key

router = APIRouter(prefix="/api/processing", tags=["processing"])


# ============================================================================
# Request Type -> Team Member Mapping
# ============================================================================

REQUEST_TYPE_TEAM = {
    "roadmap": ["product_manager", "technical_advisor"],
    "analysis": ["research_analyst", "product_manager"],
    "audit": ["qa_engineer", "ux_expert", "technical_advisor"],
    "review": ["product_manager", "ux_expert"],
    "research": ["research_analyst"],
    "custom": []  # Quincy decides based on content
}


# ============================================================================
# Deliverable Templates
# ============================================================================

DELIVERABLE_TEMPLATES = {
    "roadmap": """# {title}

## Executive Summary
{executive_summary}

## Roadmap Overview
{overview}

## Phases

{phases}

## Key Considerations
{considerations}

## Next Steps
{next_steps}

---
*Prepared by the QuietDesk Team*
""",
    "analysis": """# {title}

## Executive Summary
{executive_summary}

## Analysis

{analysis}

## Key Findings
{findings}

## Recommendations
{recommendations}

---
*Prepared by the QuietDesk Team*
""",
    "audit": """# {title}

## Executive Summary
{executive_summary}

## Audit Scope
{scope}

## Findings

{findings}

## Issues Identified
{issues}

## Recommendations
{recommendations}

## Priority Actions
{priority_actions}

---
*Prepared by the QuietDesk Team*
""",
    "review": """# {title}

## Overview
{overview}

## Feedback

{feedback}

## Strengths
{strengths}

## Areas for Improvement
{improvements}

## Recommendations
{recommendations}

---
*Prepared by the QuietDesk Team*
""",
    "research": """# {title}

## Executive Summary
{executive_summary}

## Research Objectives
{objectives}

## Findings

{findings}

## Analysis
{analysis}

## Conclusions
{conclusions}

## Recommendations
{recommendations}

---
*Prepared by the QuietDesk Team*
""",
    "custom": """# {title}

## Summary
{summary}

## Details

{details}

## Recommendations
{recommendations}

---
*Prepared by the QuietDesk Team*
"""
}


# ============================================================================
# AI Interaction Helpers
# ============================================================================

async def call_openai(api_key: str, model: str, system_prompt: str, user_message: str) -> str:
    """Make a non-streaming call to OpenAI API."""
    from openai import OpenAI

    client = OpenAI(api_key=api_key)

    response = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message}
        ],
        max_tokens=4096
    )

    return response.choices[0].message.content


async def call_anthropic(api_key: str, model: str, system_prompt: str, user_message: str) -> str:
    """Make a non-streaming call to Anthropic API."""
    from anthropic import Anthropic

    client = Anthropic(api_key=api_key)

    # Map model names
    model_map = {
        "claude-3-opus": "claude-3-opus-20240229",
        "claude-3-sonnet": "claude-3-sonnet-20240229",
        "claude-3.5-sonnet": "claude-3-5-sonnet-20241022",
        "claude-3-haiku": "claude-3-haiku-20240307",
    }
    actual_model = model_map.get(model, model)

    response = client.messages.create(
        model=actual_model,
        max_tokens=4096,
        system=system_prompt,
        messages=[{"role": "user", "content": user_message}]
    )

    return response.content[0].text


async def call_ai(api_key: str, model: str, system_prompt: str, user_message: str) -> str:
    """Call the appropriate AI provider based on model name."""
    if model.startswith("claude"):
        return await call_anthropic(api_key, model, system_prompt, user_message)
    return await call_openai(api_key, model, system_prompt, user_message)


def get_api_key_for_model(user: User, model: str) -> Optional[str]:
    """Get the appropriate API key for a model."""
    if model.startswith("claude"):
        if user.anthropic_api_key:
            return decrypt_api_key(user.anthropic_api_key)
    else:
        if user.openai_api_key:
            return decrypt_api_key(user.openai_api_key)
    return None


# ============================================================================
# Team Consultation Logic
# ============================================================================

async def consult_team_member(
    db: AsyncSession,
    user: User,
    team_member: TeamMember,
    request: Request,
    context: str = ""
) -> Dict:
    """Have a team member provide their input on a request."""

    api_key = get_api_key_for_model(user, team_member.model)
    if not api_key:
        return {
            "role": team_member.role,
            "name": team_member.name,
            "input": f"[{team_member.name} was unable to contribute - no API key configured]",
            "error": True
        }

    # Build the consultation prompt
    consultation_prompt = f"""You are being consulted on a client request. Provide your expert input based on your role.

Request Title: {request.title}
Request Type: {request.request_type}
Request Description:
{request.description}

{f"Additional Context: {context}" if context else ""}

{f"Product URL for reference: {request.product_url}" if request.product_url else ""}

Provide your expert analysis and recommendations. Be specific, actionable, and thorough.
Focus on your area of expertise and what value you can add to this deliverable."""

    try:
        response = await call_ai(
            api_key=api_key,
            model=team_member.model,
            system_prompt=team_member.instructions or f"You are {team_member.name}, {team_member.title} at QuietDesk consulting.",
            user_message=consultation_prompt
        )

        # Save internal message
        internal_msg = RequestMessage(
            request_id=request.id,
            owner_id=request.owner_id,
            role="assistant",
            sender_name=team_member.name,
            content=response,
            is_internal=True,
            team_member_role=team_member.role
        )
        db.add(internal_msg)

        return {
            "role": team_member.role,
            "name": team_member.name,
            "input": response,
            "error": False
        }
    except Exception as e:
        return {
            "role": team_member.role,
            "name": team_member.name,
            "input": f"[{team_member.name} encountered an error: {str(e)}]",
            "error": True
        }


async def quincy_synthesize(
    db: AsyncSession,
    user: User,
    quincy: TeamMember,
    request: Request,
    team_inputs: List[Dict]
) -> str:
    """Have Quincy synthesize all team input into a final deliverable."""

    api_key = get_api_key_for_model(user, quincy.model)
    if not api_key:
        raise HTTPException(status_code=402, detail="OpenAI API key required for processing")

    # Build the synthesis prompt
    team_contributions = ""
    for inp in team_inputs:
        if not inp.get("error"):
            team_contributions += f"\n\n### {inp['name']} ({inp['role'].replace('_', ' ').title()}):\n{inp['input']}"

    template = DELIVERABLE_TEMPLATES.get(request.request_type, DELIVERABLE_TEMPLATES["custom"])

    synthesis_prompt = f"""You are synthesizing your team's input into a polished deliverable for the client.

## Original Request
Title: {request.title}
Type: {request.request_type}
Description:
{request.description}

{f"Product URL: {request.product_url}" if request.product_url else ""}

## Team Contributions
{team_contributions}

## Your Task
Create a comprehensive, well-structured deliverable that:
1. Synthesizes all team input into a cohesive document
2. Presents findings in a clear, professional format
3. Provides actionable recommendations
4. Uses markdown formatting with proper headers and sections

The deliverable should be ready to present to the client as a polished consulting output.
Structure it logically with an executive summary, main content, and clear recommendations.

Write the complete deliverable in markdown format:"""

    response = await call_ai(
        api_key=api_key,
        model=quincy.model,
        system_prompt=quincy.instructions or "You are Quincy, the lead Project Manager at QuietDesk. You synthesize team input into polished client deliverables.",
        user_message=synthesis_prompt
    )

    return response


# ============================================================================
# Main Processing Function
# ============================================================================

async def process_request_async(request_id: str, user_id: str):
    """Process a request asynchronously (background task)."""
    from database import get_session_maker

    # Get the session maker (ensures it's initialized)
    session_maker = get_session_maker()
    if session_maker is None:
        return

    async with session_maker() as db:
        try:
            # Get request
            result = await db.execute(
                select(Request).where(Request.id == request_id)
            )
            request = result.scalar_one_or_none()
            if not request:
                return

            # Update status to processing
            request.status = "processing"
            request.started_at = datetime.utcnow()
            await db.commit()

            # Get user
            result = await db.execute(
                select(User).where(User.id == user_id)
            )
            user = result.scalar_one_or_none()
            if not user:
                request.status = "failed"
                await db.commit()
                return

            # Get team members
            result = await db.execute(
                select(TeamMember).where(TeamMember.owner_id == user_id)
            )
            team_members = {tm.role: tm for tm in result.scalars().all()}

            # Get Quincy (lead)
            quincy = team_members.get("project_manager")
            if not quincy:
                request.status = "failed"
                await db.commit()
                return

            # Determine which team members to consult
            roles_to_consult = REQUEST_TYPE_TEAM.get(request.request_type, [])

            # For custom requests, have Quincy decide who to consult
            if not roles_to_consult:
                # Default to consulting product manager and research analyst
                roles_to_consult = ["product_manager", "research_analyst"]

            # Consult team members
            team_inputs = []
            for role in roles_to_consult:
                if role in team_members and role != "project_manager":
                    inp = await consult_team_member(db, user, team_members[role], request)
                    team_inputs.append(inp)
                    await db.commit()  # Save internal messages as we go

            # Track which team members contributed
            contributing_roles = [inp["role"] for inp in team_inputs if not inp.get("error")]
            request.team_involved = json.dumps(contributing_roles)
            await db.commit()

            # Have Quincy synthesize the deliverable
            deliverable_content = await quincy_synthesize(db, user, quincy, request, team_inputs)

            # Create the deliverable
            deliverable = Deliverable(
                request_id=request.id,
                owner_id=user_id,
                title=f"{request.title} - Deliverable",
                content=deliverable_content,
                deliverable_type=request.request_type,
                version=1,
                is_draft=False
            )
            db.add(deliverable)

            # Add final message from Quincy
            final_msg = RequestMessage(
                request_id=request.id,
                owner_id=user_id,
                role="assistant",
                sender_name="Quincy",
                content=f"Your deliverable is ready! The team has completed the {request.request_type} you requested.",
                is_internal=False
            )
            db.add(final_msg)

            # Mark request as completed
            request.status = "completed"
            request.completed_at = datetime.utcnow()
            await db.commit()

        except Exception as e:
            # Mark as failed on error
            try:
                result = await db.execute(
                    select(Request).where(Request.id == request_id)
                )
                request = result.scalar_one_or_none()
                if request:
                    request.status = "failed"
                    await db.commit()
            except:
                pass
            raise


# ============================================================================
# API Endpoints
# ============================================================================

class ProcessRequestBody(BaseModel):
    request_id: str


@router.post("/process")
async def trigger_processing(
    body: ProcessRequestBody,
    background_tasks: BackgroundTasks,
    auth_user: dict = Depends(require_auth),
    db: AsyncSession = Depends(get_db)
):
    """Trigger processing for a pending request."""
    user_id = auth_user["sub"]

    # Verify request exists and belongs to user
    result = await db.execute(
        select(Request)
        .where(Request.id == body.request_id)
        .where(Request.owner_id == user_id)
    )
    request = result.scalar_one_or_none()

    if not request:
        raise HTTPException(status_code=404, detail="Request not found")

    if request.status != "pending":
        raise HTTPException(
            status_code=400,
            detail=f"Request is already {request.status}"
        )

    # Check if user has API keys configured
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user.openai_api_key and not user.anthropic_api_key:
        raise HTTPException(
            status_code=402,
            detail="Please configure an API key in Settings to process requests"
        )

    # Start background processing
    background_tasks.add_task(process_request_async, str(request.id), str(user_id))

    return {
        "status": "processing",
        "message": "Quincy and the team are working on your request",
        "request_id": str(request.id)
    }


@router.get("/status/{request_id}")
async def get_processing_status(
    request_id: str,
    auth_user: dict = Depends(require_auth),
    db: AsyncSession = Depends(get_db)
):
    """Get the current processing status of a request."""
    user_id = auth_user["sub"]

    result = await db.execute(
        select(Request)
        .where(Request.id == request_id)
        .where(Request.owner_id == user_id)
    )
    request = result.scalar_one_or_none()

    if not request:
        raise HTTPException(status_code=404, detail="Request not found")

    # Get internal messages for progress tracking
    result = await db.execute(
        select(RequestMessage)
        .where(RequestMessage.request_id == request_id)
        .where(RequestMessage.is_internal == True)
        .order_by(RequestMessage.created_at)
    )
    internal_messages = result.scalars().all()

    # Build progress info
    progress = []
    for msg in internal_messages:
        progress.append({
            "team_member": msg.sender_name,
            "role": msg.team_member_role,
            "timestamp": msg.created_at.isoformat()
        })

    # Get deliverable if completed
    deliverable_id = None
    if request.status == "completed":
        result = await db.execute(
            select(Deliverable.id)
            .where(Deliverable.request_id == request_id)
            .order_by(Deliverable.created_at.desc())
            .limit(1)
        )
        del_result = result.scalar_one_or_none()
        if del_result:
            deliverable_id = str(del_result)

    return {
        "request_id": str(request.id),
        "status": request.status,
        "started_at": request.started_at.isoformat() if request.started_at else None,
        "completed_at": request.completed_at.isoformat() if request.completed_at else None,
        "team_involved": json.loads(request.team_involved) if request.team_involved else [],
        "progress": progress,
        "deliverable_id": deliverable_id
    }


@router.get("/internal-messages/{request_id}")
async def get_internal_messages(
    request_id: str,
    auth_user: dict = Depends(require_auth),
    db: AsyncSession = Depends(get_db)
):
    """Get the internal team deliberation messages for a request."""
    user_id = auth_user["sub"]

    # Verify request belongs to user
    result = await db.execute(
        select(Request)
        .where(Request.id == request_id)
        .where(Request.owner_id == user_id)
    )
    request = result.scalar_one_or_none()

    if not request:
        raise HTTPException(status_code=404, detail="Request not found")

    # Get internal messages
    result = await db.execute(
        select(RequestMessage)
        .where(RequestMessage.request_id == request_id)
        .where(RequestMessage.is_internal == True)
        .order_by(RequestMessage.created_at)
    )
    messages = result.scalars().all()

    return [
        {
            "id": str(msg.id),
            "sender_name": msg.sender_name,
            "team_member_role": msg.team_member_role,
            "content": msg.content,
            "created_at": msg.created_at.isoformat()
        }
        for msg in messages
    ]
