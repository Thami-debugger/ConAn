from fastapi import FastAPI
from fastapi import WebSocket
from fastapi import WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
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


@app.get("/", response_class=HTMLResponse)
def root():
        return """
<!doctype html>
<html lang=\"en\">
<head>
    <meta charset=\"UTF-8\" />
    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\" />
    <title>ConAn</title>
    <style>
        :root { --bg1:#f7efe3; --bg2:#d8e7f4; --ink:#1f2a37; --accent:#1769aa; --accent2:#0f9d8a; --shadow:0 18px 40px rgba(23,105,170,.15); --radius:18px; }
        * { box-sizing:border-box; }
        body { margin:0; min-height:100vh; display:grid; place-items:center; background:radial-gradient(circle at top right,var(--bg2),transparent 40%),radial-gradient(circle at bottom left,#ffd5bf,transparent 38%),var(--bg1); font-family:\"Trebuchet MS\",\"Segoe UI\",sans-serif; color:var(--ink); padding:20px; }
        .phone { width:min(92vw,440px); border-radius:28px; background:linear-gradient(180deg,rgba(255,255,255,.92),rgba(255,255,255,.78)); box-shadow:var(--shadow); padding:28px 22px; border:1px solid rgba(255,255,255,.7); }
        h1 { margin:0 0 8px; font-size:1.45rem; }
        p { margin:0 0 18px; font-size:.95rem; opacity:.9; }
        .btn { width:100%; border:0; border-radius:var(--radius); color:#fff; padding:14px 16px; margin:8px 0; font-size:1rem; font-weight:700; text-decoration:none; display:inline-block; text-align:center; }
        .speak { background:linear-gradient(135deg,var(--accent),#2c87d4); box-shadow:0 12px 24px rgba(23,105,170,.28); }
        .listen { background:linear-gradient(135deg,var(--accent2),#17b6a0); box-shadow:0 12px 24px rgba(15,157,138,.26); }
        .row { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:8px; }
        .link { color:var(--accent); text-decoration:none; font-size:.9rem; font-weight:700; border:1px solid #b7cce0; padding:10px 12px; border-radius:12px; text-align:center; background:#f8fbff; }
        .status { margin-top:14px; font-size:.86rem; opacity:.8; text-align:center; }
    </style>
</head>
<body>
    <main class=\"phone\">
        <h1>ConAn</h1>
        <p>Anonymous emotional support, voice-first.</p>
        <a class=\"btn speak\" href=\"/docs\">Open API Docs</a>
        <a class=\"btn listen\" href=\"/health\">Check API Health</a>
        <div class=\"row\">
            <a class=\"link\" href=\"/openapi.json\">OpenAPI JSON</a>
            <a class=\"link\" href=\"/match\">Test Match Route</a>
        </div>
        <div class=\"status\">Backend + homepage served from one FastAPI app.</div>
    </main>
</body>
</html>
"""


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


