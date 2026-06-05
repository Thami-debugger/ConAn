import os
import threading
from typing import Optional

import psycopg2


_schema_lock = threading.Lock()
_schema_ready = False


def _normalize_db_url(raw_url: str) -> str:
    url = (raw_url or "").strip()
    if url.startswith("postgresql+psycopg2://"):
        return "postgresql://" + url[len("postgresql+psycopg2://"):]
    return url


def _get_db_url() -> str:
    return _normalize_db_url(
        os.getenv("SUPABASE_DB_URL")
        or os.getenv("POSTGRES_URL")
        or os.getenv("DATABASE_URL")
        or ""
    )


def _connect():
    db_url = _get_db_url()
    if not db_url:
        return None

    connect_kwargs = {}
    if "sslmode=" not in db_url.lower():
        connect_kwargs["sslmode"] = "require"

    return psycopg2.connect(db_url, **connect_kwargs)


def _ensure_schema() -> bool:
    global _schema_ready
    if _schema_ready:
        return True

    with _schema_lock:
        if _schema_ready:
            return True

        conn = _connect()
        if conn is None:
            return False

        try:
            with conn:
                with conn.cursor() as cur:
                    cur.execute(
                        """
                        CREATE TABLE IF NOT EXISTS ai_transcripts (
                            id BIGSERIAL PRIMARY KEY,
                            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                            session_id TEXT,
                            user_id TEXT,
                            role TEXT NOT NULL,
                            message TEXT NOT NULL,
                            source TEXT NOT NULL DEFAULT 'ai',
                            model TEXT
                        )
                        """
                    )
                    cur.execute(
                        """
                        CREATE INDEX IF NOT EXISTS idx_ai_transcripts_session_created
                        ON ai_transcripts (session_id, created_at DESC)
                        """
                    )
            _schema_ready = True
            return True
        finally:
            conn.close()


def store_ai_turn(
    *,
    role: str,
    message: str,
    user_id: Optional[str] = None,
    session_id: Optional[str] = None,
    source: str = "ai",
    model: Optional[str] = None,
) -> None:
    if not message:
        return

    try:
        if not _ensure_schema():
            return

        conn = _connect()
        if conn is None:
            return

        try:
            with conn:
                with conn.cursor() as cur:
                    cur.execute(
                        """
                        INSERT INTO ai_transcripts (session_id, user_id, role, message, source, model)
                        VALUES (%s, %s, %s, %s, %s, %s)
                        """,
                        (session_id, user_id, role, message, source, model),
                    )
        finally:
            conn.close()
    except Exception as exc:
        print(f"TRANSCRIPT_STORE_ERROR: {type(exc).__name__}: {exc}")
