/**
 * Class Balancer routes
 *
 * POST /api/class-balancer/balance
 * ─────────────────────────────────
 * Accepts a list of student IDs + desired class count, fetches student data
 * (including average grades) from the DB, then returns balanced class groups.
 *
 * Request body:
 * {
 *   studentIds: string[],     // list of student IDs (must belong to authed user)
 *   classCount: number,       // 2–10
 *   annee?: string,           // filter grades by school year (default 2026-2027)
 *   weights?: {
 *     grade?: number,
 *     gender?: number,
 *     repeating?: number
 *   }
 * }
 *
 * POST /api/class-balancer/balance-niveau
 * ─────────────────────────────────────────
 * Same as above but pulls ALL students for a given niveau+annee automatically.
 *
 * Request body:
 * {
 *   niveau: a level supported by the configured school stage,
 *   annee?: string,
 *   classCount: number,
 *   weights?: { ... }
 * }
 */

import { Router } from "express";
import { and, eq, avg as drizzleAvg, inArray } from "drizzle-orm";
import { db, studentsTable, gradesTable } from "../../shared/db.js";
import type { SchoolLevel } from "../../shared/school-stage.js";
import { getSchoolLevelsForRequest } from "../config/school-stage.js";
import { balanceClasses, type StudentInput } from "../services/classBalancer.js";

const router = Router();

// ── Shared helper: fetch students with their avg grade ─────────────────────────
async function fetchStudentsWithGrades(
  userId: string,
  studentIds: string[] | null,
  niveau: SchoolLevel | null,
  annee: string,
  allowedLevels: readonly SchoolLevel[],
): Promise<StudentInput[]> {
  // Build the student where clause
  const conds = [eq(studentsTable.userId, userId), inArray(studentsTable.niveau, [...allowedLevels])];
  if (niveau) conds.push(eq(studentsTable.niveau, niveau));

  const studentRows = await db
    .select({
      id:        studentsTable.id,
      nomPrenom: studentsTable.nomPrenom,
      sexe:      studentsTable.sexe,
      statut:    studentsTable.statut,
      niveau:    studentsTable.niveau,
      classe:    studentsTable.classe,
    })
    .from(studentsTable)
    .where(and(...conds));

  // Filter by provided IDs if given
  const filtered = studentIds
    ? studentRows.filter((s) => studentIds.includes(s.id))
    : studentRows;

  if (filtered.length === 0) return [];

  // Fetch average grade per student (across all subjects/trimesters for the year)
  const gradeConds = [
    eq(gradesTable.userId, userId),
    eq(gradesTable.annee, annee),
  ];
  const avgRows = await db
    .select({
      studentId:    gradesTable.studentId,
      averageGrade: drizzleAvg(gradesTable.score),
    })
    .from(gradesTable)
    .where(and(...gradeConds))
    .groupBy(gradesTable.studentId);

  const gradeMap = new Map(
    avgRows.map((r) => [
      r.studentId,
      r.averageGrade != null ? parseFloat(String(r.averageGrade)) : null,
    ]),
  );

  return filtered.map((s) => ({
    id:           s.id,
    nomPrenom:    s.nomPrenom,
    sexe:         s.sexe,
    statut:       s.statut,
    averageGrade: gradeMap.get(s.id) ?? null,
  }));
}

// ── POST /api/class-balancer/balance ──────────────────────────────────────────
router.post("/class-balancer/balance", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }

  const userId = req.user!.id;
  const { studentIds, classCount, annee = "2026-2027", weights, rules } = req.body as {
    studentIds?: string[];
    classCount?: number;
    annee?: string;
    weights?: Record<string, number>;
    rules?: string;
  };

  if (!Array.isArray(studentIds) || studentIds.length === 0) {
    res.status(400).json({ error: "studentIds must be a non-empty array" });
    return;
  }
  if (!classCount || classCount < 2 || classCount > 10) {
    res.status(400).json({ error: "classCount must be between 2 and 10" });
    return;
  }

  const students = await fetchStudentsWithGrades(userId, studentIds, null, annee, getSchoolLevelsForRequest(req));
  if (students.length === 0) {
    res.status(404).json({ error: "لم يُعثر على تلاميذ بالمعرّفات المُحدَّدة" });
    return;
  }

  const result = balanceClasses(students, { classCount, weights, rules });
  res.json(result);
});

// ── POST /api/class-balancer/balance-niveau ───────────────────────────────────
router.post("/class-balancer/balance-niveau", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }

  const userId = req.user!.id;
  const { niveau, classCount, annee = "2026-2027", weights, rules } = req.body as {
    niveau?: string;
    classCount?: number;
    annee?: string;
    weights?: Record<string, number>;
    rules?: string;
  };

  const validLevel = getSchoolLevelsForRequest(req).find(level => level === niveau);
  if (!validLevel) {
    res.status(400).json({ error: `niveau must be one of: ${getSchoolLevelsForRequest(req).join(", ")}` });
    return;
  }
  if (!classCount || classCount < 2 || classCount > 10) {
    res.status(400).json({ error: "classCount must be between 2 and 10" });
    return;
  }

  const students = await fetchStudentsWithGrades(userId, null, validLevel, annee, getSchoolLevelsForRequest(req));
  if (students.length === 0) {
    res.status(404).json({ error: `لا يوجد تلاميذ للمستوى ${niveau} في السنة ${annee}` });
    return;
  }

  const result = balanceClasses(students, { classCount, weights, rules });
  res.json(result);
});

// ── POST /api/class-balancer/apply ────────────────────────────────────────────
// Saves balanced result to DB — updates students.classe for each student.
// Body: { assignments: { studentId: string, classe: string }[] }
router.post("/class-balancer/apply", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const userId = req.user!.id;
  const { assignments } = req.body as {
    assignments?: { studentId: string; classe: string }[];
  };
  if (!Array.isArray(assignments) || assignments.length === 0) {
    res.status(400).json({ error: "assignments must be a non-empty array" });
    return;
  }

  // Verify all students belong to this user
  const studentIds = assignments.map(a => a.studentId);
  const ownedStudents = await db
    .select({ id: studentsTable.id })
    .from(studentsTable)
    .where(and(
      eq(studentsTable.userId, userId),
      inArray(studentsTable.id, studentIds),
      inArray(studentsTable.niveau, getSchoolLevelsForRequest(req)),
    ));
  const ownedSet = new Set(ownedStudents.map(s => s.id));

  let updated = 0;
  for (const { studentId, classe } of assignments) {
    if (!ownedSet.has(studentId)) continue;
    await db
      .update(studentsTable)
      .set({ classe })
      .where(and(eq(studentsTable.id, studentId), eq(studentsTable.userId, userId)));
    updated++;
  }

  res.json({ ok: true, updated });
});

export default router;
