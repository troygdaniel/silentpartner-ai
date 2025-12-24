from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import List, Optional
from uuid import UUID
import json

from auth import require_auth
from database import get_db
from models import User, Employee, Project, ProjectFile
from crypto import decrypt_api_key
from routes_memory import get_memories_for_employee, get_memories_for_project
from routes_files import get_files_for_context

router = APIRouter(prefix="/api/chat", tags=["chat"])


class ChatMessage(BaseModel):
    role: str  # "user" or "assistant"
    content: str


class ChatRequest(BaseModel):
    employee_id: str
    messages: List[ChatMessage]
    project_id: Optional[str] = None  # For project-scoped chat
    model_override: Optional[str] = None  # Override employee's default model for this conversation


def get_provider_for_model(model: str) -> str:
    """Determine which API provider to use based on model name."""
    if model.startswith("claude"):
        return "anthropic"
    return "openai"


def replace_instruction_variables(instructions: str, user_name: str, employee_name: str, project_name: str = None) -> str:
    """Replace template variables in instructions with actual values."""
    if not instructions:
        return instructions

    from datetime import datetime

    replacements = {
        "{{user_name}}": user_name or "User",
        "{{employee_name}}": employee_name or "Assistant",
        "{{project_name}}": project_name or "",
        "{{date}}": datetime.now().strftime("%Y-%m-%d"),
        "{{time}}": datetime.now().strftime("%H:%M"),
        "{{day}}": datetime.now().strftime("%A"),
    }

    result = instructions
    for var, value in replacements.items():
        result = result.replace(var, value)

    return result


def estimate_tokens(text: str) -> int:
    """Rough estimate of tokens (4 chars per token for English)."""
    if not text:
        return 0
    return len(text) // 4


def summarize_messages_for_context(messages: List[dict], max_tokens: int = 8000) -> List[dict]:
    """
    Summarize older messages when conversation gets too long.
    Keeps recent messages intact and summarizes older ones.
    """
    if not messages:
        return messages

    # Calculate total tokens
    total_tokens = sum(estimate_tokens(m.get("content", "")) for m in messages)

    # If under threshold, return as-is
    if total_tokens <= max_tokens:
        return messages

    # Keep the last N messages (most recent context)
    keep_recent = 10  # Keep last 10 messages intact
    if len(messages) <= keep_recent:
        return messages

    older_messages = messages[:-keep_recent]
    recent_messages = messages[-keep_recent:]

    # Create a summary of older messages
    summary_parts = []
    for m in older_messages:
        role = m.get("role", "unknown")
        content = m.get("content", "")
        # Truncate very long messages in summary
        if len(content) > 200:
            content = content[:200] + "..."
        summary_parts.append(f"[{role}]: {content}")

    summary_text = "## Summary of Earlier Conversation:\n" + "\n".join(summary_parts)

    # Return summary as first message followed by recent messages
    summarized_messages = [{"role": "user", "content": summary_text}] + recent_messages

    return summarized_messages


async def stream_openai_response(api_key: str, model: str, system_prompt: str, messages: List[dict]):
    """Stream response from OpenAI API."""
    from openai import OpenAI

    client = OpenAI(api_key=api_key)

    full_messages = []
    if system_prompt:
        full_messages.append({"role": "system", "content": system_prompt})
    full_messages.extend(messages)

    try:
        stream = client.chat.completions.create(
            model=model,
            messages=full_messages,
            stream=True
        )

        for chunk in stream:
            if chunk.choices[0].delta.content:
                yield f"data: {json.dumps({'content': chunk.choices[0].delta.content})}\n\n"

        yield "data: [DONE]\n\n"
    except Exception as e:
        yield f"data: {json.dumps({'error': str(e)})}\n\n"


async def stream_anthropic_response(api_key: str, model: str, system_prompt: str, messages: List[dict]):
    """Stream response from Anthropic API."""
    from anthropic import Anthropic

    client = Anthropic(api_key=api_key)

    # Map model names to their API identifiers
    model_map = {
        "claude-3-opus": "claude-3-opus-20240229",
        "claude-3-sonnet": "claude-3-sonnet-20240229",
        "claude-3.5-sonnet": "claude-3-5-sonnet-20241022",
        "claude-3-haiku": "claude-3-haiku-20240307",
    }
    actual_model = model_map.get(model, model)

    try:
        with client.messages.stream(
            model=actual_model,
            max_tokens=4096,
            system=system_prompt or "You are a helpful assistant.",
            messages=messages
        ) as stream:
            for text in stream.text_stream:
                yield f"data: {json.dumps({'content': text})}\n\n"

        yield "data: [DONE]\n\n"
    except Exception as e:
        yield f"data: {json.dumps({'error': str(e)})}\n\n"


@router.post("")
async def chat(
    request: ChatRequest,
    user: dict = Depends(require_auth),
    db: AsyncSession = Depends(get_db)
):
    """Send a chat message to an employee and stream the response."""
    user_id = UUID(user["sub"])

    # Get employee
    result = await db.execute(
        select(Employee)
        .where(Employee.id == UUID(request.employee_id), Employee.owner_id == user_id)
    )
    employee = result.scalar_one_or_none()

    if employee is None:
        raise HTTPException(status_code=404, detail="Employee not found")

    # Get user for API keys
    result = await db.execute(select(User).where(User.id == user_id))
    db_user = result.scalar_one_or_none()

    if db_user is None:
        raise HTTPException(status_code=404, detail="User not found")

    # Use model override if provided, otherwise use employee's default model
    model = request.model_override if request.model_override else employee.model

    # Determine provider and check for key
    provider = get_provider_for_model(model)

    if provider == "openai":
        if not db_user.openai_api_key:
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail="OpenAI API key required. Please add your API key in Settings."
            )
        api_key = decrypt_api_key(db_user.openai_api_key)
    else:  # anthropic
        if not db_user.anthropic_api_key:
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail="Anthropic API key required. Please add your API key in Settings."
            )
        api_key = decrypt_api_key(db_user.anthropic_api_key)

    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to decrypt API key"
        )

    # Build messages for API and apply summarization for long conversations
    raw_messages = [{"role": m.role, "content": m.content} for m in request.messages]
    api_messages = summarize_messages_for_context(raw_messages)

    # Get project details if applicable
    project_id = UUID(request.project_id) if request.project_id else None
    project_name = None
    project_instructions = None
    if project_id:
        result = await db.execute(
            select(Project).where(Project.id == project_id, Project.owner_id == user_id)
        )
        project = result.scalar_one_or_none()
        if project:
            project_name = project.name
            project_instructions = project.instructions

    # Get memories and build system prompt
    memories = await get_memories_for_employee(db, user_id, employee.id, project_id)

    # Replace instruction variables with actual values
    base_instructions = replace_instruction_variables(
        employee.instructions or "",
        user_name=db_user.name,
        employee_name=employee.name,
        project_name=project_name
    )
    system_prompt = base_instructions

    # Add project-specific instructions if available (conditional instructions)
    if project_instructions:
        project_instruction_section = replace_instruction_variables(
            project_instructions,
            user_name=db_user.name,
            employee_name=employee.name,
            project_name=project_name
        )
        if system_prompt:
            system_prompt = system_prompt + "\n\n## Project-Specific Instructions:\n" + project_instruction_section
        else:
            system_prompt = project_instruction_section

    if memories:
        memory_section = "\n\n## Important Information to Remember:\n" + "\n".join(f"- {m}" for m in memories)
        system_prompt = system_prompt + memory_section if system_prompt else memory_section.strip()

    # Get uploaded files and add to context
    # For project chat, use project files; for DM, use session files
    if project_id:
        result = await db.execute(
            select(ProjectFile)
            .where(ProjectFile.project_id == project_id, ProjectFile.owner_id == user_id)
        )
        project_files = result.scalars().all()
        if project_files:
            file_section = "\n\n## Project Files:\n"
            for f in project_files:
                file_section += f"\n### {f.filename}\n```\n{f.content}\n```\n"
            system_prompt = system_prompt + file_section if system_prompt else file_section.strip()
    else:
        files = await get_files_for_context(db, user_id, employee.id)
        if files:
            file_section = "\n\n## Uploaded Files:\n"
            for f in files:
                file_section += f"\n### {f['filename']}\n```\n{f['content']}\n```\n"
            system_prompt = system_prompt + file_section if system_prompt else file_section.strip()

    # Stream response
    if provider == "openai":
        return StreamingResponse(
            stream_openai_response(api_key, model, system_prompt, api_messages),
            media_type="text/event-stream"
        )
    else:
        return StreamingResponse(
            stream_anthropic_response(api_key, model, system_prompt, api_messages),
            media_type="text/event-stream"
        )
