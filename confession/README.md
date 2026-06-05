# Confession

Anonymous voice listening platform where users join as speaker or listener, with AI fallback when no listener is available.

## Monorepo Structure

- backend/: FastAPI service, matchmaking, AI listener, WebRTC signaling, admin analytics API.
- frontend/: Expo + React Native (TypeScript) mobile UI.
- database/: PostgreSQL schema.
- docker/: Dockerfiles and docker-compose.
- deployment/: Render and Railway deployment manifests.

## Phase Breakdown

### Phase 1: Backend Foundation

- Anonymous UUID creation endpoint.
- Speaker/listener queues.
- Automatic matching.
- AI fallback after timeout.

### Phase 2: Safety and Analytics

- Session end and report endpoints.
- Admin summary endpoint (admin key required).
- Topic/sentiment metric extraction from transcript text.
- No raw audio persisted.

### Phase 3: Voice Real-Time Path

- WebSocket signaling endpoint for WebRTC exchange.
- Client can send offer/answer/ICE payloads through /ws/signal/{session_id}.

### Phase 4: Frontend Experience

- Dark confession-style UI.
- Role selection, queue join, session view.
- AI listener chat fallback UI.
- End/report controls.

## Local Run

## 1) Backend

1. cd backend
2. python -m venv .venv
3. .venv/Scripts/activate (Windows) or source .venv/bin/activate (Unix)
4. pip install -r requirements.txt
5. Copy .env.example to .env and fill values.
6. uvicorn app.main:app --reload --port 8000

Docs: http://127.0.0.1:8000/docs

## 2) Frontend

1. cd frontend
2. npm install
3. Copy .env.example to .env
4. npm run web (or npm run start for native clients)

## Docker Run

From docker/ folder:

1. docker compose up --build

Services:

- Backend: http://localhost:8000
- Frontend web: http://localhost:19006
- Postgres: localhost:5432

## API Summary

- POST /v1/anonymous-id
- POST /v1/matchmaking/speaker
- POST /v1/matchmaking/listener
- GET /v1/matchmaking/status/{anonymous_user_id}
- POST /v1/ai/listen
- POST /v1/sessions/{session_id}/end
- POST /v1/sessions/{session_id}/report
- GET /v1/admin/summary (requires x-admin-key)
- GET /v1/admin/dashboard (requires x-admin-key)
- WS /ws/signal/{session_id}

## Deployment

### Render

- Use deployment/render.yaml.
- Configure DATABASE_URL, OPENAI_API_KEY, ADMIN_API_KEY.

### Railway

- Use deployment/railway.json.
- Set the same environment variables.

## Privacy and Safety Design

- Anonymous IDs only.
- No raw audio storage.
- Transcripts are optional and used only for metric extraction.
- Persisted data is anonymized: duration, topic, sentiment, timestamp, AI-vs-human.

## Notes

- This repository includes production-oriented structure and API contracts.
- For full production hardening, add auth for admin dashboard, rate limiting, queue persistence (Redis), and moderation pipelines.
