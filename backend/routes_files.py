from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List
from uuid import UUID

from auth import require_auth
from database import get_db
from models import DMFile, Employee

router = APIRouter(prefix="/api/files", tags=["files"])

# Allowed file types and size limits
ALLOWED_EXTENSIONS = {'.txt', '.md', '.json', '.csv', '.py', '.js', '.ts', '.jsx', '.tsx', '.html', '.css', '.xml', '.yaml', '.yml', '.log', '.sql'}
MAX_FILE_SIZE = 100 * 1024  # 100KB per file
MAX_FILES_PER_DM = 10


def is_allowed_file(filename: str) -> bool:
    return any(filename.lower().endswith(ext) for ext in ALLOWED_EXTENSIONS)


@router.post("/upload/{employee_id}")
async def upload_file(
    employee_id: str,
    file: UploadFile = File(...),
    user: dict = Depends(require_auth),
    db: AsyncSession = Depends(get_db)
):
    """Upload a file for a DM conversation. Files are persisted to the database."""
    user_id = UUID(user["sub"])
    emp_id = UUID(employee_id)

    # Verify employee belongs to user
    result = await db.execute(
        select(Employee).where(Employee.id == emp_id, Employee.owner_id == user_id)
    )
    if result.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="Employee not found")

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
        select(DMFile).where(DMFile.employee_id == emp_id, DMFile.owner_id == user_id)
    )
    existing_files = result.scalars().all()
    if len(existing_files) >= MAX_FILES_PER_DM:
        raise HTTPException(
            status_code=400,
            detail=f"Maximum {MAX_FILES_PER_DM} files per conversation"
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
    dm_file = DMFile(
        employee_id=emp_id,
        owner_id=user_id,
        filename=file.filename,
        content=text_content,
        size=len(content)
    )
    db.add(dm_file)
    await db.commit()
    await db.refresh(dm_file)

    return {
        "id": str(dm_file.id),
        "filename": dm_file.filename,
        "size": dm_file.size,
        "message": "File uploaded successfully"
    }


@router.get("/{employee_id}")
async def list_files(
    employee_id: str,
    user: dict = Depends(require_auth),
    db: AsyncSession = Depends(get_db)
) -> List[dict]:
    """List files uploaded for a DM conversation."""
    user_id = UUID(user["sub"])
    emp_id = UUID(employee_id)

    result = await db.execute(
        select(DMFile)
        .where(DMFile.employee_id == emp_id, DMFile.owner_id == user_id)
        .order_by(DMFile.created_at)
    )
    files = result.scalars().all()

    return [{"id": str(f.id), "filename": f.filename, "size": f.size} for f in files]


@router.delete("/{employee_id}/{file_id}")
async def delete_file(
    employee_id: str,
    file_id: str,
    user: dict = Depends(require_auth),
    db: AsyncSession = Depends(get_db)
):
    """Delete a file from a DM conversation."""
    user_id = UUID(user["sub"])

    result = await db.execute(
        select(DMFile)
        .where(DMFile.id == UUID(file_id), DMFile.owner_id == user_id)
    )
    dm_file = result.scalar_one_or_none()

    if dm_file is None:
        raise HTTPException(status_code=404, detail="File not found")

    await db.delete(dm_file)
    await db.commit()

    return {"status": "ok"}


@router.delete("/{employee_id}")
async def clear_files(
    employee_id: str,
    user: dict = Depends(require_auth),
    db: AsyncSession = Depends(get_db)
):
    """Clear all files for a DM conversation."""
    user_id = UUID(user["sub"])
    emp_id = UUID(employee_id)

    result = await db.execute(
        select(DMFile)
        .where(DMFile.employee_id == emp_id, DMFile.owner_id == user_id)
    )
    files = result.scalars().all()

    for f in files:
        await db.delete(f)
    await db.commit()

    return {"status": "ok"}


async def get_files_for_context(db: AsyncSession, user_id: UUID, employee_id: UUID) -> List[dict]:
    """Get file contents to include in chat context."""
    result = await db.execute(
        select(DMFile)
        .where(DMFile.employee_id == employee_id, DMFile.owner_id == user_id)
        .order_by(DMFile.created_at)
    )
    files = result.scalars().all()

    return [{"filename": f.filename, "content": f.content} for f in files]
