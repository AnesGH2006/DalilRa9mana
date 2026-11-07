import crypto from "node:crypto";
import { Router, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
import { db, schoolInfoTable, studentsTable } from "../../shared/db.js";
import { isSchoolStage } from "../../shared/school-stage.js";
import { CURRENT_ACADEMIC_YEAR } from "../../shared/academic-year.js";
import { SCHOOL_STAGE } from "../config/school-stage.js";

const router = Router();

function schoolOwnerId(req: Request): string {
  return req.memberContext?.schoolUserId ?? req.user!.id;
}

function requireOwner(req: Request, res: Response): boolean {
  if (!req.isAuthenticated() || !req.user) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  if (req.memberContext || req.user.role === "admin") {
    res.status(403).json({ error: "Only a school owner can select the school stage" });
    return false;
  }
  return true;
}

router.get("/school/stage", async (req, res): Promise<void> => {
  res.set("Cache-Control", "private, no-store");
  if (!req.isAuthenticated() || !req.user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const [school] = await db
    .select({ stage: schoolInfoTable.stage })
    .from(schoolInfoTable)
    .where(eq(schoolInfoTable.userId, schoolOwnerId(req)))
    .limit(1);

  if (school && !isSchoolStage(school.stage)) {
    res.status(500).json({ error: "Invalid school stage stored for this account" });
    return;
  }

  res.json({
    stage: school?.stage ?? req.schoolStage ?? SCHOOL_STAGE,
    configured: !!school,
  });
});

router.put("/school/stage", async (req, res): Promise<void> => {
  if (!requireOwner(req, res)) return;
  const stage = req.body?.stage;
  if (!isSchoolStage(stage)) {
    res.status(400).json({ error: "stage must be 'moyen' or 'lycee'" });
    return;
  }

  const userId = schoolOwnerId(req);
  const [existing] = await db
    .select({ id: schoolInfoTable.id, stage: schoolInfoTable.stage })
    .from(schoolInfoTable)
    .where(eq(schoolInfoTable.userId, userId))
    .limit(1);

  if (existing && !isSchoolStage(existing.stage)) {
    res.status(500).json({ error: "Invalid school stage stored for this account" });
    return;
  }
  if (existing?.stage === stage) {
    res.json({ stage, configured: true });
    return;
  }

  const [student] = await db
    .select({ id: studentsTable.id })
    .from(studentsTable)
    .where(eq(studentsTable.userId, userId))
    .limit(1);
  if (student) {
    res.status(409).json({ error: "لا يمكن تغيير المرحلة بعد إضافة التلاميذ." });
    return;
  }

  if (existing) {
    await db.update(schoolInfoTable)
      .set({ stage, updatedAt: new Date() })
      .where(eq(schoolInfoTable.userId, userId));
  } else {
    await db.insert(schoolInfoTable).values({
      id: crypto.randomBytes(16).toString("hex"),
      userId,
      stage,
      annee: CURRENT_ACADEMIC_YEAR,
    });
  }

  res.json({ stage, configured: true });
});

export default router;
