/**
 * send_sms_alert_tool
 * ───────────────────
 * Sends an official SMS to a student's parent/guardian.
 *
 * Dispatch priority:
 *   1. HTTP SMS Gateway (env)  — if SMS_GATEWAY_URL is set
 *   2. HTTP SMS Gateway (DB)   — if school record has smsGatewayUrl configured
 *   3. Queued log only         — logs the message as "queued" for manual retry
 *
 * The desktop-agent modem path has been removed. Parents receive a plain SMS
 * on their phone — they do not need to install any app.
 */

import { db, studentsTable, smsLogsTable, schoolInfoTable } from "../../../shared/db.js";
import { eq, and } from "drizzle-orm";
import { logger } from "../logger.js";

export interface SendSmsAlertInput {
  /** The student's DB id — used to look up parentPhone */
  student_id: string;
  /** The text message to send (Arabic ok) */
  message: string;
  /** Override the stored phone number (optional) */
  custom_phone?: string;
  /** Sender label shown on the SMS (supported by some gateways) */
  sender_id?: string;
}

// ── Gateway helper ─────────────────────────────────────────────────────────────
async function sendViaGateway(
  to: string,
  message: string,
  senderId: string,
  gatewayUrl: string,
  apiKey: string,
): Promise<{ ok: boolean; ref?: string; error?: string }> {
  try {
    const res = await fetch(gatewayUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({ to, message, sender: senderId, from: senderId }),
      signal: AbortSignal.timeout(15_000),
    });

    const body = await res.json().catch(() => ({})) as Record<string, unknown>;

    if (!res.ok) {
      return { ok: false, error: `Gateway ${res.status}: ${JSON.stringify(body)}` };
    }

    const ref = String(
      body.messageId ?? body.message_id ?? body.id ?? body.sid ?? body.msgid ?? ""
    );
    return { ok: true, ref: ref || undefined };
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
}

export async function sendSmsAlertTool(
  input: SendSmsAlertInput,
  userId: string,
): Promise<unknown> {
  // ── 1. Resolve parent phone number ─────────────────────────────────────────
  let phone = input.custom_phone?.trim() ?? null;
  let studentName = "—";

  if (!phone || input.student_id) {
    const rows = await db
      .select({ parentPhone: studentsTable.parentPhone, nomPrenom: studentsTable.nomPrenom })
      .from(studentsTable)
      .where(and(eq(studentsTable.id, input.student_id), eq(studentsTable.userId, userId)))
      .limit(1);

    if (rows.length === 0) {
      return { success: false, message: `❌ لم يُعثر على تلميذ بالمعرّف "${input.student_id}"` };
    }

    studentName = rows[0]!.nomPrenom;
    if (!phone) phone = rows[0]!.parentPhone ?? null;
  }

  const senderId = input.sender_id ?? "SchoolMgr";

  // ── 2. No phone on record ──────────────────────────────────────────────────
  if (!phone) {
    await db.insert(smsLogsTable).values({
      userId,
      studentId: input.student_id,
      phone: null,
      message: input.message,
      status: "no_phone",
    });

    return {
      success: false,
      student: studentName,
      message: `⚠️ لا يوجد رقم هاتف مسجّل لولي أمر "${studentName}".`,
    };
  }

  // ── 3. Resolve gateway (env → school DB → none) ────────────────────────────
  let gatewayUrl = process.env.SMS_GATEWAY_URL ?? "";
  let gatewayKey = process.env.SMS_GATEWAY_API_KEY ?? "";

  if (!gatewayUrl) {
    // Fall back to the school record's configured gateway
    const [schoolRow] = await db
      .select({ smsGatewayUrl: schoolInfoTable.smsGatewayUrl, smsGatewayApiKey: schoolInfoTable.smsGatewayApiKey })
      .from(schoolInfoTable)
      .where(eq(schoolInfoTable.userId, userId))
      .limit(1);
    gatewayUrl = schoolRow?.smsGatewayUrl ?? "";
    gatewayKey = schoolRow?.smsGatewayApiKey ?? "";
  }

  // ── 4. Dispatch ────────────────────────────────────────────────────────────
  let dispatchResult: { ok: boolean; ref?: string; error?: string };
  const channel: "gateway" | "modem" | "socket" = "gateway";

  if (gatewayUrl) {
    dispatchResult = await sendViaGateway(phone, input.message, senderId, gatewayUrl, gatewayKey);
  } else {
    // No gateway configured — log as queued
    await db.insert(smsLogsTable).values({
      userId,
      studentId: input.student_id,
      phone,
      message: input.message,
      status: "queued",
    });
    return {
      success: false,
      student: studentName,
      phone,
      message: `⚠️ لم يتم إرسال الرسالة إلى "${studentName}": لا توجد بوابة SMS مضبوطة. أدخل رابط بوابة SMS في إعدادات المؤسسة.`,
    };
  }

  // ── 5. Log result ──────────────────────────────────────────────────────────
  const status = dispatchResult.ok ? "sent" : "failed";

  try {
    await db.insert(smsLogsTable).values({
      userId,
      studentId: input.student_id,
      phone,
      message: input.message,
      status,
      channel,
      gatewayRef: dispatchResult.ref ?? null,
      errorMsg: dispatchResult.error ?? null,
    });
  } catch (logErr: any) {
    logger.warn({ logErr }, "SMS log insert failed");
  }

  logger.info({ userId, phone, student: studentName, channel, status }, "send_sms_alert");

  if (dispatchResult.ok) {
    return {
      success: true,
      channel,
      student: studentName,
      phone,
      ref: dispatchResult.ref,
      message: `✅ تم إرسال رسالة SMS إلى ولي أمر "${studentName}" على الرقم ${phone} عبر بوابة SMS.`,
    };
  }

  return {
    success: false,
    channel,
    student: studentName,
    phone,
    error: dispatchResult.error,
    message: `❌ فشل إرسال SMS عبر البوابة: ${dispatchResult.error}. تحقق من رابط البوابة في إعدادات المؤسسة.`,
  };
}
