from fastapi import FastAPI
from fastapi import WebSocket
from fastapi import WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from matchmaking import *
from ai_listener import listen
from transcript_store import store_ai_turn


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
    <html lang="en">
    <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>ConAn</title>
        <style>
            :root {
                --bg1: #f7efe3;
                --bg2: #d8e7f4;
                --ink: #1f2a37;
                --accent: #1769aa;
                --accent2: #0f9d8a;
                --accent3: #7f62ff;
                --card: #ffffff;
                --shadow: 0 18px 40px rgba(23, 105, 170, 0.15);
                --radius: 18px;
            }
            * { box-sizing: border-box; }
            body {
                margin: 0;
                min-height: 100vh;
                display: grid;
                place-items: center;
                background: radial-gradient(circle at top right, var(--bg2), transparent 40%),
                                        radial-gradient(circle at bottom left, #ffd5bf, transparent 38%),
                                        var(--bg1);
                font-family: "Trebuchet MS", "Segoe UI", sans-serif;
                color: var(--ink);
                padding: 20px;
            }
            .phone {
                width: min(92vw, 460px);
                border-radius: 28px;
                background: linear-gradient(180deg, rgba(255, 255, 255, 0.93), rgba(255, 255, 255, 0.8));
                box-shadow: var(--shadow);
                padding: 24px;
                border: 1px solid rgba(255, 255, 255, 0.7);
            }
            h1 { margin: 0 0 10px; font-size: 1.45rem; }
            p { margin: 0 0 14px; font-size: 0.96rem; opacity: 0.92; }
            .hidden { display: none; }
            .card {
                border-radius: 14px;
                background: #f8fbff;
                border: 1px solid #d6e2ec;
                padding: 12px;
                margin-bottom: 10px;
            }
            .btn {
                width: 100%;
                border: 0;
                border-radius: var(--radius);
                color: #fff;
                padding: 12px 14px;
                margin: 8px 0;
                font-size: 0.98rem;
                font-weight: 700;
                cursor: pointer;
            }
            .primary { background: linear-gradient(135deg, var(--accent), #2c87d4); }
            .secondary { background: linear-gradient(135deg, var(--accent2), #17b6a0); }
            .alt { background: linear-gradient(135deg, var(--accent3), #9d8cff); }
            .ghost {
                background: #ffffff;
                color: #1b2d3c;
                border: 1px solid #c9d6e3;
            }
            .status {
                margin-top: 12px;
                border-radius: 12px;
                background: #f6f8fb;
                border: 1px solid #d8e0eb;
                padding: 10px;
                font-size: 0.88rem;
                color: #3f4f62;
            }
        </style>
    </head>
    <body>
        <main class="phone">
            <section id="welcome">
                <h1>ConAn</h1>
                <p>A place to speak. A heart to listen.</p>
                <div class="card"><strong>100% Anonymous</strong><br/>Your identity is always protected.</div>
                <div class="card"><strong>Safe & Respectful</strong><br/>A judgment-free space to be heard.</div>
                <div class="card"><strong>Secure & Private</strong><br/>Conversations are never stored.</div>
                <button class="btn primary" id="get-started">Get Started</button>
            </section>

            <section id="join" class="hidden">
                <h1>How would you like to join?</h1>
                <p>You can switch roles anytime.</p>
                <button class="btn primary" id="speak">I want to speak</button>
                <button class="btn alt" id="conversation">Conversation mode</button>
                <button class="btn secondary" id="listen">I want to listen</button>
                <button class="btn ghost" id="back">Back</button>
            </section>

            <section id="finding" class="hidden">
                <h1>Finding a match...</h1>
                <p id="finding-message">We are matching you now.</p>
                <button class="btn primary" id="connect-now">Connect Now</button>
                <button class="btn ghost" id="cancel">Cancel</button>
            </section>

            <section id="session" class="hidden">
                <h1>You're connected</h1>
                <p id="session-message">Your listener is here for you.</p>
                <button class="btn ghost" id="mute">Mute</button>
                <button class="btn secondary" id="switch">Switch Role</button>
                <button class="btn alt" id="end">End Session</button>
            </section>

            <section id="ended" class="hidden">
                <h1>Session ended</h1>
                <p>Thank you for trusting us.</p>
                <button class="btn primary" id="talk-again">Talk Again</button>
            </section>

            <div class="status" id="status">Frontend mode loaded.</div>
        </main>

        <script>
            const sections = {
                welcome: document.getElementById("welcome"),
                join: document.getElementById("join"),
                finding: document.getElementById("finding"),
                session: document.getElementById("session"),
                ended: document.getElementById("ended")
            };

            let mode = "speak";

            function show(name) {
                Object.values(sections).forEach((el) => el.classList.add("hidden"));
                sections[name].classList.remove("hidden");
            }

            function setStatus(text) {
                document.getElementById("status").textContent = text;
            }

            document.getElementById("get-started").onclick = () => show("join");
            document.getElementById("back").onclick = () => show("welcome");
            document.getElementById("cancel").onclick = () => show("join");
            document.getElementById("talk-again").onclick = () => show("join");
            document.getElementById("switch").onclick = () => show("join");
            document.getElementById("end").onclick = () => show("ended");

            document.getElementById("speak").onclick = () => {
                mode = "speak";
                document.getElementById("finding-message").textContent = "Finding you a listener...";
                setStatus("Speaker mode selected.");
                show("finding");
            };

            document.getElementById("conversation").onclick = () => {
                mode = "conversation";
                document.getElementById("finding-message").textContent = "Finding a conversation partner...";
                setStatus("Conversation mode selected.");
                show("finding");
            };

            document.getElementById("listen").onclick = () => {
                mode = "listen";
                document.getElementById("finding-message").textContent = "Finding someone who wants to speak...";
                setStatus("Listener mode selected.");
                show("finding");
            };

            document.getElementById("connect-now").onclick = () => {
                const map = {
                    speak: "Your listener is here for you.",
                    conversation: "Conversation mode is active. Take turns and support each other.",
                    listen: "Someone is ready to share. Your listening matters."
                };
                document.getElementById("session-message").textContent = map[mode];
                setStatus("Connected in " + mode + " mode.");
                show("session");
            };

            document.getElementById("mute").onclick = (e) => {
                const muted = e.target.textContent === "Unmute";
                e.target.textContent = muted ? "Mute" : "Unmute";
                setStatus(muted ? "Microphone unmuted." : "Microphone muted.");
            };
        </script>
    </body>
    </html>
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
def ai_fallback(message: str, user_id: str | None = None, session_id: str | None = None):
    normalized = (message or "").strip()
    if normalized:
        store_ai_turn(
            role="user",
            message=normalized,
            user_id=user_id,
            session_id=session_id,
            source="ai_fallback",
        )

    response = listen(message)

    if response:
        store_ai_turn(
            role="assistant",
            message=response,
            user_id=user_id,
            session_id=session_id,
            source="ai_fallback",
        )

    return {"response": response}

@app.post("/speaker/{user_id}")
def join_speaker(user_id: str):
    return add_speaker(user_id)

@app.post("/listener/{user_id}")
def join_listener(user_id: str):
    return add_listener(user_id)

@app.get("/match")
def match(user_id: str | None = None):
    if user_id:
        return get_match_for_user(user_id)

    result = match_users()

    if result:
        return {"status": "matched", **result}

    return {"status": "waiting"}


@app.post("/leave/{user_id}")
def leave_matchmaking(user_id: str):
    return leave(user_id)


