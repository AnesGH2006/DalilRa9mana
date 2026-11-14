import { and, eq } from "drizzle-orm";
import { db, studentsTable } from "../../shared/db.js";
import { notifyParentAccount } from "./parentNotifications.js";
import { getParentContacts, sendParentWhatsAppMessage } from "./parentMessaging.js";
import { logger } from "../lib/logger.js";

export async function notifyParentOfAbsence(input: {
  schoolUserId: string;
  studentId: string;
  annee: string;
  date?: string;
}): Promise<{ pushSent: number; whatsappSent: number }> {
  const [student] = await db.select({
    id: studentsTable.id,
    nomPrenom: studentsTable.nomPrenom,
  }).from(studentsTable).where(and(
    eq(studentsTable.id, input.studentId),
    eq(studentsTable.userId, input.schoolUserId),
  )).limit(1);

  if (!student) return { pushSent: 0, whatsappSent: 0 };

  const absenceDate = input.date ?? new Date().toISOString().slice(0, 10);
  const message = `السيد/السيدة ولي أمر ${student.nomPrenom}: نُبلّغكم بغياب ابنكم/ابنتكم بتاريخ ${absenceDate}. يرجى التواصل مع إدارة المؤسسة.`;
  const contacts = await getParentContacts(input.schoolUserId, input.studentId);

  let whatsappSent = 0;
  try {
    const wa = await sendParentWhatsAppMessage({
      schoolUserId: input.schoolUserId,
      studentId: input.studentId,
      message,
      eventType: "ABSENCE_ALERT",
      phones: contacts.phones,
    });
    whatsappSent = wa.sent;
  } catch (error) {
    logger.error({ error, studentId: student.id }, "Parent WhatsApp absence alert failed");
  }

  let pushSent = 0;
  for (const parentUserId of contacts.parentUserIds) {
    try {
      const notification = await notifyParentAccount({
        userId: parentUserId,
        title: "تنبيه غياب",
        body: message,
        url: "/my-child#parent-notifications",
        type: "absence",
        metadata: { studentId: student.id, eventType: "ABSENCE_ALERT", date: absenceDate },
      });
      pushSent += notification.pushSent;
    } catch (error) {
      logger.error({ error, studentId: student.id, parentUserId }, "Parent portal absence alert failed");
    }
  }

  logger.info({ studentId: student.id, pushSent, whatsappSent }, "Absence parent alerts dispatched");
  return { pushSent, whatsappSent };
}
