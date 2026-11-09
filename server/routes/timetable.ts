/**
 * Timetable routes
 *
 * Teachers:  GET/POST /timetable/teachers,  PATCH/DELETE /timetable/teachers/:id
 * Rooms:     GET/POST /timetable/rooms,     PATCH/DELETE /timetable/rooms/:id
 * Slots:     GET/POST /timetable/slots,     PUT/DELETE   /timetable/slots/:id
 * Conflicts: GET /timetable/conflicts?annee=&classe=
 * Classes:   GET /timetable/classes?annee=  (distinct classe names from students)
 */

import { Router } from "express";
import { and, eq, inArray, or } from "drizzle-orm";
import {
  db,
  timetableTeachersTable,
  timetableRoomsTable,
  timetableSlotsTable,
  studentsTable,
} from "../../shared/db.js";
import {
  generateTimetable,
  type TimetableGenerationRules,
  type TimetableRequestClass,
} from "../services/timetableGenerator.js";

const router = Router();

const auth = (req: any, res: any) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return false; }
  return true;
};

// ── TEACHERS ──────────────────────────────────────────────────────────────────

router.get("/timetable/teachers", async (req, res): Promise<void> => {
  if (!auth(req, res)) return;
  const rows = await db
    .select()
    .from(timetableTeachersTable)
    .where(eq(timetableTeachersTable.userId, req.user!.id))
    .orderBy(timetableTeachersTable.name);
  res.json(rows);
});

router.post("/timetable/teachers", async (req, res): Promise<void> => {
  if (!auth(req, res)) return;
  const { name, subjects = [], phone = "", color = "#3b82f6" } = req.body as {
    name?: string; subjects?: string[]; phone?: string; color?: string;
  };
  if (!name?.trim()) { res.status(400).json({ error: "name is required" }); return; }
  const [row] = await db.insert(timetableTeachersTable).values({
    userId: req.user!.id,
    name: name.trim(),
    subjects,
    phone: phone || null,
    color,
  }).returning();
  res.status(201).json(row);
});

router.patch("/timetable/teachers/:id", async (req, res): Promise<void> => {
  if (!auth(req, res)) return;
  const { name, subjects, phone, color } = req.body as Record<string, any>;
  const updates: Record<string, any> = {};
  if (name !== undefined)     updates.name     = name.trim();
  if (subjects !== undefined) updates.subjects = subjects;
  if (phone !== undefined)    updates.phone    = phone || null;
  if (color !== undefined)    updates.color    = color;
  const [row] = await db
    .update(timetableTeachersTable)
    .set(updates)
    .where(and(
      eq(timetableTeachersTable.id, req.params.id),
      eq(timetableTeachersTable.userId, req.user!.id),
    ))
    .returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

router.delete("/timetable/teachers/:id", async (req, res): Promise<void> => {
  if (!auth(req, res)) return;
  await db
    .delete(timetableTeachersTable)
    .where(and(
      eq(timetableTeachersTable.id, req.params.id),
      eq(timetableTeachersTable.userId, req.user!.id),
    ));
  res.json({ ok: true });
});

// ── ROOMS ─────────────────────────────────────────────────────────────────────

router.get("/timetable/rooms", async (req, res): Promise<void> => {
  if (!auth(req, res)) return;
  const rows = await db
    .select()
    .from(timetableRoomsTable)
    .where(eq(timetableRoomsTable.userId, req.user!.id))
    .orderBy(timetableRoomsTable.name);
  res.json(rows);
});

router.post("/timetable/rooms", async (req, res): Promise<void> => {
  if (!auth(req, res)) return;
  const { name, type = "classroom", capacity } = req.body as {
    name?: string; type?: string; capacity?: number;
  };
  if (!name?.trim()) { res.status(400).json({ error: "name is required" }); return; }
  const [row] = await db.insert(timetableRoomsTable).values({
    userId: req.user!.id,
    name: name.trim(),
    type,
    capacity: capacity ?? null,
  }).returning();
  res.status(201).json(row);
});

router.patch("/timetable/rooms/:id", async (req, res): Promise<void> => {
  if (!auth(req, res)) return;
  const { name, type, capacity } = req.body as Record<string, any>;
  const updates: Record<string, any> = {};
  if (name !== undefined)     updates.name     = name.trim();
  if (type !== undefined)     updates.type     = type;
  if (capacity !== undefined) updates.capacity = capacity ?? null;
  const [row] = await db
    .update(timetableRoomsTable)
    .set(updates)
    .where(and(
      eq(timetableRoomsTable.id, req.params.id),
      eq(timetableRoomsTable.userId, req.user!.id),
    ))
    .returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

router.delete("/timetable/rooms/:id", async (req, res): Promise<void> => {
  if (!auth(req, res)) return;
  await db
    .delete(timetableRoomsTable)
    .where(and(
      eq(timetableRoomsTable.id, req.params.id),
      eq(timetableRoomsTable.userId, req.user!.id),
    ));
  res.json({ ok: true });
});

// ── SLOTS ─────────────────────────────────────────────────────────────────────

router.get("/timetable/slots", async (req, res): Promise<void> => {
  if (!auth(req, res)) return;
  const { annee = "2026-2027", classe } = req.query as Record<string, string>;
  const conds = [
    eq(timetableSlotsTable.userId, req.user!.id),
    eq(timetableSlotsTable.annee, annee),
  ];
  if (classe) conds.push(eq(timetableSlotsTable.classe, classe));
  const rows = await db
    .select()
    .from(timetableSlotsTable)
    .where(and(...conds))
    .orderBy(timetableSlotsTable.day, timetableSlotsTable.period);
  res.json(rows);
});

router.post("/timetable/slots", async (req, res): Promise<void> => {
  if (!auth(req, res)) return;
  const { annee = "2026-2027", classe, subject, teacherId, roomId, day, period, notes } = req.body as {
    annee?: string; classe?: string; subject?: string;
    teacherId?: string; roomId?: string;
    day?: number; period?: number; notes?: string;
  };
  if (!classe?.trim())   { res.status(400).json({ error: "classe is required" }); return; }
  if (!subject?.trim())  { res.status(400).json({ error: "subject is required" }); return; }
  if (day == null || day < 0 || day > 6)     { res.status(400).json({ error: "day must be 0–6" }); return; }
  if (period == null || period < 0 || period > 9) { res.status(400).json({ error: "period must be 0–9" }); return; }
  const [row] = await db.insert(timetableSlotsTable).values({
    userId: req.user!.id,
    annee,
    classe: classe.trim(),
    subject: subject.trim(),
    teacherId: teacherId || null,
    roomId:    roomId    || null,
    day,
    period,
    notes: notes || null,
  }).returning();
  res.status(201).json(row);
});

// ── GENERATE ─────────────────────────────────────────────────────────────────

router.post("/timetable/generate", async (req, res): Promise<void> => {
  if (!auth(req, res)) return;
  const { annee = "2026-2027", classes, roomIds = [], replace = false, rules = {} } = req.body as {
    annee?: string;
    classes?: TimetableRequestClass[];
    roomIds?: string[];
    replace?: boolean;
    rules?: TimetableGenerationRules;
  };

  if (!Array.isArray(classes) || classes.length === 0) {
    res.status(400).json({ error: "classes must be a non-empty array" });
    return;
  }
  if (!classes.every((entry) => entry && typeof entry.classe === "string" && Array.isArray(entry.subjects))) {
    res.status(400).json({ error: "Each class must include classe and subjects" });
    return;
  }

  const generated = generateTimetable(classes, Array.isArray(roomIds) ? roomIds : [], rules ?? {});
  if (replace) {
    const replaceClasses = [...new Set(classes.flatMap(entry => {
      const classe = entry.classe.trim();
      const baseClass = classe.replace(/\s+\[[^\]]+\]$/, "").trim();
      return [classe, ...(baseClass !== classe ? [baseClass] : [])].filter(Boolean);
    }))];
    await db.delete(timetableSlotsTable).where(and(
      eq(timetableSlotsTable.userId, req.user!.id),
      eq(timetableSlotsTable.annee, annee),
      ...(replaceClasses.length > 0 ? [inArray(timetableSlotsTable.classe, replaceClasses)] : []),
    ));
  }

  const rows = generated.slots.length > 0
    ? await db.insert(timetableSlotsTable).values(generated.slots.map((slot) => ({
      userId: req.user!.id,
      annee,
      ...slot,
      notes: "generated",
    }))).returning()
    : [];

  res.status(generated.unscheduled.length > 0 ? 207 : 201).json({
    annee,
    generated: rows,
    unscheduled: generated.unscheduled,
  });
});

router.put("/timetable/slots/:id", async (req, res): Promise<void> => {
  if (!auth(req, res)) return;
  const { classe, subject, teacherId, roomId, day, period, notes } = req.body as Record<string, any>;
  const updates: Record<string, any> = {};
  if (classe    !== undefined) updates.classe    = classe.trim();
  if (subject   !== undefined) updates.subject   = subject.trim();
  if (teacherId !== undefined) updates.teacherId = teacherId || null;
  if (roomId    !== undefined) updates.roomId    = roomId    || null;
  if (day       !== undefined) updates.day       = day;
  if (period    !== undefined) updates.period    = period;
  if (notes     !== undefined) updates.notes     = notes || null;
  const [row] = await db
    .update(timetableSlotsTable)
    .set(updates)
    .where(and(
      eq(timetableSlotsTable.id, req.params.id),
      eq(timetableSlotsTable.userId, req.user!.id),
    ))
    .returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

router.delete("/timetable/slots/:id", async (req, res): Promise<void> => {
  if (!auth(req, res)) return;
  await db
    .delete(timetableSlotsTable)
    .where(and(
      eq(timetableSlotsTable.id, req.params.id),
      eq(timetableSlotsTable.userId, req.user!.id),
    ));
  res.json({ ok: true });
});

// ── CONFLICTS ─────────────────────────────────────────────────────────────────
// Returns all slot pairs that share the same (teacher OR room) AND (day + period)

router.get("/timetable/conflicts", async (req, res): Promise<void> => {
  if (!auth(req, res)) return;
  const { annee = "2026-2027" } = req.query as Record<string, string>;

  const allSlots = await db
    .select()
    .from(timetableSlotsTable)
    .where(and(
      eq(timetableSlotsTable.userId, req.user!.id),
      eq(timetableSlotsTable.annee, annee),
    ));

  // Group by day+period → check for teacher/room collisions
  const conflicts: { slotIds: string[]; reason: string }[] = [];

  const byDayPeriod = new Map<string, typeof allSlots>();
  for (const slot of allSlots) {
    const key = `${slot.day}:${slot.period}`;
    if (!byDayPeriod.has(key)) byDayPeriod.set(key, []);
    byDayPeriod.get(key)!.push(slot);
  }

  for (const [, slots] of byDayPeriod) {
    if (slots.length < 2) continue;

    const classMap = new Map<string, string[]>();
    for (const slot of slots) {
      if (!classMap.has(slot.classe)) classMap.set(slot.classe, []);
      classMap.get(slot.classe)!.push(slot.id);
    }
    for (const [classe, ids] of classMap) {
      if (ids.length > 1) conflicts.push({ slotIds: ids, reason: `class:${classe}` });
    }

    const addTeacherConflicts = (week: "a" | "b", teacherForSlot: (slot: typeof slots[number]) => string | null) => {
      const teacherMap = new Map<string, string[]>();
      for (const slot of slots) {
        const teacherId = teacherForSlot(slot);
        if (!teacherId) continue;
        if (!teacherMap.has(teacherId)) teacherMap.set(teacherId, []);
        teacherMap.get(teacherId)!.push(slot.id);
      }
      for (const [teacherId, ids] of teacherMap) {
        if (ids.length > 1) conflicts.push({ slotIds: ids, reason: `teacher-week-${week}:${teacherId}` });
      }
    };
    addTeacherConflicts("a", slot => slot.teacherId);
    addTeacherConflicts("b", slot => slot.alternateSubject ? slot.alternateTeacherId : slot.teacherId);

    // Room conflicts
    const roomMap = new Map<string, string[]>();
    for (const s of slots) {
      if (!s.roomId) continue;
      if (!roomMap.has(s.roomId)) roomMap.set(s.roomId, []);
      roomMap.get(s.roomId)!.push(s.id);
    }
    for (const [rid, ids] of roomMap) {
      if (ids.length > 1) conflicts.push({ slotIds: ids, reason: `room:${rid}` });
    }
  }

  const conflictingIds = new Set(conflicts.flatMap(c => c.slotIds));
  res.json({ conflicts, conflictingSlotIds: [...conflictingIds] });
});

// ── DISTINCT CLASSES ──────────────────────────────────────────────────────────

router.get("/timetable/classes", async (req, res): Promise<void> => {
  if (!auth(req, res)) return;
  const { annee = "2026-2027" } = req.query as Record<string, string>;
  // A timetable can be prepared before students are imported, so include
  // classes from both the student register and existing timetable slots.
  const studentRows = await db
    .selectDistinct({ niveau: studentsTable.niveau, classe: studentsTable.classe, filiere: studentsTable.filiere })
    .from(studentsTable)
    .where(and(
      eq(studentsTable.userId, req.user!.id),
      eq(studentsTable.annee, annee),
    ))
    .orderBy(studentsTable.niveau, studentsTable.classe);
  const slotRows = await db
    .selectDistinct({ classe: timetableSlotsTable.classe })
    .from(timetableSlotsTable)
    .where(and(
      eq(timetableSlotsTable.userId, req.user!.id),
      eq(timetableSlotsTable.annee, annee),
    ))
    .orderBy(timetableSlotsTable.classe);
  const normalizeClass = (niveau: string, classe: string, filiere: string | null) => {
    const levelPrefix = new RegExp(`^${niveau}(?:[-_ ]|$)`, "i");
    const classPart = classe.replace(levelPrefix, "");
    const track = filiere?.trim();
    return track ? `${niveau}-${track}-${classPart}` : levelPrefix.test(classe) ? classe : `${niveau}-${classe}`;
  };
  const normalizedStudentClasses = studentRows
    .map(row => ({
      raw: row.classe?.trim(),
      normalized: row.classe?.trim() ? normalizeClass(row.niveau, row.classe.trim(), row.filiere) : "",
    }))
    .filter(row => row.raw && row.normalized);
  const knownClassNames = new Set(normalizedStudentClasses.map(row => row.normalized));
  const savedClasses = slotRows
    .map(row => row.classe?.trim())
    .filter((classe): classe is string => Boolean(classe));
  const classNamesWithProgram = new Set(
    savedClasses
      .map(classe => classe.replace(/\s+\[[^\]]+\]$/, "").trim())
      .filter((classe, index) => classe !== savedClasses[index]),
  );
  const classes = [...new Set([
    ...normalizedStudentClasses.map(row => row.normalized).filter(classe => !classNamesWithProgram.has(classe)),
    ...savedClasses.filter(classe =>
      /\s+\[[^\]]+\]$/.test(classe) || (!knownClassNames.has(classe) && !classNamesWithProgram.has(classe)),
    ),
  ])].sort();
  res.json(classes);
});

export default router;
