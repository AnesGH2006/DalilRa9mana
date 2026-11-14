/**
 * SMS Broadcast & Bulk Send API with Credit Tracking
 *
 * POST /api/sms/broadcast
 *   - Send bulk SMS to multiple parents with template rendering
 *   - Deduct credits based on message length
 *   - Log all SMS to database
 */

import { Router } from "express";
import { db, smsLogsTable, studentsTable, schoolSubscriptionsTable } from "../../shared/db.js";
import { eq, and, inArray } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import { sendBulkSms } from "../services/smsService.js";
import { deductCredits, calculateCreditsNeeded, getOrCreateSubscription } from "../services/smsCreditsService.js";
import { v4 as uuid } from "uuid";

const router = Router();

export interface SmsBroadcastRequest {
  type: "custom" | "absence_alert" | "grade_alert" | "summons";
  /** Template: "الطالب {student_name} غائب عن الدوام في {date}" */
  messageTemplate: string;
  /** List of student IDs to send to (parents of these students) */
  studentIds?: string[];
  /** Alternative: send to specific phone numbers directly */
  phoneNumbers?: string[];
  /** Render variables for template */
  variables?: Record<string, string>;
}

/**
 * Render SMS template with variables
 * Example: "الطالب {student_name} حصل على {grade}" + { student_name: "أحمد", grade: "18" }
 * Result: "الطالب أحمد حصل على 18"
 */
function renderTemplate(template: string, variables: Record<string, string> = {}): string {
  let message = template;
  for (const [key, value] of Object.entries(variables)) {
    message = message.replace(new RegExp(`\\{${key}\\}`, "g"), value);
  }
  return message;
}

/**
 * Get phone numbers for a list of student IDs
 */
async function getStudentPhones(
  userId: string,
  studentIds: string[],
): Promise<Map<string, { phone: string; name: string }>> {
  const students = await db
    .select({
      id: studentsTable.id,
      nomPrenom: studentsTable.nomPrenom,
      parentPhone: studentsTable.parentPhone,
    })
    .from(studentsTable)
    .where(
      and(
        eq(studentsTable.userId, userId),
        inArray(studentsTable.id, studentIds),
      ),
    );

  const phones = new Map<string, { phone: string; name: string }>();
  for (const s of students) {
    if (s.parentPhone) {
      phones.set(s.id, {
        phone: s.parentPhone,
        name: s.nomPrenom,
      });
    }
  }

  return phones;
}

/**
 * GET /api/sms/broadcast/preview
 * Preview template rendering and credit calculation
 */
router.get("/sms/broadcast/preview", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { template, recipients } = req.query as { template?: string; recipients?: string };

  if (!template) {
    res.status(400).json({ error: "قالب الرسالة مطلوب" });
    return;
  }

  const count = recipients ? parseInt(recipients) : 1;
  const creditsNeeded = calculateCreditsNeeded(template) * count;

  res.json({
    preview: template,
    recipients: count,
    creditsPerMessage: calculateCreditsNeeded(template),
    totalCreditsNeeded: creditsNeeded,
  });
});

/**
 * POST /api/sms/broadcast
 * Send bulk SMS to students' parents with credit tracking
 */
router.post("/sms/broadcast", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const userId = req.user!.id;
  const { type, messageTemplate, studentIds, phoneNumbers, variables } = req.body as SmsBroadcastRequest;

  if (!messageTemplate || (!studentIds?.length && !phoneNumbers?.length)) {
    res.status(400).json({ error: "قالب الرسالة والمستقبلون مطلوبان" });
    return;
  }

  try {
    // ── 1. Get list of phones ────────────────────────────────────────────────
    let recipients: string[] = [];
    const studentMap = new Map<string, string>();

    if (studentIds && studentIds.length > 0) {
      const phoneMap = await getStudentPhones(userId, studentIds);
      for (const [sid, info] of phoneMap) {
        recipients.push(info.phone);
        studentMap.set(info.phone, sid);
      }

      if (recipients.length === 0) {
        res.status(400).json({ error: "لم نجد أرقام هواتف للطلاب المحددين" });
        return;
      }
    } else {
      recipients = phoneNumbers || [];
    }

    // ── 2. Calculate credits ─────────────────────────────────────────────────
    const creditsPerMessage = calculateCreditsNeeded(messageTemplate);
    const totalCreditsNeeded = creditsPerMessage * recipients.length;

    const subscription = await getOrCreateSubscription(userId);
    if (subscription.subscriptionStatus !== "active") {
      res.status(403).json({
        error: "الاشتراك غير نشط",
        status: subscription.subscriptionStatus,
      });
      return;
    }

    if (subscription.smsCreditsRemaining < totalCreditsNeeded) {
      res.status(402).json({
        error: "رصيد SMS غير كافٍ",
        required: totalCreditsNeeded,
        available: subscription.smsCreditsRemaining,
      });
      return;
    }

    // ── 3. Render messages ───────────────────────────────────────────────────
    const messages: Array<{ phone: string; message: string; studentId?: string }> = [];

    if (variables && typeof variables === "object" && Object.keys(variables).length > 0) {
      // Template with variables - same for all
      const message = renderTemplate(messageTemplate, variables);
      for (const phone of recipients) {
        messages.push({
          phone,
          message,
          studentId: studentMap.get(phone),
        });
      }
    } else {
      // Simple template without variables
      for (const phone of recipients) {
        messages.push({
          phone,
          message: messageTemplate,
          studentId: studentMap.get(phone),
        });
      }
    }

    // ── 4. Send SMS ──────────────────────────────────────────────────────────
    logger.info({ count: messages.length, creditsNeeded: totalCreditsNeeded }, "Sending bulk SMS");

    const smsResult = await sendBulkSms({
      phoneNumbers: recipients,
      message: messageTemplate,
      userId,
    });

    // ── 5. Deduct credits ────────────────────────────────────────────────────
    const remaining = await deductCredits(userId, totalCreditsNeeded);

    // ── 6. Log to database ───────────────────────────────────────────────────
    const logPromises = messages.map(msg =>
      db.insert(smsLogsTable).values({
        id: uuid(),
        userId,
        studentId: msg.studentId || null,
        phone: msg.phone,
        recipient: msg.phone,
        message: msg.message.slice(0, 1000),
        status: smsResult.sent > 0 && smsResult.results.find(r => r.phone === msg.phone)?.success
          ? "sent"
          : "failed",
        channel: smsResult.channel,
        gatewayRef: smsResult.results.find(r => r.phone === msg.phone)?.sid,
        errorMsg: smsResult.results.find(r => r.phone === msg.phone)?.error,
      }),
    );

    await Promise.all(logPromises);

    res.json({
      success: smsResult.success,
      sent: smsResult.sent,
      failed: smsResult.failed,
      total: smsResult.total,
      channel: smsResult.channel,
      creditsDeducted: totalCreditsNeeded,
      creditsRemaining: remaining,
      message: `تم إرسال ${smsResult.sent} رسالة بنجاح`,
    });
  } catch (err: any) {
    logger.error({ err }, "Broadcast SMS failed");
    res.status(500).json({
      error: "فشل إرسال الرسائل",
      details: err?.message,
    });
  }
});

/**
 * GET /api/sms/credits
 * Get current SMS credits status
 */
router.get("/sms/credits", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const userId = req.user!.id;

  try {
    const subscription = await getOrCreateSubscription(userId);
    res.json({
      creditsRemaining: subscription.smsCreditsRemaining,
      subscriptionStatus: subscription.subscriptionStatus,
      active: subscription.subscriptionStatus === "active",
    });
  } catch (err: any) {
    logger.error({ err }, "Failed to get SMS credits");
    res.status(500).json({ error: "فشل جلب بيانات الرصيد" });
  }
});

export default router;
