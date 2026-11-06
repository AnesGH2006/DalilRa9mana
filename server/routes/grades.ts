import crypto from "crypto";
import { Router, type IRouter } from "express";
import { logAudit } from "../lib/audit.js";
import { and, desc, eq, inArray, or } from "drizzle-orm";
import { db, gradesTable, absencesTable, studentsTable, usersTable } from "../../shared/db.js";
import { bemSessionsTable } from "../../shared/schema.js";
import { UpsertGradesBulkBody, UpsertAbsenceBody } from "../../shared/schemas.js";
import { getSubjectsForLevel, calcWeightedAvg } from "../../shared/subjects.js";
import type { Niveau } from "../../shared/types.js";
import { FREE_STUDENT_LIMIT } from "../../shared/subscription.js";
import { notifyParentOfAbsence } from "../services/absenceAlerts.js";
import { enqueueAbsenceAlert } from "../services/notificationQueue.js";
import { getSchoolLevelsForRequest } from "../config/school-stage.js";

const router: IRouter = Router();

function normalizeStudentName(name: string): string {
  return name.toLocaleLowerCase("ar-DZ")
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[أإآا]/g, "ا")
    .replace(/[ةه]/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/\s+/g, "")
    .replace(/[^\p{L}\p{N}]/gu, "");
}

type BemStudent = { name?: string; average?: number | null };
type BemSessionData = { students?: BemStudent[] };

// ── GET /api/grades?studentId=&annee=&trimestre= ──────────────────────────────
router.get("/grades", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const userId = req.user!.id;
  const { studentId, annee, trimestre } = req.query as Record<string, string>;
  const conds = [eq(gradesTable.userId, userId)];
  const stageStudents = await db.select({ id: studentsTable.id }).from(studentsTable)
    .where(and(eq(studentsTable.userId, userId), inArray(studentsTable.niveau, getSchoolLevelsForRequest(req))));
  const stageStudentIds = stageStudents.map(student => student.id);
  if (stageStudentIds.length === 0) { res.json([]); return; }
  conds.push(inArray(gradesTable.studentId, stageStudentIds));
  if (studentId) conds.push(eq(gradesTable.studentId, studentId));
  if (annee) conds.push(eq(gradesTable.annee, annee));
  if (trimestre) conds.push(eq(gradesTable.trimestre, parseInt(trimestre)));
  const rows = await db.select().from(gradesTable).where(and(...conds));
  res.json(rows.map(r => ({ ...r, score: parseFloat(String(r.score)) })));
});

// ── POST /api/grades — single subject/score upsert ────────────────────────────
// Used by the OCR review-and-save flow, which saves one row (one student, one
// subject, one score) at a time. Unlike /grades/bulk, this only replaces the
// ONE matching (studentId, annee, trimestre, subject) row — it never touches
// or deletes any other subject's grade for that student.
router.post("/grades", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const userId = req.user!.id;

  const { studentId, annee, trimestre, subject, score } = req.body as {
    studentId?: string;
    annee?: string;
    trimestre?: number;
    subject?: string;
    score?: number;
  };

  if (
    !studentId || !annee || !trimestre || !subject ||
    typeof score !== "number" || isNaN(score) || score < 0 || score > 20
  ) {
    res.status(400).json({ error: "بيانات غير صالحة" });
    return;
  }

  const [student] = await db.select().from(studentsTable)
    .where(and(eq(studentsTable.id, studentId), eq(studentsTable.userId, userId), inArray(studentsTable.niveau, getSchoolLevelsForRequest(req))));
  if (!student) {
    res.status(404).json({ error: "الطالب غير موجود" });
    return;
  }

  // Replace only this exact (student, year, trimester, subject) grade.
  await db.delete(gradesTable).where(and(
    eq(gradesTable.userId, userId),
    eq(gradesTable.studentId, studentId),
    eq(gradesTable.annee, annee),
    eq(gradesTable.trimestre, trimestre),
    eq(gradesTable.subject, subject),
  ));

  const [row] = await db.insert(gradesTable).values({
    id: crypto.randomBytes(8).toString("hex"),
    userId,
    studentId,
    annee,
    trimestre,
    subject,
    score: String(Math.max(0, Math.min(20, score))),
  }).returning();

  logAudit({
    userId,
    actorId:     req.memberContext?.memberId ?? userId,
    actorName:   req.memberContext?.name ?? req.user!.firstName ?? req.user!.email ?? undefined,
    action:      "grade_edit",
    description: `تعديل درجة ${student.nomPrenom} — ${subject} — الفصل ${trimestre}`,
    entity:      "grade",
    entityId:    student.id,
    details:     { studentName: student.nomPrenom, subject, trimestre, score, annee },
    req,
  });

  res.json({ success: true, grade: { ...row, score: parseFloat(String(row.score)) } });
});

// ── POST /api/grades/bulk ─────────────────────────────────────────────────────
// Accepts either:
//   { studentId, annee, trimestre, grades }          ← manual entry (existing)
//   { studentName, annee, trimestre, grades }         ← Excel import (new)
router.post("/grades/bulk", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const userId = req.user!.id;

  const { studentId, studentName, annee, trimestre, grades } = req.body as {
    studentId?: string;
    studentName?: string;
    annee: string;
    trimestre: number;
    grades: Record<string, number>;
  };

  if (!annee || !trimestre || !grades || typeof grades !== "object") {
    res.status(400).json({ error: "Missing required fields: annee, trimestre, grades" });
    return;
  }
  if (!studentId && !studentName) {
    res.status(400).json({ error: "Provide either studentId or studentName" });
    return;
  }

  // ── Resolve student ────────────────────────────────────────────────────────
  let student: typeof studentsTable.$inferSelect | undefined;

  if (studentId) {
    // Manual entry: look up by ID (original behaviour)
    const rows = await db.select().from(studentsTable)
      .where(and(eq(studentsTable.id, studentId), eq(studentsTable.userId, userId), inArray(studentsTable.niveau, getSchoolLevelsForRequest(req))));
    student = rows[0];
  } else {
    // Excel import: look up by name (normalize whitespace for safety)
    const name = (studentName ?? "").trim();
    const rows = await db.select().from(studentsTable)
      .where(and(eq(studentsTable.userId, userId), eq(studentsTable.nomPrenom, name), inArray(studentsTable.niveau, getSchoolLevelsForRequest(req))));
    student = rows[0];

    // Fallback: try removing double spaces / different spacing
    if (!student) {
      const allStudents = await db.select().from(studentsTable)
        .where(and(eq(studentsTable.userId, userId), inArray(studentsTable.niveau, getSchoolLevelsForRequest(req))));
      student = allStudents.find(s =>
        s.nomPrenom.replace(/\s+/g, " ").trim() === name.replace(/\s+/g, " ").trim()
      );
    }
  }

  if (!student) {
    res.status(404).json({ error: `Student not found: ${studentId ?? studentName}` });
    return;
  }

  // ── Update raqm if provided via Excel import ──────────────────────────────
  const raqm = (req.body as any).raqm as number | undefined;
  if (raqm && !studentId) {
    await db.update(studentsTable)
      .set({ raqm })
      .where(and(eq(studentsTable.id, student.id), eq(studentsTable.userId, userId)));
  }

  // ── Upsert grades (atomic delete + insert) ───────────────────────────────
  // Allow grade 0 — it is a valid score (student attempted subject and scored zero).
  // Only exclude NaN / non-numeric / out-of-range values.
  const validGrades = Object.entries(grades).filter(([, score]) =>
    typeof score === "number" && !isNaN(score) && score >= 0 && score <= 20
  );

  await db.transaction(async (tx) => {
    await tx.delete(gradesTable).where(and(
      eq(gradesTable.userId, userId),
      eq(gradesTable.studentId, student!.id),
      eq(gradesTable.annee, annee),
      eq(gradesTable.trimestre, trimestre),
    ));

    if (validGrades.length > 0) {
      await tx.insert(gradesTable).values(
        validGrades.map(([subject, score]) => ({
          id: crypto.randomBytes(8).toString("hex"),
          userId,
          studentId: student!.id,
          annee,
          trimestre,
          subject,
          score: String(Math.max(0, Math.min(20, score))),
        }))
      );
    }
  });

  req.log.info(
    { studentId: student.id, studentName: student.nomPrenom, trimestre, count: validGrades.length },
    "Grades saved"
  );

  logAudit({
    userId,
    actorId:     req.memberContext?.memberId ?? userId,
    actorName:   req.memberContext?.name ?? req.user!.firstName ?? req.user!.email ?? undefined,
    action:      "grade_edit",
    description: `تعديل درجات ${student.nomPrenom} — الفصل ${trimestre} (${validGrades.length} مادة)`,
    entity:      "grade",
    entityId:    student.id,
    details:     { studentName: student.nomPrenom, trimestre, count: validGrades.length, annee },
    req,
  });

  res.json({ success: true, studentId: student.id, saved: validGrades.length });
});

// ── POST /api/grades/batch-import ────────────────────────────────────────────
// Saves ALL students' grades in a single request instead of N×3 sequential calls.
// Body: { annee, students: [{ studentName, raqm?, trimesters: { "1"?: Record<subject,score>, "2"?: ..., "3"?: ... }, triAvgs?: { "1"?: number, "2"?: number, "3"?: number } }] }
// Special subject key used to store Ministry-provided trimester averages verbatim.
// When present, /api/results uses this value instead of recalculating from raw scores.
const AVG_SUBJECT = "__avg__";

router.post("/grades/batch-import", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const userId = req.user!.id;
  const { annee, students } = req.body as {
    annee: string;
    students: Array<{
      studentName: string;
      raqm?: number;
      niveau?: string;
      classe?: string;
      sexe?: string;
      annualPassed?: boolean | null;
      trimesters: Record<string, Record<string, number>>;
      triAvgs?: Record<string, number | null>;
    }>;
  };

  if (!annee || !Array.isArray(students) || students.length === 0) {
    res.status(400).json({ error: "Missing annee or students array" });
    return;
  }

  // ── 1. Load all students for this user at once ────────────────────────────
  const allStudents = await db.select().from(studentsTable)
    .where(and(eq(studentsTable.userId, userId), inArray(studentsTable.niveau, getSchoolLevelsForRequest(req))));

  const normalize = (n: string) => n.replace(/\s+/g, " ").trim();
  const studentLookup = new Map<string, typeof allStudents[number]>();
  for (const s of allStudents) {
    const nameKey = normalize(s.nomPrenom);
    const compositeKey = normalize(`${s.nomPrenom}||${s.niveau ?? ""}||${s.classe ?? ""}`);
    if (nameKey) studentLookup.set(nameKey, s);
    if (compositeKey) studentLookup.set(compositeKey, s);
  }

  // ── 2. Build insert rows ───────────────────────────────────────────────────
  const toDelete: Array<{ studentId: string; trimestre: number }> = [];
  const toInsert: Array<{
    id: string; userId: string; studentId: string;
    annee: string; trimestre: number; subject: string; score: string;
  }> = [];
  const raqmUpdates: Array<{ studentId: string; raqm: number }> = [];
  const autoCreated: typeof studentsTable.$inferInsert[] = [];

  let savedCount = 0;
  const errors: string[] = [];

  for (const s of students) {
    const nameKey = normalize(s.studentName);
    const compositeKey = normalize(`${s.studentName}||${s.niveau ?? ""}||${s.classe ?? ""}`);
    let student = studentLookup.get(compositeKey) ?? studentLookup.get(nameKey);
    if (!student) {
      // Auto-create student if we have enough info (niveau + classe from parsed file)
      if (s.niveau && s.classe) {
        const niv = getSchoolLevelsForRequest(req).find(level => level === s.niveau);
        if (niv) {
          const newStudent = {
            id: crypto.randomBytes(16).toString("hex"),
            userId,
            nomPrenom: normalize(s.studentName),
            niveau: niv,
            classe: s.classe,
            sexe: (s.sexe === "F" ? "F" : "M") as "M" | "F",
            statut: "nouveau" as const,
            resultat: s.annualPassed === true ? "admis" as const
                    : s.annualPassed === false ? "non_admis" as const
                    : null,
            annee,
            raqm: s.raqm ?? null,
            dateNaissance: null,
          };
          autoCreated.push(newStudent);
          studentLookup.set(nameKey, newStudent as typeof allStudents[0]);
          studentLookup.set(compositeKey, newStudent as typeof allStudents[0]);
          student = newStudent as typeof allStudents[0];
        }
      }
      if (!student) { errors.push(s.studentName); continue; }
    }

    if (s.raqm && !student.raqm) {
      raqmUpdates.push({ studentId: student.id, raqm: s.raqm });
    }

    for (const [triStr, grades] of Object.entries(s.trimesters)) {
      const tri = parseInt(triStr);
      if (isNaN(tri)) continue;

      const validGrades = Object.entries(grades).filter(([, score]) =>
        typeof score === "number" && !isNaN(score) && score >= 0 && score <= 20
      );
      if (validGrades.length === 0) continue;

      toDelete.push({ studentId: student.id, trimestre: tri });

      // Raw subject scores
      for (const [subject, score] of validGrades) {
        toInsert.push({
          id: crypto.randomBytes(8).toString("hex"),
          userId, studentId: student.id, annee, trimestre: tri,
          subject, score: String(Math.max(0, Math.min(20, score))),
        });
      }

      // Store Ministry pre-calculated average as a sentinel row (__avg__)
      // so /api/results can use it directly without recalculating from raw scores.
      const providedAvg = s.triAvgs?.[String(tri)];
      if (typeof providedAvg === "number" && !isNaN(providedAvg) && providedAvg >= 0) {
        toInsert.push({
          id: crypto.randomBytes(8).toString("hex"),
          userId, studentId: student.id, annee, trimestre: tri,
          subject: AVG_SUBJECT,
          score: String(Math.round(providedAvg * 100) / 100),
        });
      }
    }
    savedCount++;
  }

  // ── 3 & 4. Execute all writes atomically in a single transaction ────────────
  if (autoCreated.length > 0) {
    const [account] = await db.select({ subscriptionPlan: usersTable.subscriptionPlan }).from(usersTable)
      .where(eq(usersTable.id, userId)).limit(1);
    if (account?.subscriptionPlan === "free") {
      const existingStudents = await db.select({ id: studentsTable.id }).from(studentsTable)
        .where(eq(studentsTable.userId, userId));
      if (existingStudents.length + autoCreated.length > FREE_STUDENT_LIMIT) {
        res.status(403).json({ error: `الخطة المجانية محدودة بـ ${FREE_STUDENT_LIMIT} تلميذاً`, requiredPlan: "basic" });
        return;
      }
    }
  }

  await db.transaction(async (tx) => {
    // Insert auto-created students first
    if (autoCreated.length > 0) {
      for (let i = 0; i < autoCreated.length; i += 200) {
        await tx.insert(studentsTable).values(autoCreated.slice(i, i + 200) as any);
      }
    }

    // Delete stale grades, bulk-insert new ones
    for (const { studentId, trimestre } of toDelete) {
      await tx.delete(gradesTable).where(and(
        eq(gradesTable.userId, userId),
        eq(gradesTable.studentId, studentId),
        eq(gradesTable.annee, annee),
        eq(gradesTable.trimestre, trimestre),
      ));
    }

    const CHUNK = 500;
    for (let i = 0; i < toInsert.length; i += CHUNK) {
      await tx.insert(gradesTable).values(toInsert.slice(i, i + CHUNK));
    }

    for (const { studentId, raqm } of raqmUpdates) {
      await tx.update(studentsTable).set({ raqm }).where(
        and(eq(studentsTable.id, studentId), eq(studentsTable.userId, userId))
      );
    }
  });

  req.log.info(
    { saved: savedCount, gradeRows: toInsert.length, notFound: errors.length, autoCreated: autoCreated.length },
    "Batch import complete"
  );
  res.json({ success: true, saved: savedCount, gradeRows: toInsert.length, notFound: errors, autoCreated: autoCreated.length });
});

// ── GET /api/results ──────────────────────────────────────────────────────────
router.get("/results", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const userId = req.user!.id;
  const { annee, niveau, classe, sexe } = req.query as Record<string, string>;

  const studentConds = [eq(studentsTable.userId, userId), inArray(studentsTable.niveau, getSchoolLevelsForRequest(req))];
  if (annee) studentConds.push(eq(studentsTable.annee, annee));
  if (niveau) studentConds.push(eq(studentsTable.niveau, niveau as Niveau));
  if (classe) studentConds.push(eq(studentsTable.classe, classe));
  if (sexe === "M" || sexe === "F") studentConds.push(eq(studentsTable.sexe, sexe));

  const students = await db.select().from(studentsTable)
    .where(and(...studentConds))
    .orderBy(studentsTable.niveau, studentsTable.classe, studentsTable.raqm, studentsTable.nomPrenom);

  if (!students.length) { res.json([]); return; }

  const studentIds = students.map(s => s.id);
  const allGrades = await db.select().from(gradesTable).where(
    and(eq(gradesTable.userId, userId), inArray(gradesTable.studentId, studentIds))
  );
  const allAbsences = await db.select().from(absencesTable).where(
    and(eq(absencesTable.userId, userId), inArray(absencesTable.studentId, studentIds))
  );

  const [latestBemSession] = await db.select({ data: bemSessionsTable.data })
    .from(bemSessionsTable)
    .where(eq(bemSessionsTable.userId, userId))
    .orderBy(desc(bemSessionsTable.createdAt))
    .limit(1);
  const bemAverageByName = new Map<string, number>();
  const bemStudents = (latestBemSession?.data as BemSessionData | undefined)?.students ?? [];
  for (const bemStudent of bemStudents) {
    if (!bemStudent.name || typeof bemStudent.average !== "number" || !Number.isFinite(bemStudent.average)) continue;
    bemAverageByName.set(normalizeStudentName(bemStudent.name), bemStudent.average);
  }

  // gradeMap: studentId → trimestre → subject → score
  // storedAvgMap: studentId → trimestre → pre-calculated Ministry average (from __avg__ sentinel)
  const gradeMap: Record<string, Record<string, Record<string, number>>> = {};
  const storedAvgMap: Record<string, Record<string, number>> = {};

  for (const g of allGrades) {
    if (g.subject === AVG_SUBJECT) {
      // Ministry-provided trimester average — use verbatim, do not recalculate
      storedAvgMap[g.studentId] ??= {};
      storedAvgMap[g.studentId]![String(g.trimestre)] = parseFloat(String(g.score));
    } else {
      gradeMap[g.studentId] ??= {};
      gradeMap[g.studentId][String(g.trimestre)] ??= {};
      gradeMap[g.studentId][String(g.trimestre)]![g.subject] = parseFloat(String(g.score));
    }
  }

  const absMap: Record<string, { j: number; u: number }> = {};
  for (const a of allAbsences) {
    absMap[a.studentId] ??= { j: 0, u: 0 };
    absMap[a.studentId]!.j += a.justifiedHours;
    absMap[a.studentId]!.u += a.unjustifiedHours;
  }

  const results = students.map(s => {
    const scores = gradeMap[s.id] ?? {};
    const storedAvgs = storedAvgMap[s.id] ?? {};
    const subs = getSubjectsForLevel(s.niveau as Niveau);

    // Prefer Ministry-provided average (stored as __avg__) over recalculation.
    // Fall back to calcWeightedAvg for manually-entered grades.
    const t1Avg = storedAvgs["1"] ?? calcWeightedAvg(scores["1"] ?? {}, subs);
    const t2Avg = storedAvgs["2"] ?? calcWeightedAvg(scores["2"] ?? {}, subs);
    const t3Avg = storedAvgs["3"] ?? calcWeightedAvg(scores["3"] ?? {}, subs);

    const avgs = [t1Avg, t2Avg, t3Avg].filter((v): v is number => v !== null);
    const annualAvg = avgs.length > 0
      ? Math.round((avgs.reduce((a, b) => a + b, 0) / avgs.length) * 100) / 100
      : null;
    const bemAvg = s.niveau === "4AM" ? (bemAverageByName.get(normalizeStudentName(s.nomPrenom)) ?? null) : null;
    const finalAvg = s.niveau === "4AM" ? bemAvg : annualAvg;
    const passed = finalAvg !== null ? finalAvg >= 10 : null;
    const abs = absMap[s.id] ?? { j: 0, u: 0 };

    return {
      student: s, scores,
      t1Avg, t2Avg, t3Avg, annualAvg, bemAvg, finalAvg, finalPassed: passed, passed,
      rank: null as number | null,
      totalJustified: abs.j,
      totalUnjustified: abs.u,
    };
  });

  // Rank within each class
  const byClass: Record<string, typeof results> = {};
  for (const r of results) {
    const key = `${r.student.niveau}-${r.student.classe}`;
    byClass[key] ??= [];
    byClass[key]!.push(r);
  }
  for (const group of Object.values(byClass)) {
    const sorted = [...group]
      .filter(r => r.finalAvg !== null)
      .sort((a, b) => (b.finalAvg ?? 0) - (a.finalAvg ?? 0));
    sorted.forEach((r, i) => { r.rank = i + 1; });
  }

  res.json(results);
});

// ── GET /api/results/subjects ─────────────────────────────────────────────────
router.get("/results/subjects", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const userId = req.user!.id;
  const { annee, niveau, classe, trimestre, sexe } = req.query as Record<string, string>;

  const studentConds = [eq(studentsTable.userId, userId), inArray(studentsTable.niveau, getSchoolLevelsForRequest(req))];
  if (annee) studentConds.push(eq(studentsTable.annee, annee));
  if (niveau) studentConds.push(eq(studentsTable.niveau, niveau as Niveau));
  if (classe) studentConds.push(eq(studentsTable.classe, classe));
  if (sexe === "M" || sexe === "F") studentConds.push(eq(studentsTable.sexe, sexe));
  const students = await db.select().from(studentsTable).where(and(...studentConds));
  if (!students.length) { res.json([]); return; }

  const studentIds = students.map(s => s.id);
  const studentMap = Object.fromEntries(students.map(s => [s.id, s]));

  // Fetch ALL grades (all trimesters) for improvement computation
  const allGrades = await db.select().from(gradesTable)
    .where(and(eq(gradesTable.userId, userId), inArray(gradesTable.studentId, studentIds)));

  // Filter to requested trimester for main stats (or use all if no filter)
  const grades = trimestre
    ? allGrades.filter(g => g.trimestre === parseInt(trimestre))
    : allGrades;

  // Main stats: bySubject scores, gender split, trimester split (for improvement)
  const bySubject: Record<string, number[]> = {};
  const bySubjectGender: Record<string, { M: number[]; F: number[] }> = {};
  const bySubjectTri: Record<string, Record<string, number[]>> = {}; // subject → tri → scores

  for (const g of allGrades) {
    if (g.subject === AVG_SUBJECT) continue;
    bySubjectTri[g.subject] ??= {};
    bySubjectTri[g.subject][String(g.trimestre)] ??= [];
    bySubjectTri[g.subject][String(g.trimestre)]!.push(parseFloat(String(g.score)));
  }

  for (const g of grades) {
    if (g.subject === AVG_SUBJECT) continue;
    const score = parseFloat(String(g.score));
    bySubject[g.subject] ??= [];
    bySubject[g.subject]!.push(score);
    bySubjectGender[g.subject] ??= { M: [], F: [] };
    const sex = studentMap[g.studentId]?.sexe as "M" | "F" | undefined;
    if (sex === "M") bySubjectGender[g.subject]!.M.push(score);
    else if (sex === "F") bySubjectGender[g.subject]!.F.push(score);
  }

  const calcStats = (scores: number[]) => {
    const avg = scores.length > 0
      ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100
      : 0;
    return { avg, passCount: scores.filter(v => v >= 10).length, total: scores.length };
  };

  const subs = getSubjectsForLevel((niveau as Niveau) ?? "4AM");
  const result = subs.map(s => {
    const scores = bySubject[s.key] ?? [];
    const avg = scores.length > 0
      ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100
      : 0;
    const passCount = scores.filter(v => v >= 10).length;
    const failCount = scores.length - passCount;
    const failRate = scores.length > 0 ? Math.round((failCount / scores.length) * 100) : 0;

    const gd = bySubjectGender[s.key] ?? { M: [], F: [] };
    const boys = calcStats(gd.M);
    const girls = calcStats(gd.F);

    // Improvement: T3 avg − T1 avg (uses all trimesters regardless of filter)
    const triData = bySubjectTri[s.key] ?? {};
    const t1Scores = triData["1"] ?? [];
    const t3Scores = triData["3"] ?? [];
    const t1Avg = t1Scores.length > 0 ? t1Scores.reduce((a, b) => a + b, 0) / t1Scores.length : null;
    const t3Avg = t3Scores.length > 0 ? t3Scores.reduce((a, b) => a + b, 0) / t3Scores.length : null;
    const improvement = (t1Avg !== null && t3Avg !== null)
      ? Math.round((t3Avg - t1Avg) * 100) / 100
      : null;

    return {
      subject: s.key, arLabel: s.arLabel, avg,
      min: scores.length ? Math.min(...scores) : 0,
      max: scores.length ? Math.max(...scores) : 0,
      passCount, failCount, total: scores.length,
      failRate, boys, girls, improvement,
    };
  }).filter(s => s.total > 0);

  res.json(result);
});

// ── Absences ──────────────────────────────────────────────────────────────────
router.get("/absences", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const userId = req.user!.id;
  const { annee, studentId } = req.query as Record<string, string>;
  const conds = [eq(absencesTable.userId, userId)];
  const stageStudents = await db.select({ id: studentsTable.id }).from(studentsTable)
    .where(and(eq(studentsTable.userId, userId), inArray(studentsTable.niveau, getSchoolLevelsForRequest(req))));
  const stageStudentIds = stageStudents.map(student => student.id);
  if (stageStudentIds.length === 0) { res.json([]); return; }
  conds.push(inArray(absencesTable.studentId, stageStudentIds));
  if (annee) conds.push(eq(absencesTable.annee, annee));
  if (studentId) conds.push(eq(absencesTable.studentId, studentId));
  const rows = await db.select().from(absencesTable).where(and(...conds));
  res.json(rows);
});

router.post("/absences", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const userId = req.user!.id;
  const body = UpsertAbsenceBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid data" }); return; }
  const { studentId, annee, trimestre, justifiedHours, unjustifiedHours } = body.data;
  const [student] = await db.select({ id: studentsTable.id }).from(studentsTable)
    .where(and(
      eq(studentsTable.id, studentId),
      eq(studentsTable.userId, userId),
      inArray(studentsTable.niveau, getSchoolLevelsForRequest(req)),
    ))
    .limit(1);
  if (!student) { res.status(404).json({ error: "الطالب غير موجود في المرحلة المختارة" }); return; }

  await db.delete(absencesTable).where(and(
    eq(absencesTable.userId, userId),
    eq(absencesTable.studentId, studentId),
    eq(absencesTable.annee, annee),
    eq(absencesTable.trimestre, trimestre),
  ));

  const [row] = await db.insert(absencesTable).values({
    id: crypto.randomBytes(8).toString("hex"),
    userId, studentId, annee, trimestre, justifiedHours, unjustifiedHours,
  }).returning();

  if (justifiedHours > 0 || unjustifiedHours > 0) {
    try {
      const queued = await enqueueAbsenceAlert({ schoolUserId: userId, studentId, annee });
      if (!queued) await notifyParentOfAbsence({ schoolUserId: userId, studentId, annee });
    } catch (error) {
      req.log?.error?.({ error, studentId }, "Absence parent alert failed");
    }
  }

  res.json(row);
});

export default router;
