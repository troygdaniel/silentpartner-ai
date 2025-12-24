from fastapi import APIRouter, Depends
from fastapi.responses import RedirectResponse

from auth import (
    is_oauth_configured,
    get_google_auth_url,
    get_current_user,
    require_auth
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.get("/status")
async def auth_status():
    """Check if OAuth is configured."""
    return {
        "oauth_configured": is_oauth_configured(),
        "provider": "google"
    }


@router.get("/google")
async def google_login():
    """Redirect to Google OAuth. Returns error if not configured."""
    auth_url = get_google_auth_url()  # Raises 503 if not configured
    return RedirectResponse(url=auth_url)


@router.get("/callback")
async def google_callback(code: str = "", error: str = ""):
    """
    Handle Google OAuth callback.
    Scaffold only - actual token exchange implemented in Increment 4.
    """
    if error:
        return {"status": "error", "message": error}

    if not code:
        return {"status": "error", "message": "No authorization code received"}

    # Scaffold response - real implementation in Increment 4
    return {
        "status": "scaffold",
        "message": "OAuth callback received. Token exchange not yet implemented.",
        "code_received": bool(code)
    }


@router.get("/me")
async def get_me(user: dict = Depends(require_auth)):
    """Get current authenticated user."""
    return {
        "user_id": user.get("sub"),
        "email": user.get("email"),
        "name": user.get("name")
    }


@router.post("/logout")
async def logout():
    """
    Logout endpoint.
    Client should discard the JWT token.
    """
    return {"status": "ok", "message": "Logged out"}
