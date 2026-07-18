---
name: Supabase lazy init
description: Why create_client() must be deferred to the FastAPI startup event, not called at module level.
---

# Supabase client must be initialised lazily

## The rule
Declare `supa: Optional[Client] = None` at module level. Assign it inside `@app.on_event("startup")` after reading the env vars. Never call `create_client()` at module scope.

## Why
`create_client(os.environ["SUPABASE_URL"], ...)` at module level causes the uvicorn worker process to crash during import — before the server binds its port. The outer uvicorn reloader process stays alive (so the workflow shows "running") but every worker exits immediately. No HTTP requests are ever served — including the admin login, which doesn't need the DB at all.

## How to apply
- `supa: Optional[Client] = None` at module scope
- In `_startup()`: check env vars, call `create_client()`, assign to `global supa`
- In `_q()`: if `supa is None`, raise `HTTPException(503, "Database not configured...")`
- Endpoints that don't touch the DB (e.g. admin login, health check) work immediately even without credentials.
