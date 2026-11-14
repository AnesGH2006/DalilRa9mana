import { and, eq } from "drizzle-orm";
import { db, schoolMembersTable, smsLogsTable, studentsTable } from "../../shared/db.js";
import { logger } from "../lib/logger.js";
import { sendWhatsAppBulk } from "./whatsappService.js";

export interface ParentContacts {
  studentName: string;
  phones: string[];
  parentUserIds: string[];
}

function phoneKey(phone: string | null | undefined): string {
  return String(phone ?? "").replace(/\D/g, "");
}

export async function getParentContacts(schoolUserId: string, studentId: string): Promise<ParentContacts> {
  const [student] = await db.select({
    nomPrenom: studentsTable.nomPrenom,
    parentPhone: studentsTable.parentPhone,
  }).from(studentsTable).where(and(
    eq(studentsTable.id, studentId),
    eq(studentsTable.userId, schoolUserId),
  )).limit(1);

  const members = await db.select({
    phone: schoolMembersTable.phone,
    memberUserId: schoolMembersTable.memberUserId,
  }).from(schoolMembersTable).where(and(
    eq(schoolMembersTable.schoolUserId, schoolUserId),
    eq(schoolMembersTable.role, "parent"),
    eq(schoolMembersTable.linkedStudentId, studentId),
  ));

  const phones = new Map<string, string>();
  for (const phone of [student?.parentPhone, ...members.map(member => member.phone)]) {
    const key = phoneKey(phone);
    if (key.length >= 9 && !phones.has(key)) phones.set(key, String(phone).trim());
  }

  return {
    studentName: student?.nomPrenom ?? "",
    phones: [...phones.values()],
    parentUserIds: [...new Set(members.flatMap(member => member.memberUserId ? [member.memberUserId] : []))],
  };
}

export async function sendParentWhatsAppMessage(input: {
  schoolUserId: string;
  studentId?: string | null;
  message: string;
  eventType: string;
  phones?: string[];
}): Promise<{ sent: number; failed: number; total: number; channel: string; reason?: string }> {
  const contacts = input.phones?.length
    ? { studentName: "", phones: input.phones, parentUserIds: [] as string[] }
    : input.studentId
      ? await getParentContacts(input.schoolUserId, input.studentId)
      : { studentName: "", phones: [], parentUserIds: [] as string[] };

  const phones = [...new Set(contacts.phones.map(phone => phone.trim()).filter(Boolean))];
  if (!phones.length) return { sent: 0, failed: 0, total: 0, channel: "none", reason: "no_phone" };

  const result = await sendWhatsAppBulk({
    phoneNumbers: phones,
    message: input.message.slice(0, 1000),
    userId: input.schoolUserId,
  });

  await Promise.all(result.results.map(item =>
    db.insert(smsLogsTable).values({
      userId: input.schoolUserId,
      studentId: input.studentId ?? null,
      phone: item.phone,
      recipient: item.phone,
      message: input.message.slice(0, 1000),
      status: item.success ? "sent" : "failed",
      channel: "gateway",
      gatewayRef: item.sid ?? null,
      errorMsg: item.error ?? null,
      sentAt: item.success ? new Date() : null,
    }).catch(error => logger.warn({ error, phone: item.phone }, "Parent WhatsApp log insert failed")),
  ));

  logger.info({
    schoolUserId: input.schoolUserId,
    studentId: input.studentId,
    eventType: input.eventType,
    channel: result.channel,
    sent: result.sent,
    failed: result.failed,
  }, "Parent WhatsApp message dispatched");

  return { sent: result.sent, failed: result.failed, total: result.total, channel: result.channel };
}
