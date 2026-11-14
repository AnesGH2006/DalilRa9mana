/**
 * QR Code routes
 *
 * GET  /api/qr/student/:studentId                              — single QR (PNG data URL, SVG, or JSON payload)
 * POST /api/qr/students/batch                                  — batch JSON payloads (up to 200)
 * GET  /api/public/schools/:schoolId/students/:studentId       — public QR scan result (no auth, HMAC verified)
 */
import { Router } from "express";
import { generateStudentQr, batchStudentQr, publicStudentGradeView } from "../controllers/qr.js";

const router = Router();

router.get("/qr/student/:studentId", generateStudentQr);
router.post("/qr/students/batch", batchStudentQr);

// Public — no auth middleware applied, HMAC sig required
router.get("/public/schools/:schoolId/students/:studentId", publicStudentGradeView);

export default router;
