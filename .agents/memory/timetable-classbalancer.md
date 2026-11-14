---
name: Timetable & Class Balancer modules
description: Architecture and key decisions for the timetable manager and smart class balancing features
---

# Timetable & Class Balancer modules

## What was built
- **Smart Class Balancer** (`/class-balancer`): calls existing `/api/class-balancer/balance-niveau`, shows drag-and-drop class cards, saves via new `/api/class-balancer/apply` (updates `students.classe` in DB)
- **Timetable Manager** (`/timetable`): 4-tab UI (Schedule | Teachers | Rooms | Print), interactive grid with drag-and-drop slots, conflict highlighting
- **WhatsApp button**: now reads `supportPhone` from `/api/school`; hidden when field is empty; configurable in Settings page

## DB tables added (pushed via db:push)
- `timetable_teachers` — name, subjects (jsonb), phone, color
- `timetable_rooms` — name, type (classroom|lab|sports|library|other), capacity
- `timetable_slots` — classe, subject, teacherId, roomId, day (0=Sun→4=Thu), period (0-6)
- `school_info.support_phone` — new column for WhatsApp support number

## Server routes
- `server/routes/timetable.ts` — all CRUD for teachers/rooms/slots + conflict detection + distinct classes
- `server/routes/classBalancer.ts` — added POST `/class-balancer/apply`
- `server/routes/school.ts` — handles `supportPhone` in PUT body

## Key decisions
- Algerian school week: days 0–4 (Sun–Thu), 7 periods per day
- WhatsApp button only renders when `supportPhone` is set in school settings — no broken link with placeholder
- Conflict detection is server-side (GET /timetable/conflicts) and highlights slot IDs client-side
- Class balancer drag-and-drop rebuilds stats inline without re-fetching server; "apply" call updates DB

**Why:** Keeping conflicts server-side ensures all classes are checked, not just the currently visible one.

## Pre-existing TS bug fixed
`server/routes/grades.ts` line 125: `req.memberContext?.memberUserId` → `req.memberContext?.memberId`

## Trimestre filter in results.tsx
Added `TriFilter` type + `TRI_OPTIONS` constant + `getTriAvg` / `getTriPassed` / `resultBadgeLabel` helpers.
Filter options: "" | "1" | "2" | "1+2" | "3" | "1+2+3". Selected filter highlights the relevant T column(s) with a violet tint and changes the avg column header dynamically.
Niveau change no longer resets the classe filter.

## 4AM result label
`resultBadgeLabel(passed, niveau)` returns "معيد" for 4AM students who fail (not "راسب"). Badge uses amber color for "معيد" vs red for "راسب".

## OCR v3 — Groq Vision
Replaced Tesseract with Groq `meta-llama/llama-4-scout-17b-16e-instruct` vision model.
Uses raw fetch to `https://api.groq.com/openai/v1/chat/completions` with base64 JPEG image.
Sharp still used for resize-only preprocessing (max 1920px, JPEG 88 quality).
Returns same response shape as v2: `{ rows, totalLines, overallConfidence, rawText }`.
