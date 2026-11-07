import crypto from "crypto";
import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, schoolInfoTable } from "../../shared/db.js";
import { UpsertSchoolInfoBody, SchoolInfoSchema } from "../../shared/schemas.js";
import { getSchoolStageForRequest } from "../config/school-stage.js";

/** Generate a random 6-char alphanumeric join code. */
const JOIN_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O, 1/I
function genJoinCode(): string {
  let code = "";
  for (let i = 0; i < 6; i++) code += JOIN_CODE_ALPHABET[crypto.randomInt(JOIN_CODE_ALPHABET.length)];
  return code;
}

const router: IRouter = Router();

router.get("/school", async (req, res): Promise<void> => {
    if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
    const [existing] = await db.select().from(schoolInfoTable).where(eq(schoolInfoTable.userId, req.user!.id));
    const info = existing;
  if (!info) { res.json(null); return; }
  // Auto-assign a join code if none exists yet
  if (!info.joinCode) {
    const [updated] = await db.update(schoolInfoTable)
      .set({ joinCode: genJoinCode() })
      .where(eq(schoolInfoTable.userId, req.user!.id))
      .returning();
    res.json(updated); return;
  }
  res.json(info);
});

// ── GET /api/public/school-by-code/:code ─────────────────────────────────────
// Returns school name + userId for the parent registration form (no auth required).
router.get("/public/school-by-code/:code", async (req, res): Promise<void> => {
  const code = String(req.params.code ?? "").toUpperCase().trim();
  if (!code) { res.status(400).json({ error: "code required" }); return; }
  const [info] = await db
    .select({ schoolUserId: schoolInfoTable.userId, nom: schoolInfoTable.nom, wilaya: schoolInfoTable.wilaya })
    .from(schoolInfoTable)
    .where(eq(schoolInfoTable.joinCode, code))
    .limit(1);
  if (!info) { res.status(404).json({ error: "School not found" }); return; }
  res.json(info);
});

router.put("/school", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Invalid data", details: [] }); return; }
  const parsed = UpsertSchoolInfoBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid data", details: parsed.error.issues }); return; }

  const userId = req.user!.id;
  const { nom, wilaya, commune, annee, directeur, phone, smsGatewayUrl, smsGatewayApiKey, supportPhone } = parsed.data;
  const [existing] = await db.select().from(schoolInfoTable).where(eq(schoolInfoTable.userId, userId));

  const vals = {
    nom, wilaya, commune, annee,
    stage: getSchoolStageForRequest(req),
    directeur: directeur ?? "",
    phone: phone ?? "",
    smsGatewayUrl: smsGatewayUrl ?? "",
    smsGatewayApiKey: smsGatewayApiKey ?? "",
    supportPhone: supportPhone ?? "",
  };

  if (existing) {
    const [updated] = await db.update(schoolInfoTable)
      .set({ ...vals, updatedAt: new Date() })
      .where(eq(schoolInfoTable.userId, userId))
      .returning();
    res.json(SchoolInfoSchema.parse(updated));
  } else {
    const [created] = await db.insert(schoolInfoTable)
      .values({ id: crypto.randomBytes(16).toString("hex"), userId, ...vals })
      .returning();
    res.json(SchoolInfoSchema.parse(created));
  }
});

export default router;
