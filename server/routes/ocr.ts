/**
 * OCR Grade Sheet, Absence Sheet & Daily Register Processing
 *
 * POST /api/ocr/parse-grades?type=grades|absences|daily_attendance|daily_register&engine=auto|gemini|vision|tesseract
 * POST /api/ocr/export   (paid "excel_export" feature) — turns reviewed rows into a CSV that Excel opens
 *
 * Pipeline: Sharp preprocess → Gemini Vision or Groq Vision (user's own key) → Tesseract.js (fallback)
 */
import { Router } from "express";
import multer from "multer";
import * as XLSX from "xlsx";
import { and, eq } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import { db, ocrUploadsTable, schoolInfoTable, studentDailyAttendanceTable, studentsTable } from "../../shared/db.js";
import { remarkFor } from "./pedagogy.js";
import { getUserGroqKey, getUserGeminiKey } from "../lib/groq-key.js";
import { processOcr, type OcrEngine, type OcrType } from "../services/ocrService.js";
import { canUseStaffFeature, requireStaffFeature, STAFF_PLAN_PRICE_DZD } from "../middlewares/staffAccess.js";

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = file.mimetype.startsWith("image/") || file.mimetype === "application/pdf";
    if (!allowed) {
      cb(new Error("يجب أن يكون الملف صورة (JPEG, PNG, WebP) أو PDF"));
      return;
    }
    cb(null, true);
  },
});

router.post(
  "/ocr/parse-grades",
  upload.single("image"),
  async (req, res): Promise<void> => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    // Who may use OCR:
    //  - the school owner (admin, or an active subscription)
    //  - a non-parent member who has the "imports" permission; whether they may use the
    //    specific OCR feature (school plan or their own 2,000 DZD staff plan) is checked below
    const member = req.memberContext;
    const ownerAllowed = !member && (req.user!.role === "admin" || req.user!.subscriptionStatus === "active");
    const memberAllowed = !!member && member.role !== "parent" && member.permissions.includes("imports");
    if (!ownerAllowed && !memberAllowed) {
      res.status(403).json({ error: "ميزة OCR متاحة لصاحب الاشتراك أو للأعضاء المصرّح لهم فقط" });
      return;
    }

    if (!req.file) {
      res.status(400).json({ error: "لم يتم رفع أي صورة. أرفق الصورة في حقل 'image'." });
      return;
    }

    const userId = req.user!.id;
    const requestedType = String(req.query.type ?? "grades");
    const ocrType: OcrType = (
      requestedType === "absences" ||
      requestedType === "daily_attendance" ||
      requestedType === "daily_register"
        ? requestedType
        : "grades"
    ) as OcrType;
    const isDaily = ocrType === "daily_register" || ocrType === "daily_attendance";

    // Teachers unlock grade OCR, supervisors unlock absence OCR (daily register included).
    const ocrFeature = ocrType === "grades" ? "ocr_grades" : "ocr_absences";
    if (member && !canUseStaffFeature(req, ocrFeature)) {
      res.status(402).json({
        error: `هذه الميزة تتطلب اشتراك الأستاذ/المشرف (${STAFF_PLAN_PRICE_DZD} دج في السنة)`,
        requiredPlan: "staff",
        priceDzd: STAFF_PLAN_PRICE_DZD,
        feature: ocrFeature,
      });
      return;
    }

    if (req.file.mimetype === "application/pdf") {
      res.status(415).json({
        error: "ملفات PDF تحتاج إلى تحويل صفحاتها إلى صور قبل OCR. ارفع PNG أو JPG لكل صفحة.",
      });
      return;
    }

    const engineParam = String(req.query.engine ?? "auto") as OcrEngine;
    const engine: OcrEngine = ["auto", "gemini", "vision", "tesseract"].includes(engineParam)
      ? engineParam
      : "auto";

    try {
      const [geminiApiKey, groqApiKey] = await Promise.all([
        getUserGeminiKey(userId),
        getUserGroqKey(userId),
      ]);

      if (!geminiApiKey && !groqApiKey && engine !== "tesseract") {
        res.status(428).json({
          error: "لم يتم ضبط أي مفتاح OCR بعد. أضف مفتاح Gemini أو Groq من صفحة الإعدادات أولاً.",
          suggestion: "settings_required",
        });
        return;
      }

      logger.info(
        { size: req.file.size, mime: req.file.mimetype, ocrType, engine, hasGemini: Boolean(geminiApiKey), hasGroq: Boolean(groqApiKey) },
        "OCR: processing",
      );

      const result = await processOcr(req.file.buffer, ocrType, engine, { geminiApiKey, groqApiKey });

      if (result.rows.length === 0) {
        const suggestions = [
          "تأكد من أن الصورة تحتوي على بيانات واضحة",
          "حاول صورة بجودة أعلى أو إضاءة أفضل",
          geminiApiKey && groqApiKey
            ? "جرّب تبديل المحرك (Gemini/Groq) من الإعدادات"
            : "أضف مفتاح OCR ثانٍ (Gemini أو Groq) من الإعدادات لزيادة الدقة",
        ];
        res.status(422).json({
          error: ocrType === "absences"
            ? "لم يتم العثور على بيانات غياب في الصورة. جرّب مرة أخرى."
            : isDaily
              ? "لم يتم التعرف على سجل الغياب اليومي. تأكد من وضوح أسماء التلاميذ وعلامات الحضور."
              : "لم يتم العثور على أي درجات في الصورة. جرّب مرة أخرى.",
          engine: result.engine,
          suggestions,
          rawText: result.rawText?.slice(0, 500),
        });
        return;
      }

      const rows = result.rows.map((r: any, i: number) => {
        const base = {
          rowNumber: i + 1,
          studentName: r.studentName,
          confidence: r.confidence,
          lowConfidence: r.confidence < 80,
        };
        if (isDaily) return { ...r, ...base };
        if (ocrType === "absences" && "justifiedHours" in r) {
          return { ...base, justifiedHours: r.justifiedHours, unjustifiedHours: r.unjustifiedHours };
        }
        if ("grade" in r) return { ...base, grade: r.grade };
        return base;
      });

      // Audit log
      try {
        await db.insert(ocrUploadsTable).values({
          userId,
          type: ocrType,
          engine: result.engine,
          fileName: req.file.originalname ?? null,
          rows,
          rowCount: rows.length,
        });
      } catch (logErr) {
        logger.warn({ logErr }, "OCR audit insert failed");
      }

      res.json({
        success: true,
        type: ocrType,
        engine: result.engine,
        rows,
        reportDate: (result as any).reportDate ?? null,
        totalLines: rows.length,
        overallConfidence: result.overallConfidence,
        rawText: result.rawText?.slice(0, 2000),
      });
    } catch (err: any) {
      logger.error({ err }, "OCR processing failed");
      const errorMessage = err?.message ?? "Unknown error";
      const quotaExhausted = /(?:API\s+429|RESOURCE_EXHAUSTED|rate_limit_exceeded|tokens per minute|quota exceeded)/i.test(errorMessage);

      res.status(quotaExhausted ? 503 : 500).json({
        error: quotaExhausted
          ? "حصة خدمة OCR ممتلئة مؤقتًا. لم يتمكن أي محرك من معالجة الصورة."
          : "فشل معالجة الصورة",
        suggestions: quotaExhausted
          ? [
              "انتظر حتى تتجدد حصة Gemini أو Groq ثم أعد المحاولة",
              "أضف مفتاح API آخر من صفحة الإعدادات أو اختر محركًا تتوفر له حصة",
            ]
          : [errorMessage.includes("API_KEY") || errorMessage.includes("API key")
              ? "تأكد من صحة مفتاح Gemini أو Groq في الإعدادات"
              : "تحقق من اتصال الإنترنت وجودة الصورة ثم أعد المحاولة"],
      });
    }
  },
);

// ── Export reviewed rows to a real .xlsx workbook (paid "excel_export" feature) ──────────────
// Columns adapt to the OCR mode: grades / absences / daily register.
const xlsxCell = (value: unknown): string => {
  const text = String(value ?? "").replace(/\r?\n/g, " ");
  // Neutralize spreadsheet formula injection on text cells
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
};

type ExportMeta = {
  subject?: string;
  classe?: string;
  niveau?: string;
  annee?: string;
  reportDate?: string;
  trimestre?: string;
  gradeType?: string;
  /** For grades_hajz: which assessment column this batch fills (continuous|test1|test2|exam|general) */
  assessment?: string;
};

// ── Official "حجز النقاط" grade-book templates (mutawassit / thanawi) ─────────────────────
type HajzMerge = { s: { c: number; r: number }; e: { c: number; r: number } };

const HAJZ_HEADERS: Record<"moyen" | "lycee", string[]> = {
  moyen: ["رقم التعريف", "اللقب", "الاسم", "تاريخ الميلاد", "التقييم المستمر", "الفرض", "الاختبار", "التقدير"],
  lycee: ["رقم التعريف", "اللقب", "الاسم", "تاريخ الميلاد", "التقييم المستمر", "الفرض 1", "الفرض 2", "الاختبار", "التقدير"],
};

const TRIMESTRE_LABELS: Record<string, string> = { "1": "الأول", "2": "الثاني", "3": "الثالث" };

// Appreciation mark — same thresholds as the pedagogy center's remarkFor()
function hajzAppreciation(avg: number): string {
  if (avg >= 16) return "ممتاز";
  if (avg >= 14) return "جيد جداً";
  if (avg >= 12) return "حسن";
  if (avg >= 10) return "مقبول";
  return "ضعيف";
}

const normName = (s: unknown): string =>
  String(s ?? "")
    .normalize("NFKC")
    .replace(/[ً-ْٰـ]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

const splitNomPrenom = (full: string): [string, string] => {
  const parts = String(full ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return ["", parts[0] ?? ""];
  return [parts.slice(0, -1).join(" "), parts[parts.length - 1]!];
};

function hajzGradeColumn(stage: "moyen" | "lycee", gt: string): number | null {
  const g = gt.trim().toLowerCase();
  if (["continuous", "تقويم", "تقويم مستمر", "تقييم مستمر", "تقييم"].includes(g)) return 4;
  if (["test", "test1", "فرض", "فرض1", "الفرض الأول", "فرض أول"].includes(g)) return 5;
  if (["test2", "فرض2", "فرض ثاني", "الفرض الثاني", "فرض ثان"].includes(g)) return stage === "lycee" ? 6 : 5;
  if (["exam", "اختبار"].includes(g)) return stage === "lycee" ? 7 : 6;
  return null;
}

type HajzStudent = { id: string; nomPrenom: string; dateNaissance: string | null; raqm: number | null };

function buildHajzSheet(
  rows: Array<Record<string, unknown>>,
  meta: ExportMeta,
  students: HajzStudent[],
  school: { nom: string; wilaya: string } | null,
  stage: "moyen" | "lycee",
  attendanceRate: Map<string, number>,
): { aoa: unknown[][]; merges: HajzMerge[] } {
  const headers = HAJZ_HEADERS[stage];
  const width = headers.length;
  const estCol = width - 1; // التقدير / الملاحظة

  const byStudent = new Map<string, { name: string; cells: Map<number, number>; notes: string[] }>();
  for (const r of rows) {
    const rawName = String(r.studentName ?? "").trim();
    if (!rawName) continue;
    const key = normName(rawName);
    let rec = byStudent.get(key);
    if (!rec) {
      rec = { name: rawName, cells: new Map(), notes: [] };
      byStudent.set(key, rec);
    }
    const g = Number(r.editedGrade ?? r.grade);
    if (Number.isFinite(g)) {
      const gt = String(r.gradeType ?? r.assessment ?? meta.assessment ?? meta.gradeType ?? "");
      const col = hajzGradeColumn(stage, gt);
      if (col !== null && !rec.cells.has(col)) rec.cells.set(col, g);
    }
    const n = String(r.note ?? r.editedNote ?? "").trim();
    if (n && !rec.notes.includes(n)) rec.notes.push(n);
  }

  const studentMap = new Map<string, HajzStudent>();
  for (const s of students) {
    const k = normName(s.nomPrenom);
    if (k && !studentMap.has(k)) studentMap.set(k, s);
  }

  const anneeFmt = String(meta.annee ?? "").replace(/-/g, " / ");
  const termLabel = TRIMESTRE_LABELS[String(meta.trimestre ?? "")] ?? String(meta.trimestre ?? "");
  const stageLabel = stage === "lycee" ? "ثانوية" : "متوسطة";
  const span = (c1: number, c2: number, r: number): HajzMerge => ({ s: { c: c1, r }, e: { c: c2, r } });
  const merges: HajzMerge[] = [
    span(0, width - 1, 0), span(0, width - 1, 1),
    span(0, 3, 2), span(4, width - 1, 2),
    span(0, 3, 3), span(4, width - 1, 3),
    span(0, 3, 4), span(4, width - 1, 4),
  ];

  const emptyRow = Array.from({ length: width }, () => "");
  const aoa: unknown[][] = [
    ["الجمهورية الجزائرية الديمقراطية الشعبية", ...emptyRow.slice(1)],
    ["وزارة التربية الوطنية", ...emptyRow.slice(1)],
    (() => { const r = [...emptyRow]; r[0] = xlsxCell(`مديرية التربية لولاية: ${school?.wilaya ?? ""}`); r[4] = `السنة الدراسية: ${anneeFmt}`; return r; })(),
    (() => { const r = [...emptyRow]; r[0] = xlsxCell(`المؤسسة: (${stageLabel}) ${school?.nom ?? ""}`); r[4] = `الفصل: ${termLabel}`; return r; })(),
    (() => { const r = [...emptyRow]; r[0] = xlsxCell(`الفوج التربوي: ${meta.classe ?? ""}`); r[4] = xlsxCell(`المادة: ${meta.subject ?? ""}`); return r; })(),
    emptyRow,
    headers,
  ];

  for (const rec of byStudent.values()) {
    const stu = studentMap.get(normName(rec.name));
    const [nom, prenom] = splitNomPrenom(stu?.nomPrenom ?? rec.name);
    const row: unknown[] = [...emptyRow];
    row[0] = stu?.raqm ?? "";
    row[1] = xlsxCell(nom);
    row[2] = xlsxCell(prenom);
    row[3] = xlsxCell(stu?.dateNaissance ?? "");
    let gradeSum = 0;
    let gradeCount = 0;
    for (const [col, val] of rec.cells) {
      row[col] = val;
      gradeSum += val;
      gradeCount += 1;
    }
    // المتابعة البيداغوجية: appreciation mark + remark with the same rules as the pedagogy center
    let remarkText = "";
    if (gradeCount > 0) {
      const avg = gradeSum / gradeCount;
      const label = hajzAppreciation(avg);
      remarkText = remarkFor(avg, stu ? (attendanceRate.get(stu.id) ?? 100) : 100, 3, "ar") as string;
      const prefix = `${label}، `;
      if (typeof remarkText === "string" && remarkText.startsWith(prefix)) {
        remarkText = remarkText.slice(prefix.length);
      }
      remarkText = `${label} — ${remarkText}`;
    }
    const appreciation = [remarkText, rec.notes.join(" | ")].filter(Boolean).join(" — ");
    row[estCol] = xlsxCell(appreciation);
    aoa.push(row);
  }
  return { aoa, merges };
}

function buildExportSheet(type: string, rows: Array<Record<string, unknown>>, meta: ExportMeta): { headers: string[]; data: unknown[][] } {
  const name = (r: Record<string, unknown>) => xlsxCell(r.studentName);
  const note = (r: Record<string, unknown>) => xlsxCell(r.note ?? r.editedNote ?? "");
  const grade = (r: Record<string, unknown>) => {
    const g = r.editedGrade ?? r.grade;
    const n = Number(g);
    return Number.isFinite(n) ? n : xlsxCell(g ?? "");
  };

  if (type === "grades") {
    return {
      headers: ["#", "الاسم الكامل", "المادة", "القسم", "المستوى", "السنة", "الفصل", "نوع التقييم", "العلامة /20", "ملاحظة"],
      data: rows.map((r, i) => [
        i + 1, name(r), xlsxCell(meta.subject ?? ""), xlsxCell(meta.classe ?? ""),
        xlsxCell(meta.niveau ?? ""), xlsxCell(meta.annee ?? ""), xlsxCell(meta.trimestre ?? ""),
        xlsxCell(meta.gradeType ?? ""), grade(r), note(r),
      ]),
    };
  }

  if (type === "absences") {
    return {
      headers: ["#", "الاسم الكامل", "القسم", "السنة", "ساعات مبررة", "ساعات غير مبررة", "ملاحظة"],
      data: rows.map((r, i) => [
        i + 1, name(r), xlsxCell(meta.classe ?? ""), xlsxCell(meta.annee ?? ""),
        Number(r.editedJustified ?? r.justifiedHours) || 0,
        Number(r.editedUnjustified ?? r.unjustifiedHours) || 0,
        note(r),
      ]),
    };
  }

  // daily_register / daily_attendance
  const absent = (r: Record<string, unknown>) => {
    const v = r.editedAbsent ?? r.isAbsent;
    if (v === true) return "غائب";
    if (v === false) return "حاضر";
    return xlsxCell(r.status ?? "");
  };
  return {
    headers: ["#", "الاسم الكامل", "التاريخ", "السنة", "الحالة", "ملاحظة"],
    data: rows.map((r, i) => [
      i + 1, name(r), xlsxCell(meta.reportDate ?? r.reportDate ?? ""), xlsxCell(meta.annee ?? ""),
      absent(r), note(r),
    ]),
  };
}

router.post(
  "/ocr/export",
  (req, res, next) => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    next();
  },
  requireStaffFeature("excel_export"),
  async (req, res): Promise<void> => {
    const body = req.body ?? {};
    const rows = Array.isArray(body.rows)
      ? (body.rows as Array<Record<string, unknown>>).slice(0, 2000)
      : [];
    const type = String(body.type ?? "grades");
    const meta = (body.meta ?? {}) as ExportMeta;

    let worksheet: XLSX.WorkSheet;
    let sheetName = "OCR";

    if (type === "grades_hajz") {
      const scopeUserId = req.memberContext?.schoolUserId ?? req.user!.id;
      const conds = [eq(studentsTable.userId, scopeUserId)];
      if (meta.annee) conds.push(eq(studentsTable.annee, meta.annee));
      if (meta.classe) conds.push(eq(studentsTable.classe, meta.classe));
      if (meta.niveau) conds.push(eq(studentsTable.niveau, meta.niveau as never));
      const [students, schoolRows, attendanceRows] = await Promise.all([
        db
          .select({
            id: studentsTable.id,
            nomPrenom: studentsTable.nomPrenom,
            dateNaissance: studentsTable.dateNaissance,
            raqm: studentsTable.raqm,
          })
          .from(studentsTable)
          .where(and(...conds)),
        db
          .select({ nom: schoolInfoTable.nom, wilaya: schoolInfoTable.wilaya, stage: schoolInfoTable.stage })
          .from(schoolInfoTable)
          .where(eq(schoolInfoTable.userId, scopeUserId))
          .limit(1),
        db
          .select({
            studentId: studentDailyAttendanceTable.studentId,
            isAbsent: studentDailyAttendanceTable.isAbsent,
            status: studentDailyAttendanceTable.status,
          })
          .from(studentDailyAttendanceTable)
          .where(and(
            eq(studentDailyAttendanceTable.userId, scopeUserId),
            ...(meta.annee ? [eq(studentDailyAttendanceTable.annee, meta.annee)] : []),
          )),
      ]);

      // Attendance rate per student (unexcused absences lower the rate), matching pedagogy rules
      const attStats = new Map<string, { total: number; unexcused: number }>();
      for (const a of attendanceRows) {
        const st = attStats.get(a.studentId) ?? { total: 0, unexcused: 0 };
        st.total += 1;
        const justified = /مبرر|مبررة|معذور|justifi|excuse|غ\/م/i.test(a.status ?? "");
        if (a.isAbsent && !justified) st.unexcused += 1;
        attStats.set(a.studentId, st);
      }
      const attendanceRate = new Map<string, number>();
      for (const [sid, st] of attStats) {
        attendanceRate.set(sid, st.total > 0 ? Math.round(((st.total - st.unexcused) / st.total) * 1000) / 10 : 100);
      }
      const school = schoolRows[0] ?? null;
      const stage: "moyen" | "lycee" =
        school?.stage === "lycee" || school?.stage === "moyen"
          ? (school.stage as "moyen" | "lycee")
          : req.schoolStage === "lycee" ? "lycee" : "moyen";
      const { aoa, merges } = buildHajzSheet(
        rows, meta, students,
        school ? { nom: school.nom, wilaya: school.wilaya } : null,
        stage,
        attendanceRate,
      );
      worksheet = XLSX.utils.aoa_to_sheet(aoa);
      worksheet["!merges"] = merges as any;
      worksheet["!cols"] = HAJZ_HEADERS[stage].map((_, i) => ({ wch: i <= 2 ? 20 : i === 3 ? 14 : 16 }));
      sheetName = "حجز النقاط";
    } else {
      const { headers, data } = buildExportSheet(type, rows, meta);
      worksheet = XLSX.utils.aoa_to_sheet([headers, ...data]);
      worksheet["!cols"] = headers.map((_, i) => ({ wch: i === 1 || i === 2 ? 22 : i === headers.length - 1 ? 28 : 18 }));
      worksheet["!autofilter"] = { ref: worksheet["!ref"] ?? "A1" };
    }

    worksheet["!sheetViews"] = [{ rightToLeft: true } as any];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
    const safeType = ["grades", "grades_hajz", "absences", "daily_register", "daily_attendance"].includes(type) ? type : "export";
    const date = meta.reportDate || new Date().toISOString().slice(0, 10);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="ocr-${safeType}-${date}.xlsx"`);
    res.send(buffer);
  },
);

export default router;