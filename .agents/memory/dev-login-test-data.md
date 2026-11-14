---
name: Dev-login test data pollution
description: curl/API testing via /api/dev-login writes real rows under a persistent "dev-test-user" account — must be cleaned up after verification.
---

This CEM app exposes `GET /api/dev-login` (gated by `ALLOW_DEV_LOGIN=true`) for instant test login without OIDC. It creates/reuses a real row in `users` with id `dev-test-user`.

**Why:** Any data written while testing through this session (imports, inserts) persists in the real dev database under that user, separate from the actual user's account — it won't be visible to them and will silently accumulate as junk if left behind.

**How to apply:** After using `/api/dev-login` + curl to verify an endpoint end-to-end, delete the rows you created for `user_id = 'dev-test-user'` (and the `users` row itself) before finishing the task.
