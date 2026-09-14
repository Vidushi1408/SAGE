from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import os

from contextlib import asynccontextmanager
from app.core.config import settings
from app.api.v1 import auth, connectors, data, insights, chat, team
from app.services.scheduler import scheduler_service

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Initialize and run background synchronization
    scheduler_service.start()
    yield
    # Shutdown: Stop scheduler execution threads
    scheduler_service.shutdown()

app = FastAPI(
    title=settings.PROJECT_NAME,
    description="SAGE - Smart Analytics & Growth Engine API. An analyst that never clocks out.",
    version="1.0.0",
    lifespan=lifespan
)

# CORS configurations
cors_origins_raw = os.getenv("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000,http://localhost:3001,http://127.0.0.1:3001")
origins = [o.strip() for o in cors_origins_raw.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount Routers
app.include_router(auth.router, prefix="/api/v1/auth", tags=["Authentication"])
app.include_router(connectors.router, prefix="/api/v1/connectors", tags=["Connectors"])
app.include_router(data.router, prefix="/api/v1/data", tags=["Data Sync"])
app.include_router(insights.router, prefix="/api/v1/insights", tags=["Insights"])
app.include_router(chat.router, prefix="/api/v1/chat", tags=["Chat Agent"])
app.include_router(team.router, prefix="/api/v1/team", tags=["Team Management"])

@app.get("/")
def read_root():
    return {
        "status": "healthy",
        "project": settings.PROJECT_NAME,
        "tagline": "An analyst that never clocks out."
    }
