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
