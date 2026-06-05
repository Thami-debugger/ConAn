from pathlib import Path

from fastapi import APIRouter, Header, HTTPException
from fastapi.responses import HTMLResponse
from sqlalchemy import func
from sqlalchemy.orm import Session
from fastapi import Depends

from app.core.config import settings
from app.db.session import get_db
from app.models.entities import ConversationSession, SessionAnalytics


router = APIRouter(prefix="/admin", tags=["admin"])


def require_admin_key(x_admin_key: str | None) -> None:
    if x_admin_key != settings.admin_api_key:
        raise HTTPException(status_code=403, detail="Forbidden")


@router.get("/dashboard", response_class=HTMLResponse)
def dashboard(x_admin_key: str | None = Header(default=None)) -> HTMLResponse:
    require_admin_key(x_admin_key)
    html_path = Path(__file__).resolve().parents[2] / "admin" / "dashboard.html"
    return HTMLResponse(content=html_path.read_text(encoding="utf-8"))


@router.get("/summary")
def summary(db: Session = Depends(get_db), x_admin_key: str | None = Header(default=None)) -> dict:
    require_admin_key(x_admin_key)

    total_sessions = db.query(func.count(ConversationSession.id)).scalar() or 0
    ai_sessions = db.query(func.count(SessionAnalytics.id)).filter(SessionAnalytics.used_ai_listener.is_(True)).scalar() or 0
    avg_duration = db.query(func.avg(ConversationSession.duration_seconds)).scalar() or 0
    avg_sentiment = db.query(func.avg(SessionAnalytics.sentiment_score)).scalar() or 0

    top_topic_row = (
        db.query(SessionAnalytics.topic, func.count(SessionAnalytics.id).label("c"))
        .group_by(SessionAnalytics.topic)
        .order_by(func.count(SessionAnalytics.id).desc())
        .first()
    )
    top_topic = top_topic_row[0] if top_topic_row else "none"

    return {
        "session_count": int(total_sessions),
        "ai_session_count": int(ai_sessions),
        "average_session_duration_seconds": float(avg_duration),
        "average_sentiment_score": float(avg_sentiment),
        "top_topic": top_topic,
    }
