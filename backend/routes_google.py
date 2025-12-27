"""
Google Drive/Sheets API integration routes.

Provides endpoints for AI employees to create and manage Google Sheets.
"""
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import httpx
import re

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

    async with httpx.AsyncClient() as client:
        url = f"{SHEETS_API_BASE}/{request.spreadsheet_id}/values/{request.range}"
        response = await client.put(
            url,
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

    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{SHEETS_API_BASE}/{request.spreadsheet_id}/values/{request.range}:append",
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

    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"{SHEETS_API_BASE}/{request.spreadsheet_id}/values/{request.range}",
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


# --- Roadmap Creation ---

class RoadmapItem(BaseModel):
    """A single roadmap item (feature/task)."""
    name: str
    description: str = ""
    priority: str = ""
    status: str = "Not Started"
    notes: str = ""


class RoadmapPhase(BaseModel):
    """A phase containing multiple roadmap items."""
    name: str
    description: str = ""
    items: List[RoadmapItem] = []


class CreateRoadmapRequest(BaseModel):
    """Request to create a roadmap spreadsheet."""
    title: str
    content: str  # Markdown content to parse
    # Optional: pre-parsed phases (if AI already parsed it)
    phases: Optional[List[RoadmapPhase]] = None


def parse_roadmap_markdown(content: str) -> List[RoadmapPhase]:
    """Parse markdown roadmap content into structured phases and items.

    Supports formats like:
    - ## Phase 1: Foundation
    - ### Feature Name
    - **Feature Name**: Description
    - - [ ] Task item
    - - [x] Completed task
    - Bullet points with descriptions
    """
    phases: List[RoadmapPhase] = []
    current_phase: Optional[RoadmapPhase] = None
    current_item: Optional[RoadmapItem] = None

    lines = content.split('\n')

    for line in lines:
        line = line.strip()
        if not line:
            continue

        # Phase headers: ## Phase 1, ### Phase 1, # Phase 1, or **Phase 1**
        phase_match = re.match(
            r'^#{1,3}\s*(?:Phase\s*)?(\d+)?[:\s-]*(.+?)(?:\s*[-–—]\s*(.+))?$',
            line, re.IGNORECASE
        )
        if phase_match:
            # Check if this is actually a feature (### Feature) inside a phase
            if line.startswith('###') and current_phase is not None:
                # This is a feature header, not a phase
                feature_name = phase_match.group(2).strip() if phase_match.group(2) else ""
                if phase_match.group(3):
                    feature_name = f"{feature_name} - {phase_match.group(3).strip()}"
                current_item = RoadmapItem(name=feature_name)
                current_phase.items.append(current_item)
                continue

            # Save previous phase
            if current_phase:
                phases.append(current_phase)

            phase_num = phase_match.group(1) or str(len(phases) + 1)
            phase_title = phase_match.group(2).strip() if phase_match.group(2) else f"Phase {phase_num}"
            phase_desc = phase_match.group(3).strip() if phase_match.group(3) else ""

            current_phase = RoadmapPhase(
                name=f"Phase {phase_num}: {phase_title}" if phase_num.isdigit() else phase_title,
                description=phase_desc
            )
            current_item = None
            continue

        # Bold phase markers: **Phase 1: Title**
        bold_phase_match = re.match(r'^\*\*Phase\s*(\d+)[:\s-]*(.+?)\*\*', line, re.IGNORECASE)
        if bold_phase_match:
            if current_phase:
                phases.append(current_phase)

            phase_num = bold_phase_match.group(1)
            phase_title = bold_phase_match.group(2).strip()
            current_phase = RoadmapPhase(name=f"Phase {phase_num}: {phase_title}")
            current_item = None
            continue

        # If no phase yet, create a default one
        if current_phase is None:
            current_phase = RoadmapPhase(name="Overview")

        # Feature items: **Feature**: Description or - **Feature**: Description
        feature_match = re.match(r'^[-*]?\s*\*\*(.+?)\*\*[:\s]*(.*)$', line)
        if feature_match:
            feature_name = feature_match.group(1).strip()
            feature_desc = feature_match.group(2).strip()
            current_item = RoadmapItem(name=feature_name, description=feature_desc)
            current_phase.items.append(current_item)
            continue

        # Checkbox items: - [ ] Task or - [x] Completed task
        checkbox_match = re.match(r'^[-*]\s*\[([ xX])\]\s*(.+)$', line)
        if checkbox_match:
            is_done = checkbox_match.group(1).lower() == 'x'
            task_name = checkbox_match.group(2).strip()

            # Parse task name and any description after colon
            task_parts = task_name.split(':', 1)
            item_name = task_parts[0].strip()
            item_desc = task_parts[1].strip() if len(task_parts) > 1 else ""

            current_item = RoadmapItem(
                name=item_name,
                description=item_desc,
                status="Completed" if is_done else "Not Started"
            )
            current_phase.items.append(current_item)
            continue

        # Regular bullet points: - Item or * Item
        bullet_match = re.match(r'^[-*]\s+(.+)$', line)
        if bullet_match:
            item_text = bullet_match.group(1).strip()

            # Check for "Name: Description" format
            if ':' in item_text:
                parts = item_text.split(':', 1)
                item_name = parts[0].strip()
                item_desc = parts[1].strip()
            else:
                item_name = item_text
                item_desc = ""

            current_item = RoadmapItem(name=item_name, description=item_desc)
            current_phase.items.append(current_item)
            continue

        # Numbered items: 1. Item or 1) Item
        numbered_match = re.match(r'^\d+[.)]\s+(.+)$', line)
        if numbered_match:
            item_text = numbered_match.group(1).strip()

            if ':' in item_text:
                parts = item_text.split(':', 1)
                item_name = parts[0].strip()
                item_desc = parts[1].strip()
            else:
                item_name = item_text
                item_desc = ""

            current_item = RoadmapItem(name=item_name, description=item_desc)
            current_phase.items.append(current_item)
            continue

        # Plain text following a feature - treat as description continuation
        if current_item and line and not line.startswith('#'):
            if current_item.description:
                current_item.description += " " + line
            else:
                current_item.description = line

    # Don't forget the last phase
    if current_phase:
        phases.append(current_phase)

    return phases


def phases_to_sheet_data(phases: List[RoadmapPhase]) -> Dict[str, List[List[str]]]:
    """Convert parsed phases to sheet data format.

    Returns a dict of {sheet_name: [[row1], [row2], ...]}
    Creates one sheet per phase plus an Overview sheet.
    """
    sheets_data: Dict[str, List[List[str]]] = {}

    # Overview sheet with summary of all phases
    overview_rows = [
        ["Phase", "Items", "Status", "Description"],
    ]

    for phase in phases:
        # Count items by status
        completed = sum(1 for item in phase.items if item.status == "Completed")
        total = len(phase.items)
        status = f"{completed}/{total} complete" if total > 0 else "Empty"

        overview_rows.append([
            phase.name,
            str(total),
            status,
            phase.description or ""
        ])

    sheets_data["Overview"] = overview_rows

    # Individual phase sheets
    for i, phase in enumerate(phases, 1):
        # Sanitize sheet name (max 100 chars, no special chars)
        sheet_name = re.sub(r'[^\w\s-]', '', phase.name)[:50].strip()
        if not sheet_name:
            sheet_name = f"Phase{i}"

        phase_rows = [
            ["Item", "Description", "Priority", "Status", "Notes"],
        ]

        for item in phase.items:
            phase_rows.append([
                item.name,
                item.description or "",
                item.priority or "Medium",
                item.status or "Not Started",
                item.notes or ""
            ])

        # Ensure unique sheet names
        if sheet_name in sheets_data:
            sheet_name = f"{sheet_name}_{i}"

        sheets_data[sheet_name] = phase_rows

    return sheets_data


@router.post("/sheets/create-roadmap")
async def create_roadmap_sheet(
    request: CreateRoadmapRequest,
    auth_user: dict = Depends(require_auth),
    db: AsyncSession = Depends(get_db)
):
    """Create a complete roadmap spreadsheet from markdown content.

    This endpoint handles all parsing and sheet creation atomically,
    ensuring reliable roadmap creation without depending on AI tool calls.

    The spreadsheet will have:
    - An Overview sheet summarizing all phases
    - Individual sheets for each phase with detailed items
    """
    result = await db.execute(select(User).where(User.id == auth_user["sub"]))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    access_token = await get_valid_google_token(user, db)

    # Parse the markdown content into phases
    if request.phases:
        phases = request.phases
    else:
        phases = parse_roadmap_markdown(request.content)

    if not phases:
        raise HTTPException(
            status_code=400,
            detail="Could not parse any phases from the provided content"
        )

    # Convert phases to sheet data
    sheets_data = phases_to_sheet_data(phases)
    sheet_names = list(sheets_data.keys())

    async with httpx.AsyncClient(timeout=60.0) as client:
        # Step 1: Create the spreadsheet with all sheets
        create_body = {
            "properties": {"title": request.title},
            "sheets": [{"properties": {"title": name}} for name in sheet_names]
        }

        create_response = await client.post(
            SHEETS_API_BASE,
            headers={
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json"
            },
            json=create_body
        )

        if create_response.status_code != 200:
            error_detail = create_response.json() if create_response.headers.get("content-type", "").startswith("application/json") else create_response.text
            raise HTTPException(
                status_code=create_response.status_code,
                detail=f"Failed to create spreadsheet: {error_detail}"
            )

        create_data = create_response.json()
        spreadsheet_id = create_data["spreadsheetId"]
        spreadsheet_url = create_data["spreadsheetUrl"]

        # Step 2: Batch update all sheets with data
        batch_data = []
        for sheet_name, rows in sheets_data.items():
            batch_data.append({
                "range": f"'{sheet_name}'!A1",
                "values": rows
            })

        batch_response = await client.post(
            f"{SHEETS_API_BASE}/{spreadsheet_id}/values:batchUpdate",
            headers={
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json"
            },
            json={
                "valueInputOption": "USER_ENTERED",
                "data": batch_data
            }
        )

        if batch_response.status_code != 200:
            error_detail = batch_response.json() if batch_response.headers.get("content-type", "").startswith("application/json") else batch_response.text
            raise HTTPException(
                status_code=batch_response.status_code,
                detail=f"Failed to populate spreadsheet: {error_detail}"
            )

        # Step 3: Format the header rows (bold, freeze)
        sheet_id_map = {
            s.get("properties", {}).get("title"): s.get("properties", {}).get("sheetId")
            for s in create_data.get("sheets", [])
        }

        format_requests = []
        for sheet_name in sheet_names:
            sheet_id = sheet_id_map.get(sheet_name)
            if sheet_id is not None:
                # Bold header row
                format_requests.append({
                    "repeatCell": {
                        "range": {
                            "sheetId": sheet_id,
                            "startRowIndex": 0,
                            "endRowIndex": 1
                        },
                        "cell": {
                            "userEnteredFormat": {
                                "textFormat": {"bold": True},
                                "backgroundColor": {"red": 0.9, "green": 0.9, "blue": 0.9}
                            }
                        },
                        "fields": "userEnteredFormat(textFormat,backgroundColor)"
                    }
                })
                # Freeze header row
                format_requests.append({
                    "updateSheetProperties": {
                        "properties": {
                            "sheetId": sheet_id,
                            "gridProperties": {"frozenRowCount": 1}
                        },
                        "fields": "gridProperties.frozenRowCount"
                    }
                })

        if format_requests:
            await client.post(
                f"{SHEETS_API_BASE}/{spreadsheet_id}:batchUpdate",
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Content-Type": "application/json"
                },
                json={"requests": format_requests}
            )

        # Build summary of what was created
        phase_summaries = []
        for phase in phases:
            phase_summaries.append({
                "name": phase.name,
                "item_count": len(phase.items),
                "description": phase.description
            })

        return {
            "spreadsheet_id": spreadsheet_id,
            "url": spreadsheet_url,
            "title": request.title,
            "sheets": sheet_names,
            "phases": phase_summaries,
            "total_items": sum(len(p.items) for p in phases)
        }
