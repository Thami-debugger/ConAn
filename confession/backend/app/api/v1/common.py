from datetime import datetime
from uuid import uuid4

from fastapi import APIRouter

from app.schemas.common import AnonymousIdentity, HealthResponse


router = APIRouter(tags=["common"])


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(status="ok")


@router.post("/anonymous-id", response_model=AnonymousIdentity)
def create_anonymous_id() -> AnonymousIdentity:
    return AnonymousIdentity(anonymous_user_id=str(uuid4()), created_at=datetime.utcnow())
