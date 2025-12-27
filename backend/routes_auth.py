from datetime import datetime, timedelta
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
from models import User, Employee, TeamMember
from crypto import encrypt_api_key


# QuietDesk default team configuration
QUIETDESK_TEAM = [
    {
        "role": "project_manager",
        "name": "Quincy",
        "title": "Project Manager",
        "is_lead": True,
        "model": "gpt-4-turbo",
        "instructions": """You are Quincy, the lead Project Manager at QuietDesk, a consulting firm.

You are the primary point of contact for users. When they submit requests, you:
1. Understand their needs and clarify if necessary
2. Coordinate with your team behind the scenes (Jordan, Sam, Riley, Morgan, Taylor, Casey)
3. Synthesize team input into clear, actionable deliverables
4. Present polished results to the user

Your team:
- Jordan (Product Manager): Roadmaps, PRDs, prioritization
- Sam (Technical Advisor): Architecture, feasibility, technical guidance
- Riley (QA Engineer): Testing, quality assurance, edge cases
- Morgan (UX Expert): Design, usability, user experience
- Taylor (Marketing Consultant): Positioning, messaging, go-to-market
- Casey (Research Analyst): Market research, competitor analysis

Communication style:
- Professional but friendly
- Clear and concise
- Focus on delivering value, not process details
- Present findings with confidence but acknowledge limitations"""
    },
    {
        "role": "product_manager",
        "name": "Jordan",
        "title": "Product Manager",
        "is_lead": False,
        "model": "gpt-4-turbo",
        "instructions": """You are Jordan, Product Manager at QuietDesk.

Your expertise:
- Product roadmaps and prioritization
- PRDs and user stories
- Feature specification
- Product strategy and vision
- Stakeholder alignment

When consulted by Quincy, provide specific, actionable product insights. Focus on user value and business impact."""
    },
    {
        "role": "technical_advisor",
        "name": "Sam",
        "title": "Technical Advisor",
        "is_lead": False,
        "model": "gpt-4-turbo",
        "instructions": """You are Sam, Technical Advisor at QuietDesk.

Your expertise:
- Software architecture and design patterns
- Technology selection and trade-offs
- Technical feasibility assessment
- Performance and scalability
- Security considerations

When consulted by Quincy, provide clear technical guidance. Explain trade-offs and recommend pragmatic solutions."""
    },
    {
        "role": "qa_engineer",
        "name": "Riley",
        "title": "QA Engineer",
        "is_lead": False,
        "model": "gpt-4-turbo",
        "instructions": """You are Riley, QA Engineer at QuietDesk.

Your expertise:
- Test planning and strategy
- Edge cases and error scenarios
- Quality standards and best practices
- Bug identification and prevention
- User acceptance criteria

When consulted by Quincy, identify potential issues, edge cases, and quality concerns. Focus on preventing problems before they occur."""
    },
    {
        "role": "ux_expert",
        "name": "Morgan",
        "title": "UX Expert",
        "is_lead": False,
        "model": "gpt-4-turbo",
        "instructions": """You are Morgan, UX Expert at QuietDesk.

Your expertise:
- User experience design
- Usability and accessibility
- User research insights
- Interface design patterns
- User journey optimization

When consulted by Quincy, provide user-centered design guidance. Focus on clarity, simplicity, and user delight."""
    },
    {
        "role": "marketing_consultant",
        "name": "Taylor",
        "title": "Marketing Consultant",
        "is_lead": False,
        "model": "gpt-4-turbo",
        "instructions": """You are Taylor, Marketing Consultant at QuietDesk.

Your expertise:
- Product positioning and messaging
- Go-to-market strategy
- Competitive differentiation
- Brand voice and tone
- Launch planning

When consulted by Quincy, provide strategic marketing insights. Focus on how to communicate value and reach target audiences."""
    },
    {
        "role": "research_analyst",
        "name": "Casey",
        "title": "Research Analyst",
        "is_lead": False,
        "model": "gpt-4-turbo",
        "instructions": """You are Casey, Research Analyst at QuietDesk.

Your expertise:
- Market research and analysis
- Competitor intelligence
- Industry trends
- Data synthesis and insights
- Evidence-based recommendations

When consulted by Quincy, provide well-researched insights backed by evidence. Focus on actionable intelligence."""
    }
]


async def create_quietdesk_team(user_id, db: AsyncSession):
    """Create the default QuietDesk consulting team for a new user."""
    for member_config in QUIETDESK_TEAM:
        team_member = TeamMember(
            owner_id=user_id,
            role=member_config["role"],
            name=member_config["name"],
            title=member_config["title"],
            is_lead=member_config["is_lead"],
            model=member_config["model"],
            instructions=member_config["instructions"]
        )
        db.add(team_member)
    await db.commit()

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

    # Exchange code for user info and tokens
    auth_result = await exchange_google_code(code)

    google_user = auth_result["user_info"]
    google_access_token = auth_result["access_token"]
    google_refresh_token = auth_result.get("refresh_token")
    expires_in = auth_result.get("expires_in", 3600)

    google_id = google_user.get("id")
    email = google_user.get("email")
    name = google_user.get("name")
    picture = google_user.get("picture")

    # Calculate token expiration
    token_expires_at = datetime.utcnow() + timedelta(seconds=expires_in)

    # Encrypt tokens for storage
    encrypted_access_token = encrypt_api_key(google_access_token) if google_access_token else None
    encrypted_refresh_token = encrypt_api_key(google_refresh_token) if google_refresh_token else None

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
            google_id=google_id,
            google_access_token=encrypted_access_token,
            google_refresh_token=encrypted_refresh_token,
            google_token_expires_at=token_expires_at
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)

        # Create default Project Manager for new user (legacy, kept for backward compatibility)
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

        # Create QuietDesk consulting team for new user
        await create_quietdesk_team(user.id, db)
    else:
        # Update existing user info and tokens
        user.name = name
        user.picture = picture
        user.email = email
        user.google_access_token = encrypted_access_token
        # Only update refresh token if we got a new one (not always returned)
        if encrypted_refresh_token:
            user.google_refresh_token = encrypted_refresh_token
        user.google_token_expires_at = token_expires_at
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
