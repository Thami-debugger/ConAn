CREATE TABLE IF NOT EXISTS conversation_sessions (
    id SERIAL PRIMARY KEY,
    session_uuid VARCHAR(64) UNIQUE NOT NULL,
    speaker_id VARCHAR(64) NOT NULL,
    listener_id VARCHAR(64),
    listener_type VARCHAR(16) NOT NULL,
    status VARCHAR(16) NOT NULL,
    started_at TIMESTAMP NOT NULL DEFAULT NOW(),
    ended_at TIMESTAMP,
    duration_seconds INTEGER
);

CREATE TABLE IF NOT EXISTS session_reports (
    id SERIAL PRIMARY KEY,
    session_uuid VARCHAR(64) NOT NULL,
    reporter_id VARCHAR(64) NOT NULL,
    reason TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS session_analytics (
    id SERIAL PRIMARY KEY,
    session_uuid VARCHAR(64) NOT NULL,
    hour_of_day INTEGER NOT NULL,
    topic VARCHAR(64) NOT NULL,
    sentiment_score DOUBLE PRECISION NOT NULL,
    used_ai_listener BOOLEAN NOT NULL DEFAULT FALSE,
    captured_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sessions_session_uuid ON conversation_sessions(session_uuid);
CREATE INDEX IF NOT EXISTS idx_reports_session_uuid ON session_reports(session_uuid);
CREATE INDEX IF NOT EXISTS idx_analytics_session_uuid ON session_analytics(session_uuid);
