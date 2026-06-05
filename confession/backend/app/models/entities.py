from datetime import datetime
from enum import Enum

from sqlalchemy import Boolean, DateTime, Enum as SqlEnum, Float, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class Role(str, Enum):
    speaker = "speaker"
    listener = "listener"
    ai = "ai"


class SessionStatus(str, Enum):
    waiting = "waiting"
    active = "active"
    ended = "ended"


class ConversationSession(Base):
    __tablename__ = "conversation_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    session_uuid: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)

    speaker_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    listener_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    listener_type: Mapped[Role] = mapped_column(SqlEnum(Role), nullable=False, default=Role.listener)

    status: Mapped[SessionStatus] = mapped_column(SqlEnum(SessionStatus), nullable=False, default=SessionStatus.waiting)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), default=datetime.utcnow)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=False), nullable=True)
    duration_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)


class SessionReport(Base):
    __tablename__ = "session_reports"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    session_uuid: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    reporter_id: Mapped[str] = mapped_column(String(64), nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), default=datetime.utcnow)


class SessionAnalytics(Base):
    __tablename__ = "session_analytics"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    session_uuid: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    hour_of_day: Mapped[int] = mapped_column(Integer, nullable=False)
    topic: Mapped[str] = mapped_column(String(64), nullable=False)
    sentiment_score: Mapped[float] = mapped_column(Float, nullable=False)
    used_ai_listener: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    captured_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), default=datetime.utcnow)
