import os

import psycopg2


speaker_queue = []
listener_queue = []
matched_peers = {}

DB_URL = (
    os.getenv("SUPABASE_DB_URL")
    or os.getenv("DATABASE_URL")
    or os.getenv("POSTGRES_URL")
    or ""
).strip()

DB_ENABLED = bool(DB_URL)
_db_initialized = False


def _remove_from_queue(queue, user_id):
    try:
        queue.remove(user_id)
        return True
    except ValueError:
        return False


def _set_match(speaker_id, listener_id):
    matched_peers[speaker_id] = listener_id
    matched_peers[listener_id] = speaker_id


def _match_now_or_queue(user_id, own_queue, opposite_queue):
    # Keep users from existing in both queues when they switch roles.
    _remove_from_queue(opposite_queue, user_id)

    if user_id in matched_peers:
        return {"status": "matched", "peer_id": matched_peers[user_id]}

    _remove_from_queue(own_queue, user_id)

    if opposite_queue:
        peer_id = opposite_queue.pop(0)
        _set_match(user_id, peer_id)
        return {"status": "matched", "peer_id": peer_id}

    own_queue.append(user_id)
    return {"status": "waiting"}


def add_speaker(user_id):
    if DB_ENABLED:
        return _db_join_role(user_id, "speaker")
    return _match_now_or_queue(user_id, speaker_queue, listener_queue)


def add_listener(user_id):
    if DB_ENABLED:
        return _db_join_role(user_id, "listener")
    return _match_now_or_queue(user_id, listener_queue, speaker_queue)


def get_match_for_user(user_id):
    if DB_ENABLED:
        return _db_get_match_for_user(user_id)
    peer_id = matched_peers.get(user_id)
    if peer_id:
        return {"status": "matched", "peer_id": peer_id}
    return {"status": "waiting"}


def leave(user_id):
    if DB_ENABLED:
        return _db_leave(user_id)
    left_queue = _remove_from_queue(speaker_queue, user_id) or _remove_from_queue(listener_queue, user_id)
    peer_id = matched_peers.pop(user_id, None)
    if peer_id:
        matched_peers.pop(peer_id, None)
    return {
        "status": "left",
        "left_queue": left_queue,
        "had_match": bool(peer_id),
        "peer_id": peer_id,
    }


def match_users():
    if DB_ENABLED:
        return _db_match_any_pair()

    # Backward compatibility for older callers that expect a global match endpoint.
    if speaker_queue and listener_queue:
        speaker_id = speaker_queue.pop(0)
        listener_id = listener_queue.pop(0)
        _set_match(speaker_id, listener_id)
        return {
            "speaker": speaker_id,
            "listener": listener_id,
        }

    return None


def _connect_db():
    connect_kwargs = {}

    if "sslmode=" not in DB_URL.lower():
        connect_kwargs["sslmode"] = "require"

    return psycopg2.connect(DB_URL, **connect_kwargs)


def _ensure_db_schema():
    global _db_initialized

    if _db_initialized:
        return

    with _connect_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS conan_waiting_queue (
                    user_id TEXT PRIMARY KEY,
                    role TEXT NOT NULL CHECK (role IN ('speaker', 'listener')),
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """
            )
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS conan_matches (
                    user_id TEXT PRIMARY KEY,
                    peer_id TEXT NOT NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """
            )
            cur.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_conan_waiting_queue_role_created_at
                ON conan_waiting_queue (role, created_at)
                """
            )

    _db_initialized = True


def _db_join_role(user_id, role):
    _ensure_db_schema()
    opposite_role = "listener" if role == "speaker" else "speaker"

    with _connect_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT peer_id FROM conan_matches WHERE user_id = %s",
                (user_id,),
            )
            row = cur.fetchone()
            if row:
                return {"status": "matched", "peer_id": row[0]}

            cur.execute("DELETE FROM conan_waiting_queue WHERE user_id = %s", (user_id,))

            cur.execute(
                """
                INSERT INTO conan_waiting_queue (user_id, role)
                VALUES (%s, %s)
                ON CONFLICT (user_id)
                DO UPDATE SET role = EXCLUDED.role, updated_at = NOW()
                """,
                (user_id, role),
            )

            cur.execute(
                """
                SELECT user_id
                FROM conan_waiting_queue
                WHERE role = %s AND user_id <> %s
                ORDER BY created_at ASC
                FOR UPDATE SKIP LOCKED
                LIMIT 1
                """,
                (opposite_role, user_id),
            )
            peer_row = cur.fetchone()

            if not peer_row:
                return {"status": "waiting"}

            peer_id = peer_row[0]

            cur.execute(
                "DELETE FROM conan_waiting_queue WHERE user_id IN (%s, %s)",
                (user_id, peer_id),
            )

            cur.execute(
                """
                INSERT INTO conan_matches (user_id, peer_id)
                VALUES (%s, %s), (%s, %s)
                ON CONFLICT (user_id)
                DO UPDATE SET peer_id = EXCLUDED.peer_id, created_at = NOW()
                """,
                (user_id, peer_id, peer_id, user_id),
            )

            return {"status": "matched", "peer_id": peer_id}


def _db_get_match_for_user(user_id):
    _ensure_db_schema()

    with _connect_db() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT peer_id FROM conan_matches WHERE user_id = %s", (user_id,))
            row = cur.fetchone()

            if not row:
                return {"status": "waiting"}

            return {"status": "matched", "peer_id": row[0]}


def _db_leave(user_id):
    _ensure_db_schema()

    with _connect_db() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM conan_waiting_queue WHERE user_id = %s", (user_id,))
            left_queue = cur.rowcount > 0

            cur.execute("DELETE FROM conan_matches WHERE user_id = %s RETURNING peer_id", (user_id,))
            row = cur.fetchone()
            peer_id = row[0] if row else None

            if peer_id:
                cur.execute("DELETE FROM conan_matches WHERE user_id = %s", (peer_id,))

            return {
                "status": "left",
                "left_queue": left_queue,
                "had_match": bool(peer_id),
                "peer_id": peer_id,
            }


def _db_match_any_pair():
    _ensure_db_schema()

    with _connect_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT user_id
                FROM conan_waiting_queue
                WHERE role = 'speaker'
                ORDER BY created_at ASC
                FOR UPDATE SKIP LOCKED
                LIMIT 1
                """
            )
            speaker_row = cur.fetchone()

            if not speaker_row:
                return None

            cur.execute(
                """
                SELECT user_id
                FROM conan_waiting_queue
                WHERE role = 'listener'
                ORDER BY created_at ASC
                FOR UPDATE SKIP LOCKED
                LIMIT 1
                """
            )
            listener_row = cur.fetchone()

            if not listener_row:
                return None

            speaker_id = speaker_row[0]
            listener_id = listener_row[0]

            cur.execute(
                "DELETE FROM conan_waiting_queue WHERE user_id IN (%s, %s)",
                (speaker_id, listener_id),
            )

            cur.execute(
                """
                INSERT INTO conan_matches (user_id, peer_id)
                VALUES (%s, %s), (%s, %s)
                ON CONFLICT (user_id)
                DO UPDATE SET peer_id = EXCLUDED.peer_id, created_at = NOW()
                """,
                (speaker_id, listener_id, listener_id, speaker_id),
            )

            return {
                "speaker": speaker_id,
                "listener": listener_id,
            }