import { getParentContacts, sendParentWhatsAppMessage } from "./parentMessaging.js";
import { notifyParentAccount } from "./parentNotifications.js";
import { logger } from "../lib/logger.js";

export interface GradeAlertItem {
  subject: string;
  score: number;
  gradeType?: string | null;
}

function gradeTypeLabel(items: GradeAlertItem[]): string {
  const types = new Set(items.map(item => item.gradeType ?? "general"));
  if (types.has("exam")) return "الاختبار";
  if (types.has("test")) return "الفرض";
  return "الفرض/الاختبار";
}

export async function notifyParentOfGrades(input: {
  schoolUserId: string;
  studentId: string;
  annee: string;
  trimestre: number;
  grades: GradeAlertItem[];
}): Promise<{ sent: number; pushSent: number; skipped?: string }> {
  const alertGrades = input.grades.filter(item => item.gradeType === "test" || item.gradeType === "exam");
  if (!alertGrades.length) return { sent: 0, pushSent: 0, skipped: "not_test_or_exam" };

  const contacts = await getParentContacts(input.schoolUserId, input.studentId);
  if (!contacts.phones.length && !contacts.parentUserIds.length) {
    return { sent: 0, pushSent: 0, skipped: "no_parent_contact" };
  }

  const label = gradeTypeLabel(alertGrades);
  const lines = alertGrades
    .map(item => `- ${item.subject}: ${item.score}/20`)
    .join("\n")
    .slice(0, 700);
  const body = `تم رصد نقاط ${label} للتلميذ ${contacts.studentName || "ابنكم"} (الفصل ${input.trimestre}، ${input.annee}):\n${lines}\nيمكنكم متابعتها من حساب ولي الأمر.`;

  let sent = 0;
  try {
    const wa = await sendParentWhatsAppMessage({
      schoolUserId: input.schoolUserId,
      studentId: input.studentId,
      message: body,
      eventType: `${label}_GRADE`,
      phones: contacts.phones,
    });
    sent = wa.sent;
  } catch (error) {
    logger.error({ error, studentId: input.studentId }, "Parent grade WhatsApp alert failed");
  }

  let pushSent = 0;
  for (const parentUserId of contacts.parentUserIds) {
    try {
      const notification = await notifyParentAccount({
        userId: parentUserId,
        title: `نقاط ${label}`,
        body,
        url: "/my-child#parent-notifications",
        type: "grade",
        metadata: { studentId: input.studentId, eventType: `${label}_GRADE`, annee: input.annee, trimestre: input.trimestre },
      });
      pushSent += notification.pushSent;
    } catch (error) {
      logger.error({ error, studentId: input.studentId, parentUserId }, "Parent grade push alert failed");
    }
  }

  return { sent, pushSent };
}
