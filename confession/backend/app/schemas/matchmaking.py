from datetime import datetime
from typing import Literal

from pydantic import BaseModel


class JoinQueueRequest(BaseModel):
    anonymous_user_id: str


class JoinQueueResponse(BaseModel):
    status: Literal["waiting", "matched", "ai_fallback"]
    session_id: str | None = None
    peer_id: str | None = None
    role: Literal["speaker", "listener"]
    listener_type: Literal["human", "ai"] | None = None
    queued_at: datetime


class MatchStatusResponse(BaseModel):
    status: Literal["waiting", "matched", "ended"]
    session_id: str | None = None
    peer_id: str | None = None
    listener_type: Literal["human", "ai"] | None = None
