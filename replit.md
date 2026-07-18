# Branching Narrative RPG Engine

A multiplayer branching-narrative game engine with independent per-player progression, Location Gates (all players must arrive), and Vote Gates (majority decision).

## Stack

- **Backend**: FastAPI + Motor (async MongoDB driver) — `backend/server.py`
- **Frontend**: React 19 + CRACO + Tailwind + shadcn/ui + React Flow (`@xyflow/react`)
- **Database**: MongoDB (required — see Environment Variables below)

## How to run

Two workflows are needed:

| Workflow | Command | Port |
|----------|---------|------|
| Backend  | `cd backend && uvicorn server:app --host 0.0.0.0 --port 8001 --reload` | 8001 (console) |
| Frontend | `cd frontend && PORT=5000 yarn start` | 5000 (webview) |

The frontend dev server proxies all `/api` requests (HTTP + WebSocket) to `localhost:8001`, so no cross-origin issues.

## Environment Variables

| Key | Where | Notes |
|-----|-------|-------|
| `MONGO_URL` | Replit Secret | e.g. `mongodb+srv://user:pass@cluster.mongodb.net` — **required, backend crashes without it** |
| `DB_NAME` | Replit Secret | e.g. `narrative_rpg` — **required** |
| `ADMIN_PASSWORD` | Replit Secret (optional) | defaults to `admin123` |
| `REACT_APP_BACKEND_URL` | Env var | set to `""` (empty) — proxy handles routing |

## Visual Node Editor

The story graph editor is at `/admin/stories/:id` — built with React Flow. Requires:
1. Admin login at `/admin` (password from `ADMIN_PASSWORD` env var)
2. A story selected from `/admin/stories`

## User Preferences

- Do not change the MongoDB architecture or database layer without explicit instruction.
- Do not migrate the database schema without explicit instruction.
