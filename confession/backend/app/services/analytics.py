from datetime import datetime

from sqlalchemy.orm import Session

from app.models.entities import SessionAnalytics


def classify_topic(text: str) -> str:
    content = text.lower()
    if any(token in content for token in ["school", "exam", "class"]):
        return "education"
    if any(token in content for token in ["work", "job", "boss"]):
        return "work"
    if any(token in content for token in ["family", "parent", "home"]):
        return "family"
    if any(token in content for token in ["relationship", "partner", "love"]):
        return "relationship"
    return "general"


def sentiment_score(text: str) -> float:
    content = text.lower()
    negative = ["sad", "alone", "anxious", "bad", "angry", "lost"]
    positive = ["better", "grateful", "calm", "hopeful", "good", "relieved"]

    score = 0
    for token in negative:
        if token in content:
            score -= 1
    for token in positive:
        if token in content:
            score += 1

    # Clamp in [-1, 1]
    return max(-1.0, min(1.0, score / 5.0))


def store_session_metrics(db: Session, session_id: str, transcript: str, used_ai: bool) -> None:
    now = datetime.utcnow()
    row = SessionAnalytics(
        session_uuid=session_id,
        hour_of_day=now.hour,
        topic=classify_topic(transcript),
        sentiment_score=sentiment_score(transcript),
        used_ai_listener=used_ai,
    )
    db.add(row)
    db.commit()
