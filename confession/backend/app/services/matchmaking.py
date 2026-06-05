import asyncio
from collections import deque
from dataclasses import dataclass
from datetime import datetime
from uuid import uuid4

from app.core.config import settings
from app.models.entities import Role


@dataclass
class QueueEntry:
    user_id: str
    queued_at: datetime


class MatchmakingService:
    def __init__(self) -> None:
        self._speaker_queue: deque[QueueEntry] = deque()
        self._listener_queue: deque[QueueEntry] = deque()
        self._lock = asyncio.Lock()

        self._session_by_user: dict[str, dict] = {}

    async def join_speaker(self, user_id: str) -> dict:
        async with self._lock:
            if user_id in self._session_by_user:
                return self._session_by_user[user_id]

            queued_at = datetime.utcnow()
            if self._listener_queue:
                listener = self._listener_queue.popleft()
                return self._create_match(user_id, listener.user_id, Role.listener)

            self._speaker_queue.append(QueueEntry(user_id=user_id, queued_at=queued_at))

        await asyncio.sleep(settings.ai_wait_timeout_seconds)

        async with self._lock:
            existing = self._session_by_user.get(user_id)
            if existing:
                return existing

            for idx, entry in enumerate(self._speaker_queue):
                if entry.user_id == user_id:
                    del self._speaker_queue[idx]
                    break

            return self._create_match(user_id, "ai-listener", Role.ai)

    async def join_listener(self, user_id: str) -> dict:
        async with self._lock:
            if user_id in self._session_by_user:
                return self._session_by_user[user_id]

            if self._speaker_queue:
                speaker = self._speaker_queue.popleft()
                return self._create_match(speaker.user_id, user_id, Role.listener)

            self._listener_queue.append(QueueEntry(user_id=user_id, queued_at=datetime.utcnow()))
            return {
                "status": "waiting",
                "session_id": None,
                "peer_id": None,
                "listener_type": None,
                "role": "listener",
                "queued_at": datetime.utcnow(),
            }

    async def get_status(self, user_id: str) -> dict:
        async with self._lock:
            existing = self._session_by_user.get(user_id)
            if existing:
                return existing

            return {
                "status": "waiting",
                "session_id": None,
                "peer_id": None,
                "listener_type": None,
            }

    async def end_session(self, user_id: str) -> str | None:
        async with self._lock:
            info = self._session_by_user.get(user_id)
            if not info:
                return None

            session_id = info["session_id"]
            peer_id = info["peer_id"]

            self._session_by_user.pop(user_id, None)
            if peer_id:
                self._session_by_user.pop(peer_id, None)

            return session_id

    def _create_match(self, speaker_id: str, listener_id: str, listener_role: Role) -> dict:
        session_id = str(uuid4())
        listener_type = "ai" if listener_role == Role.ai else "human"

        speaker_info = {
            "status": "ai_fallback" if listener_role == Role.ai else "matched",
            "session_id": session_id,
            "peer_id": listener_id,
            "listener_type": listener_type,
            "role": "speaker",
            "queued_at": datetime.utcnow(),
        }
        listener_info = {
            "status": "matched",
            "session_id": session_id,
            "peer_id": speaker_id,
            "listener_type": listener_type,
            "role": "listener",
            "queued_at": datetime.utcnow(),
        }

        self._session_by_user[speaker_id] = speaker_info
        self._session_by_user[listener_id] = listener_info
        return speaker_info


matchmaking_service = MatchmakingService()
