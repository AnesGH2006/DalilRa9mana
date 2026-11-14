---
name: Workflow Architecture
description: How dev workflows are split between Start application and managed artifact workflows, and why they must not overlap.
---

## Rule
`Start application` runs **only** `pnpm run dev:client` (Vite, port 5000).
The API server is handled exclusively by the managed `artifacts/api-server: API Server` workflow (`pnpm -w run dev:server`, port 8080).

## Why
Replit auto-starts every registered artifact's managed workflow at project open.
- `artifacts/api-server: API Server` → grabs port 8080 automatically.
- `artifacts/school-analyzer: web` → runs `pnpm -w run dev:client` with `PORT=20053` (Vite respects `process.env.PORT` after the vite.config.ts fix), so it runs on 20053.
- If `Start application` also ran `dev:server`, it would EADDRINUSE on 8080 and die. If it also ran `dev:client` without the PORT fix, it would EADDRINUSE on 5000 and move to 5001, breaking the workflow's `waitForPort: 5000` gate and leaving the preview blank.

## How to apply
- Never change `Start application` back to `pnpm run dev` or `concurrently dev:server dev:client`.
- If both client and server need restarting, restart `Start application` AND `artifacts/api-server: API Server` separately.
- `vite.config.ts` server.port must remain `parseInt(process.env.PORT || "5000")` so the school-analyzer managed workflow gets port 20053 via its `PORT` env var.
