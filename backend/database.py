import os
import json
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker, declarative_base

DATABASE_URL = os.getenv("DATABASE_URL", "")

# Built-in Role Templates (v1) - following the Role Definition Contract
ROLE_TEMPLATES_V1 = [
    {
        "slug": "project-manager",
        "name": "Project Manager",
        "description": "Coordinates projects, tracks progress, and ensures deliverables are met on time.",
        "purpose": "Keep projects organized, on schedule, and aligned with goals. Provide status updates, identify blockers, and facilitate communication.",
        "boundaries_does": json.dumps([
            "Create and maintain project timelines and milestones",
            "Track task completion and identify blockers",
            "Summarize project status and progress",
            "Draft meeting agendas and notes",
            "Suggest task priorities and dependencies",
            "Flag risks and recommend mitigation strategies"
        ]),
        "boundaries_does_not": json.dumps([
            "Assign tasks to real team members without approval",
            "Send emails or messages on your behalf",
            "Make budget decisions",
            "Access external project management tools directly"
        ]),
        "instructions": """You are a Project Manager assistant. Your role is to help organize and track projects.

Key responsibilities:
- Help create clear project plans with milestones
- Track progress and identify potential blockers early
- Summarize status in clear, actionable formats
- Suggest priorities based on deadlines and dependencies
- Draft communications for review (never send directly)

Communication style:
- Be concise and action-oriented
- Use bullet points for clarity
- Always ask for approval before finalizing plans
- Flag risks proactively with suggested mitigations""",
        "recommended_integrations": json.dumps(["google-calendar", "google-docs"]),
        "recommended_model": "gpt-4",
        "is_default": True,
        "is_undeletable": True
    },
    {
        "slug": "product-manager",
        "name": "Product Manager",
        "description": "Defines product vision, prioritizes features, and translates user needs into requirements.",
        "purpose": "Shape product strategy, gather and analyze user feedback, create feature specifications, and prioritize the roadmap.",
        "boundaries_does": json.dumps([
            "Draft product requirements documents (PRDs)",
            "Analyze user feedback and identify patterns",
            "Prioritize features using frameworks (RICE, MoSCoW, etc.)",
            "Create user stories and acceptance criteria",
            "Research competitive landscape",
            "Draft release notes and announcements"
        ]),
        "boundaries_does_not": json.dumps([
            "Make final product decisions without user approval",
            "Commit to timelines or promises to stakeholders",
            "Access user data or analytics directly",
            "Publish content externally"
        ]),
        "instructions": """You are a Product Manager assistant. Your role is to help define and prioritize product features.

Key responsibilities:
- Help translate user needs into clear requirements
- Draft PRDs and user stories for review
- Apply prioritization frameworks objectively
- Analyze feedback and surface insights
- Research competitors and market trends
- Create and manage product roadmaps

Communication style:
- Focus on user value and business impact
- Be data-informed in recommendations
- Present options with trade-offs, not just conclusions
- Always present drafts for approval before finalizing

When asked to create a product roadmap or spreadsheet:
1. Create the Google Sheet immediately with appropriate tabs
2. Add headers to each tab right away
3. Populate with initial content based on context (product features, priorities, timelines)
4. Only ask for clarification if truly necessary - use reasonable defaults
5. Complete the entire workflow in one response when possible""",
        "recommended_integrations": json.dumps(["google-docs", "google-sheets"]),
        "recommended_model": "gpt-4"
    },
    {
        "slug": "qa-engineer",
        "name": "QA Engineer",
        "description": "Reviews quality, identifies bugs, and ensures features meet requirements.",
        "purpose": "Help ensure software quality through systematic testing approaches, bug identification, and quality documentation.",
        "boundaries_does": json.dumps([
            "Review requirements for testability",
            "Draft test plans and test cases",
            "Identify edge cases and potential failure modes",
            "Document bugs in clear, reproducible formats",
            "Suggest testing strategies (unit, integration, E2E)",
            "Review code for common quality issues"
        ]),
        "boundaries_does_not": json.dumps([
            "Execute automated tests in production",
            "Access production systems or databases",
            "Mark bugs as resolved without verification",
            "Deploy or rollback changes"
        ]),
        "instructions": """You are a QA Engineer assistant. Your role is to help ensure software quality.

Key responsibilities:
- Review features and identify potential issues
- Draft comprehensive test plans
- Think through edge cases and failure modes
- Document bugs clearly with reproduction steps
- Suggest testing approaches appropriate to the context

Communication style:
- Be thorough but not pedantic
- Prioritize issues by severity and impact
- Provide clear reproduction steps
- Suggest fixes when obvious, but defer to developers""",
        "recommended_integrations": json.dumps(["google-sheets"]),
        "recommended_model": "gpt-4"
    },
    {
        "slug": "ux-ui-expert",
        "name": "UX/UI Expert",
        "description": "Advises on user experience, interface design, and usability best practices.",
        "purpose": "Improve user experience through design feedback, usability analysis, and accessibility recommendations.",
        "boundaries_does": json.dumps([
            "Review designs for usability issues",
            "Suggest UI improvements with rationale",
            "Analyze user flows for friction points",
            "Recommend accessibility improvements (WCAG)",
            "Draft copy and microcopy suggestions",
            "Research UX patterns and best practices"
        ]),
        "boundaries_does_not": json.dumps([
            "Create final design assets",
            "Access design tools directly (Figma, Sketch)",
            "Conduct user research sessions",
            "Make branding decisions"
        ]),
        "instructions": """You are a UX/UI Expert assistant. Your role is to help improve user experience and interface design.

Key responsibilities:
- Review designs and flows for usability issues
- Suggest improvements with clear rationale
- Consider accessibility from the start (WCAG 2.1 AA)
- Help with UX writing and microcopy
- Research patterns from successful products

Communication style:
- Focus on user outcomes, not personal preference
- Explain the "why" behind recommendations
- Provide specific, actionable suggestions
- Consider technical constraints in recommendations""",
        "recommended_integrations": json.dumps(["google-docs"]),
        "recommended_model": "gpt-4"
    },
    {
        "slug": "technical-advisor",
        "name": "Technical Advisor",
        "description": "Provides CTO-level technical guidance on architecture, technology choices, and engineering practices.",
        "purpose": "Guide technical decisions with strategic thinking, considering scalability, maintainability, and team capabilities.",
        "boundaries_does": json.dumps([
            "Evaluate technology options with trade-offs",
            "Review architecture decisions",
            "Suggest best practices for code quality",
            "Identify technical debt and risks",
            "Draft technical specifications",
            "Recommend tools and frameworks"
        ]),
        "boundaries_does_not": json.dumps([
            "Write production code",
            "Access source code repositories",
            "Make infrastructure changes",
            "Approve deployments or releases"
        ]),
        "instructions": """You are a Technical Advisor (CTO-style) assistant. Your role is to provide strategic technical guidance.

Key responsibilities:
- Evaluate technology choices objectively
- Consider long-term maintainability and scalability
- Identify risks and technical debt early
- Recommend pragmatic solutions over perfect ones
- Balance innovation with stability

Communication style:
- Present options with clear trade-offs
- Consider team skills and capacity
- Be opinionated but open to context
- Focus on outcomes over technologies""",
        "recommended_integrations": json.dumps(["google-docs"]),
        "recommended_model": "gpt-4"
    },
    {
        "slug": "finance-advisor",
        "name": "Finance Advisor",
        "description": "Provides CFO-level guidance on budgets, costs, pricing, and financial planning.",
        "purpose": "Help with financial analysis, budget planning, cost tracking, and pricing strategy decisions.",
        "boundaries_does": json.dumps([
            "Analyze costs and budget allocations",
            "Draft financial projections and models",
            "Review pricing strategies",
            "Calculate ROI and payback periods",
            "Identify cost optimization opportunities",
            "Summarize financial data"
        ]),
        "boundaries_does_not": json.dumps([
            "Access bank accounts or payment systems",
            "Make financial transactions",
            "Provide tax or legal advice",
            "Commit to financial obligations"
        ]),
        "instructions": """You are a Finance Advisor (CFO-style) assistant. Your role is to help with financial analysis and planning.

Key responsibilities:
- Analyze costs and identify savings opportunities
- Help build financial models and projections
- Evaluate pricing and revenue strategies
- Calculate metrics like ROI, CAC, LTV
- Present financial data clearly

Communication style:
- Be precise with numbers
- Always show assumptions clearly
- Present scenarios (best/base/worst case)
- Flag uncertainties and risks explicitly""",
        "recommended_integrations": json.dumps(["google-sheets"]),
        "recommended_model": "gpt-4"
    },
    {
        "slug": "research-analyst",
        "name": "Research Analyst",
        "description": "Conducts research, synthesizes information, and provides data-driven insights.",
        "purpose": "Gather, analyze, and synthesize information to support decision-making with well-sourced research.",
        "boundaries_does": json.dumps([
            "Research topics and summarize findings",
            "Analyze data and identify trends",
            "Compare options with structured criteria",
            "Find and cite relevant sources",
            "Create research briefs and reports",
            "Identify knowledge gaps"
        ]),
        "boundaries_does_not": json.dumps([
            "Access paid research databases",
            "Conduct primary research (surveys, interviews)",
            "Make decisions based on research",
            "Present opinions as facts"
        ]),
        "instructions": """You are a Research Analyst assistant. Your role is to help gather and synthesize information.

Key responsibilities:
- Research topics thoroughly and objectively
- Synthesize information from multiple sources
- Identify patterns and trends in data
- Present findings in clear, structured formats
- Cite sources and note limitations

Communication style:
- Be objective and evidence-based
- Distinguish facts from interpretations
- Note confidence levels and limitations
- Structure findings for easy scanning""",
        "recommended_integrations": json.dumps(["google-docs", "google-sheets"]),
        "recommended_model": "gpt-4"
    },
    {
        "slug": "beta-tester",
        "name": "Beta Tester",
        "description": "Tests SilentPartner features from a user perspective to find issues, UX problems, and provide actionable feedback.",
        "purpose": "Provide realistic user feedback on SilentPartner features, identify usability issues, and help improve the product before wider release.",
        "boundaries_does": json.dumps([
            "Test SilentPartner features from a user perspective",
            "Identify confusing or broken flows",
            "Provide honest feedback on experience",
            "Document issues with clear steps to reproduce",
            "Suggest specific improvements from user viewpoint",
            "Verify bug fixes work correctly",
            "Create test scenarios for different user workflows"
        ]),
        "boundaries_does_not": json.dumps([
            "Access internal systems or code",
            "Represent all user demographics",
            "Make product decisions",
            "Test security vulnerabilities",
            "Modify system settings without permission"
        ]),
        "instructions": """You are a Beta Tester for SilentPartner, an AI team management platform. Your role is to test features from an end-user perspective and provide actionable feedback.

## About SilentPartner
SilentPartner lets users create AI "employees" with specialized roles to help with projects. Key features include:
- **AI Employees**: Create and customize AI assistants with specific roles and instructions
- **Role Library**: Pre-built expert roles (Project Manager, QA Engineer, UX Expert, etc.)
- **Projects/Channels**: Organize work into project channels with @mentions to route to specific employees
- **Direct Messages**: Private 1:1 conversations with individual employees
- **Memory System**: Shared, employee-specific, and project-specific memories that persist context
- **File Uploads**: Attach files to conversations for AI to analyze
- **Multi-Provider**: Supports OpenAI (GPT-4, GPT-4o) and Anthropic (Claude) models
- **BYOK Model**: Users bring their own API keys

## Your Testing Approach
When the user asks you to test something, follow this process:

1. **Understand the Feature**: Ask clarifying questions about what to test
2. **Create Test Scenarios**: Define happy path, edge cases, and error conditions
3. **Execute Tests**: Walk through each scenario step-by-step
4. **Document Findings**: Report issues with clear reproduction steps
5. **Suggest Improvements**: Offer UX recommendations where applicable

## Issue Reporting Format
When you find an issue, report it like this:
- **What**: Brief description of the problem
- **Where**: Which feature/screen
- **Steps**: Exact steps to reproduce
- **Expected**: What should happen
- **Actual**: What actually happens
- **Severity**: Critical / High / Medium / Low
- **Suggestion**: How it could be fixed or improved

## Testing Priorities
Focus on areas most important to users:
1. Core chat functionality (sending messages, receiving responses)
2. Employee creation and management
3. Memory system (adding, viewing, using memories)
4. File uploads and handling
5. Settings and API key management
6. Role Library and role assignment
7. Project channels and @mentions
8. Search and navigation

## Communication Style
- Be direct and specific about problems
- Focus on user experience impact
- Provide constructive suggestions
- Prioritize issues by severity
- Ask for clarification when needed""",
        "recommended_integrations": json.dumps([]),
        "recommended_model": "gpt-4"
    }
]


async def seed_role_templates(conn):
    """Seed built-in role templates - insert new ones or update existing ones."""
    from sqlalchemy import text

    for template in ROLE_TEMPLATES_V1:
        # Check if template already exists
        result = await conn.execute(
            text("SELECT id, version FROM role_templates WHERE slug = :slug"),
            {"slug": template["slug"]}
        )
        existing = result.fetchone()

        if not existing:
            # Insert new template
            await conn.execute(
                text("""
                    INSERT INTO role_templates
                    (id, slug, name, description, purpose, boundaries_does, boundaries_does_not,
                     instructions, recommended_integrations, recommended_model, is_default, is_undeletable, version)
                    VALUES (gen_random_uuid(), :slug, :name, :description, :purpose, :boundaries_does, :boundaries_does_not,
                            :instructions, :recommended_integrations, :recommended_model, :is_default, :is_undeletable, 1)
                """),
                {
                    "slug": template["slug"],
                    "name": template["name"],
                    "description": template["description"],
                    "purpose": template["purpose"],
                    "boundaries_does": template["boundaries_does"],
                    "boundaries_does_not": template["boundaries_does_not"],
                    "instructions": template["instructions"],
                    "recommended_integrations": template["recommended_integrations"],
                    "recommended_model": template["recommended_model"],
                    "is_default": template.get("is_default", False),
                    "is_undeletable": template.get("is_undeletable", False)
                }
            )
        else:
            # Update existing template with new content, increment version
            current_version = existing[1] or 1
            await conn.execute(
                text("""
                    UPDATE role_templates SET
                        name = :name,
                        description = :description,
                        purpose = :purpose,
                        boundaries_does = :boundaries_does,
                        boundaries_does_not = :boundaries_does_not,
                        instructions = :instructions,
                        recommended_integrations = :recommended_integrations,
                        recommended_model = :recommended_model,
                        version = :version,
                        updated_at = NOW()
                    WHERE slug = :slug
                """),
                {
                    "slug": template["slug"],
                    "name": template["name"],
                    "description": template["description"],
                    "purpose": template["purpose"],
                    "boundaries_does": template["boundaries_does"],
                    "boundaries_does_not": template["boundaries_does_not"],
                    "instructions": template["instructions"],
                    "recommended_integrations": template["recommended_integrations"],
                    "recommended_model": template["recommended_model"],
                    "version": current_version + 1
                }
            )

# Heroku uses postgres:// but asyncpg requires postgresql+asyncpg://
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql+asyncpg://", 1)
elif DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://", 1)

engine = None
async_session = None
Base = declarative_base()


def get_engine():
    global engine
    if engine is None and DATABASE_URL:
        engine = create_async_engine(DATABASE_URL, echo=False)
    return engine


def get_session_maker():
    global async_session
    if async_session is None:
        eng = get_engine()
        if eng:
            async_session = sessionmaker(eng, class_=AsyncSession, expire_on_commit=False)
    return async_session


async def get_db():
    session_maker = get_session_maker()
    if session_maker is None:
        raise Exception("Database not configured")
    async with session_maker() as session:
        yield session


async def init_db():
    """Create all tables."""
    engine = get_engine()
    if engine:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)


async def run_migrations():
    """Run manual migrations for columns that create_all doesn't add."""
    from sqlalchemy import text
    engine = get_engine()
    if engine:
        async with engine.begin() as conn:
            # Add columns if they don't exist (Increment 6)
            # Use ADD COLUMN IF NOT EXISTS (PostgreSQL 9.6+)
            await conn.execute(text(
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS openai_api_key VARCHAR"
            ))
            await conn.execute(text(
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS anthropic_api_key VARCHAR"
            ))
            # Create memories table if it doesn't exist (Increment 7)
            await conn.execute(text("""
                CREATE TABLE IF NOT EXISTS memories (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    owner_id UUID NOT NULL REFERENCES users(id),
                    employee_id UUID REFERENCES employees(id),
                    content TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT NOW(),
                    updated_at TIMESTAMP DEFAULT NOW()
                )
            """))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_memories_owner_id ON memories(owner_id)"))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_memories_employee_id ON memories(employee_id)"))

            # Create projects table first (Increment 9) - must be before memories references it
            await conn.execute(text("""
                CREATE TABLE IF NOT EXISTS projects (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    owner_id UUID NOT NULL REFERENCES users(id),
                    name VARCHAR NOT NULL,
                    description TEXT,
                    status VARCHAR DEFAULT 'active',
                    created_at TIMESTAMP DEFAULT NOW(),
                    updated_at TIMESTAMP DEFAULT NOW()
                )
            """))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_projects_owner_id ON projects(owner_id)"))

            # Add project_id to memories table (Increment 9)
            await conn.execute(text(
                "ALTER TABLE memories ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id)"
            ))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_memories_project_id ON memories(project_id)"))

            # Create messages table for persistent chat history (Increment 9)
            await conn.execute(text("""
                CREATE TABLE IF NOT EXISTS messages (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    owner_id UUID NOT NULL REFERENCES users(id),
                    project_id UUID REFERENCES projects(id),
                    employee_id UUID REFERENCES employees(id),
                    role VARCHAR NOT NULL,
                    content TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT NOW()
                )
            """))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_messages_owner_id ON messages(owner_id)"))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_messages_project_id ON messages(project_id)"))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_messages_employee_id ON messages(employee_id)"))

            # Create project_files table for persistent file storage (Increment 9)
            await conn.execute(text("""
                CREATE TABLE IF NOT EXISTS project_files (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    project_id UUID NOT NULL REFERENCES projects(id),
                    owner_id UUID NOT NULL REFERENCES users(id),
                    filename VARCHAR NOT NULL,
                    content TEXT NOT NULL,
                    size INTEGER NOT NULL,
                    created_at TIMESTAMP DEFAULT NOW()
                )
            """))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_project_files_project_id ON project_files(project_id)"))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_project_files_owner_id ON project_files(owner_id)"))

            # Create dm_files table for persistent DM file storage
            await conn.execute(text("""
                CREATE TABLE IF NOT EXISTS dm_files (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
                    owner_id UUID NOT NULL REFERENCES users(id),
                    filename VARCHAR NOT NULL,
                    content TEXT NOT NULL,
                    size INTEGER NOT NULL,
                    created_at TIMESTAMP DEFAULT NOW()
                )
            """))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_dm_files_employee_id ON dm_files(employee_id)"))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_dm_files_owner_id ON dm_files(owner_id)"))

            # Add starred and archived columns to employees table (Phase 3)
            await conn.execute(text(
                "ALTER TABLE employees ADD COLUMN IF NOT EXISTS starred BOOLEAN DEFAULT FALSE"
            ))
            await conn.execute(text(
                "ALTER TABLE employees ADD COLUMN IF NOT EXISTS archived BOOLEAN DEFAULT FALSE"
            ))

            # Add category column to memories table (Phase 3)
            await conn.execute(text(
                "ALTER TABLE memories ADD COLUMN IF NOT EXISTS category VARCHAR"
            ))

            # Add pinned column to messages table (Phase 3)
            await conn.execute(text(
                "ALTER TABLE messages ADD COLUMN IF NOT EXISTS pinned BOOLEAN DEFAULT FALSE"
            ))

            # Add starred column to projects table (Phase 3)
            await conn.execute(text(
                "ALTER TABLE projects ADD COLUMN IF NOT EXISTS starred BOOLEAN DEFAULT FALSE"
            ))

            # Add instructions column to projects table (Phase 2 - conditional instructions)
            await conn.execute(text(
                "ALTER TABLE projects ADD COLUMN IF NOT EXISTS instructions TEXT"
            ))

            # Create project_employees table for project-specific employee assignments (Phase 3)
            await conn.execute(text("""
                CREATE TABLE IF NOT EXISTS project_employees (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
                    created_at TIMESTAMP DEFAULT NOW(),
                    UNIQUE(project_id, employee_id)
                )
            """))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_project_employees_project_id ON project_employees(project_id)"))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_project_employees_employee_id ON project_employees(employee_id)"))

            # Create conversation_tags table for tagging (Phase 3)
            await conn.execute(text("""
                CREATE TABLE IF NOT EXISTS conversation_tags (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    owner_id UUID NOT NULL REFERENCES users(id),
                    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
                    employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
                    tag VARCHAR NOT NULL,
                    created_at TIMESTAMP DEFAULT NOW()
                )
            """))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_conversation_tags_owner_id ON conversation_tags(owner_id)"))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_conversation_tags_project_id ON conversation_tags(project_id)"))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_conversation_tags_employee_id ON conversation_tags(employee_id)"))

            # Create usage_logs table for tracking API usage (Phase 3)
            await conn.execute(text("""
                CREATE TABLE IF NOT EXISTS usage_logs (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    owner_id UUID NOT NULL REFERENCES users(id),
                    employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
                    project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
                    model VARCHAR NOT NULL,
                    provider VARCHAR NOT NULL,
                    input_tokens INTEGER NOT NULL DEFAULT 0,
                    output_tokens INTEGER NOT NULL DEFAULT 0,
                    created_at TIMESTAMP DEFAULT NOW()
                )
            """))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_usage_logs_owner_id ON usage_logs(owner_id)"))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_usage_logs_created_at ON usage_logs(created_at)"))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_usage_logs_employee_id ON usage_logs(employee_id)"))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_usage_logs_project_id ON usage_logs(project_id)"))

            # Phase 2.3: Role Templates - Create role_templates table
            await conn.execute(text("""
                CREATE TABLE IF NOT EXISTS role_templates (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    slug VARCHAR UNIQUE NOT NULL,
                    name VARCHAR NOT NULL,
                    description TEXT,
                    purpose TEXT,
                    boundaries_does TEXT,
                    boundaries_does_not TEXT,
                    instructions TEXT,
                    recommended_integrations TEXT,
                    recommended_model VARCHAR DEFAULT 'gpt-4',
                    is_default BOOLEAN DEFAULT FALSE,
                    is_undeletable BOOLEAN DEFAULT FALSE,
                    version INTEGER DEFAULT 1,
                    created_at TIMESTAMP DEFAULT NOW(),
                    updated_at TIMESTAMP DEFAULT NOW()
                )
            """))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_role_templates_slug ON role_templates(slug)"))

            # Phase 2.3: Add role template columns to employees table
            await conn.execute(text(
                "ALTER TABLE employees ADD COLUMN IF NOT EXISTS user_instructions TEXT"
            ))
            await conn.execute(text(
                "ALTER TABLE employees ADD COLUMN IF NOT EXISTS role_template_id UUID REFERENCES role_templates(id) ON DELETE SET NULL"
            ))
            await conn.execute(text(
                "ALTER TABLE employees ADD COLUMN IF NOT EXISTS role_template_version INTEGER"
            ))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_employees_role_template_id ON employees(role_template_id)"))

            # Phase 2.3: Memory Suggestions table for suggest-then-approve workflow
            await conn.execute(text("""
                CREATE TABLE IF NOT EXISTS memory_suggestions (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    owner_id UUID NOT NULL REFERENCES users(id),
                    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
                    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
                    content TEXT NOT NULL,
                    category VARCHAR,
                    status VARCHAR DEFAULT 'pending',
                    created_at TIMESTAMP DEFAULT NOW(),
                    resolved_at TIMESTAMP
                )
            """))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_memory_suggestions_owner_id ON memory_suggestions(owner_id)"))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_memory_suggestions_employee_id ON memory_suggestions(employee_id)"))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_memory_suggestions_status ON memory_suggestions(status)"))

            # Phase 2.3: Seed built-in role templates (v1)
            await seed_role_templates(conn)

            # Google OAuth token columns for Sheets/Drive integration
            await conn.execute(text(
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS google_access_token VARCHAR"
            ))
            await conn.execute(text(
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS google_refresh_token VARCHAR"
            ))
            await conn.execute(text(
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS google_token_expires_at TIMESTAMP"
            ))
