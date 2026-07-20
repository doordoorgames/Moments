---
name: Supabase service role key for server writes
description: The backend must use the service role key (not anon key) to bypass RLS for all server-side DB writes.
---

Supabase tables have Row Level Security (RLS) enabled by default. The anon key respects RLS and will return 401 on inserts/updates that lack a matching policy.

**Why:** The backend is a trusted server — it should bypass RLS entirely rather than define per-table policies. The service role key does this automatically.

**How to apply:**
- Store the key as `SUPABASE_SERVICE_ROLE_KEY` secret.
- In the startup event, prefer it over the anon key:
  `key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_KEY")`
- Never expose the service role key to the frontend or browser clients.
