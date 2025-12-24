from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from uuid import UUID
from io import BytesIO

from auth import require_auth
from database import get_db
from models import Message, Project, Employee

router = APIRouter(prefix="/api/export", tags=["export"])


def generate_pdf_content(title: str, messages: list) -> bytes:
    """Generate a simple PDF from conversation messages."""
    try:
        from reportlab.lib.pagesizes import letter
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
        from reportlab.lib.enums import TA_LEFT
        from reportlab.lib.colors import HexColor
    except ImportError:
        # Fallback if reportlab not installed - return plain text as PDF-like format
        content = f"# {title}\n\n"
        for m in messages:
            role = "You" if m["role"] == "user" else "Assistant"
            content += f"**{role}** ({m['created_at']}):\n{m['content']}\n\n---\n\n"
        return content.encode('utf-8')

    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=letter, topMargin=50, bottomMargin=50)

    styles = getSampleStyleSheet()
    title_style = styles['Title']

    user_style = ParagraphStyle(
        'UserMessage',
        parent=styles['Normal'],
        fontSize=11,
        leading=14,
        spaceBefore=10,
        spaceAfter=5,
        leftIndent=0,
        textColor=HexColor('#333333'),
        backColor=HexColor('#e3f2fd'),
    )

    assistant_style = ParagraphStyle(
        'AssistantMessage',
        parent=styles['Normal'],
        fontSize=11,
        leading=14,
        spaceBefore=10,
        spaceAfter=5,
        leftIndent=0,
        textColor=HexColor('#333333'),
        backColor=HexColor('#f5f5f5'),
    )

    meta_style = ParagraphStyle(
        'Meta',
        parent=styles['Normal'],
        fontSize=9,
        textColor=HexColor('#666666'),
    )

    story = []
    story.append(Paragraph(title, title_style))
    story.append(Spacer(1, 20))

    for m in messages:
        role_label = "You" if m["role"] == "user" else "Assistant"
        style = user_style if m["role"] == "user" else assistant_style

        # Add role and timestamp
        story.append(Paragraph(f"<b>{role_label}</b> - {m['created_at']}", meta_style))

        # Clean content for PDF (escape special chars)
        content = m["content"]
        content = content.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
        content = content.replace('\n', '<br/>')

        story.append(Paragraph(content, style))
        story.append(Spacer(1, 10))

    doc.build(story)
    return buffer.getvalue()


@router.get("/project/{project_id}/pdf")
async def export_project_to_pdf(
    project_id: str,
    user: dict = Depends(require_auth),
    db: AsyncSession = Depends(get_db)
):
    """Export a project conversation to PDF."""
    user_id = UUID(user["sub"])

    # Verify project ownership
    result = await db.execute(
        select(Project).where(Project.id == UUID(project_id), Project.owner_id == user_id)
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Get messages
    result = await db.execute(
        select(Message)
        .where(Message.project_id == UUID(project_id), Message.owner_id == user_id)
        .order_by(Message.created_at.asc())
    )
    messages = result.scalars().all()

    message_data = [
        {
            "role": m.role,
            "content": m.content,
            "created_at": m.created_at.strftime("%Y-%m-%d %H:%M") if m.created_at else ""
        }
        for m in messages
    ]

    pdf_bytes = generate_pdf_content(f"Project: {project.name}", message_data)

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{project.name}.pdf"'
        }
    )


@router.get("/dm/{employee_id}/pdf")
async def export_dm_to_pdf(
    employee_id: str,
    user: dict = Depends(require_auth),
    db: AsyncSession = Depends(get_db)
):
    """Export a DM conversation to PDF."""
    user_id = UUID(user["sub"])

    # Verify employee ownership
    result = await db.execute(
        select(Employee).where(Employee.id == UUID(employee_id), Employee.owner_id == user_id)
    )
    employee = result.scalar_one_or_none()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")

    # Get DM messages
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

    message_data = [
        {
            "role": m.role,
            "content": m.content,
            "created_at": m.created_at.strftime("%Y-%m-%d %H:%M") if m.created_at else ""
        }
        for m in messages
    ]

    pdf_bytes = generate_pdf_content(f"Conversation with {employee.name}", message_data)

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{employee.name}_conversation.pdf"'
        }
    )
