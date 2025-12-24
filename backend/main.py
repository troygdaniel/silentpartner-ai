from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from sqlalchemy import text
import os

from database import get_engine, init_db
from routes_auth import router as auth_router
from routes_employees import router as employees_router
import models  # noqa: F401 - Import to register models with Base


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: create tables
    await init_db()
    yield
    # Shutdown: nothing to do


app = FastAPI(lifespan=lifespan)

# Register routers
app.include_router(auth_router)
app.include_router(employees_router)


@app.get("/api/health")
def health_check():
    return {"status": "ok"}


@app.get("/api/db-health")
async def db_health_check():
    engine = get_engine()
    if engine is None:
        return {"status": "error", "message": "Database not configured"}
    try:
        async with engine.connect() as conn:
            result = await conn.execute(text("SELECT 1"))
            result.fetchone()
        return {"status": "ok", "database": "connected"}
    except Exception as e:
        return {"status": "error", "message": str(e)}


# Serve static frontend files
static_dir = os.path.join(os.path.dirname(__file__), "static")
if os.path.exists(static_dir):
    app.mount("/assets", StaticFiles(directory=os.path.join(static_dir, "assets")), name="assets")

    @app.get("/{full_path:path}")
    def serve_frontend(full_path: str):
        return FileResponse(os.path.join(static_dir, "index.html"))
