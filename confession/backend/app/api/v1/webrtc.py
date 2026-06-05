from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.services.signaling import signaling_hub


router = APIRouter(tags=["webrtc"])


@router.websocket("/ws/signal/{session_id}")
async def websocket_signaling(session_id: str, websocket: WebSocket) -> None:
    await signaling_hub.connect(session_id, websocket)
    try:
        while True:
            payload = await websocket.receive_json()
            await signaling_hub.broadcast(session_id, payload, websocket)
    except WebSocketDisconnect:
        signaling_hub.disconnect(session_id, websocket)
