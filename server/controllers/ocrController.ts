/**
 * Vision OCR HTTP handler.
 * (Requested as src/controllers/ocrController.ts)
 */
import type { Request, Response } from "express";
import { logger } from "../lib/logger.js";
import { getUserGeminiKey } from "../lib/groq-key.js";
import { scanGradeSheetImage, VisionOcrServiceError } from "../services/visionOcrService.js";

function canUseOcr(req: Request): boolean {
  if (!req.isAuthenticated() || !req.user) return false;
  if (req.memberContext) return false;
  return req.user.role === "admin" || req.user.subscriptionStatus === "active";
}

export async function scanGrades(req: Request, res: Response): Promise<void> {
  if (!canUseOcr(req)) {
    const status = req.isAuthenticated() ? 403 : 401;
    res.status(status).json({
      success: false,
      error: status === 401 ? "Unauthorized" : "ميزة OCR متاحة لصاحب الاشتراك فقط",
    });
    return;
  }

  if (!req.file) {
    res.status(400).json({
      success: false,
      error: "لم يتم رفع أي صورة. أرفق الملف في الحقل 'image' بصيغة JPEG أو PNG أو WebP (حد أقصى 10MB).",
    });
    return;
  }

  const includeRawDebug = String(req.query.debug ?? "") === "1" || String(req.query.debug ?? "") === "true";

  try {
    const userGeminiKey = await getUserGeminiKey(req.user!.id);
    const result = await scanGradeSheetImage(req.file.buffer, req.file.mimetype, {
      userGeminiKey,
      includeRawDebug,
    });
    res.json(result);
  } catch (err) {
    logger.error({ err }, "Vision OCR scan-grades failed");

    if (err instanceof VisionOcrServiceError) {
      if (err.code === "INVALID_IMAGE") {
        res.status(400).json({ success: false, error: err.message, code: err.code });
        return;
      }
      if (err.code === "MISSING_API_KEY") {
        res.status(503).json({
          success: false,
          error: err.message,
          code: err.code,
          suggestion: "Set GEMINI_API_KEY on the server, or save a Gemini API key in Settings.",
        });
        return;
      }
      const httpStatus = err.code === "PARSE_FAILED" ? 502 : 500;
      res.status(httpStatus).json({
        success: false,
        error: err.message,
        code: err.code,
        suggestion: err.code === "PARSE_FAILED"
          ? "The model returned unreadable JSON. Retry with a sharper, well-lit photo of the full table."
          : "Gemini Vision is unavailable. Check GEMINI_API_KEY, quota, and that the image is a clear grade sheet.",
      });
      return;
    }

    const detail = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({
      success: false,
      error: "فشل معالجة صورة كشف النقاط",
      details: detail,
    });
  }
}
