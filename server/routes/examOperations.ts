import { Router, type Request, type Response } from "express";
import { and, asc, desc, eq, inArray, like } from "drizzle-orm";
import {
  db,
  examHallsTable,
  examInvigilatorsTable,
  examSeatingAssignmentsTable,
  examSessionsTable,
  schoolInfoTable,
  schoolMembersTable,
  studentDailyAttendanceTable,
  studentsTable,
  timetableSlotsTable,
  timetableTeachersTable,
} from "../../shared/db.js";
import { normalizeTimetableClassName } from "../../shared/timetable-curriculum.js";
import { buildInvigilationPlan, type InvigilatorCandidate, type TimetableSlotLike } from "../services/examInvigilation.js";
import { assignExamSeating } from "../services/examSeating.js";
import { buildOfficialReport, officialReportToXlsx, type OfficialReportType } from "../services/officialReports.js";

const router = Router();

function schoolId(req: Request): string {
  return req.memberContext?.schoolUserId ?? req.user!.id;
}

function forbidParent(req: Request, res: Response): boolean {
  if (!req.isAuthenticated() || !req.user) {
    res.status(401).json({ error: "Unauthorized" });
    return true;
  }
  if (req.memberContext?.role === "parent") {
    res.status(403).json({ error: "Parents cannot manage exam operations" });
    return true;
  }
  return false;
}

function validDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function timeOrNull(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  return typeof value === "string" && /^\d{2}:\d{2}$/.test(value) ? value : undefined;
}

function intOrNull(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : undefined;
}

function strOrNull(value: unknown, max = 500): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function classMatches(student: { classe?: string | null; niveau?: string | null; filiere?: string | null }, target: string | null | undefined): boolean {
  const wanted = String(target ?? "").trim();
  if (!wanted) return true;
  const raw = String(student.classe ?? "").trim();
  if (!raw) return false;
  if (raw === wanted) return true;
  const normalizedStudent = normalizeTimetableClassName(raw, student.niveau, student.filiere) ?? raw;
  const normalizedTarget = normalizeTimetableClassName(wanted, student.niveau, student.filiere) ?? wanted;
  return normalizedStudent === normalizedTarget || normalizedStudent.includes(normalizedTarget) || normalizedTarget.includes(normalizedStudent);
}

async function schoolName(userId: string): Promise<string | null> {
  const [info] = await db.select({ nom: schoolInfoTable.nom }).from(schoolInfoTable)
    .where(eq(schoolInfoTable.userId, userId)).limit(1);
  return info?.nom ?? null;
}

// ── Exam sessions ────────────────────────────────────────────────────────────
router.get("/exams/sessions", async (req, res): Promise<void> => {
  if (forbidParent(req, res)) return;
  const annee = String(req.query.annee ?? "2026-2027");
  const rows = await db.select().from(examSessionsTable)
    .where(and(eq(examSessionsTable.userId, schoolId(req)), eq(examSessionsTable.annee, annee)))
    .orderBy(asc(examSessionsTable.examDate), asc(examSessionsTable.startTime), asc(examSessionsTable.title));
  res.json(rows);
});

router.post("/exams/sessions", async (req, res): Promise<void> => {
  if (forbidParent(req, res)) return;
  const body = req.body as Record<string, any>;
  if (!validDate(body.examDate) || typeof body.title !== "string" || !body.title.trim()) {
    res.status(400).json({ error: "title and examDate are required" });
    return;
  }
  const [row] = await db.insert(examSessionsTable).values({
    userId: schoolId(req),
    annee: typeof body.annee === "string" && body.annee ? body.annee : "2026-2027",
    title: body.title.trim(),
    kind: strOrNull(body.kind, 30) ?? "exam",
    classe: strOrNull(body.classe, 80),
    subject: strOrNull(body.subject, 120),
    examDate: body.examDate,
    startTime: timeOrNull(body.startTime) ?? null,
    endTime: timeOrNull(body.endTime) ?? null,
    durationMinutes: intOrNull(body.durationMinutes) ?? null,
    status: strOrNull(body.status, 20) ?? "draft",
    notes: strOrNull(body.notes),
  }).returning();
  res.status(201).json(row);
});

router.patch("/exams/sessions/:id", async (req, res): Promise<void> => {
  if (forbidParent(req, res)) return;
  const updates: Record<string, any> = {};
  const body = req.body as Record<string, any>;
  if (body.title !== undefined) updates.title = String(body.title).trim();
  if (body.kind !== undefined) updates.kind = strOrNull(body.kind, 30);
  if (body.classe !== undefined) updates.classe = strOrNull(body.classe, 80);
  if (body.subject !== undefined) updates.subject = strOrNull(body.subject, 120);
  if (body.examDate !== undefined) {
    if (!validDate(body.examDate)) { res.status(400).json({ error: "Invalid examDate" }); return; }
    updates.examDate = body.examDate;
  }
  const startTime = timeOrNull(body.startTime);
  const endTime = timeOrNull(body.endTime);
  const durationMinutes = intOrNull(body.durationMinutes);
  if (startTime !== undefined) updates.startTime = startTime;
  if (endTime !== undefined) updates.endTime = endTime;
  if (durationMinutes !== undefined) updates.durationMinutes = durationMinutes;
  if (body.status !== undefined) updates.status = strOrNull(body.status, 20);
  if (body.notes !== undefined) updates.notes = strOrNull(body.notes);
  if (body.annee !== undefined) updates.annee = String(body.annee);
  const [row] = await db.update(examSessionsTable).set(updates)
    .where(and(eq(examSessionsTable.id, String(req.params.id)), eq(examSessionsTable.userId, schoolId(req))))
    .returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

router.delete("/exams/sessions/:id", async (req, res): Promise<void> => {
  if (forbidParent(req, res)) return;
  await db.delete(examSessionsTable).where(and(
    eq(examSessionsTable.id, String(req.params.id)),
    eq(examSessionsTable.userId, schoolId(req)),
  ));
  res.json({ ok: true });
});

// ── Exam halls ───────────────────────────────────────────────────────────────
router.get("/exams/halls", async (req, res): Promise<void> => {
  if (forbidParent(req, res)) return;
  const annee = String(req.query.annee ?? "2026-2027");
  const rows = await db.select().from(examHallsTable)
    .where(and(eq(examHallsTable.userId, schoolId(req)), eq(examHallsTable.annee, annee)))
    .orderBy(asc(examHallsTable.name));
  res.json(rows);
});

router.post("/exams/halls", async (req, res): Promise<void> => {
  if (forbidParent(req, res)) return;
  const body = req.body as Record<string, any>;
  const capacity = Number(body.capacity);
  if (typeof body.name !== "string" || !body.name.trim() || !Number.isInteger(capacity) || capacity <= 0) {
    res.status(400).json({ error: "name and positive capacity are required" });
    return;
  }
  const [row] = await db.insert(examHallsTable).values({
    userId: schoolId(req),
    annee: typeof body.annee === "string" && body.annee ? body.annee : "2026-2027",
    name: body.name.trim(),
    capacity,
    building: strOrNull(body.building, 120),
    floor: strOrNull(body.floor, 80),
    roomType: strOrNull(body.roomType, 40) ?? "classroom",
    isActive: body.isActive !== false,
  }).returning();
  res.status(201).json(row);
});

router.patch("/exams/halls/:id", async (req, res): Promise<void> => {
  if (forbidParent(req, res)) return;
  const updates: Record<string, any> = {};
  const body = req.body as Record<string, any>;
  if (body.name !== undefined) updates.name = String(body.name).trim();
  if (body.capacity !== undefined) {
    const capacity = Number(body.capacity);
    if (!Number.isInteger(capacity) || capacity <= 0) { res.status(400).json({ error: "Invalid capacity" }); return; }
    updates.capacity = capacity;
  }
  if (body.building !== undefined) updates.building = strOrNull(body.building, 120);
  if (body.floor !== undefined) updates.floor = strOrNull(body.floor, 80);
  if (body.roomType !== undefined) updates.roomType = strOrNull(body.roomType, 40);
  if (body.isActive !== undefined) updates.isActive = Boolean(body.isActive);
  const [row] = await db.update(examHallsTable).set(updates)
    .where(and(eq(examHallsTable.id, String(req.params.id)), eq(examHallsTable.userId, schoolId(req))))
    .returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

router.delete("/exams/halls/:id", async (req, res): Promise<void> => {
  if (forbidParent(req, res)) return;
  await db.delete(examHallsTable).where(and(
    eq(examHallsTable.id, String(req.params.id)),
    eq(examHallsTable.userId, schoolId(req)),
  ));
  res.json({ ok: true });
});

// ── Invigilation generation ──────────────────────────────────────────────────
router.post("/exams/invigilation/generate", async (req, res): Promise<void> => {
  if (forbidParent(req, res)) return;
  const body = req.body as Record<string, any>;
  const annee = typeof body.annee === "string" && body.annee ? body.annee : "2026-2027";
  const sessionIds = Array.isArray(body.sessionIds) ? body.sessionIds.map(String).filter(Boolean) : null;

  const sessionConditions = [eq(examSessionsTable.userId, schoolId(req)), eq(examSessionsTable.annee, annee)];
  if (sessionIds?.length) sessionConditions.push(inArray(examSessionsTable.id, sessionIds));
  const sessions = await db.select().from(examSessionsTable).where(and(...sessionConditions))
    .orderBy(asc(examSessionsTable.examDate), asc(examSessionsTable.startTime));
  if (!sessions.length) { res.status(404).json({ error: "No exam sessions found" }); return; }

  const userId = schoolId(req);
  const [teachers, members, students, slots] = await Promise.all([
    db.select({ id: timetableTeachersTable.id, name: timetableTeachersTable.name, subjects: timetableTeachersTable.subjects })
      .from(timetableTeachersTable).where(eq(timetableTeachersTable.userId, userId)),
    db.select({ id: schoolMembersTable.id, name: schoolMembersTable.name, role: schoolMembersTable.role })
      .from(schoolMembersTable).where(and(eq(schoolMembersTable.schoolUserId, userId), inArray(schoolMembersTable.role, ["teacher", "supervisor", "counselor"]))),
    db.select().from(studentsTable).where(and(eq(studentsTable.userId, userId), eq(studentsTable.annee, annee))),
    db.select().from(timetableSlotsTable).where(and(eq(timetableSlotsTable.userId, userId), eq(timetableSlotsTable.annee, annee))),
  ]);

  const candidates: InvigilatorCandidate[] = [
    ...teachers.map(teacher => ({ id: `teacher:${teacher.id}`, name: teacher.name, teacherId: teacher.id, subjects: Array.isArray(teacher.subjects) ? teacher.subjects : [] })),
    ...members.map(member => ({ id: `member:${member.id}`, name: member.name, memberId: member.id, subjects: [] })),
  ];
  if (!candidates.length) { res.status(400).json({ error: "No teachers or staff available for invigilation" }); return; }

  const studentCounts: Record<string, number> = {};
  for (const session of sessions) {
    studentCounts[session.id] = students.filter(student => classMatches(student, session.classe)).length;
  }

  const plan = buildInvigilationPlan({
    sessions,
    candidates,
    studentCounts,
    slots: slots as TimetableSlotLike[],
    options: {
      studentsPerInvigilator: Number(body.studentsPerInvigilator) || 25,
      minInvigilators: Number(body.minInvigilators) || 2,
      maxInvigilators: Number(body.maxInvigilators) || 6,
      includeChief: body.includeChief !== false,
    },
  });

  const scopeIds = sessions.map(session => session.id);
  if (scopeIds.length) {
    await db.delete(examInvigilatorsTable).where(and(
      eq(examInvigilatorsTable.userId, userId),
      inArray(examInvigilatorsTable.sessionId, scopeIds),
    ));
    if (plan.assignments.length) {
      const sessionById = new Map(sessions.map(session => [session.id, session]));
      await db.insert(examInvigilatorsTable).values(plan.assignments.map(item => ({
        userId,
        annee: sessionById.get(item.sessionId)?.annee ?? annee,
        sessionId: item.sessionId,
        teacherId: item.teacherId,
        memberId: item.memberId,
        name: item.name,
        subject: item.subject,
        role: item.role,
      })));
    }
  }

  res.json({ generated: plan.assignments.length, unassigned: plan.unassigned, assignments: plan.assignments });
});

router.get("/exams/invigilation", async (req, res): Promise<void> => {
  if (forbidParent(req, res)) return;
  const annee = String(req.query.annee ?? "2026-2027");
  const sessionId = typeof req.query.sessionId === "string" ? req.query.sessionId : undefined;
  const conditions = [eq(examInvigilatorsTable.userId, schoolId(req)), eq(examInvigilatorsTable.annee, annee)];
  if (sessionId) conditions.push(eq(examInvigilatorsTable.sessionId, sessionId));
  const rows = await db.select().from(examInvigilatorsTable).where(and(...conditions))
    .orderBy(asc(examInvigilatorsTable.sessionId), asc(examInvigilatorsTable.role), asc(examInvigilatorsTable.name));
  const sessionIds = [...new Set(rows.map(row => row.sessionId))];
  const sessions = sessionIds.length
    ? await db.select().from(examSessionsTable).where(inArray(examSessionsTable.id, sessionIds))
    : [];
  const sessionById = new Map(sessions.map(session => [session.id, session]));
  res.json(rows.map(row => ({ ...row, session: sessionById.get(row.sessionId) ?? null })));
});

// ── Seating generation ───────────────────────────────────────────────────────
router.post("/exams/seating/generate", async (req, res): Promise<void> => {
  if (forbidParent(req, res)) return;
  const body = req.body as Record<string, any>;
  const sessionId = String(body.sessionId ?? "");
  if (!sessionId) { res.status(400).json({ error: "sessionId is required" }); return; }
  const userId = schoolId(req);
  const [session] = await db.select().from(examSessionsTable)
    .where(and(eq(examSessionsTable.id, sessionId), eq(examSessionsTable.userId, userId))).limit(1);
  if (!session) { res.status(404).json({ error: "Exam session not found" }); return; }

  const hallIds = Array.isArray(body.hallIds) ? body.hallIds.map(String).filter(Boolean) : null;
  const hallConditions = [eq(examHallsTable.userId, userId), eq(examHallsTable.annee, session.annee), eq(examHallsTable.isActive, true)];
  if (hallIds?.length) hallConditions.push(inArray(examHallsTable.id, hallIds));
  const [students, halls] = await Promise.all([
    db.select().from(studentsTable).where(and(eq(studentsTable.userId, userId), eq(studentsTable.annee, session.annee))),
    db.select().from(examHallsTable).where(and(...hallConditions)).orderBy(asc(examHallsTable.name)),
  ]);
  if (!halls.length) { res.status(400).json({ error: "No active exam halls configured" }); return; }

  const eligibleStudents = students.filter(student => classMatches(student, session.classe));
  if (!eligibleStudents.length) { res.status(400).json({ error: "No students matched this exam session" }); return; }

  const plan = assignExamSeating({
    sessionId: session.id,
    annee: session.annee,
    students: eligibleStudents,
    halls,
    options: {
      columnsPerRow: Number(body.columnsPerRow) || 8,
      organizationPrefix: strOrNull(body.organizationPrefix, 20) ?? undefined,
      keepClassesTogether: body.keepClassesTogether !== false,
    },
  });

  await db.delete(examSeatingAssignmentsTable).where(and(
    eq(examSeatingAssignmentsTable.userId, userId),
    eq(examSeatingAssignmentsTable.sessionId, session.id),
  ));
  if (plan.assignments.length) {
    await db.insert(examSeatingAssignmentsTable).values(plan.assignments.map(item => ({
      userId,
      annee: session.annee,
      sessionId: session.id,
      studentId: item.studentId,
      hallId: item.hallId,
      seatNumber: item.seatNumber,
      organizationNumber: item.organizationNumber,
      rowNumber: item.rowNumber,
      columnNumber: item.columnNumber,
    })));
  }

  res.json({ generated: plan.assignments.length, unassigned: plan.unassigned, halls: plan.halls, assignments: plan.assignments });
});

router.get("/exams/seating", async (req, res): Promise<void> => {
  if (forbidParent(req, res)) return;
  const sessionId = typeof req.query.sessionId === "string" ? req.query.sessionId : undefined;
  if (!sessionId) { res.status(400).json({ error: "sessionId is required" }); return; }
  const userId = schoolId(req);
  const rows = await db.select().from(examSeatingAssignmentsTable)
    .where(and(eq(examSeatingAssignmentsTable.userId, userId), eq(examSeatingAssignmentsTable.sessionId, sessionId)))
    .orderBy(asc(examSeatingAssignmentsTable.organizationNumber));
  const [studentIds, hallIds] = [
    [...new Set(rows.map(row => row.studentId))],
    [...new Set(rows.map(row => row.hallId))],
  ];
  const [students, halls, sessions] = await Promise.all([
    studentIds.length ? db.select().from(studentsTable).where(inArray(studentsTable.id, studentIds)) : [],
    hallIds.length ? db.select().from(examHallsTable).where(inArray(examHallsTable.id, hallIds)) : [],
    db.select().from(examSessionsTable).where(and(eq(examSessionsTable.id, sessionId), eq(examSessionsTable.userId, userId))).limit(1),
  ]);
  const studentById = new Map(students.map(student => [student.id, student]));
  const hallById = new Map(halls.map(hall => [hall.id, hall]));
  res.json({
    session: sessions[0] ?? null,
    assignments: rows.map(row => ({
      ...row,
      student: studentById.get(row.studentId) ?? null,
      hall: hallById.get(row.hallId) ?? null,
    })),
  });
});

// ── Official reports ─────────────────────────────────────────────────────────
const REPORT_TYPES = new Set<OfficialReportType>(["student_roster", "census", "monthly", "invigilation_plan", "seating_plan"]);

router.get("/exam-reports/:type", async (req, res): Promise<void> => {
  if (forbidParent(req, res)) return;
  const type = String(req.params.type) as OfficialReportType;
  if (!REPORT_TYPES.has(type)) { res.status(404).json({ error: "Unknown report type" }); return; }
  const userId = schoolId(req);
  const annee = String(req.query.annee ?? "2026-2027");
  const format = String(req.query.format ?? "json") === "xlsx" ? "xlsx" : "json";
  const name = await schoolName(userId);

  let report;
  if (type === "student_roster" || type === "census") {
    const conditions = [eq(studentsTable.userId, userId), eq(studentsTable.annee, annee)];
    const classe = typeof req.query.classe === "string" ? req.query.classe : "";
    const niveau = typeof req.query.niveau === "string" ? req.query.niveau : "";
    if (classe) conditions.push(eq(studentsTable.classe, classe));
    if (niveau) conditions.push(eq(studentsTable.niveau, niveau));
    const students = await db.select().from(studentsTable).where(and(...conditions));
    report = buildOfficialReport(type, { schoolName: name, annee, students });
  } else if (type === "monthly") {
    const month = String(req.query.month ?? "");
    if (!/^\d{4}-\d{2}$/.test(month)) { res.status(400).json({ error: "month must be YYYY-MM" }); return; }
    const conditions = [eq(studentsTable.userId, userId), eq(studentsTable.annee, annee)];
    if (typeof req.query.classe === "string" && req.query.classe) conditions.push(eq(studentsTable.classe, req.query.classe));
    const students = await db.select().from(studentsTable).where(and(...conditions));
    const studentIds = students.map(student => student.id);
    const attendance = studentIds.length
      ? await db.select().from(studentDailyAttendanceTable).where(and(
          eq(studentDailyAttendanceTable.userId, userId),
          eq(studentDailyAttendanceTable.annee, annee),
          inArray(studentDailyAttendanceTable.studentId, studentIds),
          like(studentDailyAttendanceTable.attendanceDate, `${month}-%`),
        ))
      : [];
    report = buildOfficialReport(type, { schoolName: name, annee, month, students, attendance });
  } else if (type === "invigilation_plan") {
    const [sessions, invigilators, halls] = await Promise.all([
      db.select().from(examSessionsTable).where(and(eq(examSessionsTable.userId, userId), eq(examSessionsTable.annee, annee))),
      db.select().from(examInvigilatorsTable).where(and(eq(examInvigilatorsTable.userId, userId), eq(examInvigilatorsTable.annee, annee))),
      db.select().from(examHallsTable).where(and(eq(examHallsTable.userId, userId), eq(examHallsTable.annee, annee))),
    ]);
    report = buildOfficialReport(type, { schoolName: name, annee, sessions, invigilators, halls });
  } else {
    const sessionId = String(req.query.sessionId ?? "");
    if (!sessionId) { res.status(400).json({ error: "sessionId is required for seating_plan" }); return; }
    const [session] = await db.select().from(examSessionsTable)
      .where(and(eq(examSessionsTable.id, sessionId), eq(examSessionsTable.userId, userId))).limit(1);
    if (!session) { res.status(404).json({ error: "Exam session not found" }); return; }
    const [assignments, students, halls] = await Promise.all([
      db.select().from(examSeatingAssignmentsTable).where(and(eq(examSeatingAssignmentsTable.userId, userId), eq(examSeatingAssignmentsTable.sessionId, session.id))),
      db.select().from(studentsTable).where(and(eq(studentsTable.userId, userId), eq(studentsTable.annee, session.annee))),
      db.select().from(examHallsTable).where(and(eq(examHallsTable.userId, userId), eq(examHallsTable.annee, session.annee))),
    ]);
    report = buildOfficialReport(type, { schoolName: name, annee: session.annee, session, students, halls, assignments });
  }

  if (format === "xlsx") {
    const buffer = officialReportToXlsx(report);
    res.set({
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${type}-${annee}.xlsx"`,
    });
    res.send(buffer);
    return;
  }
  res.json(report);
});

export default router;
