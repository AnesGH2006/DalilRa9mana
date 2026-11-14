import crypto from "crypto";
import { Router, type Request, type Response } from "express";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { db, schoolInfoTable, schoolMembersTable, smsLogsTable, studentsTable } from "../../shared/db.js";
import { CURRENT_ACADEMIC_YEAR } from "../../shared/academic-year.js";
import { canUseStaffFeature, STAFF_PLAN_PRICE_DZD } from "../middlewares/staffAccess.js";
import { sendWhatsAppBulk, getWhatsAppStatus } from "../services/whatsappService.js";
import { sendParentWhatsAppMessage } from "../services/parentMessaging.js";
import { logger } from "../lib/logger.js";

const router = Router();

function schoolIdForWhatsApp(req: Request, res: Response): string | null {
  if (!req.isAuthenticated() || !req.user) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  const member = req.memberContext;
  if (!member) return req.user.id;
  if (member.role === "parent") {
    res.status(403).json({ error: "غير مسموح" });
    return null;
  }
  if (!canUseStaffFeature(req, "parent_notifications")) {
    res.status(402).json({
      error: `إرسال رسائل واتساب/أولياء التلاميذ يتطلب اشتراك المشرف (${STAFF_PLAN_PRICE_DZD} دج في السنة)`,
      requiredPlan: "staff",
      priceDzd: STAFF_PLAN_PRICE_DZD,
      feature: "parent_notifications",
    });
    return null;
  }
  return member.schoolUserId;
}

const JOIN_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function genJoinCode(): string {
  let code = "";
  for (let i = 0; i < 6; i++) code += JOIN_CODE_ALPHABET[crypto.randomInt(JOIN_CODE_ALPHABET.length)];
  return code;
}

function appBaseUrl(req: Request): string {
  const env = process.env.APP_BASE_URL ?? process.env.PUBLIC_APP_URL ?? process.env.BASE_URL;
  if (env) return env.replace(/\/+$/, "");
  return `${req.protocol}://${req.get("host")}`;
}

router.get("/whatsapp/status", async (req, res): Promise<void> => {
  const userId = schoolIdForWhatsApp(req, res);
  if (!userId) return;
  res.json(await getWhatsAppStatus(userId));
});

router.post("/whatsapp/send", async (req, res): Promise<void> => {
  const userId = schoolIdForWhatsApp(req, res);
  if (!userId) return;
  const { studentId, message, phone } = req.body as { studentId?: string; message?: string; phone?: string };
  if (!message?.trim() || (!studentId && !phone?.trim())) {
    res.status(400).json({ success: false, message: "بيانات ناقصة: الرسالة ومستلم واحد على الأقل مطلوبان" });
    return;
  }
  try {
    const result = await sendParentWhatsAppMessage({
      schoolUserId: userId,
      studentId: studentId ?? null,
      message: message.trim(),
      eventType: "MANUAL_WHATSAPP",
      phones: phone?.trim() ? [phone.trim()] : undefined,
    });
    res.json({ success: result.sent > 0 || result.failed === 0, ...result });
  } catch (error: any) {
    req.log?.error?.({ error }, "whatsapp/send failed");
    res.status(500).json({ success: false, message: error?.message || "فشل إرسال الرسالة" });
  }
});

router.post("/whatsapp/invite-parents", async (req, res): Promise<void> => {
  const userId = schoolIdForWhatsApp(req, res);
  if (!userId) return;
  const body = req.body as { annee?: string; classe?: string; niveau?: string; limit?: number };
  const annee = typeof body.annee === "string" && body.annee.trim() ? body.annee.trim() : CURRENT_ACADEMIC_YEAR;
  const limit = Math.min(Math.max(Number(body.limit) || 200, 1), 1000);

  const conditions = [
    eq(studentsTable.userId, userId),
    eq(studentsTable.annee, annee),
    isNotNull(studentsTable.parentPhone),
  ];
  if (body.classe?.trim()) conditions.push(eq(studentsTable.classe, body.classe.trim()));
  if (body.niveau?.trim()) conditions.push(eq(studentsTable.niveau, body.niveau.trim() as any));

  const [students, linkedRows, schoolRows] = await Promise.all([
    db.select({
      id: studentsTable.id,
      nomPrenom: studentsTable.nomPrenom,
      classe: studentsTable.classe,
      niveau: studentsTable.niveau,
      parentPhone: studentsTable.parentPhone,
    }).from(studentsTable).where(and(...conditions)),
    db.select({ linkedStudentId: schoolMembersTable.linkedStudentId })
      .from(schoolMembersTable)
      .where(and(eq(schoolMembersTable.schoolUserId, userId), eq(schoolMembersTable.role, "parent"))),
    db.select({ nom: schoolInfoTable.nom, joinCode: schoolInfoTable.joinCode })
      .from(schoolInfoTable).where(eq(schoolInfoTable.userId, userId)).limit(1),
  ]);

  const linkedStudentIds = new Set(linkedRows.map(row => row.linkedStudentId).filter(Boolean));
  const candidates = students.filter(student => student.parentPhone && !linkedStudentIds.has(student.id)).slice(0, limit);
  if (!candidates.length) {
    res.json({ success: true, invited: 0, message: "لا يوجد أولياء غير مسجلين بأرقام هواتف في هذا النطاق" });
    return;
  }

  let joinCode = schoolRows[0]?.joinCode ?? "";
  if (!joinCode) {
    joinCode = genJoinCode();
    if (schoolRows[0]) {
      await db.update(schoolInfoTable).set({ joinCode }).where(eq(schoolInfoTable.userId, userId));
    } else {
      await db.insert(schoolInfoTable).values({
        id: crypto.randomBytes(16).toString("hex"),
        userId,
        joinCode,
      }).onConflictDoNothing();
    }
  }
  const schoolName = schoolRows[0]?.nom?.trim() || "إدارة المؤسسة";
  const inviteUrl = `${appBaseUrl(req)}/parent-register?code=${encodeURIComponent(joinCode)}`;

  const byPhone = new Map<string, typeof candidates>();
  for (const student of candidates) {
    const phone = String(student.parentPhone).trim();
    const key = phone.replace(/\D/g, "");
    if (!key) continue;
    const list = byPhone.get(key) ?? [];
    list.push(student);
    byPhone.set(key, list);
  }

  const phones = [...byPhone.keys()];
  const message = `دعوة من ${schoolName}: لتفعيل حساب ولي الأمر ومتابعة أبنائكم (${candidates.length} تلميذ/ة) اشتركوا في خدمة المتابعة بـ 500 دج/سنة عبر:\n${inviteUrl}\nرمز المدرسة: ${joinCode}`;
  const result = await sendWhatsAppBulk({ phoneNumbers: phones, message, userId });

  await Promise.all(result.results.map(item =>
    db.insert(smsLogsTable).values({
      userId,
      studentId: null,
      phone: item.phone,
      recipient: item.phone,
      message: message.slice(0, 1000),
      status: item.success ? "sent" : "failed",
      channel: "gateway",
      gatewayRef: item.sid ?? null,
      errorMsg: item.error ?? null,
      sentAt: item.success ? new Date() : null,
    }).catch(error => logger.warn({ error, phone: item.phone }, "Parent invite log insert failed")),
  ));

  res.json({
    success: result.failed === 0,
    invited: result.sent,
    failed: result.failed,
    total: result.total,
    channel: result.channel,
    joinCode,
    inviteUrl,
  });
});

export default router;
