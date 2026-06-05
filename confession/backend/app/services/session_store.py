from datetime import datetime

from sqlalchemy.orm import Session

from app.models.entities import ConversationSession, Role, SessionStatus, SessionReport


def create_session_record(db: Session, session_id: str, speaker_id: str, listener_id: str, listener_type: str) -> str:
    role = Role.ai if listener_type == "ai" else Role.listener

    row = ConversationSession(
        session_uuid=session_id,
        speaker_id=speaker_id,
        listener_id=listener_id,
        listener_type=role,
        status=SessionStatus.active,
        started_at=datetime.utcnow(),
    )
    db.add(row)
    db.commit()
    return session_id


def end_session_record(db: Session, session_id: str) -> datetime:
    row = db.query(ConversationSession).filter(ConversationSession.session_uuid == session_id).first()
    ended_at = datetime.utcnow()
    if row:
        row.ended_at = ended_at
        row.status = SessionStatus.ended
        row.duration_seconds = int((ended_at - row.started_at).total_seconds())
        db.commit()
    return ended_at


def create_report(db: Session, session_id: str, reporter_id: str, reason: str) -> int:
    row = SessionReport(session_uuid=session_id, reporter_id=reporter_id, reason=reason)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row.id
