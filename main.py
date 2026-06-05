from fastapi import FastAPI
from fastapi import WebSocket
from fastapi import WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from matchmaking import *
from ai_listener import listen


signal_rooms = {}

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health_check():
    return {"status": "ok"}


@app.get("/")
def root():
    return {
        "name": "ConAn API",
        "status": "ok",
        "docs": "/docs",
        "health": "/health"
    }


@app.websocket("/ws/signal/{session_id}")
async def websocket_signaling(session_id: str, websocket: WebSocket):
    await websocket.accept()
    clients = signal_rooms.setdefault(session_id, set())
    clients.add(websocket)

    try:
        while True:
            payload = await websocket.receive_json()
            for peer in list(signal_rooms.get(session_id, set())):
                if peer is websocket:
                    continue
                await peer.send_json(payload)
    except WebSocketDisconnect:
        clients = signal_rooms.get(session_id)
        if clients:
            clients.discard(websocket)
            if not clients:
                signal_rooms.pop(session_id, None)


@app.post("/ai")
def ai_fallback(message: str):
    response = listen(message)
    return {"response": response}

@app.post("/speaker/{user_id}")
def join_speaker(user_id: str):
    add_speaker(user_id)
    return {"status": "waiting"}

@app.post("/listener/{user_id}")
def join_listener(user_id: str):
    add_listener(user_id)
    return {"status": "waiting"}

@app.get("/match")
def match():
    result = match_users()

    if result:
        return result

    return {"message": "No match"}


