/**
 * School Members (RBAC)
 *
 * HEAD-ADMIN routes — all require an authenticated head-admin session.
 *
 * GET    /api/members           — list all staff members for this school
 * POST   /api/members           — create a staff member (teacher/supervisor/counselor)
 * PATCH  /api/members/:id       — update name, email, assignedClasses
 * DELETE /api/members/:id       — remove a member
 *
 * Self-registration routes (authenticated user, no admin needed)
 * POST   /api/parent-register   — parent claims their child using school join code + student national ID
 */
import { Router, type Request, type Response } from "express";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, schoolMembersTable, studentsTable, gradesTable, absencesTable, studentDailyAttendanceTable, schoolInfoTable } from "../../shared/db.js";
import { deleteCachedJson, getCachedJson, setCachedJson } from "../services/redisCache.js";
import { calcAnnualAvg, calcWeightedAvg, getSubjectsForLevel } from "../../shared/subjects.js";
import {
  DEFAULT_STAFF_PERMISSIONS,
  normalizeStaffPermissions,
  STAFF_PERMISSIONS,
  type StaffPermission,
  type StaffRole,
} from "../../shared/member-permissions.js";

const router = Router();

/** Only a head-admin (subscribed, non-member user) may manage members. */
function isHeadAdmin(req: Request): boolean {
  return req.isAuthenticated() && !req.memberContext;
}

function isValidPermissionList(value: unknown): value is StaffPermission[] {
  return Array.isArray(value)
    && value.every(permission => typeof permission === "string" && STAFF_PERMISSIONS.includes(permission as StaffPermission));
}

// ── GET /api/members ─────────────────────────────────────────────────────────
router.get("/members", async (req: Request, res: Response): Promise<void> => {
  if (!isHeadAdmin(req)) { res.status(403).json({ error: "Forbidden" }); return; }
  const userId = req.user!.id;

  const rows = await db
    .select()
    .from(schoolMembersTable)
    .where(eq(schoolMembersTable.schoolUserId, userId))
    .orderBy(schoolMembersTable.createdAt);

  res.json(rows);
});

// ── POST /api/members ─────────────────────────────────────────────────────────
router.post("/members", async (req: Request, res: Response): Promise<void> => {
  if (!isHeadAdmin(req)) { res.status(403).json({ error: "Forbidden" }); return; }
  const schoolUserId = req.user!.id;

  const { role, name, email, phone, assignedClasses, permissions } = req.body as {
    role: StaffRole;
    name: string;
    email?: string;
    phone?: string;
    assignedClasses?: string[];
    permissions?: unknown;
  };

  // Admin can only create staff roles — parents self-register via /api/parent-register
  if (!role || !["teacher", "supervisor", "counselor"].includes(role)) {
    res.status(400).json({ error: "role must be 'teacher', 'supervisor', or 'counselor'" });
    return;
  }
  if (!name?.trim()) {
    res.status(400).json({ error: "name is required" });
    return;
  }
  if (permissions !== undefined && !isValidPermissionList(permissions)) {
    res.status(400).json({ error: "permissions contains an unknown permission" });
    return;
  }

  const [created] = await db
    .insert(schoolMembersTable)
    .values({
      schoolUserId,
      role,
      permissions: normalizeStaffPermissions(
        permissions ?? DEFAULT_STAFF_PERMISSIONS[role],
        role,
      ),
      name: name.trim(),
      email: email?.trim() || null,
      phone: phone?.trim() || null,
      assignedClasses: assignedClasses ?? [],
      linkedStudentId: null,
    })
    .returning();

  res.status(201).json(created);
});

// ── PATCH /api/members/:id ────────────────────────────────────────────────────
router.patch("/members/:id", async (req: Request, res: Response): Promise<void> => {
  if (!isHeadAdmin(req)) { res.status(403).json({ error: "Forbidden" }); return; }
  const schoolUserId = req.user!.id;
  const { id } = req.params as { id: string };

  const { name, email, phone, assignedClasses, linkedStudentId, permissions } = req.body as {
    name?: string;
    email?: string;
    phone?: string;
    assignedClasses?: string[];
    linkedStudentId?: string | null;
    permissions?: unknown;
  };

  const updates: Partial<typeof schoolMembersTable.$inferInsert> = {};
  if (name !== undefined) updates.name = name.trim();
  if (email !== undefined) updates.email = email?.trim() || null;
  if (phone !== undefined) updates.phone = phone?.trim() || null;
  if (assignedClasses !== undefined) updates.assignedClasses = assignedClasses;
  if (linkedStudentId !== undefined) updates.linkedStudentId = linkedStudentId;
  if (permissions !== undefined) {
    const [member] = await db.select({ role: schoolMembersTable.role })
      .from(schoolMembersTable)
      .where(and(eq(schoolMembersTable.id, id), eq(schoolMembersTable.schoolUserId, schoolUserId)))
      .limit(1);
    if (!member || member.role === "parent") {
      res.status(member ? 400 : 404).json({ error: member ? "Parents do not have staff permissions" : "Member not found" });
      return;
    }
    if (!isValidPermissionList(permissions)) {
      res.status(400).json({ error: "permissions contains an unknown permission" });
      return;
    }
    updates.permissions = normalizeStaffPermissions(permissions, member.role);
  }

  const [updated] = await db
    .update(schoolMembersTable)
    .set(updates)
    .where(and(eq(schoolMembersTable.id, id), eq(schoolMembersTable.schoolUserId, schoolUserId)))
    .returning();

  if (!updated) { res.status(404).json({ error: "Member not found" }); return; }
  res.json(updated);
});

// ── DELETE /api/members/self — remove own membership (dev escape / account recovery) ──
// MUST be declared before /members/:id so Express doesn't swallow "self" as an :id param.
router.delete("/members/self", async (req: Request, res: Response): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!req.memberContext) { res.status(404).json({ error: "Not a member" }); return; }

  await db
    .delete(schoolMembersTable)
    .where(eq(schoolMembersTable.id, req.memberContext.memberId));

  res.json({ success: true });
});

// ── DELETE /api/members/:id ───────────────────────────────────────────────────
router.delete("/members/:id", async (req: Request, res: Response): Promise<void> => {
  if (!isHeadAdmin(req)) { res.status(403).json({ error: "Forbidden" }); return; }
  const schoolUserId = req.user!.id;
  const { id } = req.params as { id: string };

  const [deleted] = await db
    .delete(schoolMembersTable)
    .where(and(eq(schoolMembersTable.id, id), eq(schoolMembersTable.schoolUserId, schoolUserId)))
    .returning();

  if (!deleted) { res.status(404).json({ error: "Member not found" }); return; }
  res.json({ success: true });
});

// ── GET /api/my-member-context ────────────────────────────────────────────────
router.get("/my-member-context", (req: Request, res: Response): void => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  res.json({ memberContext: req.memberContext ?? null });
});

// ── GET /api/my-child ─────────────────────────────────────────────────────────
// Parent: returns their linked student profile + grades + absences for the given year.
// Averages are computed the same way as /api/results: prefer Ministry-stored __avg__
// sentinel rows, fall back to weighted recalculation from individual subject grades.
router.get("/my-child", async (req: Request, res: Response): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (req.memberContext?.role !== "parent") { res.status(403).json({ error: "Parents only" }); return; }
  if (req.user!.subscriptionStatus !== "active") {
    res.status(402).json({ error: "Parent service subscription required" });
    return;
  }

  const { linkedStudentId, schoolUserId } = req.memberContext;
  if (!linkedStudentId) { res.json({ student: null }); return; }

  const annee = String(req.query.annee ?? "2025-2026");
  const cacheKey = `parent-feed:v5:${schoolUserId}:${linkedStudentId}:${annee}`;
  const cached = await getCachedJson<Record<string, unknown>>(cacheKey);
  if (cached) {
    res.set("Cache-Control", "private, max-age=60");
    res.json(cached);
    return;
  }

  const [student] = await db
    .select()
    .from(studentsTable)
    .where(and(eq(studentsTable.id, linkedStudentId), eq(studentsTable.userId, schoolUserId)))
    .limit(1);

  if (!student) { res.status(404).json({ error: "Student not found" }); return; }

  // Prefer the selected year, but fall back to the latest available school year
  // when the current year has no data yet. This prevents a blank parent dashboard
  // when the student has valid attendance/grade rows recorded under the prior year.
  const allStudentGrades = await db
    .select()
    .from(gradesTable)
    .where(eq(gradesTable.studentId, linkedStudentId));

  const allStudentAbsences = await db
    .select()
    .from(absencesTable)
    .where(eq(absencesTable.studentId, linkedStudentId));

  const allStudentDailyAttendance = await db
    .select({
      id: studentDailyAttendanceTable.id,
      attendanceDate: studentDailyAttendanceTable.attendanceDate,
      annee: studentDailyAttendanceTable.annee,
      status: studentDailyAttendanceTable.status,
      isAbsent: studentDailyAttendanceTable.isAbsent,
      parentAbsenceReason: studentDailyAttendanceTable.parentAbsenceReason,
      parentAbsenceReasonAt: studentDailyAttendanceTable.parentAbsenceReasonAt,
    })
    .from(studentDailyAttendanceTable)
    .where(and(
      eq(studentDailyAttendanceTable.userId, schoolUserId),
      eq(studentDailyAttendanceTable.studentId, linkedStudentId),
    ))
    .orderBy(desc(studentDailyAttendanceTable.attendanceDate));

  const fallbackYear = [...new Set([
    ...allStudentGrades.map(g => g.annee),
    ...allStudentAbsences.map(a => a.annee),
    ...allStudentDailyAttendance.map(a => a.annee),
  ])].sort().at(-1) ?? annee;

  const hasCurrentYearData = allStudentGrades.some(g => g.annee === annee)
    || allStudentAbsences.some(a => a.annee === annee)
    || allStudentDailyAttendance.some(a => a.annee === annee);
  const selectedYear = hasCurrentYearData ? annee : fallbackYear;

  const allGrades = allStudentGrades.filter(g => g.annee === selectedYear);
  const absences = allStudentAbsences.filter(a => a.annee === selectedYear);
  const dailyAbsences = allStudentDailyAttendance.filter(a =>
    a.isAbsent && a.annee === selectedYear,
  );
  const dailyAttendanceCount = allStudentDailyAttendance.filter(a => a.annee === selectedYear).length;

  const [schoolInfo] = await db
    .select({ nom: schoolInfoTable.nom, wilaya: schoolInfoTable.wilaya, commune: schoolInfoTable.commune })
    .from(schoolInfoTable)
    .where(eq(schoolInfoTable.userId, schoolUserId))
    .limit(1);

  // Separate Ministry-stored averages (__avg__ sentinel) from subject grades —
  // same logic as /api/results so both pages show identical values.
  const AVG_SUBJECT = "__avg__";
  const storedAvgs: Record<string, number> = {};
  const subjectGrades: Record<string, Record<string, number>> = {}; // trimestre → subject → score

  for (const g of allGrades) {
    const score = parseFloat(String(g.score));
    const tr = String(g.trimestre);
    if (g.subject === AVG_SUBJECT) {
      storedAvgs[tr] = score;
    } else {
      subjectGrades[tr] ??= {};
      subjectGrades[tr]![g.subject] = score;
    }
  }

  const subs = getSubjectsForLevel(
    student.niveau as import("../../shared/subjects.js").Niveau,
    student.filiere as import("../../shared/subjects.js").LyceeBacFiliere | undefined,
  );

  const t1Avg = storedAvgs["1"] ?? calcWeightedAvg(subjectGrades["1"] ?? {}, subs);
  const t2Avg = storedAvgs["2"] ?? calcWeightedAvg(subjectGrades["2"] ?? {}, subs);
  const t3Avg = storedAvgs["3"] ?? calcWeightedAvg(subjectGrades["3"] ?? {}, subs);

  const annualAvg = calcAnnualAvg(t1Avg, t2Avg, t3Avg);

  // Return subject grades only (no __avg__ sentinels) so the client can show
  // per-subject rows without confusion.
  const grades = allGrades
    .filter(g => g.subject !== AVG_SUBJECT)
    .map(g => ({ ...g, score: parseFloat(String(g.score)) }));

  const payload = {
    school: schoolInfo ?? null,
    student,
    grades,
    absences,
    dailyAbsences,
    dailyAttendanceCount,
    t1Avg,
    t2Avg,
    t3Avg,
    annualAvg,
  };
  await setCachedJson(cacheKey, payload, 600);
  res.set("Cache-Control", "private, max-age=60");
  res.json(payload);
});

router.post("/my-child/absences/:id/reason", async (req: Request, res: Response): Promise<void> => {
  if (!req.isAuthenticated() || req.memberContext?.role !== "parent") {
    res.status(403).json({ error: "Parents only" });
    return;
  }
  if (req.user!.subscriptionStatus !== "active") {
    res.status(402).json({ error: "Parent service subscription required" });
    return;
  }

  const { linkedStudentId, schoolUserId } = req.memberContext;
  const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
  if (!linkedStudentId || reason.length < 3 || reason.length > 500) {
    res.status(400).json({ error: "Enter an absence reason between 3 and 500 characters" });
    return;
  }
  const annee = typeof req.body?.annee === "string" ? req.body.annee : "2025-2026";

  const [updatedAbsence] = await db.update(studentDailyAttendanceTable)
    .set({ parentAbsenceReason: reason, parentAbsenceReasonAt: new Date() })
    .where(and(
      eq(studentDailyAttendanceTable.id, String(req.params.id)),
      eq(studentDailyAttendanceTable.userId, schoolUserId),
      eq(studentDailyAttendanceTable.studentId, linkedStudentId),
      eq(studentDailyAttendanceTable.isAbsent, true),
    ))
    .returning({ id: studentDailyAttendanceTable.id, parentAbsenceReason: studentDailyAttendanceTable.parentAbsenceReason, parentAbsenceReasonAt: studentDailyAttendanceTable.parentAbsenceReasonAt });

  if (!updatedAbsence) {
    res.status(404).json({ error: "Absence record not found" });
    return;
  }

  await deleteCachedJson(`parent-feed:v5:${schoolUserId}:${linkedStudentId}:${annee}`);
  res.json({ success: true, ...updatedAbsence });
});

// ── GET /api/teacher/students ─────────────────────────────────────────────────
// Teacher: list students in their assigned classes.
router.get("/teacher/students", async (req: Request, res: Response): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (req.memberContext?.role !== "teacher") { res.status(403).json({ error: "Teachers only" }); return; }

  const { assignedClasses, schoolUserId } = req.memberContext;
  const annee = String(req.query.annee ?? "2025-2026");

  if (!assignedClasses.length) { res.json([]); return; }

  const students = await db
    .select()
    .from(studentsTable)
    .where(
      and(
        eq(studentsTable.userId, schoolUserId),
        eq(studentsTable.annee, annee),
        inArray(studentsTable.classe, assignedClasses),
      ),
    )
    .orderBy(studentsTable.classe, studentsTable.nomPrenom);

  res.json(students);
});

// ── POST /api/teacher/grades ──────────────────────────────────────────────────
// Teacher: submit grades for a student in an assigned class.
router.post("/teacher/grades", async (req: Request, res: Response): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (req.memberContext?.role !== "teacher") { res.status(403).json({ error: "Teachers only" }); return; }

  const { assignedClasses, schoolUserId } = req.memberContext;
  const { studentId, annee, trimestre, grades: gradeMap } = req.body as {
    studentId: string;
    annee: string;
    trimestre: number;
    grades: Record<string, number>;
  };

  if (!studentId || !annee || !trimestre || !gradeMap) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }

  // Verify student belongs to this school AND is in an assigned class
  const [student] = await db
    .select({ id: studentsTable.id, classe: studentsTable.classe })
    .from(studentsTable)
    .where(and(eq(studentsTable.id, studentId), eq(studentsTable.userId, schoolUserId)))
    .limit(1);

  if (!student) { res.status(404).json({ error: "Student not found" }); return; }
  if (!assignedClasses.includes(student.classe)) {
    res.status(403).json({ error: "ليس لديك صلاحية إدخال درجات هذا القسم" });
    return;
  }

  const crypto = (await import("crypto")).default;
  const upserts = Object.entries(gradeMap).map(([subject, score]) => ({
    id: crypto.randomUUID(),
    userId: schoolUserId,
    studentId,
    annee,
    trimestre,
    subject,
    score: String(Math.min(Math.max(Number(score), 0), 20)),
  }));

  if (upserts.length > 0) {
    for (const row of upserts) {
      await db.insert(gradesTable).values(row as any).onConflictDoNothing();
    }
  }

  res.json({ success: true, count: upserts.length });
});

// ── POST /api/parent-register ─────────────────────────────────────────────────
// Any authenticated user can call this to register as a parent linked to a student.
// They supply the school join code + student national ID to prove they belong to the school.
router.post("/parent-register", async (req: Request, res: Response): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }

  // A user who is already a member cannot self-register again
  if (req.memberContext) {
    res.status(409).json({ error: "Already a school member", memberContext: req.memberContext });
    return;
  }

  const { joinCode, nationalId, parentName } = req.body as {
    joinCode: string;
    nationalId: string;
    parentName?: string;
  };

  if (!joinCode?.trim() || !nationalId?.trim()) {
    res.status(400).json({ error: "joinCode and nationalId are required" });
    return;
  }

  // Look up school by join code
  const [school] = await db
    .select({ userId: schoolInfoTable.userId, nom: schoolInfoTable.nom })
    .from(schoolInfoTable)
    .where(eq(schoolInfoTable.joinCode, joinCode.toUpperCase().trim()))
    .limit(1);

  if (!school) {
    res.status(404).json({ error: "رمز المدرسة غير صحيح. تحقق من الرمز مع مدير المدرسة." });
    return;
  }

  // Find student by raqm (registration number) in that school
  // raqm is the "رقم التسجيل" field used in Algeria (integer)
  const raqmInt = parseInt(nationalId.trim(), 10);
  if (isNaN(raqmInt)) {
    res.status(400).json({ error: "رقم التسجيل يجب أن يكون رقمًا صحيحًا." });
    return;
  }
  const [student] = await db
    .select({ id: studentsTable.id, nomPrenom: studentsTable.nomPrenom, niveau: studentsTable.niveau, classe: studentsTable.classe, filiere: studentsTable.filiere })
    .from(studentsTable)
    .where(and(eq(studentsTable.userId, school.userId), eq(studentsTable.raqm, raqmInt)))
    .limit(1);

  if (!student) {
    res.status(404).json({ error: "رقم التسجيل غير موجود في سجلات المدرسة. تحقق من الرقم أو تواصل مع مدير المدرسة." });
    return;
  }

  // Check if this user already has a parent record for this school
  const [existing] = await db
    .select({ id: schoolMembersTable.id })
    .from(schoolMembersTable)
    .where(and(
      eq(schoolMembersTable.schoolUserId, school.userId),
      eq(schoolMembersTable.memberUserId, req.user!.id),
    ))
    .limit(1);

  if (existing) {
    res.status(409).json({ error: "أنت مسجّل بالفعل في هذه المدرسة." });
    return;
  }

  const name = parentName?.trim() || req.user!.firstName || req.user!.email || "ولي الأمر";

  const [created] = await db
    .insert(schoolMembersTable)
    .values({
      schoolUserId: school.userId,
      memberUserId: req.user!.id,
      role: "parent",
      name,
      email: req.user!.email ?? null,
      phone: null,
      assignedClasses: [],
      linkedStudentId: student.id,
    })
    .returning();

  res.status(201).json({
    success: true,
    member: created,
    student: { id: student.id, nomPrenom: student.nomPrenom, niveau: student.niveau, classe: student.classe, filiere: student.filiere },
    school: { nom: school.nom },
  });
});

export default router;
