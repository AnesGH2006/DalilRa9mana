/**
 * OCR Review & Commit API
 *
 * POST /api/ocr/review-commit
 *   - Accept reviewed/edited OCR data and commit to database
 *   - Supports both grades and absences
 */

import { Router } from "express";
import { db, gradesTable, absencesTable, studentsTable, ocrUploadsTable } from "../../shared/db.js";
import { eq, and } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import { v4 as uuid } from "uuid";

const router = Router();

export interface OcrReviewRow {
  rowNumber: number;
  studentName: string;
  confidence: number;
  lowConfidence: boolean;
  // For grades
  grade?: number;
  gradeType?: "general" | "continuous" | "test" | "exam";
  // For absences
  justifiedHours?: number;
  unjustifiedHours?: number;
}

export interface OcrCommitRequest {
  type: "grades" | "absences";
  trimestre?: number;
  subject?: string;
  rows: Array<OcrReviewRow & { matched: boolean; studentId?: string }>;
}

/**
 * Match OCR student names to actual students in the database
 */
async function matchStudents(
  userId: string,
  annee: string,
  names: string[],
): Promise<Map<string, string>> {
  const students = await db
    .select({ id: studentsTable.id, nomPrenom: studentsTable.nomPrenom })
    .from(studentsTable)
    .where(and(eq(studentsTable.userId, userId), eq(studentsTable.annee, annee)));

  const nameMap = new Map<string, string>();

  const normalizeName = (value: string) => value
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[أإآا]/g, "ا")
    .replace(/[ةه]/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  
  for (const name of names) {
    const cleaned = normalizeName(name);
    
    // Exact match
    const exact = students.find(s => normalizeName(s.nomPrenom) === cleaned);
    if (exact) {
      nameMap.set(name, exact.id);
      continue;
    }
    
    // Partial match (contains)
    const partial = students.find(s => {
      const studentName = normalizeName(s.nomPrenom);
      const extractedWords = cleaned.split(" ").filter(Boolean);
      const studentWords = studentName.split(" ").filter(Boolean);
      return studentName.includes(cleaned) || cleaned.includes(studentName) ||
        (extractedWords.length > 0 && extractedWords.every(word => studentWords.some(candidate => candidate.includes(word))));
    });
    if (partial) {
      nameMap.set(name, partial.id);
      continue;
    }
  }

  return nameMap;
}

/**
 * POST /api/ocr/match-students
 * Match OCR-extracted names to actual students
 */
router.post("/ocr/match-students", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const userId = req.user!.id;
  const { names, annee } = req.body as { names: string[]; annee?: string };

  if (!Array.isArray(names) || names.length === 0) {
    res.status(400).json({ error: "قائمة الأسماء مطلوبة" });
    return;
  }

  const year = annee || "2026-2027";

  try {
    const mapping = await matchStudents(userId, year, names);
    const results = names.map(name => ({
      name,
      studentId: mapping.get(name) || null,
      matched: !!mapping.get(name),
    }));

    res.json({ success: true, matches: results });
  } catch (err: any) {
    logger.error({ err }, "Student matching failed");
    res.status(500).json({ error: "فشل المطابقة" });
  }
});

/**
 * POST /api/ocr/review-commit
 * Commit reviewed/edited OCR data to database
 */
router.post("/ocr/review-commit", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const userId = req.user!.id;
  const { type, trimestre, subject, gradeType = "general", rows, annee } = req.body as OcrCommitRequest & { annee?: string; gradeType?: "general" | "continuous" | "test" | "exam" };

  if (!type || !Array.isArray(rows) || rows.length === 0) {
    res.status(400).json({ error: "بيانات غير كاملة" });
    return;
  }

  if (type === "grades" && (!trimestre || !subject)) {
    res.status(400).json({ error: "الفصل والمادة مطلوبان للدرجات" });
    return;
  }

  const year = annee || "2026-2027";
  let insertedCount = 0;
  let skipped = 0;

  try {
    for (const row of rows) {
      if (!row.matched || !row.studentId) {
        skipped++;
        continue;
      }

      if (type === "grades") {
        if (row.grade === undefined) {
          skipped++;
          continue;
        }

        await db.insert(gradesTable).values({
          id: uuid(),
          userId,
          studentId: row.studentId,
          annee: year,
          trimestre: trimestre!,
          subject: subject!,
          gradeType,
          score: row.grade.toString(),
        });
        insertedCount++;
      } else if (type === "absences") {
        if (row.justifiedHours === undefined || row.unjustifiedHours === undefined) {
          skipped++;
          continue;
        }

        await db.insert(absencesTable).values({
          id: uuid(),
          userId,
          studentId: row.studentId,
          annee: year,
          trimestre: trimestre || 1,
          justifiedHours: row.justifiedHours,
          unjustifiedHours: row.unjustifiedHours,
        });
        insertedCount++;
      }
    }

    res.json({
      success: true,
      inserted: insertedCount,
      skipped,
      message: `تم إدراج ${insertedCount} صف${skipped > 0 ? ` و تخطي ${skipped}` : ""}`,
    });
  } catch (err: any) {
    logger.error({ err, type, insertedCount }, "OCR commit failed");
    res.status(500).json({
      error: "فشل حفظ البيانات",
      inserted: insertedCount,
      message: err?.message,
    });
  }
});

export default router;
