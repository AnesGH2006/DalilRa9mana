import { Router, type Request } from "express";
import { eq } from "drizzle-orm";
import { db, schoolInfoTable, usersTable } from "../../shared/db.js";
import { encryptGroqKey, encryptGeminiKey, getUserGroqKey } from "../lib/groq-key.js";
import { runReActAgent } from "../lib/react-agent.js";
import { getSchoolStageForRequest } from "../config/school-stage.js";

const router = Router();
const canUseAssistant = (req: Request) => !req.memberContext && (req.user?.role === "admin" || req.user?.subscriptionStatus === "active");

router.post("/assistant/run", async (req, res): Promise<void> => {
  if (!req.isAuthenticated() || !req.user) { res.status(401).json({ error: "غير مصرح" }); return; }
  if (!canUseAssistant(req)) { res.status(403).json({ error: "هذه الميزة متاحة للمشتركين فقط" }); return; }

  const rawMessages = req.body?.messages;
  if (!Array.isArray(rawMessages) || rawMessages.length === 0 || rawMessages.length > 16 ||
      rawMessages.some(message => !message || !["user", "assistant"].includes(message.role) ||
        typeof message.content !== "string" || message.content.trim().length === 0 || message.content.length > 10000)) {
    res.status(400).json({ error: "رسائل المحادثة غير صالحة" });
    return;
  }

  let groqApiKey: string | null;
  try {
    groqApiKey = await getUserGroqKey(req.user.id);
  } catch (error) {
    req.log.error({ error }, "Unable to read assistant API key");
    res.status(503).json({ error: "تعذر قراءة مفتاح المساعد من الإعدادات" });
    return;
  }
  if (!groqApiKey) {
    res.status(400).json({ error: "أضف مفتاح Groq من إعدادات المساعد أولاً" });
    return;
  }

  const [school] = await db.select({ nom: schoolInfoTable.nom, wilaya: schoolInfoTable.wilaya, commune: schoolInfoTable.commune, annee: schoolInfoTable.annee })
    .from(schoolInfoTable)
    .where(eq(schoolInfoTable.userId, req.user.id))
    .limit(1);
  const schoolContext = school
    ? `المؤسسة: ${school.nom}\nالولاية: ${school.wilaya}\nالبلدية: ${school.commune}\nالسنة الدراسية: ${school.annee}`
    : "لم تُسجل بيانات المؤسسة بعد.";

  res.status(200);
  res.set({
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();

  const sendEvent = (event: string, data: unknown) => {
    if (!res.destroyed) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    await runReActAgent({
      userId: req.user.id,
      groqApiKey,
      schoolContext,
      schoolStage: getSchoolStageForRequest(req),
      messages: rawMessages.map(message => ({ role: message.role as "user" | "assistant", content: message.content.trim() })),
      onStep: step => sendEvent("step", step),
    });
    if (!res.destroyed) res.end();
  } catch (error) {
    req.log.error({ error, userId: req.user.id }, "Assistant run failed");
    const message = error instanceof Error ? error.message.slice(0, 400) : "تعذر تشغيل المساعد";
    sendEvent("error", { message });
    if (!res.destroyed) res.end();
  }
});

router.get("/assistant/settings", async (req, res) => {
  if (!req.isAuthenticated() || !req.user) { res.status(401).json({ error: "غير مصرح" }); return; }
  if (!canUseAssistant(req)) { res.status(403).json({ error: "هذه الميزة متاحة للمشتركين فقط" }); return; }
  const [user] = await db
    .select({ groqApiKey: usersTable.groqApiKey, geminiApiKey: usersTable.geminiApiKey })
    .from(usersTable)
    .where(eq(usersTable.id, req.user.id));
  res.json({
    hasGroqApiKey: Boolean(user?.groqApiKey),
    hasGeminiApiKey: Boolean(user?.geminiApiKey),
  });
});

router.put("/assistant/settings", async (req, res) => {
  if (!req.isAuthenticated() || !req.user) { res.status(401).json({ error: "غير مصرح" }); return; }
  if (!canUseAssistant(req)) { res.status(403).json({ error: "هذه الميزة متاحة للمشتركين فقط" }); return; }

  const body = req.body as { groqApiKey?: unknown; geminiApiKey?: unknown };
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  const response: Record<string, boolean> = {};

  // Only touch groqApiKey if the request actually included that field
  if (typeof body?.groqApiKey === "string") {
    const key = body.groqApiKey.trim();
    if (key && !/^gsk_[A-Za-z0-9_-]{20,}$/.test(key)) {
      res.status(400).json({ error: "مفتاح Groq غير صالح" });
      return;
    }
    updates.groqApiKey = key ? encryptGroqKey(key) : null;
    response.hasGroqApiKey = Boolean(key);
  }

  // Only touch geminiApiKey if the request actually included that field
  if (typeof body?.geminiApiKey === "string") {
    const key = body.geminiApiKey.trim();
    if (key && key.length < 20) {
      res.status(400).json({ error: "مفتاح Gemini غير صالح" });
      return;
    }
    updates.geminiApiKey = key ? encryptGeminiKey(key) : null;
    response.hasGeminiApiKey = Boolean(key);
  }

  await db.update(usersTable).set(updates).where(eq(usersTable.id, req.user.id));
  res.json(response);
});

export default router;