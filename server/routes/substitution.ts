/**
 * POST /api/substitution/find
 *
 * Request body:
 * {
 *   absentTeacherId: string,
 *   slot: { day: number, period: number, subject: string },
 *   teachers: Teacher[],   // full roster with occupiedSlots
 *   limit?: number
 * }
 *
 * Response: SubstitutionResult
 */
import { Router } from "express";
import { findSubstitutes, type Teacher, type AbsenceSlot } from "../services/substitution.js";

const router = Router();

router.post("/substitution/find", (req, res): void => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const {
    absentTeacherId,
    slot,
    teachers,
    limit = 5,
  } = req.body as {
    absentTeacherId?: string;
    slot?: AbsenceSlot;
    teachers?: Teacher[];
    limit?: number;
  };

  // ── Input validation ───────────────────────────────────────────────────────
  if (!absentTeacherId) {
    res.status(400).json({ error: "absentTeacherId is required" });
    return;
  }

  if (!slot || typeof slot.day !== "number" || typeof slot.period !== "number") {
    res.status(400).json({
      error: "slot must contain numeric day and period fields",
    });
    return;
  }

  if (!Array.isArray(teachers) || teachers.length === 0) {
    res.status(400).json({
      error: "teachers array is required and must not be empty",
    });
    return;
  }

  const result = findSubstitutes(
    absentTeacherId,
    { day: slot.day, period: slot.period, subject: slot.subject ?? "" },
    teachers,
    Math.min(Math.max(limit, 1), 20),
  );

  res.json(result);
});

export default router;
