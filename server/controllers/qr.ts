/**
 * Student QR Generator
 * --------------------
 * Generates a signed QR code payload for a student, suitable for:
 *   • Fast attendance scanning at the gate
 *   • Printing on school ID cards
 *
 * Payload structure (JSON, HMAC-SHA256 signed):
 *   { sid, name, niveau, classe, annee, iat, sig }
 *
 * The signature uses SESSION_SECRET so QR codes cannot be forged externally.
 * The route returns either a PNG image (base64 data URL) or raw SVG.
 *
 * GET /api/qr/student/:studentId?format=png|svg|json
 */

import type { Request, Response } from "express";
import { createHmac } from "crypto";
import QRCode from "qrcode";
import { eq, and } from "drizzle-orm";
import { db, studentsTable, gradesTable, absencesTable, schoolInfoTable } from "../../shared/db.js";
import { logger } from "../lib/logger.js";

// ── Signature helper ──────────────────────────────────────────────────────────

const SECRET = process.env.SESSION_SECRET ?? "school-qr-fallback-secret";

interface QrPayload {
  sid: string;
  name: string;
  niveau: string;
  classe: string;
  annee: string;
  iat: number;
  sig: string;
}

function signPayload(raw: Omit<QrPayload, "sig">): string {
  const data = JSON.stringify(raw, Object.keys(raw).sort());
  return createHmac("sha256", SECRET).update(data).digest("hex").slice(0, 16);
}

/** Short HMAC used inside the scannable URL so it can't be forged. */
export function signStudentId(studentId: string): string {
  return createHmac("sha256", SECRET).update(studentId).digest("hex").slice(0, 16);
}

export function buildQrPayload(student: {
  id: string;
  nomPrenom: string;
  niveau: string;
  classe: string;
  annee: string;
}): QrPayload {
  const raw: Omit<QrPayload, "sig"> = {
    sid:    student.id,
    name:   student.nomPrenom,
    niveau: student.niveau,
    classe: student.classe,
    annee:  student.annee,
    iat:    Math.floor(Date.now() / 1000),
  };
  return { ...raw, sig: signPayload(raw) };
}

/**
 * Builds the string that gets encoded INTO the QR image.
 * A plain HTTPS URL so any phone camera can tap-to-open it.
 *   https://<host>/scan-qr?sid=<id>&sig=<hmac>
 */
export function buildQrContent(student: { id: string }, baseUrl: string): string {
  const sig = signStudentId(student.id);
  return `${baseUrl}/scan-qr?sid=${encodeURIComponent(student.id)}&sig=${encodeURIComponent(sig)}`;
}

// ── Controller ────────────────────────────────────────────────────────────────

/**
 * GET /api/qr/student/:studentId
 *
 * Query params:
 *   format  — "png" (default) | "svg" | "json"
 *   size    — pixel width for PNG (64–1024, default 256)
 */
export async function generateStudentQr(req: Request, res: Response): Promise<void> {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const userId = req.user!.id;
  const { studentId } = req.params as { studentId: string };
  const format = String(req.query.format ?? "png").toLowerCase() as "png" | "svg" | "json";
  const size   = Math.min(Math.max(parseInt(String(req.query.size ?? "256")), 64), 1024);

  if (!studentId) {
    res.status(400).json({ error: "studentId is required" });
    return;
  }

  // ── Fetch student (scoped to the authenticated user) ─────────────────────
  const [student] = await db
    .select({
      id:        studentsTable.id,
      userId:    studentsTable.userId,
      nomPrenom: studentsTable.nomPrenom,
      niveau:    studentsTable.niveau,
      classe:    studentsTable.classe,
      annee:     studentsTable.annee,
    })
    .from(studentsTable)
    .where(and(eq(studentsTable.id, studentId), eq(studentsTable.userId, userId)))
    .limit(1);

  if (!student) {
    res.status(404).json({ error: "التلميذ غير موجود أو لا تملك صلاحية الوصول إليه" });
    return;
  }

  // ── Build the scannable content ──────────────────────────────────────────
  // Encode a real HTTPS URL so any phone camera can tap-to-open it directly.
  const baseUrl = `${req.protocol}://${req.get("host")}`;
  const qrContent = buildQrContent(student, baseUrl);
  // Also keep the full payload for the JSON format
  const payload = buildQrPayload(student);

  try {
    if (format === "json") {
      res.json({ studentId: student.id, student: student.nomPrenom, qrContent, payload });
      return;
    }

    if (format === "svg") {
      const svg = await QRCode.toString(qrContent, {
        type: "svg",
        margin: 2,
        color: { dark: "#0f172a", light: "#ffffff" },
      });
      res.setHeader("Content-Type", "image/svg+xml");
      res.setHeader(
        "Content-Disposition",
        `inline; filename="qr-${student.id}.svg"`,
      );
      res.send(svg);
      return;
    }

    // Default: PNG as base64 data URL or raw buffer
    const wantBuffer = req.query.raw === "1";
    const qrOpts = { margin: 2, color: { dark: "#0f172a", light: "#ffffff" } };

    if (wantBuffer) {
      const buf = await QRCode.toBuffer(qrContent, { type: "png", width: size, ...qrOpts });
      res.setHeader("Content-Type", "image/png");
      res.setHeader("Content-Disposition", `inline; filename="qr-${student.id}.png"`);
      res.send(buf);
    } else {
      const dataUrl = await QRCode.toDataURL(qrContent, { type: "image/png", width: size, ...qrOpts });
      res.json({
        studentId:  student.id,
        student:    student.nomPrenom,
        niveau:     student.niveau,
        classe:     student.classe,
        annee:      student.annee,
        format:     "png",
        width:      size,
        dataUrl,
        qrContent,
        payload,
      });
    }
  } catch (err: any) {
    logger.error({ err, studentId }, "QR generation failed");
    res.status(500).json({ error: "فشل إنشاء رمز QR" });
  }
}

/**
 * POST /api/qr/students/batch
 *
 * Body: { studentIds: string[], format?: "json" | "png" | "svg", size?: number }
 * Returns an array of QR payloads (JSON mode) or a 400 for image batch requests.
 */
export async function batchStudentQr(req: Request, res: Response): Promise<void> {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const userId = req.user!.id;
  const { studentIds, format = "json" } = req.body as {
    studentIds?: string[];
    format?: string;
  };

  if (!Array.isArray(studentIds) || studentIds.length === 0) {
    res.status(400).json({ error: "studentIds must be a non-empty array" });
    return;
  }

  if (studentIds.length > 200) {
    res.status(400).json({ error: "الحد الأقصى للدفعة الواحدة هو 200 تلميذ" });
    return;
  }

  if (format !== "json") {
    res.status(400).json({
      error: "الإنشاء الجماعي لصور QR غير مدعوم — استخدم format=json ثم اطبع القوائم من الواجهة",
    });
    return;
  }

  const students = await db
    .select({
      id:        studentsTable.id,
      nomPrenom: studentsTable.nomPrenom,
      niveau:    studentsTable.niveau,
      classe:    studentsTable.classe,
      annee:     studentsTable.annee,
    })
    .from(studentsTable)
    .where(eq(studentsTable.userId, userId));

  const idSet = new Set(studentIds);
  const scoped = students.filter((s) => idSet.has(s.id));

  const results = scoped.map((s) => ({
    studentId: s.id,
    student:   s.nomPrenom,
    niveau:    s.niveau,
    classe:    s.classe,
    annee:     s.annee,
    payload:   buildQrPayload(s),
  }));

  res.json({ count: results.length, items: results });
}

/**
 * GET /api/public/schools/:schoolId/students/:studentId?sig=...
 *
 * PUBLIC endpoint (no auth) — this is what a phone camera lands on after
 * scanning a printed QR/ID card, or what the client-side /scan-qr page
 * calls to render the scan result. Security comes entirely from the HMAC
 * signature (?sig=), not from a login session:
 *   1. The signature must match signStudentId(studentId) — proves the
 *      link was generated by this server and wasn't guessed/forged.
 *   2. :schoolId is resolved to its owning userId, and the student lookup
 *      is scoped to that same userId — so even a valid signature for one
 *      school's student can't be replayed against a different school's
 *      record by swapping the schoolId in the URL.
 *
 * Returns only a lightweight public summary (name, level, class, annual
 * average, total absence hours) — no parent phone, no per-subject grades,
 * no other sensitive fields.
 */
export async function publicStudentGradeView(req: Request, res: Response): Promise<void> {
  const { schoolId, studentId } = req.params as { schoolId: string; studentId: string };
  const sig = String(req.query.sig ?? "");

  if (!schoolId || !studentId || !sig) {
    res.status(400).json({ error: "رابط غير صالح" });
    return;
  }

  const expectedSig = signStudentId(studentId);
  if (sig !== expectedSig) {
    res.status(403).json({ error: "رمز التحقق غير صالح" });
    return;
  }

  // Resolve the school row to get its owning userId — keeps the lookup
  // scoped to the correct tenant without requiring a login session.
  const [school] = await db
    .select({ userId: schoolInfoTable.userId, nom: schoolInfoTable.nom })
    .from(schoolInfoTable)
    .where(eq(schoolInfoTable.id, schoolId))
    .limit(1);

  if (!school) {
    res.status(404).json({ error: "المؤسسة غير موجودة" });
    return;
  }

  const [student] = await db
    .select({
      id:        studentsTable.id,
      nomPrenom: studentsTable.nomPrenom,
      niveau:    studentsTable.niveau,
      classe:    studentsTable.classe,
      annee:     studentsTable.annee,
    })
    .from(studentsTable)
    .where(and(eq(studentsTable.id, studentId), eq(studentsTable.userId, school.userId)))
    .limit(1);

  if (!student) {
    res.status(404).json({ error: "التلميذ غير موجود" });
    return;
  }

  try {
    const [grades, absences] = await Promise.all([
      db.select().from(gradesTable)
        .where(and(eq(gradesTable.studentId, student.id), eq(gradesTable.userId, school.userId))),
      db.select().from(absencesTable)
        .where(and(eq(absencesTable.studentId, student.id), eq(absencesTable.userId, school.userId))),
    ]);

    const triAvg = new Map<number, number>();
    for (const g of grades) {
      const score = parseFloat(String(g.score));
      if (isNaN(score) || g.subject !== "__avg__") continue;
      triAvg.set(g.trimestre, score);
    }
    const vals = [...triAvg.values()];
    const annualAvg = vals.length
      ? +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2)
      : null;

    const totalAbsenceHours = absences.reduce(
      (sum, a) => sum + a.justifiedHours + a.unjustifiedHours,
      0,
    );

    res.json({
      school: school.nom,
      student: student.nomPrenom,
      niveau: student.niveau,
      classe: student.classe,
      annee: student.annee,
      annualAvg,
      totalAbsenceHours,
    });
  } catch (err) {
    logger.error({ err, studentId, schoolId }, "publicStudentGradeView failed");
    res.status(500).json({ error: "فشل تحميل بيانات التلميذ" });
  }
}