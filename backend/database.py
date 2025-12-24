import os
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker, declarative_base

DATABASE_URL = os.getenv("DATABASE_URL", "")

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
