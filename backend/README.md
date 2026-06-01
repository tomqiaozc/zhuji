# Zhuji Backend (M4)

FastAPI + PostgreSQL + SQLAlchemy[asyncio] + Alembic.

## Quick start

```bash
# 1. Start Postgres + backend with docker-compose (from repo root)
docker compose up --build

# 2. Or run the backend locally against a local Postgres
cp backend/.env.example backend/.env
cd backend
pip install -e ".[dev]"
alembic upgrade head
uvicorn src.main:app --reload --port 8000

# 3. Run tests (uses in-memory SQLite, no Postgres needed)
cd backend
pip install -e ".[dev]"
pytest -v
```

## API surface

- `POST /api/auth/register` — username + password (≥8 chars), returns access token.
- `POST /api/auth/login` — returns access token.
- `GET  /api/auth/me` — returns current user.
- `GET/POST/PATCH/DELETE /api/projects` (+ `/{id}`)
- `GET/POST/PATCH/DELETE /api/projects/{pid}/nodes` (+ `/{id}`)
- `GET/POST/PATCH/DELETE /api/nodes/{nid}/checklist` (+ `/{cid}`)
- `GET/POST/PATCH/DELETE /api/projects/{pid}/purchases` (+ `/{id}`)
- `GET/POST/PATCH/DELETE /api/projects/{pid}/reminders` (+ `/{id}`)
- `POST /api/projects/load-demo` — load the full demo project for the current user (11 stages / 62 nodes / 25–40 purchases / ¥60–80k).
- `GET  /api/health` — readiness probe (also checks DB).

All business endpoints require `Authorization: Bearer <jwt>` and scope every query by `user_id`. There is no cross-user access path.
