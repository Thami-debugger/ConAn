from collections import defaultdict

from fastapi import WebSocket


class SignalingHub:
    def __init__(self) -> None:
        self.rooms: dict[str, set[WebSocket]] = defaultdict(set)

    async def connect(self, session_id: str, ws: WebSocket) -> None:
        await ws.accept()
        self.rooms[session_id].add(ws)

    def disconnect(self, session_id: str, ws: WebSocket) -> None:
        clients = self.rooms.get(session_id)
        if not clients:
            return
        clients.discard(ws)
        if not clients:
            self.rooms.pop(session_id, None)

    async def broadcast(self, session_id: str, payload: dict, sender: WebSocket) -> None:
        for ws in list(self.rooms.get(session_id, set())):
            if ws != sender:
                await ws.send_json(payload)


signaling_hub = SignalingHub()
