import { and, eq } from "drizzle-orm";
import {
  db,
  absencesTable,
  assessmentEventsTable,
  examHallsTable,
  examInvigilatorsTable,
  examSeatingAssignmentsTable,
  examSessionsTable,
  gradesTable,
  schoolInfoTable,
  schoolMembersTable,
  studentDailyAttendanceTable,
  studentsTable,
  timetableRoomsTable,
  timetableSlotsTable,
  timetableTeachersTable,
} from "../../shared/db.js";
import type { OfficialReport, ReportSheet } from "./officialReports.js";

function safeCell(value: string | number | null | undefined): string | number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const text = String(value);
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

function sheet(name: string, headers: string[], rows: Array<Array<string | number | null | undefined>>): ReportSheet {
  return { name: name.slice(0, 31), headers, rows: rows.map(row => row.map(safeCell)) };
}

function countBy<T>(items: T[], key: (item: T) => string): Array<{ key: string; count: number }> {
  const map = new Map<string, number>();
  for (const item of items) map.set(key(item), (map.get(key(item)) ?? 0) + 1);
  return [...map.entries()].map(([k, count]) => ({ key: k, count })).sort((a, b) => b.count - a.count || a.key.localeCompare(b.key, "ar"));
}

function avg(values: number[]): number | null {
  if (!values.length) return null;
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100;
}

function pct(part: number, total: number): number | null {
  return total > 0 ? Math.round((part / total) * 1000) / 10 : null;
}

export async function buildRgfReport(userId: string, annee: string): Promise<OfficialReport> {
  const [
    schoolRows,
    students,
    grades,
    absences,
    dailyAttendance,
    teachers,
    rooms,
    slots,
    members,
    sessions,
    halls,
    invigilators,
    seating,
    assessments,
  ] = await Promise.all([
    db.select({ nom: schoolInfoTable.nom, wilaya: schoolInfoTable.wilaya, commune: schoolInfoTable.commune }).from(schoolInfoTable).where(eq(schoolInfoTable.userId, userId)).limit(1),
    db.select().from(studentsTable).where(and(eq(studentsTable.userId, userId), eq(studentsTable.annee, annee))),
    db.select().from(gradesTable).where(and(eq(gradesTable.userId, userId), eq(gradesTable.annee, annee))),
    db.select().from(absencesTable).where(and(eq(absencesTable.userId, userId), eq(absencesTable.annee, annee))),
    db.select().from(studentDailyAttendanceTable).where(and(eq(studentDailyAttendanceTable.userId, userId), eq(studentDailyAttendanceTable.annee, annee))),
    db.select().from(timetableTeachersTable).where(eq(timetableTeachersTable.userId, userId)),
    db.select().from(timetableRoomsTable).where(eq(timetableRoomsTable.userId, userId)),
    db.select().from(timetableSlotsTable).where(and(eq(timetableSlotsTable.userId, userId), eq(timetableSlotsTable.annee, annee))),
    db.select({ role: schoolMembersTable.role }).from(schoolMembersTable).where(eq(schoolMembersTable.schoolUserId, userId)),
    db.select().from(examSessionsTable).where(and(eq(examSessionsTable.userId, userId), eq(examSessionsTable.annee, annee))),
    db.select().from(examHallsTable).where(and(eq(examHallsTable.userId, userId), eq(examHallsTable.annee, annee))),
    db.select().from(examInvigilatorsTable).where(and(eq(examInvigilatorsTable.userId, userId), eq(examInvigilatorsTable.annee, annee))),
    db.select().from(examSeatingAssignmentsTable).where(and(eq(examSeatingAssignmentsTable.userId, userId), eq(examSeatingAssignmentsTable.annee, annee))),
    db.select().from(assessmentEventsTable).where(and(eq(assessmentEventsTable.userId, userId), eq(assessmentEventsTable.annee, annee))),
  ]);

  const school = schoolRows[0];
  const schoolName = school?.nom?.trim() || "المؤسسة";
  const studentsTotal = students.length;
  const boys = students.filter(s => s.sexe === "M").length;
  const girls = students.filter(s => s.sexe === "F").length;
  const byNiveau = countBy(students, s => s.niveau || "غير محدد");
  const byClasse = countBy(students, s => s.classe || "بدون قسم");
  const byStatut = countBy(students, s => s.statut || "غير محدد");
  const byResultat = countBy(students, s => s.resultat || "بدون نتيجة");
  const repeaters = students.filter(s => s.statut === "redoublant" || s.resultat === "mustarrak").length;

  const numericScores = grades.map(g => Number(g.score)).filter(score => Number.isFinite(score));
  const passScores = numericScores.filter(score => score >= 10).length;
  const subjectScores = new Map<string, number[]>();
  for (const grade of grades) {
    const score = Number(grade.score);
    if (!Number.isFinite(score)) continue;
    const list = subjectScores.get(grade.subject) ?? [];
    list.push(score);
    subjectScores.set(grade.subject, list);
  }
  const subjectAverages = [...subjectScores.entries()]
    .map(([subject, scores]) => ({ subject, average: avg(scores) ?? 0, count: scores.length }))
    .sort((a, b) => b.average - a.average);

  const justifiedHours = absences.reduce((sum, row) => sum + (row.justifiedHours ?? 0), 0);
  const unjustifiedHours = absences.reduce((sum, row) => sum + (row.unjustifiedHours ?? 0), 0);
  const absentDays = dailyAttendance.filter(row => row.isAbsent).length;
  const dailyRows = dailyAttendance.length;

  const membersByRole = countBy(members, m => m.role || "staff");
  const teacherWorkload = new Map<string, number>();
  for (const slot of slots) {
    for (const teacherId of [slot.teacherId, slot.alternateTeacherId]) {
      if (!teacherId) continue;
      teacherWorkload.set(teacherId, (teacherWorkload.get(teacherId) ?? 0) + 1);
    }
  }
  const workloads = [...teacherWorkload.values()];
  const roomCapacity = rooms.reduce((sum, room) => sum + (room.capacity ?? 0), 0);
  const classesCount = new Set(slots.map(slot => slot.classe)).size;
  const subjectsCount = new Set(slots.map(slot => slot.subject)).size;

  const sheets: ReportSheet[] = [
    sheet("ملخص عام", ["البند", "القيمة"], [
      ["المؤسسة", schoolName],
      ["الولاية", school?.wilaya ?? ""],
      ["البلدية", school?.commune ?? ""],
      ["السنة الدراسية", annee],
      ["تاريخ الإصدار", new Date().toISOString().slice(0, 10)],
      ["إجمالي التلاميذ", studentsTotal],
      ["إجمالي الأساتذة", teachers.length],
      ["إجمالي القاعات/الأقسام", rooms.length],
      ["حصص الجدول", slots.length],
    ]),
    sheet("التلاميذ", ["المستوى", "العدد"], byNiveau.map(item => [item.key, item.count])),
    sheet("الأقسام", ["القسم", "العدد"], byClasse.slice(0, 80).map(item => [item.key, item.count])),
    sheet("النوع", ["النوع", "العدد", "النسبة %"], [
      ["ذكور", boys, pct(boys, studentsTotal)],
      ["إناث", girls, pct(girls, studentsTotal)],
    ]),
    sheet("الحالة والنتيجة", ["البند", "الحالة/النتيجة", "العدد"], [
      ...byStatut.map(item => ["الوضعية", item.key, item.count]),
      ...byResultat.map(item => ["النتيجة", item.key, item.count]),
      ["المعيدون/المستركون", "redoublant/mustarrak", repeaters],
    ]),
    sheet("النتائج", ["المادة", "المعدل", "عدد الدرجات"], subjectAverages.map(item => [item.subject, item.average, item.count])),
    sheet("إحصائيات النقاط", ["البند", "القيمة"], [
      ["عدد الدرجات", numericScores.length],
      ["معدل النقاط العام", avg(numericScores)],
      ["نسبة النجاح >= 10", pct(passScores, numericScores.length)],
      ["عدد المواد", subjectsCount],
      ["عدد الأقسام في الجدول", classesCount],
    ]),
    sheet("الغيابات", ["البند", "القيمة"], [
      ["ساعات الغياب المبررة", justifiedHours],
      ["ساعات الغياب غير المبررة", unjustifiedHours],
      ["أيام الغياب المسجلة", absentDays],
      ["سجلات الحضور اليومية", dailyRows],
      ["نسبة الغياب من السجلات", pct(absentDays, dailyRows)],
    ]),
    sheet("الموارد البشرية", ["البند", "القيمة"], [
      ["أساتذة الجدول", teachers.length],
      ["أعضاء المؤسسة", members.length],
      ["أدنى حصص/أستاذ", workloads.length ? Math.min(...workloads) : null],
      ["أقصى حصص/أستاذ", workloads.length ? Math.max(...workloads) : null],
      ["معدل حصص/أستاذ", avg(workloads)],
      ["عدد القاعات", rooms.length],
      ["طاقة القاعات", roomCapacity],
      ...membersByRole.map(item => [`عضو: ${item.key}`, item.count]),
    ]),
    sheet("الاختبارات", ["البند", "القيمة"], [
      ["جلسات الاختبارات", sessions.length],
      ["قاعات الامتحانات", halls.length],
      ["طاقة قاعات الامتحانات", halls.reduce((sum, hall) => sum + (hall.capacity ?? 0), 0)],
      ["مهام الحراسة", invigilators.length],
      ["تفويج التلاميذ", seating.length],
    ]),
    sheet("التقييم والمواعيد", ["البند", "القيمة"], [
      ["مواعيد الفروض/الاختبارات", assessments.length],
      ["مواد الجدول", subjectsCount],
      ["أقسام الجدول", classesCount],
    ]),
  ];

  return {
    type: "rgf",
    title: `التقرير العام لسير المؤسسة — ${schoolName} — ${annee}`,
    generatedAt: new Date().toISOString(),
    params: { annee, schoolName },
    sheets,
  } as OfficialReport;
}
