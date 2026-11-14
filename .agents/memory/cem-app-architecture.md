---
name: CEM App Architecture
description: Key decisions for the Algerian CEM school management app structure and data model
---

## Flat structure
- `client/`, `server/`, `shared/` at repo root (not pnpm sub-packages)
- `@shared/` Vite alias → `shared/` for client; server uses relative imports `../../shared/...`
- All shared types in `shared/types.ts`, Zod schemas in `shared/schemas.ts`, DB tables in `shared/schema.ts`, subjects in `shared/subjects.ts`

## DB tables
- `sessions`, `users`, `school_info` (with directeur+phone), `students`, `grades`, `absences`
- Migration: `pnpm tsx scripts/migrate.ts` (idempotent, uses IF NOT EXISTS)

**Why:** Flat structure avoids TS project reference complexity; all schemas colocated for easier maintenance.

## Grades model
- One row per (student_id, trimestre 1-3, subject, score 0-20)
- Subjects defined in `shared/subjects.ts` as `CEM_SUBJECTS[]` with key, arLabel, coef, optional levels
- `calcWeightedAvg(scores, subjects)` does coefficient-weighted average
- Trimester averages → annual average = mean of T1/T2/T3

## Sidebar 7 sections (updated)
1. التلاميذ (/, /students)
2. النتائج (/results, /subjects, /exam-results, /absences, /repeaters, /failed, /orientation-results, /transfer-results, /councils, /bem)
3. أعمال نهاية السنة (/yearend, /yearend/passed, /yearend/failed)
4. الإحصائيات والتحليل (/analytics) — recharts pie+bar+radial charts
5. التوجيه المسبق (/orientation — coming soon stub)
6. البيانات (/import)
7. المزيد (/settings, /account, /subscription)

## New pages added
- `/analytics` — recharts pie (gender), bar (level), radial (success rate), table with badges; year selector persists in localStorage
- `/subscription` — 3-tier plan cards (Free/Pro/Premium) with gradient headers and feature lists

## Year selector
- Dashboard and Analytics both have a year dropdown (2018-2019 to 2025-2026)
- Selected year persisted in localStorage key `cem-selected-year`
- Dashboard fetches stats for selected year, not just school's configured year

## Workflow
- Name: "Start application"
- Command: `pnpm run dev:server & pnpm run dev:client`
- waitForPort: 20053 (vite uses PORT env var, default 20053 in vite.config.ts)

## Critical: Vite proxy required for /api
- vite.config.ts MUST have `server.proxy: { "/api": { target: "http://localhost:8080" } }`
- Without it, all /api calls hit Vite (which 404s) instead of Express backend
- **Why:** Vite dev server and Express run on different ports; the proxy bridges them in dev

## UI style conventions
- Stat cards use bg-gradient-to-br with colored shadow (`shadow-{color}-500/25`)
- Buttons use gradient classes for bright CTAs (from-blue-500 to-indigo-600 etc.)
- Sidebar logo has gradient text; upgrade banner at bottom links to /subscription
- Recharts CustomTooltip uses bg-background/95 backdrop-blur for dark/light compatibility

## How to apply
- New pages → add route in App.tsx Switch + NavItemDef in SECTIONS array
- New subjects → add to `shared/subjects.ts` CEM_SUBJECTS array
- New DB columns → add to `shared/schema.ts` + add `ALTER TABLE ADD COLUMN IF NOT EXISTS` in `scripts/migrate.ts`
