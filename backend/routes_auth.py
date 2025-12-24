from fastapi import APIRouter, Depends
from fastapi.responses import RedirectResponse, HTMLResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from auth import (
    is_oauth_configured,
    get_google_auth_url,
    get_current_user,
    require_auth,
    exchange_google_code,
    create_access_token
)
from database import get_db
from models import User, Employee

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
async def google_callback(
    code: str = "",
    error: str = "",
    db: AsyncSession = Depends(get_db)
):
    """Handle Google OAuth callback - exchange code and create/update user."""
    if error:
        return HTMLResponse(content=f"""
            <html><body>
            <h1>Authentication Error</h1>
            <p>{error}</p>
            <a href="/">Return to home</a>
            </body></html>
        """, status_code=400)

    if not code:
        return HTMLResponse(content="""
            <html><body>
            <h1>Authentication Error</h1>
            <p>No authorization code received</p>
            <a href="/">Return to home</a>
            </body></html>
        """, status_code=400)

    # Exchange code for user info
    google_user = await exchange_google_code(code)

    google_id = google_user.get("id")
    email = google_user.get("email")
    name = google_user.get("name")
    picture = google_user.get("picture")

    # Find or create user
    result = await db.execute(select(User).where(User.google_id == google_id))
    user = result.scalar_one_or_none()

    is_new_user = False
    if user is None:
        is_new_user = True
        # Create new user
        user = User(
            email=email,
            name=name,
            picture=picture,
            google_id=google_id
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)

        # Create default Project Manager for new user
        default_pm = Employee(
            owner_id=user.id,
            name="Project Manager",
            role="Project Manager",
            instructions="You are a helpful Project Manager assistant. Help the user plan, organize, and track their projects and tasks.",
            model="gpt-4",
            is_default=True
        )
        db.add(default_pm)
        await db.commit()
    else:
        # Update existing user info
        user.name = name
        user.picture = picture
        user.email = email
        await db.commit()

    # Create JWT token
    token = create_access_token({
        "sub": str(user.id),
        "email": user.email,
        "name": user.name
    })

    # Return HTML that stores token and redirects
    return HTMLResponse(content=f"""
        <html>
        <head><title>Logging in...</title></head>
        <body>
        <script>
            localStorage.setItem('token', '{token}');
            window.location.href = '/';
        </script>
        <noscript>
            <p>Login successful! Token: {token}</p>
            <a href="/">Continue to app</a>
        </noscript>
        </body>
        </html>
    """)


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
