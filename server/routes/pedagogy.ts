import crypto from "node:crypto";
import OpenAI from "openai";
import { Router } from "express";
import { and, eq, inArray, sql } from "drizzle-orm";
import {
  db,
  gradesTable,
  schoolMembersTable,
  studentsTable,
  studentDailyAttendanceTable,
} from "../../shared/db.js";
import { getUserGroqKey } from "../lib/groq-key.js";
import { notifyParentOfAbsence } from "../services/absenceAlerts.js";
import { notifyParentAccount } from "../services/parentNotifications.js";
import { getIO } from "../socket/index.js";
import { logger } from "../lib/logger.js";

const router = Router();

type RemarkLanguage = "ar" | "fr" | "both";

function remarkFor(average: number, attendanceRate: number, behaviorScore: number, language: RemarkLanguage) {
  const attendanceWarning = attendanceRate < 90;
  const behaviorWarning = behaviorScore <= 2;
  let ar: string;
  let fr: string;

  if (average >= 16) {
    ar = "ممتاز، نتائج باهرة واصل على هذا المنوال";
    fr = "Excellent travail, résultats remarquables. Continuez ainsi.";
  } else if (average >= 14) {
    ar = "عمل جيد جداً، بإمكانك تحقيق الأفضل";
    fr = "Très bon travail, vous pouvez encore progresser.";
  } else if (average >= 12) {
    ar = "عمل حسن، واصل الاجتهاد لتحسين نتائجك";
    fr = "Bon travail, poursuivez vos efforts pour progresser.";
  } else if (average >= 10 && attendanceWarning) {
    ar = "نتائج متوسطة، يحتاج للتثبيت والمواظبة على الحضور";
    fr = "Résultats moyens, consolidez vos acquis et soyez assidu.";
  } else if (average >= 10) {
    ar = "نتائج مقبولة، مزيداً من الاجتهاد لتحقيق تقدم أفضل";
    fr = "Résultats satisfaisants, poursuivez vos efforts pour progresser.";
  } else if (behaviorWarning) {
    ar = "نتائج ضعيفة، يتطلب تداركاً عاجلاً ومتابعة جادة من الولي";
    fr = "Résultats insuffisants, un rattrapage urgent et un suivi familial sérieux sont nécessaires.";
  } else {
    ar = "نتائج ضعيفة، يتطلب تداركاً عاجلاً ومواظبة أكبر";
    fr = "Résultats insuffisants, un rattrapage urgent et davantage d'assiduité sont nécessaires.";
  }

  return language === "ar" ? ar : language === "fr" ? fr : { ar, fr };
}

router.post("/v1/pedagogy/generate-remarks", async (req, res): Promise<void> => {
  if (!req.isAuthenticated() || !req.user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { subjectAverages, attendanceRate, behavioralScore, language = "both" } = req.body ?? {};
  if (!Array.isArray(subjectAverages) || subjectAverages.length === 0 || subjectAverages.length > 100 ||
      typeof attendanceRate !== "number" || !Number.isFinite(attendanceRate) || attendanceRate < 0 || attendanceRate > 100 ||
      typeof behavioralScore !== "number" || !Number.isInteger(behavioralScore) || behavioralScore < 1 || behavioralScore > 5 ||
      !["ar", "fr", "both"].includes(language) ||
      subjectAverages.some((item: any) => !item || typeof item.subject !== "string" || !item.subject.trim() ||
        ![1, 2, 3].includes(item.trimester) || typeof item.average !== "number" ||
        !Number.isFinite(item.average) || item.average < 0 || item.average > 20)) {
    res.status(400).json({ error: "Invalid remarks input" });
    return;
  }

  res.json({
    remarks: subjectAverages.map((item: { subject: string; trimester: number; average: number }) => ({
      subject: item.subject,
      trimester: item.trimester,
      average: item.average,
      remark: remarkFor(item.average, attendanceRate, behavioralScore, language),
    })),
    rules: { highAbsenceThreshold: 90, behaviorWarningThreshold: 2 },
  });
});

router.post("/v1/ai/generate-quiz", async (req, res): Promise<void> => {
  if (!req.isAuthenticated() || !req.user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { gradeLevel, subject, lessonTopic, difficulty, questionCount } = req.body ?? {};
  if (typeof gradeLevel !== "string" || !gradeLevel.trim() || gradeLevel.length > 40 ||
      typeof subject !== "string" || !subject.trim() || subject.length > 100 ||
      typeof lessonTopic !== "string" || !lessonTopic.trim() || lessonTopic.length > 300 ||
      !["Easy", "Medium", "Hard"].includes(difficulty) ||
      !Number.isInteger(questionCount) || questionCount < 3 || questionCount > 30) {
    res.status(400).json({ error: "Invalid quiz input" });
    return;
  }

  let apiKey: string | null;
  try {
    apiKey = await getUserGroqKey(req.user.id);
  } catch (error) {
    req.log.error({ error }, "Unable to read quiz generation API key");
    res.status(503).json({ error: "تعذر قراءة مفتاح الذكاء الاصطناعي" });
    return;
  }
  if (!apiKey) { res.status(400).json({ error: "أضف مفتاح Groq من إعدادات المساعد أولاً" }); return; }

  try {
    const client = new OpenAI({ apiKey, baseURL: "https://api.groq.com/openai/v1" });
    const completion = await client.chat.completions.create({
      model: "openai/gpt-oss-120b",
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: "You are an Algerian middle-school curriculum assessment specialist. Produce valid JSON only. Stay strictly within the stated grade, subject and lesson topic; do not invent official ministry claims. Write clear Arabic and French labels where appropriate. Include exactly the requested number of questions, divided across three sections: exercise1 for direct knowledge retrieval, exercise2 for reasoning/problem solving, and integrationSituation with an evaluation grid. Include a complete answerKey and a points scale totaling 20. Every question must have points and the answer key must map to every question.",
        },
        {
          role: "user",
          content: JSON.stringify({ gradeLevel: gradeLevel.trim(), subject: subject.trim(), lessonTopic: lessonTopic.trim(), difficulty, questionCount }),
        },
      ],
    });
    const content = completion.choices[0]?.message.content;
    if (!content) throw new Error("AI returned an empty quiz");
    const quiz = JSON.parse(content);
    if (!quiz.exercise1 || !quiz.exercise2 || !quiz.integrationSituation || !quiz.answerKey) {
      throw new Error("AI returned an incomplete quiz");
    }
    res.json({ quiz, gradeLevel: gradeLevel.trim(), subject: subject.trim(), lessonTopic: lessonTopic.trim(), difficulty });
  } catch (error) {
    req.log.error({ error, userId: req.user.id }, "Quiz generation failed");
    res.status(502).json({ error: "تعذر إنشاء الاختبار حالياً" });
  }
});

function isIsoTimestamp(value: unknown): value is string {
  return typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value) &&
    Number.isFinite(Date.parse(value));
}

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(`${value}T00:00:00.000Z`)) &&
    new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value;
}

function academicYear(date: Date): string {
  const year = date.getUTCFullYear();
  return date.getUTCMonth() >= 8 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
}

router.put("/v1/attendance/sync", async (req, res): Promise<void> => {
  if (!req.isAuthenticated() || !req.user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { attendanceDate, annee, entries } = req.body ?? {};
  if (Array.isArray(entries)) {
    if (!isIsoDate(attendanceDate) || entries.length === 0 || entries.length > 1000 ||
        (annee !== undefined && (typeof annee !== "string" || !/^\d{4}-\d{4}$/.test(annee))) ||
        entries.some((entry: any) => !entry || typeof entry.studentId !== "string" || !entry.studentId ||
          typeof entry.status !== "string" || !entry.status.trim() || entry.status.length > 100 || typeof entry.isAbsent !== "boolean") ||
        new Set(entries.map((entry: any) => entry.studentId)).size !== entries.length) {
      res.status(400).json({ error: "Invalid attendance sync entries" });
      return;
    }
    const schoolUserId = req.memberContext?.schoolUserId ?? req.user.id;
    const studentIds = entries.map((entry: { studentId: string }) => entry.studentId) as string[];
    const ownedStudents = await db.select({ id: studentsTable.id }).from(studentsTable)
      .where(and(eq(studentsTable.userId, schoolUserId), inArray(studentsTable.id, studentIds)));
    if (ownedStudents.length !== studentIds.length) {
      res.status(400).json({ error: "One or more students do not belong to this school" });
      return;
    }
    const year = typeof annee === "string" ? annee : academicYear(new Date(`${attendanceDate}T00:00:00.000Z`));
    const previouslyAbsent = await db.select({ studentId: studentDailyAttendanceTable.studentId })
      .from(studentDailyAttendanceTable)
      .where(and(
        eq(studentDailyAttendanceTable.userId, schoolUserId),
        eq(studentDailyAttendanceTable.attendanceDate, attendanceDate),
        eq(studentDailyAttendanceTable.isAbsent, true),
        inArray(studentDailyAttendanceTable.studentId, studentIds),
      ));
    const previousIds = new Set(previouslyAbsent.map(row => row.studentId));
    await db.insert(studentDailyAttendanceTable).values(entries.map((entry: { studentId: string; status: string; isAbsent: boolean }) => ({
      id: crypto.randomBytes(16).toString("hex"),
      userId: schoolUserId,
      studentId: entry.studentId,
      attendanceDate,
      annee: year,
      status: entry.status.trim(),
      isAbsent: entry.isAbsent,
    }))).onConflictDoUpdate({
      target: [studentDailyAttendanceTable.userId, studentDailyAttendanceTable.studentId, studentDailyAttendanceTable.attendanceDate],
      set: { annee: year, status: sql`excluded.status`, isAbsent: sql`excluded.is_absent` },
    });
    const newAbsentees = entries.filter((entry: { studentId: string; isAbsent: boolean }) => entry.isAbsent && !previousIds.has(entry.studentId));
    await Promise.all(newAbsentees.map((entry: { studentId: string }) => notifyParentOfAbsence({
      schoolUserId, studentId: entry.studentId, annee: year, date: attendanceDate,
    }).catch(error => logger.error({ error, studentId: entry.studentId, attendanceDate }, "Synced attendance alert failed"))));
    try {
      getIO().to(`school:${schoolUserId}`).emit("attendance:updated", {
        attendanceDate,
        entries: entries.map((entry: { studentId: string; isAbsent: boolean }) => ({ studentId: entry.studentId, isAbsent: entry.isAbsent })),
      });
    } catch (error) {
      logger.warn({ error, schoolUserId }, "Attendance websocket event could not be emitted");
    }
    res.json({ success: true, attendanceDate, synced: entries.length, notified: newAbsentees.length });
    return;
  }

  const { class_id: classId, timestamp, teacher_id: teacherId, absentees } = req.body ?? {};
  if (typeof classId !== "string" || !classId.trim() || classId.length > 64 || !isIsoTimestamp(timestamp) ||
      (teacherId !== undefined && (typeof teacherId !== "string" || teacherId.length > 128)) ||
      !Array.isArray(absentees) || absentees.length > 500 ||
      absentees.some((id: unknown) => typeof id !== "string" || !id || id.length > 64) ||
      new Set(absentees).size !== absentees.length) {
    res.status(400).json({ error: "Invalid attendance sync payload" });
    return;
  }
  if (teacherId && teacherId !== req.user.id && teacherId !== req.memberContext?.memberId) {
    res.status(403).json({ error: "Teacher does not match the authenticated account" });
    return;
  }

  const schoolUserId = req.memberContext?.schoolUserId ?? req.user.id;
  const timestampAttendanceDate = timestamp.slice(0, 10);
  const year = academicYear(new Date(timestamp));
  const roster = await db.select({ id: studentsTable.id })
    .from(studentsTable)
    .where(and(eq(studentsTable.userId, schoolUserId), eq(studentsTable.classe, classId.trim())));
  if (!roster.length || absentees.some((id: string) => !roster.some(student => student.id === id))) {
    res.status(400).json({ error: "Class or one or more students do not belong to this school" });
    return;
  }

  const previouslyAbsent = absentees.length
    ? await db.select({ studentId: studentDailyAttendanceTable.studentId })
      .from(studentDailyAttendanceTable)
      .where(and(
        eq(studentDailyAttendanceTable.userId, schoolUserId),
        eq(studentDailyAttendanceTable.attendanceDate, timestampAttendanceDate),
        eq(studentDailyAttendanceTable.isAbsent, true),
        inArray(studentDailyAttendanceTable.studentId, absentees),
      ))
    : [];
  const previousIds = new Set(previouslyAbsent.map(row => row.studentId));
  const newAbsentees = absentees.filter((id: string) => !previousIds.has(id));

  if (absentees.length) {
    await db.insert(studentDailyAttendanceTable).values(absentees.map((studentId: string) => ({
      id: crypto.randomBytes(16).toString("hex"),
      userId: schoolUserId,
      studentId,
      attendanceDate: timestampAttendanceDate,
      annee: year,
      status: "ABSENT",
      isAbsent: true,
    }))).onConflictDoUpdate({
      target: [studentDailyAttendanceTable.userId, studentDailyAttendanceTable.studentId, studentDailyAttendanceTable.attendanceDate],
      set: { annee: year, status: "ABSENT", isAbsent: true },
    });
  }

  await Promise.all(newAbsentees.map(studentId => notifyParentOfAbsence({
    schoolUserId,
    studentId,
    annee: year,
    date: timestampAttendanceDate,
  }).catch(error => logger.error({ error, studentId, attendanceDate: timestampAttendanceDate }, "Synced attendance alert failed"))));

  try {
    getIO().to(`school:${schoolUserId}`).emit("attendance:updated", {
      classId: classId.trim(), attendanceDate: timestampAttendanceDate, absentees,
    });
  } catch (error) {
    logger.warn({ error, schoolUserId }, "Attendance websocket event could not be emitted");
  }
  res.json({ success: true, attendanceDate: timestampAttendanceDate, synced: absentees.length, notified: newAbsentees.length });
});

router.post("/v1/notifications/disciplinary", async (req, res): Promise<void> => {
  if (!req.isAuthenticated() || !req.user) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (req.memberContext?.role === "parent") { res.status(403).json({ error: "School staff only" }); return; }
  const { student_id: studentId, template_ar: message } = req.body ?? {};
  if (typeof studentId !== "string" || !studentId || typeof message !== "string" || !message.trim() || message.length > 1200) {
    res.status(400).json({ error: "Invalid disciplinary notification" });
    return;
  }
  const schoolUserId = req.memberContext?.schoolUserId ?? req.user.id;
  const [student] = await db.select({ id: studentsTable.id, name: studentsTable.nomPrenom })
    .from(studentsTable)
    .where(and(eq(studentsTable.id, studentId), eq(studentsTable.userId, schoolUserId)))
    .limit(1);
  if (!student) { res.status(404).json({ error: "Student not found" }); return; }

  const timestamp = new Date().toISOString();
  const linkedParents = await db.select({ memberUserId: schoolMembersTable.memberUserId })
    .from(schoolMembersTable)
    .where(and(
      eq(schoolMembersTable.schoolUserId, schoolUserId),
      eq(schoolMembersTable.linkedStudentId, student.id),
      eq(schoolMembersTable.role, "parent"),
    ));
  const parentUserIds = [...new Set(linkedParents.flatMap(parent => parent.memberUserId ? [parent.memberUserId] : []))];
  const portalResults = await Promise.allSettled(parentUserIds.map(parentUserId => notifyParentAccount({
    userId: parentUserId,
    title: "إشعار متابعة تربوية",
    body: message.trim(),
    type: "warning",
    url: "/my-child#parent-notifications",
    metadata: { studentId: student.id, eventType: "DISCIPLINE_ALERT", timestamp },
  })));
  const portalDeliveries = portalResults.flatMap(result => result.status === "fulfilled" ? [result.value] : []);
  for (const result of portalResults) {
    if (result.status === "rejected") req.log.error({ error: result.reason, studentId: student.id }, "Parent portal disciplinary alert failed");
  }

  res.json({
    student_name: student.name,
    event_type: "DISCIPLINE_ALERT",
    timestamp,
    template_ar: message.trim(),
    sent: portalDeliveries.length > 0,
    portalRecipients: portalDeliveries.length,
    pushSent: portalDeliveries.reduce((total, delivery) => total + delivery.pushSent, 0),
  });
});

function nextSchoolDay(date: string): string {
  const next = new Date(`${date}T00:00:00.000Z`);
  do { next.setUTCDate(next.getUTCDate() + 1); } while (next.getUTCDay() === 5 || next.getUTCDay() === 6);
  return next.toISOString().slice(0, 10);
}

router.get("/v1/pedagogy/early-warnings", async (req, res): Promise<void> => {
  if (!req.isAuthenticated() || !req.user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const annee = typeof req.query.annee === "string" ? req.query.annee : undefined;
  const schoolUserId = req.memberContext?.schoolUserId ?? req.user.id;
  const gradeConditions = [eq(gradesTable.userId, schoolUserId), inArray(gradesTable.trimestre, [1, 2])];
  if (annee) gradeConditions.push(eq(gradesTable.annee, annee));
  const grades = await db.select({ studentId: gradesTable.studentId, trimestre: gradesTable.trimestre, subject: gradesTable.subject, score: gradesTable.score })
    .from(gradesTable).where(and(...gradeConditions));
  const attendance = await db.select({ studentId: studentDailyAttendanceTable.studentId, date: studentDailyAttendanceTable.attendanceDate, status: studentDailyAttendanceTable.status, isAbsent: studentDailyAttendanceTable.isAbsent })
    .from(studentDailyAttendanceTable)
    .where(annee ? and(eq(studentDailyAttendanceTable.userId, schoolUserId), eq(studentDailyAttendanceTable.annee, annee)) : eq(studentDailyAttendanceTable.userId, schoolUserId));

  const averages = new Map<string, Map<number, number>>();
  const buckets = new Map<string, Map<number, Map<string, number[]>>>();
  for (const grade of grades) {
    if (grade.subject === "__avg__") {
      const averageMap = averages.get(grade.studentId) ?? new Map();
      averageMap.set(grade.trimestre, Number(grade.score));
      averages.set(grade.studentId, averageMap);
      continue;
    }
    const trimesterMap = buckets.get(grade.studentId) ?? new Map();
    const subjectMap = trimesterMap.get(grade.trimestre) ?? new Map();
    const scores = subjectMap.get(grade.subject) ?? [];
    scores.push(Number(grade.score));
    subjectMap.set(grade.subject, scores);
    trimesterMap.set(grade.trimestre, subjectMap);
    buckets.set(grade.studentId, trimesterMap);
  }
  for (const [studentId, trimesterMap] of buckets) {
    const averageMap = averages.get(studentId) ?? new Map();
    for (const [trimester, subjects] of trimesterMap) {
      if (averageMap.has(trimester)) continue;
      const subjectAverages = [...subjects.values()].map(scores => scores.reduce((sum, score) => sum + score, 0) / scores.length);
      if (subjectAverages.length) averageMap.set(trimester, subjectAverages.reduce((sum, score) => sum + score, 0) / subjectAverages.length);
    }
    averages.set(studentId, averageMap);
  }

  const absencesByStudent = new Map<string, string[]>();
  for (const row of attendance) {
    if (!row.isAbsent || /مبرر|مبررة|معذور|justifi|excuse|غ\/م/i.test(row.status)) continue;
    const dates = absencesByStudent.get(row.studentId) ?? [];
    dates.push(row.date);
    absencesByStudent.set(row.studentId, dates);
  }

  const warnings: Array<Record<string, unknown>> = [];
  const students = await db.select({ id: studentsTable.id, name: studentsTable.nomPrenom, niveau: studentsTable.niveau, classe: studentsTable.classe })
    .from(studentsTable).where(eq(studentsTable.userId, schoolUserId));
  for (const student of students) {
    const studentAverages = averages.get(student.id);
    const first = studentAverages?.get(1);
    const second = studentAverages?.get(2);
    const drop = first !== undefined && second !== undefined ? first - second : 0;
    const unexcusedDates = [...new Set(absencesByStudent.get(student.id) ?? [])].sort();
    let consecutive = 0;
    let maxConsecutive = 0;
    for (let index = 0; index < unexcusedDates.length; index++) {
      consecutive = index > 0 && nextSchoolDay(unexcusedDates[index - 1]!) === unexcusedDates[index] ? consecutive + 1 : 1;
      maxConsecutive = Math.max(maxConsecutive, consecutive);
    }
    const risk = drop >= 2 ? "CRITICAL_DROP" : maxConsecutive >= 3 ? "ATTENDANCE_WARNING" : second !== undefined && second < 10 ? "ACADEMIC_RISK" : null;
    if (risk) warnings.push({
      studentId: student.id,
      studentName: student.name,
      niveau: student.niveau,
      classe: student.classe,
      risk,
      trimester1Average: first ?? null,
      trimester2Average: second ?? null,
      averageDrop: Number(drop.toFixed(2)),
      consecutiveUnexcusedDays: maxConsecutive,
      intervention: risk === "CRITICAL_DROP" ? "مراجعة نتائج التلميذ والتواصل مع الولي" : risk === "ATTENDANCE_WARNING" ? "التواصل العاجل مع الولي ومتابعة المواظبة" : "برمجة متابعة تربوية ودعم في المواد المتعثرة",
    });
  }
  res.json({ warnings, total: warnings.length });
});

export default router;