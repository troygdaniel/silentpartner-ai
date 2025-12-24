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
