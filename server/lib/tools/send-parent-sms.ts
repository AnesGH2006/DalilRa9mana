/**
 * send_parent_sms_tool
 * --------------------
 * Resolves a student's saved parent phone number and dispatches an SMS
 * directly to the connected desktop agent over Socket.IO.
 */

import { and, eq, ilike } from "drizzle-orm";
import { db, smsLogsTable, studentsTable } from "../../../shared/db.js";
import { sendSmsToAgent } from "../../socket/agentHandler.js";
import { logger } from "../logger.js";

export interface SendParentSmsInput {
  studentName: string;
  message: string;
}

export async function sendParentSmsTool(
  input: SendParentSmsInput,
  userId: string,
): Promise<unknown> {
  const studentName = input.studentName?.trim();
  const message = input.message?.trim();

  if (!studentName || !message) {
    return {
      success: false,
      message: "يجب تحديد اسم التلميذ ونص الرسالة قبل الإرسال.",
    };
  }

  const [student] = await db
    .select({
      id: studentsTable.id,
      nomPrenom: studentsTable.nomPrenom,
      parentPhone: studentsTable.parentPhone,
    })
    .from(studentsTable)
    .where(and(
      eq(studentsTable.userId, userId),
      ilike(studentsTable.nomPrenom, studentName),
    ))
    .limit(1);

  if (!student) {
    return {
      success: false,
      message: `لم يُعثر على تلميذ باسم "${studentName}". تحقق من الاسم كما هو مسجّل في قاعدة البيانات.`,
    };
  }

  if (!student.parentPhone) {
    return {
      success: false,
      student: student.nomPrenom,
      message: `لا يوجد رقم هاتف مسجّل لولي أمر "${student.nomPrenom}". يرجى توفير الرقم أو تشغيل أداة استخراج أرقام أولياء الأمور أولاً.`,
    };
  }

  try {
    const confirmation = await sendSmsToAgent(userId, {
      phone: student.parentPhone,
      message,
    });
    const details = confirmation as Record<string, unknown>;
    const sent = details.status === "success" || details.ok === true;

    await db.insert(smsLogsTable).values({
      userId,
      studentId: student.id,
      phone: student.parentPhone,
      message,
      status: sent ? "sent" : "failed",
      channel: "socket",
      errorMsg: sent ? null : String(details.error ?? "فشل وكيل سطح المكتب في الإرسال"),
    });

    return {
      success: sent,
      student: student.nomPrenom,
      phone: student.parentPhone,
      channel: "socket",
      message: sent
        ? `تم إرسال رسالة SMS إلى ولي أمر "${student.nomPrenom}" بنجاح.`
        : `تعذر إرسال الرسالة إلى ولي أمر "${student.nomPrenom}": ${String(details.error ?? "خطأ غير معروف")}`,
      confirmation,
    };
  } catch (error: any) {
    logger.error({ error, userId, studentId: student.id }, "send_parent_sms_tool failed");
    await db.insert(smsLogsTable).values({
      userId,
      studentId: student.id,
      phone: student.parentPhone,
      message,
      status: "failed",
      channel: "socket",
      errorMsg: error.message ?? "فشل الاتصال بوكيل سطح المكتب",
    }).catch((logError) => logger.warn({ logError }, "SMS failure log insert failed"));

    return {
      success: false,
      student: student.nomPrenom,
      phone: student.parentPhone,
      message: `تعذر إرسال الرسالة إلى ولي أمر "${student.nomPrenom}": ${error.message ?? "وكيل سطح المكتب غير متصل"}`,
    };
  }
}