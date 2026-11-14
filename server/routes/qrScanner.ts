/**
 * QR Scanner & Attendance Logging API
 *
 * GET  /api/qr/scan?sid=<id>&sig=<hmac>       — Verify QR scan and log attendance
 * GET  /api/qr/attendance-logs                — Get recent attendance logs
 * POST /api/qr/quick-attendance                — Manual attendance entry via QR token
 */

import { Router } from "express";
import { createHmac } from "crypto";
import { db, attendanceLogsTable, studentsTable } from "../../shared/db.js";
import { eq, and, desc, gte } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import { v4 as uuid } from "uuid";

const router = Router();

const SECRET = process.env.SESSION_SECRET ?? "school-qr-fallback-secret";

/**
 * Verify HMAC signature of student ID
 */
function verifyStudentSig(studentId: string, sig: string): boolean {
  const expected = createHmac("sha256", SECRET).update(studentId).digest("hex").slice(0, 16);
  return expected === sig;
}

/**
 * GET /api/qr/scan?sid=<studentId>&sig=<hmac>
 * 
 * Verify QR code signature and log attendance.
 * Can be called from:
 *   1. Web camera scanner (authenticated)
 *   2. Mobile camera app tapping QR link (public, HMAC verified)
 */
router.get("/qr/scan", async (req, res): Promise<void> => {
  const { sid: studentId, sig } = req.query as { sid?: string; sig?: string };

  if (!studentId || !sig) {
    res.status(400).json({ error: "بيانات QR ناقصة" });
    return;
  }

  // ── Verify signature ─────────────────────────────────────────────────────
  if (!verifyStudentSig(studentId, sig)) {
    res.status(401).json({ error: "توقيع QR غير صحيح" });
    return;
  }

  try {
    // ── Get student info ─────────────────────────────────────────────────────
    const [student] = await db
      .select()
      .from(studentsTable)
      .where(eq(studentsTable.id, studentId))
      .limit(1);

    if (!student) {
      res.status(404).json({ error: "الطالب غير موجود" });
      return;
    }

    // ── Check for duplicate scan within last 2 minutes ───────────────────────
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
    const [recentScan] = await db
      .select()
      .from(attendanceLogsTable)
      .where(
        and(
          eq(attendanceLogsTable.studentId, studentId),
          eq(attendanceLogsTable.userId, student.userId),
          gte(attendanceLogsTable.scannedAt, twoMinutesAgo),
        ),
      )
      .limit(1);

    if (recentScan) {
      res.json({
        success: true,
        duplicate: true,
        message: "الطالب مسجل بالفعل في الدقائق الأخيرة",
        student: {
          id: student.id,
          name: student.nomPrenom,
          classe: student.classe,
        },
      });
      return;
    }

    // ── Log attendance ───────────────────────────────────────────────────────
    const logEntry = await db
      .insert(attendanceLogsTable)
      .values({
        id: uuid(),
        userId: student.userId,
        studentId,
        scannedAt: new Date(),
        source: "qr",
        sig: sig as string,
      })
      .returning();

    logger.info(
      { studentId, name: student.nomPrenom, classe: student.classe },
      "Attendance logged via QR",
    );

    res.json({
      success: true,
      duplicate: false,
      message: `تم تسجيل حضور ${student.nomPrenom}`,
      student: {
        id: student.id,
        name: student.nomPrenom,
        classe: student.classe,
        niveau: student.niveau,
      },
    });
  } catch (err: any) {
    logger.error({ err, studentId }, "QR scan failed");
    res.status(500).json({ error: "فشل معالجة QR" });
  }
});

/**
 * GET /api/qr/attendance-logs
 * 
 * Get recent attendance logs (last 24 hours by default)
 */
router.get("/qr/attendance-logs", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const userId = req.user!.id;
  const hours = parseInt(String(req.query.hours ?? "24"));
  const limit = Math.min(parseInt(String(req.query.limit ?? "100")), 1000);

  try {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    const logs = await db
      .select({
        id: attendanceLogsTable.id,
        studentId: attendanceLogsTable.studentId,
        studentName: studentsTable.nomPrenom,
        classe: studentsTable.classe,
        scannedAt: attendanceLogsTable.scannedAt,
        source: attendanceLogsTable.source,
      })
      .from(attendanceLogsTable)
      .innerJoin(
        studentsTable,
        and(
          eq(attendanceLogsTable.studentId, studentsTable.id),
          eq(attendanceLogsTable.userId, userId),
        ),
      )
      .where(gte(attendanceLogsTable.scannedAt, since))
      .orderBy(desc(attendanceLogsTable.scannedAt))
      .limit(limit);

    // Group by student
    const grouped = new Map<string, any>();
    for (const log of logs) {
      const key = log.studentId;
      if (!grouped.has(key)) {
        grouped.set(key, {
          studentId: log.studentId,
          studentName: log.studentName,
          classe: log.classe,
          scans: [],
        });
      }
      grouped.get(key)!.scans.push({
        id: log.id,
        scannedAt: log.scannedAt,
        source: log.source,
      });
    }

    res.json({
      period: `${hours}ساعة الماضية`,
      total: logs.length,
      students: Array.from(grouped.values()),
    });
  } catch (err: any) {
    logger.error({ err }, "Failed to get attendance logs");
    res.status(500).json({ error: "فشل جلب سجلات الحضور" });
  }
});

/**
 * POST /api/qr/quick-attendance
 * 
 * Manual attendance entry for a student (when QR scan isn't available).
 * Requires authentication and the student must belong to this user.
 */
router.post("/qr/quick-attendance", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const userId = req.user!.id;
  const { studentId } = req.body as { studentId?: string };

  if (!studentId) {
    res.status(400).json({ error: "معرّف الطالب مطلوب" });
    return;
  }

  try {
    const [student] = await db
      .select()
      .from(studentsTable)
      .where(and(eq(studentsTable.id, studentId), eq(studentsTable.userId, userId)))
      .limit(1);

    if (!student) {
      res.status(404).json({ error: "الطالب غير موجود" });
      return;
    }

    // ── Log attendance ───────────────────────────────────────────────────────
    const log = await db
      .insert(attendanceLogsTable)
      .values({
        id: uuid(),
        userId,
        studentId,
        scannedAt: new Date(),
        source: "manual",
      })
      .returning();

    logger.info(
      { studentId, name: student.nomPrenom },
      "Attendance logged manually",
    );

    res.json({
      success: true,
      message: `تم تسجيل حضور ${student.nomPrenom}`,
      log: log[0],
    });
  } catch (err: any) {
    logger.error({ err }, "Manual attendance logging failed");
    res.status(500).json({ error: "فشل تسجيل الحضور" });
  }
});

export default router;
