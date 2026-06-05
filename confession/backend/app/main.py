from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1 import admin, ai, common, matchmaking, session, webrtc
from app.core.config import settings
from app.db.session import Base, engine

try:
    Base.metadata.create_all(bind=engine)
except Exception:
    # Keep API bootable so queue and AI fallback can run while DB is being provisioned.
    pass

app = FastAPI(title=settings.app_name)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.allowed_origins.split(",") if o.strip()] or ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(common.router, prefix="/v1")
app.include_router(matchmaking.router, prefix="/v1")
app.include_router(session.router, prefix="/v1")
app.include_router(ai.router, prefix="/v1")
app.include_router(admin.router, prefix="/v1")
app.include_router(webrtc.router)
