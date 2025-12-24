from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from typing import List, Dict
from uuid import UUID, uuid4
import base64

from auth import require_auth

router = APIRouter(prefix="/api/files", tags=["files"])

# In-memory storage for uploaded files (conversation-scoped)
# Key: session_id (user_id + employee_id combo), Value: list of file dicts
file_storage: Dict[str, List[dict]] = {}

# Allowed file types and size limits
ALLOWED_EXTENSIONS = {'.txt', '.md', '.json', '.csv', '.py', '.js', '.ts', '.jsx', '.tsx', '.html', '.css', '.xml', '.yaml', '.yml', '.log', '.sql'}
MAX_FILE_SIZE = 100 * 1024  # 100KB per file
MAX_FILES_PER_SESSION = 5


def get_session_key(user_id: str, employee_id: str) -> str:
    return f"{user_id}:{employee_id}"


def is_allowed_file(filename: str) -> bool:
    return any(filename.lower().endswith(ext) for ext in ALLOWED_EXTENSIONS)


@router.post("/upload/{employee_id}")
async def upload_file(
    employee_id: str,
    file: UploadFile = File(...),
    user: dict = Depends(require_auth)
):
    """Upload a file for the current conversation. Files are text-only and temporary."""
    user_id = user["sub"]
    session_key = get_session_key(user_id, employee_id)

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

    # Initialize session storage if needed
    if session_key not in file_storage:
        file_storage[session_key] = []

    # Check file count limit
    if len(file_storage[session_key]) >= MAX_FILES_PER_SESSION:
        raise HTTPException(
            status_code=400,
            detail=f"Maximum {MAX_FILES_PER_SESSION} files per conversation"
        )

    # Try to decode as text
    try:
        text_content = content.decode('utf-8')
    except UnicodeDecodeError:
        raise HTTPException(
            status_code=400,
            detail="File must be valid UTF-8 text"
        )

    # Store file
    file_id = str(uuid4())
    file_data = {
        "id": file_id,
        "filename": file.filename,
        "content": text_content,
        "size": len(content)
    }
    file_storage[session_key].append(file_data)

    return {
        "id": file_id,
        "filename": file.filename,
        "size": len(content),
        "message": "File uploaded successfully"
    }


@router.get("/{employee_id}")
async def list_files(
    employee_id: str,
    user: dict = Depends(require_auth)
) -> List[dict]:
    """List files uploaded for the current conversation."""
    user_id = user["sub"]
    session_key = get_session_key(user_id, employee_id)

    files = file_storage.get(session_key, [])
    return [{"id": f["id"], "filename": f["filename"], "size": f["size"]} for f in files]


@router.delete("/{employee_id}/{file_id}")
async def delete_file(
    employee_id: str,
    file_id: str,
    user: dict = Depends(require_auth)
):
    """Delete a file from the current conversation."""
    user_id = user["sub"]
    session_key = get_session_key(user_id, employee_id)

    if session_key not in file_storage:
        raise HTTPException(status_code=404, detail="No files found")

    files = file_storage[session_key]
    for i, f in enumerate(files):
        if f["id"] == file_id:
            del files[i]
            return {"status": "ok"}

    raise HTTPException(status_code=404, detail="File not found")


@router.delete("/{employee_id}")
async def clear_files(
    employee_id: str,
    user: dict = Depends(require_auth)
):
    """Clear all files for the current conversation."""
    user_id = user["sub"]
    session_key = get_session_key(user_id, employee_id)

    if session_key in file_storage:
        del file_storage[session_key]

    return {"status": "ok"}


def get_files_for_context(user_id: str, employee_id: str) -> List[dict]:
    """Get file contents to include in chat context."""
    session_key = get_session_key(user_id, employee_id)
    return file_storage.get(session_key, [])
