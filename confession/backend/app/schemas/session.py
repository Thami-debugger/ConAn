from datetime import datetime

from pydantic import BaseModel


class EndSessionRequest(BaseModel):
    anonymous_user_id: str
    transcript: str | None = None


class EndSessionResponse(BaseModel):
    session_id: str
    status: str
    ended_at: datetime


class ReportRequest(BaseModel):
    anonymous_user_id: str
    reason: str


class ReportResponse(BaseModel):
    status: str
    report_id: int
