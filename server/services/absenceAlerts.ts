import { and, eq } from "drizzle-orm";
import { db, schoolMembersTable, studentsTable } from "../../shared/db.js";
import { notifyParentAccount } from "./parentNotifications.js";
import { logger } from "../lib/logger.js";

export async function notifyParentOfAbsence(input: {
  schoolUserId: string;
  studentId: string;
  annee: string;
  date?: string;
}): Promise<{ pushSent: number }> {
  const [student] = await db.select({
    id: studentsTable.id,
    nomPrenom: studentsTable.nomPrenom,
  }).from(studentsTable).where(and(
    eq(studentsTable.id, input.studentId),
    eq(studentsTable.userId, input.schoolUserId),
  )).limit(1);

  if (!student) return { pushSent: 0 };

  const absenceDate = input.date ?? new Date().toISOString().slice(0, 10);
  const message = `السيد/السيدة ولي أمر ${student.nomPrenom}: نُبلّغكم بغياب ابنكم/ابنتكم بتاريخ ${absenceDate}. يرجى التواصل مع إدارة المؤسسة.`;
  const parents = await db.select({ memberUserId: schoolMembersTable.memberUserId })
    .from(schoolMembersTable)
    .where(and(
      eq(schoolMembersTable.schoolUserId, input.schoolUserId),
      eq(schoolMembersTable.linkedStudentId, input.studentId),
      eq(schoolMembersTable.role, "parent"),
    ));

  let pushSent = 0;
  for (const parentUserId of new Set(parents.flatMap(parent => parent.memberUserId ? [parent.memberUserId] : []))) {
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

  logger.info({ studentId: student.id, pushSent }, "Absence parent portal alert dispatched");
  return { pushSent };
}
