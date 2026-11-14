/**
 * Vision OCR routes.
 * (Requested as src/routes/ocrRoutes.ts)
 *
 * POST /api/ocr/scan-grades  — multipart field "image"
 */
import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import multer from "multer";
import { scanGrades } from "../controllers/ocrController.js";
import { isAllowedOcrImageMime } from "../services/visionOcrService.js";

const router: IRouter = Router();

const ALLOWED_MIMES = new Set(["image/jpeg", "image/png", "image/webp", "image/jpg"]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIMES.has(file.mimetype) && !isAllowedOcrImageMime(file.mimetype)) {
      cb(new Error("يُقبل JPEG و PNG و WebP فقط"));
      return;
    }
    cb(null, true);
  },
});

function uploadImage(req: Request, res: Response, next: NextFunction): void {
  upload.single("image")(req, res, (err: unknown) => {
    if (!err) {
      next();
      return;
    }
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        res.status(400).json({
          success: false,
          error: "حجم الصورة يتجاوز 10MB. صغّر الملف ثم أعد المحاولة.",
        });
        return;
      }
      res.status(400).json({ success: false, error: `رفع غير صالح: ${err.message}` });
      return;
    }
    const message = err instanceof Error ? err.message : "فشل رفع الملف";
    res.status(400).json({ success: false, error: message });
  });
}

router.post("/ocr/scan-grades", uploadImage, scanGrades);

export default router;
