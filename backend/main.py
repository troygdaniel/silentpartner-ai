from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from sqlalchemy import text
import os

from database import get_engine, init_db, run_migrations
from routes_auth import router as auth_router
from routes_employees import router as employees_router
from routes_settings import router as settings_router
from routes_chat import router as chat_router
from routes_memory import router as memory_router
from routes_files import router as files_router
from routes_projects import router as projects_router
from routes_messages import router as messages_router
from routes_project_files import router as project_files_router
from routes_project_employees import router as project_employees_router
from routes_tags import router as tags_router
from routes_usage import router as usage_router
from routes_export import router as export_router
from routes_roles import router as roles_router
from routes_memory_suggestions import router as memory_suggestions_router
from routes_google import router as google_router
from routes_dashboard import router as dashboard_router
from routes_processing import router as processing_router
import models  # noqa: F401 - Import to register models with Base


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: create tables and run migrations
    await init_db()
    await run_migrations()
    yield
    # Shutdown: nothing to do


app = FastAPI(lifespan=lifespan)

# Register routers
app.include_router(auth_router)
app.include_router(employees_router)
app.include_router(settings_router)
app.include_router(chat_router)
app.include_router(memory_router)
app.include_router(files_router)
app.include_router(projects_router)
app.include_router(messages_router)
app.include_router(project_files_router)
app.include_router(project_employees_router)
app.include_router(tags_router)
app.include_router(usage_router)
app.include_router(export_router)
app.include_router(roles_router)
app.include_router(memory_suggestions_router)
app.include_router(google_router)
app.include_router(dashboard_router)
app.include_router(processing_router)


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
