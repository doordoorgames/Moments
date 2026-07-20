---
name: Supabase maybe_single v2 returns None
description: In supabase-py v2+, maybe_single().execute() returns None when no row matches, not an APIResponse with data=None.
---

In supabase-py v2.31.0+, `.maybe_single().execute()` returns `None` directly when no row is found, rather than an `APIResponse` object with `data=None`.

**Why:** The library changed its return contract in v2. Accessing `.data` on `None` raises `AttributeError: 'NoneType' object has no attribute 'data'`.

**How to apply:** Guard every `maybe_single()` call site:
- Getters: `return res.data if res is not None else None`
- Conditional checks: `if res is not None and res.data:`

Never write `if res.data:` or `return res.data` directly after a `maybe_single()` call.
