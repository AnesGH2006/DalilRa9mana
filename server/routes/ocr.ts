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
import { logger } from "../lib/logger.js";
import { db, ocrUploadsTable } from "../../shared/db.js";
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

// ── Export reviewed rows to a CSV that Excel opens (paid "excel_export" feature) ──────────────
const csvCell = (value: unknown): string => {
  let text = String(value ?? "").replace(/\r?\n/g, " ");
  if (/^[=+\-@]/.test(text)) text = `'${text}`; // stops Excel from running formulas
  return `"${text.replace(/"/g, '""')}"`;
};

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
  (req, res): void => {
    const rows = Array.isArray(req.body?.rows)
      ? (req.body.rows as Array<Record<string, unknown>>).slice(0, 2000)
      : [];
    const header = ["#", "الاسم الكامل", "العلامة", "الحالة", "ملاحظة", "ساعات مبررة", "ساعات غير مبررة"];
    const lines = [header.map(csvCell).join(";")];
    rows.forEach((r, i) => {
      lines.push(
        [i + 1, r.studentName, r.grade, r.status, r.note, r.justifiedHours, r.unjustifiedHours]
          .map(csvCell)
          .join(";"),
      );
    });
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="ocr-export.csv"');
    res.send("\uFEFF" + lines.join("\r\n"));
  },
);

export default router;