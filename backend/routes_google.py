"""
Google Drive/Sheets API integration routes.

Provides endpoints for AI employees to create and manage Google Sheets.
"""
from datetime import datetime, timedelta
from typing import Optional, List
from urllib.parse import quote
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import httpx

from auth import require_auth, refresh_google_token
from database import get_db
from models import User
from crypto import decrypt_api_key, encrypt_api_key

router = APIRouter(prefix="/api/google", tags=["google"])

SHEETS_API_BASE = "https://sheets.googleapis.com/v4/spreadsheets"
DRIVE_API_BASE = "https://www.googleapis.com/drive/v3/files"


class CreateSheetRequest(BaseModel):
    title: str
    sheets: Optional[List[str]] = None  # Optional list of sheet names


class UpdateSheetRequest(BaseModel):
    spreadsheet_id: str
    range: str  # e.g., "Sheet1!A1:B2"
    values: List[List[str]]


class AppendSheetRequest(BaseModel):
    spreadsheet_id: str
    range: str
    values: List[List[str]]


class ReadSheetRequest(BaseModel):
    spreadsheet_id: str
    range: str


async def get_valid_google_token(user: User, db: AsyncSession) -> str:
    """Get a valid Google access token, refreshing if needed."""
    if not user.google_refresh_token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No Google account connected. Please log out and log in again to grant Google Drive access."
        )

    # Check if token is expired or about to expire (within 5 minutes)
    now = datetime.utcnow()
    if user.google_token_expires_at and user.google_token_expires_at > now + timedelta(minutes=5):
        # Token is still valid
        return decrypt_api_key(user.google_access_token)

    # Token expired or expiring soon, refresh it
    try:
        refresh_token = decrypt_api_key(user.google_refresh_token)
        new_tokens = await refresh_google_token(refresh_token)

        # Update stored tokens
        user.google_access_token = encrypt_api_key(new_tokens["access_token"])
        user.google_token_expires_at = now + timedelta(seconds=new_tokens["expires_in"])
        await db.commit()

        return new_tokens["access_token"]
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Failed to refresh Google token: {str(e)}. Please log out and log in again."
        )


@router.post("/sheets/create")
async def create_sheet(
    request: CreateSheetRequest,
    auth_user: dict = Depends(require_auth),
    db: AsyncSession = Depends(get_db)
):
    """Create a new Google Sheet.

    Returns the spreadsheet ID and URL.
    """
    # Get user from database
    result = await db.execute(select(User).where(User.id == auth_user["sub"]))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    access_token = await get_valid_google_token(user, db)

    # Build request body
    body = {
        "properties": {
            "title": request.title
        }
    }

    # Add additional sheets if specified
    if request.sheets:
        body["sheets"] = [
            {"properties": {"title": name}} for name in request.sheets
        ]

    async with httpx.AsyncClient() as client:
        response = await client.post(
            SHEETS_API_BASE,
            headers={
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json"
            },
            json=body
        )

        if response.status_code != 200:
            error_detail = response.json() if response.headers.get("content-type", "").startswith("application/json") else response.text
            raise HTTPException(
                status_code=response.status_code,
                detail=f"Failed to create Google Sheet: {error_detail}"
            )

        data = response.json()
        spreadsheet_id = data["spreadsheetId"]
        spreadsheet_url = data["spreadsheetUrl"]

        # Extract actual sheet names from response
        sheet_names = [
            s.get("properties", {}).get("title", "Sheet1")
            for s in data.get("sheets", [])
        ]
        if not sheet_names:
            sheet_names = ["Sheet1"]

        return {
            "spreadsheet_id": spreadsheet_id,
            "url": spreadsheet_url,
            "title": request.title,
            "sheets": sheet_names
        }


@router.post("/sheets/update")
async def update_sheet(
    request: UpdateSheetRequest,
    auth_user: dict = Depends(require_auth),
    db: AsyncSession = Depends(get_db)
):
    """Update values in a Google Sheet.

    Uses valueInputOption=USER_ENTERED so formulas and formats are parsed.
    """
    result = await db.execute(select(User).where(User.id == auth_user["sub"]))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    access_token = await get_valid_google_token(user, db)

    # URL-encode the range to handle special characters like !
    encoded_range = quote(request.range, safe='')

    async with httpx.AsyncClient() as client:
        response = await client.put(
            f"{SHEETS_API_BASE}/{request.spreadsheet_id}/values/{encoded_range}",
            headers={
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json"
            },
            params={"valueInputOption": "USER_ENTERED"},
            json={"values": request.values}
        )

        if response.status_code != 200:
            error_detail = response.json() if response.headers.get("content-type", "").startswith("application/json") else response.text
            raise HTTPException(
                status_code=response.status_code,
                detail=f"Failed to update Google Sheet: {error_detail}"
            )

        data = response.json()
        return {
            "updated_range": data.get("updatedRange"),
            "updated_rows": data.get("updatedRows"),
            "updated_columns": data.get("updatedColumns"),
            "updated_cells": data.get("updatedCells")
        }


@router.post("/sheets/append")
async def append_sheet(
    request: AppendSheetRequest,
    auth_user: dict = Depends(require_auth),
    db: AsyncSession = Depends(get_db)
):
    """Append rows to a Google Sheet."""
    result = await db.execute(select(User).where(User.id == auth_user["sub"]))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    access_token = await get_valid_google_token(user, db)

    encoded_range = quote(request.range, safe='')

    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{SHEETS_API_BASE}/{request.spreadsheet_id}/values/{encoded_range}:append",
            headers={
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json"
            },
            params={
                "valueInputOption": "USER_ENTERED",
                "insertDataOption": "INSERT_ROWS"
            },
            json={"values": request.values}
        )

        if response.status_code != 200:
            error_detail = response.json() if response.headers.get("content-type", "").startswith("application/json") else response.text
            raise HTTPException(
                status_code=response.status_code,
                detail=f"Failed to append to Google Sheet: {error_detail}"
            )

        data = response.json()
        updates = data.get("updates", {})
        return {
            "updated_range": updates.get("updatedRange"),
            "updated_rows": updates.get("updatedRows"),
            "updated_cells": updates.get("updatedCells")
        }


@router.post("/sheets/read")
async def read_sheet(
    request: ReadSheetRequest,
    auth_user: dict = Depends(require_auth),
    db: AsyncSession = Depends(get_db)
):
    """Read values from a Google Sheet."""
    result = await db.execute(select(User).where(User.id == auth_user["sub"]))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    access_token = await get_valid_google_token(user, db)

    encoded_range = quote(request.range, safe='')

    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"{SHEETS_API_BASE}/{request.spreadsheet_id}/values/{encoded_range}",
            headers={"Authorization": f"Bearer {access_token}"}
        )

        if response.status_code != 200:
            error_detail = response.json() if response.headers.get("content-type", "").startswith("application/json") else response.text
            raise HTTPException(
                status_code=response.status_code,
                detail=f"Failed to read Google Sheet: {error_detail}"
            )

        data = response.json()
        return {
            "range": data.get("range"),
            "values": data.get("values", [])
        }


@router.get("/sheets/{spreadsheet_id}")
async def get_sheet_info(
    spreadsheet_id: str,
    auth_user: dict = Depends(require_auth),
    db: AsyncSession = Depends(get_db)
):
    """Get metadata about a Google Sheet."""
    result = await db.execute(select(User).where(User.id == auth_user["sub"]))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    access_token = await get_valid_google_token(user, db)

    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"{SHEETS_API_BASE}/{spreadsheet_id}",
            headers={"Authorization": f"Bearer {access_token}"},
            params={"fields": "spreadsheetId,spreadsheetUrl,properties.title,sheets.properties"}
        )

        if response.status_code != 200:
            error_detail = response.json() if response.headers.get("content-type", "").startswith("application/json") else response.text
            raise HTTPException(
                status_code=response.status_code,
                detail=f"Failed to get Google Sheet info: {error_detail}"
            )

        data = response.json()
        return {
            "spreadsheet_id": data.get("spreadsheetId"),
            "url": data.get("spreadsheetUrl"),
            "title": data.get("properties", {}).get("title"),
            "sheets": [
                {"title": s.get("properties", {}).get("title"), "index": s.get("properties", {}).get("index")}
                for s in data.get("sheets", [])
            ]
        }


@router.get("/connection-status")
async def check_google_connection(
    auth_user: dict = Depends(require_auth),
    db: AsyncSession = Depends(get_db)
):
    """Check if user has valid Google Drive/Sheets connection."""
    result = await db.execute(select(User).where(User.id == auth_user["sub"]))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    has_refresh_token = bool(user.google_refresh_token)
    token_valid = False

    if has_refresh_token and user.google_token_expires_at:
        token_valid = user.google_token_expires_at > datetime.utcnow()

    return {
        "connected": has_refresh_token,
        "token_valid": token_valid,
        "message": "Google Drive connected" if has_refresh_token else "Please log out and log in again to connect Google Drive"
    }
