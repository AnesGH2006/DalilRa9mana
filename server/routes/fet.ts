import { Router } from "express";
import multer from "multer";
import { and, eq, like } from "drizzle-orm";
import {
  db,
  timetableTeachersTable,
  timetableRoomsTable,
  timetableSlotsTable,
} from "../../shared/db.js";
import { parseFetXml } from "../services/fetParser.js";
import { normalizeTimetableClassName } from "../../shared/timetable-curriculum.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

function schoolId(req: any): string {
  return req.memberContext?.schoolUserId ?? req.user!.id;
}

function forbidParent(req: any, res: any): boolean {
  if (!req.isAuthenticated() || !req.user) { res.status(401).json({ error: "Unauthorized" }); return true; }
  if (req.memberContext?.role === "parent") { res.status(403).json({ error: "Parents cannot import FET timetables" }); return true; }
  return false;
}

function norm(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

async function readXml(req: any): Promise<string> {
  if (req.file?.buffer) return req.file.buffer.toString("utf8");
  const body = req.body as { xml?: string; content?: string };
  const xml = body.xml ?? body.content ?? "";
  if (!xml.trim()) throw new Error("FET XML content is required");
  return xml;
}

router.get("/timetable/fet/status", async (req, res): Promise<void> => {
  if (forbidParent(req, res)) return;
  try {
    const userId = schoolId(req);
    const annee = typeof req.query.annee === "string" && req.query.annee.trim() ? req.query.annee.trim() : "2026-2027";
    const slots = await db.select({
      id: timetableSlotsTable.id,
      classe: timetableSlotsTable.classe,
      teacherId: timetableSlotsTable.teacherId,
      day: timetableSlotsTable.day,
      period: timetableSlotsTable.period,
      notes: timetableSlotsTable.notes,
    }).from(timetableSlotsTable).where(and(eq(timetableSlotsTable.userId, userId), eq(timetableSlotsTable.annee, annee)));

    const fetSlots = slots.filter(slot => String(slot.notes ?? "").startsWith("fet"));
    res.json({
      annee,
      totalSlots: slots.length,
      fetSlots: fetSlots.length,
      fetClasses: new Set(fetSlots.map(slot => slot.classe)).size,
      fetTeachers: new Set(fetSlots.map(slot => slot.teacherId).filter(Boolean)).size,
      fetDays: new Set(fetSlots.map(slot => slot.day)).size,
      fetPeriods: new Set(fetSlots.map(slot => `${slot.day}:${slot.period}`)).size,
    });
  } catch (error: any) {
    res.status(500).json({ error: error?.message ?? "Failed to load FET status" });
  }
});

router.post("/timetable/fet/parse", upload.single("file"), async (req, res): Promise<void> => {
  if (forbidParent(req, res)) return;
  try {
    const xml = await readXml(req);
    const parsed = parseFetXml(xml, { dayOffset: Number((req.body as any)?.dayOffset) || 0 });
    res.json(parsed);
  } catch (error: any) {
    res.status(400).json({ error: error?.message ?? "Failed to parse FET file" });
  }
});

router.post("/timetable/fet/import", upload.single("file"), async (req, res): Promise<void> => {
  if (forbidParent(req, res)) return;
  const userId = schoolId(req);
  const body = req.body as Record<string, any>;
  const annee = typeof body.annee === "string" && body.annee.trim() ? body.annee.trim() : "2026-2027";
  const replaceFet = body.replaceFet !== false;
  const includeSlots = body.includeSlots !== false;

  try {
    const xml = await readXml(req);
    const parsed = parseFetXml(xml, { dayOffset: Number(body.dayOffset) || 0 });

    // Teachers: upsert by normalized name and merge subjects discovered in activities.
    const existingTeachers = await db.select().from(timetableTeachersTable).where(eq(timetableTeachersTable.userId, userId));
    const teacherByName = new Map(existingTeachers.map(teacher => [norm(teacher.name), teacher]));
    const subjectsByTeacher = new Map<string, Set<string>>();
    for (const activity of parsed.activities) {
      if (!activity.teacher || !activity.subject) continue;
      const key = norm(activity.teacher);
      const set = subjectsByTeacher.get(key) ?? new Set<string>();
      set.add(activity.subject);
      subjectsByTeacher.set(key, set);
    }

    let teachersCreated = 0;
    let teachersUpdated = 0;
    const teacherIdByName = new Map<string, string>();
    for (const teacher of parsed.teachers) {
      const key = norm(teacher.name);
      const subjects = [...(subjectsByTeacher.get(key) ?? [])];
      const existing = teacherByName.get(key);
      if (existing) {
        const merged = [...new Set([...(Array.isArray(existing.subjects) ? existing.subjects : []), ...subjects])];
        if (JSON.stringify(merged) !== JSON.stringify(existing.subjects ?? [])) {
          await db.update(timetableTeachersTable).set({ subjects: merged }).where(eq(timetableTeachersTable.id, existing.id));
          teachersUpdated++;
        }
        teacherIdByName.set(key, existing.id);
      } else {
        const [created] = await db.insert(timetableTeachersTable).values({
          userId,
          name: teacher.name.slice(0, 255),
          subjects,
          color: "#0ea5e9",
        }).returning();
        teacherIdByName.set(key, created.id);
        teachersCreated++;
      }
    }

    // Rooms: upsert by name.
    let roomsCreated = 0;
    const roomIdByName = new Map<string, string>();
    if (parsed.rooms.length) {
      const existingRooms = await db.select().from(timetableRoomsTable).where(eq(timetableRoomsTable.userId, userId));
      const roomByName = new Map(existingRooms.map(room => [norm(room.name), room]));
      for (const room of parsed.rooms) {
        const key = norm(room.name);
        const existing = roomByName.get(key);
        if (existing) { roomIdByName.set(key, existing.id); continue; }
        const [created] = await db.insert(timetableRoomsTable).values({ userId, name: room.name.slice(0, 100), type: "classroom" }).returning();
        roomIdByName.set(key, created.id);
        roomsCreated++;
      }
    }

    let slotsCreated = 0;
    const skipped: string[] = [];
    if (includeSlots && parsed.slots.length) {
      if (replaceFet) {
        await db.delete(timetableSlotsTable).where(and(
          eq(timetableSlotsTable.userId, userId),
          eq(timetableSlotsTable.annee, annee),
          like(timetableSlotsTable.notes, "fet%"),
        ));
      }
      const activityByIndex = new Map(parsed.activities.map(activity => [activity.index, activity]));
      const rows: Array<typeof timetableSlotsTable.$inferInsert> = [];
      for (const assignment of parsed.slots) {
        const activity = activityByIndex.get(assignment.activityIndex);
        if (!activity) { skipped.push(`activity:${assignment.activityIndex}`); continue; }
        const teacherKey = norm(activity.teacher);
        const teacherId = teacherIdByName.get(teacherKey) ?? null;
        const classes = activity.classes.length ? activity.classes : ["بدون قسم"];
        for (const rawClass of classes) {
          const classe = normalizeTimetableClassName(rawClass) ?? rawClass;
          rows.push({
            userId,
            annee,
            classe: classe.slice(0, 30),
            subject: (activity.subject || "مادة").slice(0, 100),
            teacherId,
            roomId: null,
            day: assignment.day,
            period: Math.max(0, Math.min(9, assignment.period)),
            notes: `fet:activity-${activity.index}`,
          });
        }
      }
      if (rows.length) {
        await db.insert(timetableSlotsTable).values(rows);
        slotsCreated = rows.length;
      }
    }

    res.json({
      success: true,
      annee,
      stats: parsed.stats,
      teachersCreated,
      teachersUpdated,
      roomsCreated,
      slotsCreated,
      warnings: [...parsed.warnings, ...skipped.slice(0, 20)],
      skippedCount: skipped.length,
    });
  } catch (error: any) {
    res.status(400).json({ error: error?.message ?? "Failed to import FET file" });
  }
});

export default router;
