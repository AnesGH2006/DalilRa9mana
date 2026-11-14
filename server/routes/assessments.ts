import { Router } from "express";
import { and, asc, eq } from "drizzle-orm";
import { assessmentEventsTable, db } from "../../shared/db.js";

const router = Router();

function schoolUserId(req: any): string {
  return req.memberContext?.schoolUserId ?? req.user!.id;
}

function validKind(value: unknown): value is "test" | "exam" {
  return value === "test" || value === "exam";
}

function validDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function timeOrNull(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  return typeof value === "string" && /^\d{2}:\d{2}$/.test(value) ? value : undefined;
}

router.get("/assessments", async (req, res): Promise<void> => {
  if (!req.isAuthenticated() || req.memberContext?.role === "parent") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const { annee = "2026-2027" } = req.query as Record<string, string>;
  const rows = await db.select().from(assessmentEventsTable)
    .where(and(
      eq(assessmentEventsTable.userId, schoolUserId(req)),
      eq(assessmentEventsTable.annee, annee),
    ))
    .orderBy(asc(assessmentEventsTable.eventDate), asc(assessmentEventsTable.startTime), asc(assessmentEventsTable.title));
  res.json(rows);
});

router.post("/assessments", async (req, res): Promise<void> => {
  if (!req.isAuthenticated() || req.memberContext?.role === "parent") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const body = req.body as Record<string, any>;
  const kind = validKind(body.kind) ? body.kind : "test";
  if (!validDate(body.eventDate) || typeof body.title !== "string" || !body.title.trim() || typeof body.subject !== "string" || !body.subject.trim()) {
    res.status(400).json({ error: "title, subject and eventDate are required" });
    return;
  }
  const trimestre = Number.isInteger(Number(body.trimestre)) && Number(body.trimestre) >= 1 && Number(body.trimestre) <= 3
    ? Number(body.trimestre)
    : null;
  const [row] = await db.insert(assessmentEventsTable).values({
    userId: schoolUserId(req),
    annee: typeof body.annee === "string" && body.annee ? body.annee : "2026-2027",
    trimestre,
    classe: typeof body.classe === "string" && body.classe.trim() ? body.classe.trim() : null,
    subject: body.subject.trim(),
    kind,
    title: body.title.trim(),
    eventDate: body.eventDate,
    startTime: timeOrNull(body.startTime) ?? null,
    endTime: timeOrNull(body.endTime) ?? null,
    room: typeof body.room === "string" && body.room.trim() ? body.room.trim() : null,
    notes: typeof body.notes === "string" && body.notes.trim() ? body.notes.trim() : null,
  }).returning();
  res.status(201).json(row);
});

router.patch("/assessments/:id", async (req, res): Promise<void> => {
  if (!req.isAuthenticated() || req.memberContext?.role === "parent") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const updates: Record<string, any> = {};
  const body = req.body as Record<string, any>;
  if (body.title !== undefined) updates.title = String(body.title).trim();
  if (body.subject !== undefined) updates.subject = String(body.subject).trim();
  if (body.kind !== undefined) {
    if (!validKind(body.kind)) { res.status(400).json({ error: "Invalid kind" }); return; }
    updates.kind = body.kind;
  }
  if (body.eventDate !== undefined) {
    if (!validDate(body.eventDate)) { res.status(400).json({ error: "Invalid eventDate" }); return; }
    updates.eventDate = body.eventDate;
  }
  if (body.trimestre !== undefined) {
    const trimestre = Number(body.trimestre);
    updates.trimestre = Number.isInteger(trimestre) && trimestre >= 1 && trimestre <= 3 ? trimestre : null;
  }
  if (body.classe !== undefined) updates.classe = typeof body.classe === "string" && body.classe.trim() ? body.classe.trim() : null;
  if (body.annee !== undefined) updates.annee = String(body.annee);
  if (body.room !== undefined) updates.room = typeof body.room === "string" && body.room.trim() ? body.room.trim() : null;
  if (body.notes !== undefined) updates.notes = typeof body.notes === "string" && body.notes.trim() ? body.notes.trim() : null;
  const startTime = timeOrNull(body.startTime);
  const endTime = timeOrNull(body.endTime);
  if (startTime !== undefined) updates.startTime = startTime;
  if (endTime !== undefined) updates.endTime = endTime;

  const [row] = await db.update(assessmentEventsTable).set(updates)
    .where(and(
      eq(assessmentEventsTable.id, String(req.params.id)),
      eq(assessmentEventsTable.userId, schoolUserId(req)),
    ))
    .returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

router.delete("/assessments/:id", async (req, res): Promise<void> => {
  if (!req.isAuthenticated() || req.memberContext?.role === "parent") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  await db.delete(assessmentEventsTable).where(and(
    eq(assessmentEventsTable.id, String(req.params.id)),
    eq(assessmentEventsTable.userId, schoolUserId(req)),
  ));
  res.json({ ok: true });
});

export default router;
