from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.session import EndSessionRequest, EndSessionResponse, ReportRequest, ReportResponse
from app.services.analytics import store_session_metrics
from app.services.matchmaking import matchmaking_service
from app.services.session_store import create_report, end_session_record


router = APIRouter(prefix="/sessions", tags=["sessions"])


@router.post("/{session_id}/end", response_model=EndSessionResponse)
async def end_session(session_id: str, payload: EndSessionRequest, db: Session = Depends(get_db)) -> EndSessionResponse:
    removed_session_id = await matchmaking_service.end_session(payload.anonymous_user_id)
    if removed_session_id is None:
        raise HTTPException(status_code=404, detail="No active session for this user")

    ended_at = end_session_record(db, session_id)

    if payload.transcript:
        store_session_metrics(db, session_id, payload.transcript, used_ai=("ai" in payload.transcript.lower()))

    return EndSessionResponse(session_id=session_id, status="ended", ended_at=ended_at)


@router.post("/{session_id}/report", response_model=ReportResponse)
def report_session(session_id: str, payload: ReportRequest, db: Session = Depends(get_db)) -> ReportResponse:
    report_id = create_report(db, session_id=session_id, reporter_id=payload.anonymous_user_id, reason=payload.reason)
    return ReportResponse(status="reported", report_id=report_id)
