from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List
from uuid import UUID

from auth import require_auth
from database import get_db
from models import ProjectFile, Project

router = APIRouter(prefix="/api/project-files", tags=["project-files"])

# Allowed file types and size limits
ALLOWED_EXTENSIONS = {'.txt', '.md', '.json', '.csv', '.py', '.js', '.ts', '.jsx', '.tsx', '.html', '.css', '.xml', '.yaml', '.yml', '.log', '.sql'}
MAX_FILE_SIZE = 100 * 1024  # 100KB per file
MAX_FILES_PER_PROJECT = 10


def is_allowed_file(filename: str) -> bool:
    return any(filename.lower().endswith(ext) for ext in ALLOWED_EXTENSIONS)


@router.post("/upload/{project_id}")
async def upload_file(
    project_id: str,
    file: UploadFile = File(...),
    user: dict = Depends(require_auth),
    db: AsyncSession = Depends(get_db)
):
    """Upload a file to a project."""
    user_id = UUID(user["sub"])

    # Verify project ownership
    result = await db.execute(
        select(Project)
        .where(Project.id == UUID(project_id), Project.owner_id == user_id)
    )
    project = result.scalar_one_or_none()
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")

    # Validate file extension
    if not file.filename or not is_allowed_file(file.filename):
        raise HTTPException(
            status_code=400,
            detail=f"File type not allowed. Allowed: {', '.join(ALLOWED_EXTENSIONS)}"
        )

    # Read file content
    content = await file.read()

    # Validate file size
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"File too large. Maximum size: {MAX_FILE_SIZE // 1024}KB"
        )

    # Check file count limit
    result = await db.execute(
        select(ProjectFile)
        .where(ProjectFile.project_id == UUID(project_id))
    )
    existing_files = result.scalars().all()
    if len(existing_files) >= MAX_FILES_PER_PROJECT:
        raise HTTPException(
            status_code=400,
            detail=f"Maximum {MAX_FILES_PER_PROJECT} files per project"
        )

    # Try to decode as text
    try:
        text_content = content.decode('utf-8')
    except UnicodeDecodeError:
        raise HTTPException(
            status_code=400,
            detail="File must be valid UTF-8 text"
        )

    # Store file in database
    new_file = ProjectFile(
        project_id=UUID(project_id),
        owner_id=user_id,
        filename=file.filename,
        content=text_content,
        size=len(content)
    )
    db.add(new_file)
    await db.commit()
    await db.refresh(new_file)

    return {
        "id": str(new_file.id),
        "filename": new_file.filename,
        "size": new_file.size,
        "message": "File uploaded successfully"
    }


@router.get("/{project_id}")
async def list_files(
    project_id: str,
    user: dict = Depends(require_auth),
    db: AsyncSession = Depends(get_db)
) -> List[dict]:
    """List files in a project."""
    user_id = UUID(user["sub"])

    # Verify project ownership
    result = await db.execute(
        select(Project)
        .where(Project.id == UUID(project_id), Project.owner_id == user_id)
    )
    project = result.scalar_one_or_none()
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")

    # Get files
    result = await db.execute(
        select(ProjectFile)
        .where(ProjectFile.project_id == UUID(project_id))
        .order_by(ProjectFile.created_at.desc())
    )
    files = result.scalars().all()

    return [
        {"id": str(f.id), "filename": f.filename, "size": f.size}
        for f in files
    ]


@router.get("/{project_id}/{file_id}/content")
async def get_file_content(
    project_id: str,
    file_id: str,
    user: dict = Depends(require_auth),
    db: AsyncSession = Depends(get_db)
) -> dict:
    """Get file content."""
    user_id = UUID(user["sub"])

    # Verify project ownership
    result = await db.execute(
        select(Project)
        .where(Project.id == UUID(project_id), Project.owner_id == user_id)
    )
    project = result.scalar_one_or_none()
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")

    # Get file
    result = await db.execute(
        select(ProjectFile)
        .where(ProjectFile.id == UUID(file_id), ProjectFile.project_id == UUID(project_id))
    )
    file = result.scalar_one_or_none()
    if file is None:
        raise HTTPException(status_code=404, detail="File not found")

    return {
        "id": str(file.id),
        "filename": file.filename,
        "content": file.content,
        "size": file.size
    }


@router.delete("/{project_id}/{file_id}")
async def delete_file(
    project_id: str,
    file_id: str,
    user: dict = Depends(require_auth),
    db: AsyncSession = Depends(get_db)
):
    """Delete a file from a project."""
    user_id = UUID(user["sub"])

    # Verify project ownership
    result = await db.execute(
        select(Project)
        .where(Project.id == UUID(project_id), Project.owner_id == user_id)
    )
    project = result.scalar_one_or_none()
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")

    # Get and delete file
    result = await db.execute(
        select(ProjectFile)
        .where(ProjectFile.id == UUID(file_id), ProjectFile.project_id == UUID(project_id))
    )
    file = result.scalar_one_or_none()
    if file is None:
        raise HTTPException(status_code=404, detail="File not found")

    await db.delete(file)
    await db.commit()

    return {"status": "ok"}


def get_project_files_for_context(db_files: List[ProjectFile]) -> List[dict]:
    """Helper function to get file contents for chat context."""
    return [
        {"filename": f.filename, "content": f.content}
        for f in db_files
    ]
