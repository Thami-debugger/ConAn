from datetime import datetime

from pydantic import BaseModel


class HealthResponse(BaseModel):
    status: str


class AnonymousIdentity(BaseModel):
    anonymous_user_id: str
    created_at: datetime
