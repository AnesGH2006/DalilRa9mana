import { Router, type Request } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable } from "../../shared/db.js";
import { encryptGroqKey } from "../lib/groq-key.js";

const router = Router();
const canUseAssistant = (req: Request) => !req.memberContext && (req.user?.role === "admin" || req.user?.subscriptionStatus === "active");

router.get("/assistant/settings", async (req, res) => {
  if (!req.isAuthenticated() || !req.user) { res.status(401).json({ error: "غير مصرح" }); return; }
  if (!canUseAssistant(req)) { res.status(403).json({ error: "هذه الميزة متاحة للمشتركين فقط" }); return; }
  const [user] = await db.select({ groqApiKey: usersTable.groqApiKey }).from(usersTable).where(eq(usersTable.id, req.user.id));
  res.json({ hasGroqApiKey: Boolean(user?.groqApiKey) });
});

router.put("/assistant/settings", async (req, res) => {
  if (!req.isAuthenticated() || !req.user) { res.status(401).json({ error: "غير مصرح" }); return; }
  if (!canUseAssistant(req)) { res.status(403).json({ error: "هذه الميزة متاحة للمشتركين فقط" }); return; }
  const key = typeof req.body?.groqApiKey === "string" ? req.body.groqApiKey.trim() : "";
  if (key && !/^gsk_[A-Za-z0-9_-]{20,}$/.test(key)) { res.status(400).json({ error: "مفتاح Groq غير صالح" }); return; }
  await db.update(usersTable).set({ groqApiKey: key ? encryptGroqKey(key) : null, updatedAt: new Date() }).where(eq(usersTable.id, req.user.id));
  res.json({ hasGroqApiKey: Boolean(key) });
});

export default router;