import crypto from "crypto";
import { Router, type IRouter } from "express";
import multer from "multer";
import * as XLSX from "xlsx";
import { eq, and, inArray, ne } from "drizzle-orm";
import { db, studentsTable, gradesTable, orientationWishesTable, orientationPlansTable, orientationTransfersTable, schoolInfoTable, feederSchoolsTable } from "../../shared/db.js";
import { ImportOrientationWishesResponse, UpsertOrientationPlanBody, PublishOrientationPlanBody, OrganizeIncomingGroupsBody } from "../../shared/schemas.js";
import { getSubjectsForLevel, calcWeightedAvg } from "../../shared/subjects.js";
import type { Niveau } from "../../shared/types.js";
import { getSchoolStageForRequest } from "../config/school-stage.js";

const router: IRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

router.get("/orientation/secondary-schools", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (getSchoolStageForRequest(req) !== "moyen") {
    res.status(403).json({ error: "قائمة الثانويات متاحة لحسابات المتوسط فقط" });
    return;
  }
  const schools = await db.select({
    userId: schoolInfoTable.userId,
    name: schoolInfoTable.nom,
    wilaya: schoolInfoTable.wilaya,
    commune: schoolInfoTable.commune,
  }).from(schoolInfoTable)
    .where(and(eq(schoolInfoTable.stage, "lycee"), ne(schoolInfoTable.userId, req.user!.id)));
  res.json(schools);
});

router.get("/orientation/incoming", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (getSchoolStageForRequest(req) !== "lycee") {
    res.status(403).json({ error: "قوائم الاستقبال متاحة لحسابات الثانوي فقط" });
    return;
  }
  const annee = String(req.query.annee ?? "").trim();
  if (!/^\d{4}-\d{4}$/.test(annee)) { res.status(400).json({ error: "السنة الدراسية غير صالحة" }); return; }

  const incoming = await db.select({
    id: orientationTransfersTable.id,
    studentId: orientationTransfersTable.destinationStudentId,
    studentName: studentsTable.nomPrenom,
    dateNaissance: studentsTable.dateNaissance,
    sexe: studentsTable.sexe,
    parentPhone: studentsTable.parentPhone,
    annualAvg: orientationTransfersTable.annualAvg,
    stream: orientationTransfersTable.stream,
    destinationName: orientationTransfersTable.destinationName,
    sourceUserId: orientationTransfersTable.sourceUserId,
    sourceSchoolName: schoolInfoTable.nom,
    classe: studentsTable.classe,
  }).from(orientationTransfersTable)
    .innerJoin(studentsTable, eq(studentsTable.id, orientationTransfersTable.destinationStudentId))
    .leftJoin(schoolInfoTable, eq(schoolInfoTable.userId, orientationTransfersTable.sourceUserId))
    .where(and(
      eq(orientationTransfersTable.destinationUserId, req.user!.id),
      eq(orientationTransfersTable.annee, annee),
    ));
  res.json(incoming.map(student => ({ ...student, annualAvg: student.annualAvg === null ? null : Number(student.annualAvg) })));
});

router.get("/orientation/incoming/linked-schools", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (getSchoolStageForRequest(req) !== "lycee") {
    res.status(403).json({ error: "الروافد متاحة لحسابات الثانوي فقط" });
    return;
  }
  const annee = String(req.query.annee ?? "").trim();
  if (!/^\d{4}-\d{4}$/.test(annee)) { res.status(400).json({ error: "السنة الدراسية غير صالحة" }); return; }

  const linkedSchools = await db.select({
    userId: feederSchoolsTable.middleSchoolUserId,
    name: schoolInfoTable.nom,
    wilaya: schoolInfoTable.wilaya,
    commune: schoolInfoTable.commune,
  }).from(feederSchoolsTable)
    .innerJoin(schoolInfoTable, eq(schoolInfoTable.userId, feederSchoolsTable.middleSchoolUserId))
    .where(and(
      eq(feederSchoolsTable.highSchoolUserId, req.user!.id),
      eq(feederSchoolsTable.annee, annee),
      eq(schoolInfoTable.stage, "moyen"),
    ));

  if (!linkedSchools.length) { res.json([]); return; }
  const middleSchoolIds = linkedSchools.map(school => school.userId);
  const [students, plans, transfers] = await Promise.all([
    db.select({ userId: studentsTable.userId }).from(studentsTable).where(and(
      inArray(studentsTable.userId, middleSchoolIds),
      eq(studentsTable.annee, annee),
      eq(studentsTable.niveau, "4AM" as Niveau),
    )),
    db.select().from(orientationPlansTable).where(and(
      inArray(orientationPlansTable.userId, middleSchoolIds),
      eq(orientationPlansTable.annee, annee),
    )),
    db.select({
      sourceUserId: orientationTransfersTable.sourceUserId,
    }).from(orientationTransfersTable)
      .where(and(
        eq(orientationTransfersTable.destinationUserId, req.user!.id),
        eq(orientationTransfersTable.annee, annee),
      inArray(orientationTransfersTable.sourceUserId, middleSchoolIds),
    )),
  ]);

  const expectedBySchool = new Map<string, number>();
  for (const student of students) expectedBySchool.set(student.userId, (expectedBySchool.get(student.userId) ?? 0) + 1);

  const planBySchool = new Map<string, typeof plans[number]>();
  for (const plan of plans) {
    for (const destination of plan.destinations) {
      if (destination.schoolUserId === req.user!.id) planBySchool.set(plan.userId, plan);
    }
  }

  const receivedBySchool = new Map<string, number>();
  for (const transfer of transfers) receivedBySchool.set(
    transfer.sourceUserId,
    (receivedBySchool.get(transfer.sourceUserId) ?? 0) + 1,
  );

  res.json(linkedSchools.map(school => {
    const plan = planBySchool.get(school.userId);
    const status = plan?.status === "published" ? "sent" : plan ? "pending" : "not_sent";
    return {
      ...school,
      expectedIncomingStudents: status === "sent"
        ? receivedBySchool.get(school.userId) ?? 0
        : expectedBySchool.get(school.userId) ?? 0,
      dataStatus: status,
    };
  }));
});

router.post("/orientation/incoming/organize", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (getSchoolStageForRequest(req) !== "lycee") {
    res.status(403).json({ error: "تنظيم الأفواج متاح لحسابات الثانوي فقط" });
    return;
  }
  const parsed = OrganizeIncomingGroupsBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "عدد الأفواج غير صالح", details: parsed.error.issues }); return; }

  const { annee } = parsed.data;
  const incoming = await db.select({
    studentId: orientationTransfersTable.destinationStudentId,
    stream: orientationTransfersTable.stream,
    annualAvg: orientationTransfersTable.annualAvg,
  }).from(orientationTransfersTable).where(and(
    eq(orientationTransfersTable.destinationUserId, req.user!.id),
    eq(orientationTransfersTable.annee, annee),
  ));
  const scienceStudents = incoming.filter(student => student.stream === "science")
    .sort((a, b) => Number(b.annualAvg ?? 0) - Number(a.annualAvg ?? 0) || a.studentId.localeCompare(b.studentId));
  const artsStudents = incoming.filter(student => student.stream === "arts")
    .sort((a, b) => Number(b.annualAvg ?? 0) - Number(a.annualAvg ?? 0) || a.studentId.localeCompare(b.studentId));

  if ((scienceStudents.length && parsed.data.scienceGroups === 0) || (artsStudents.length && parsed.data.artsGroups === 0)) {
    res.status(400).json({ error: "حدد عدد الأفواج لكل جذع يوجد به تلاميذ وافدون" });
    return;
  }

  const groups = [
    { students: scienceStudents, count: parsed.data.scienceGroups, label: "علوم" },
    { students: artsStudents, count: parsed.data.artsGroups, label: "آداب" },
  ];
  await db.transaction(async tx => {
    for (const group of groups) {
      const byClass = new Map<string, string[]>();
      group.students.forEach((student, index) => {
        const classe = `${group.label} ${index % group.count + 1}`;
        const studentIds = byClass.get(classe) ?? [];
        studentIds.push(student.studentId);
        byClass.set(classe, studentIds);
      });
      for (const [classe, studentIds] of byClass) {
        await tx.update(studentsTable).set({ classe }).where(and(
          eq(studentsTable.userId, req.user!.id),
          inArray(studentsTable.id, studentIds),
        ));
      }
    }
  });

  res.json({
    assigned: incoming.length,
    groups: groups.map(group => ({
      stream: group.label,
      count: group.count,
      students: group.students.length,
    })),
  });
});

router.get("/orientation/plans/:annee", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const annee = String(req.params.annee ?? "").trim();
  if (!/^\d{4}-\d{4}$/.test(annee)) { res.status(400).json({ error: "السنة الدراسية غير صالحة" }); return; }
  if (getSchoolStageForRequest(req) !== "moyen") { res.status(403).json({ error: "إصدار قرارات التوجيه متاح لحسابات المتوسط فقط" }); return; }

  const [plan] = await db.select().from(orientationPlansTable)
    .where(and(eq(orientationPlansTable.userId, req.user!.id), eq(orientationPlansTable.annee, annee)));
  res.json(plan ?? { annee, destinations: [], status: "draft", assignments: [], publishedAt: null });
});

router.put("/orientation/plans", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const parsed = UpsertOrientationPlanBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "بيانات الخريطة غير صالحة", details: parsed.error.issues }); return; }
  if (getSchoolStageForRequest(req) !== "moyen") { res.status(403).json({ error: "إعداد خريطة التوجيه متاح لحسابات المتوسط فقط" }); return; }

  const userId = req.user!.id;
  const { annee, destinations } = parsed.data;
  const schoolUserIds = [...new Set(destinations.map(destination => destination.schoolUserId))];
  if (schoolUserIds.length) {
    const schools = await db.select({
      userId: schoolInfoTable.userId,
      name: schoolInfoTable.nom,
    }).from(schoolInfoTable).where(and(
      eq(schoolInfoTable.stage, "lycee"),
      inArray(schoolInfoTable.userId, schoolUserIds),
    ));
    if (schools.length !== schoolUserIds.length || schoolUserIds.includes(userId)) {
      res.status(400).json({ error: "تأكد من اختيار حسابات ثانويات مستقبلة صحيحة" });
      return;
    }
    const schoolsById = new Map(schools.map(school => [school.userId, school]));
    for (const destination of destinations) {
      destination.name = schoolsById.get(destination.schoolUserId)!.name;
    }
  }
  const [existing] = await db.select().from(orientationPlansTable)
    .where(and(eq(orientationPlansTable.userId, userId), eq(orientationPlansTable.annee, annee)));
  if (existing?.status === "published") {
    res.status(409).json({ error: "تم اعتماد التوجيه لهذه السنة ولا يمكن تعديل الخريطة" });
    return;
  }

  if (existing) {
    const [updated] = await db.transaction(async tx => {
      const [savedPlan] = await tx.update(orientationPlansTable)
        .set({ destinations, updatedAt: new Date() })
        .where(and(eq(orientationPlansTable.id, existing.id), eq(orientationPlansTable.status, "draft")))
        .returning();
      if (savedPlan) {
        await tx.delete(feederSchoolsTable).where(and(
          eq(feederSchoolsTable.middleSchoolUserId, userId),
          eq(feederSchoolsTable.annee, annee),
        ));
        if (destinations.length) await tx.insert(feederSchoolsTable).values(destinations.map(destination => ({
          id: crypto.randomUUID(),
          middleSchoolUserId: userId,
          highSchoolUserId: destination.schoolUserId,
          annee,
        }))).onConflictDoNothing();
      }
      return [savedPlan];
    });
    if (!updated) { res.status(409).json({ error: "تعذر تعديل خريطة معتمدة" }); return; }
    res.json(updated);
    return;
  }

  const [created] = await db.transaction(async tx => {
    const [plan] = await tx.insert(orientationPlansTable).values({
      id: crypto.randomUUID(),
      userId,
      annee,
      destinations,
      status: "draft",
      assignments: [],
    }).returning();
    if (destinations.length) {
      await tx.insert(feederSchoolsTable).values(destinations.map(destination => ({
        id: crypto.randomUUID(),
        middleSchoolUserId: userId,
        highSchoolUserId: destination.schoolUserId,
        annee,
      }))).onConflictDoNothing();
    }
    return [plan];
  });
  res.json(created);
});

router.post("/orientation/plans/:annee/publish", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const annee = String(req.params.annee ?? "").trim();
  if (!/^\d{4}-\d{4}$/.test(annee)) { res.status(400).json({ error: "السنة الدراسية غير صالحة" }); return; }
  if (getSchoolStageForRequest(req) !== "moyen") { res.status(403).json({ error: "اعتماد قرارات التوجيه متاح لحسابات المتوسط فقط" }); return; }
  const parsed = PublishOrientationPlanBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "قائمة التوجيه غير صالحة", details: parsed.error.issues }); return; }

  const userId = req.user!.id;
  const [plan] = await db.select().from(orientationPlansTable)
    .where(and(eq(orientationPlansTable.userId, userId), eq(orientationPlansTable.annee, annee)));
  if (!plan) { res.status(409).json({ error: "احفظ الخريطة التربوية قبل اعتماد التوجيه" }); return; }
  if (plan.status === "published") { res.status(409).json({ error: "تم اعتماد التوجيه مسبقاً" }); return; }

  const assignments = parsed.data.assignments;
  const studentIds = assignments.map(assignment => assignment.studentId);
  if (new Set(studentIds).size !== studentIds.length) {
    res.status(400).json({ error: "يوجد تلميذ مكرر في قائمة التوجيه" });
    return;
  }

  const destinationUserIds = [...new Set(plan.destinations.map(destination => destination.schoolUserId))];
  const registeredDestinations = destinationUserIds.length
    ? await db.select({ userId: schoolInfoTable.userId }).from(schoolInfoTable).where(and(
      eq(schoolInfoTable.stage, "lycee"),
      inArray(schoolInfoTable.userId, destinationUserIds),
    ))
    : [];
  if (registeredDestinations.length !== destinationUserIds.length) {
    res.status(409).json({ error: "تغيرت بيانات إحدى الثانويات المحددة. حدّث الخريطة ثم أعد المحاولة" });
    return;
  }
  const counts = new Map<string, { science: number; arts: number }>();
  for (const assignment of assignments) {
    const destination = plan.destinations.find(item =>
      item.name === assignment.destinationName && item.schoolUserId === assignment.destinationUserId
    );
    if (!destination) {
      res.status(400).json({ error: `الثانوية "${assignment.destinationName}" غير موجودة في الخريطة` });
      return;
    }
    const count = counts.get(destination.schoolUserId) ?? { science: 0, arts: 0 };
    count[assignment.stream]++;
    counts.set(destination.schoolUserId, count);
    if (count.science > destination.scienceSeats || count.arts > destination.artsSeats) {
      res.status(400).json({ error: `تم تجاوز سعة المقاعد في ثانوية ${destination.name}` });
      return;
    }
  }

  let verifiedAssignments = assignments;
  if (studentIds.length) {
    const students = await db.select({
      id: studentsTable.id,
      nomPrenom: studentsTable.nomPrenom,
      classe: studentsTable.classe,
      dateNaissance: studentsTable.dateNaissance,
      sexe: studentsTable.sexe,
      parentPhone: studentsTable.parentPhone,
    }).from(studentsTable)
      .where(and(
        eq(studentsTable.userId, userId),
        eq(studentsTable.annee, annee),
        eq(studentsTable.niveau, "4AM" as Niveau),
        inArray(studentsTable.id, studentIds),
      ));
    if (students.length !== studentIds.length) {
      res.status(400).json({ error: "تتضمن القائمة تلاميذ غير مسجلين في مؤسستك لهذه السنة" });
      return;
    }
    const studentById = new Map(students.map(student => [student.id, student]));
    verifiedAssignments = assignments.map(assignment => ({
      ...assignment,
      studentName: studentById.get(assignment.studentId)!.nomPrenom,
      classe: studentById.get(assignment.studentId)!.classe,
    }));
  }

  const [published] = await db.transaction(async tx => {
    const [updatedPlan] = await tx.update(orientationPlansTable)
      .set({ status: "published", assignments: verifiedAssignments, publishedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(orientationPlansTable.id, plan.id), eq(orientationPlansTable.status, "draft")))
      .returning();
    if (!updatedPlan) return [];

    const students = studentIds.length
      ? await tx.select({
        id: studentsTable.id,
        nomPrenom: studentsTable.nomPrenom,
        dateNaissance: studentsTable.dateNaissance,
        sexe: studentsTable.sexe,
        parentPhone: studentsTable.parentPhone,
      }).from(studentsTable).where(and(
        eq(studentsTable.userId, userId),
        eq(studentsTable.annee, annee),
        inArray(studentsTable.id, studentIds),
      ))
      : [];
    const studentById = new Map(students.map(student => [student.id, student]));
    const destinationStudents = verifiedAssignments.map(assignment => {
      const sourceStudent = studentById.get(assignment.studentId);
      if (!sourceStudent) throw new Error("Missing source student after orientation validation");
      const destinationStudentId = crypto.randomUUID();
      return {
        transfer: {
          id: crypto.randomUUID(),
          planId: plan.id,
          sourceUserId: userId,
          destinationUserId: assignment.destinationUserId,
          sourceStudentId: assignment.studentId,
          destinationStudentId,
          annee,
          studentName: sourceStudent.nomPrenom,
          annualAvg: assignment.annualAvg === null ? null : String(assignment.annualAvg),
          stream: assignment.stream,
          destinationName: assignment.destinationName,
        },
        student: {
          id: destinationStudentId,
          userId: assignment.destinationUserId,
          nomPrenom: sourceStudent.nomPrenom,
          dateNaissance: sourceStudent.dateNaissance,
          parentPhone: sourceStudent.parentPhone,
          niveau: "1AS" as const,
          classe: "غير موزع",
          sexe: sourceStudent.sexe,
          statut: "nouveau" as const,
          resultat: null,
          annee,
        },
      };
    });

    for (let i = 0; i < destinationStudents.length; i += 500) {
      const chunk = destinationStudents.slice(i, i + 500);
      await tx.insert(studentsTable).values(chunk.map(item => item.student));
      await tx.insert(orientationTransfersTable).values(chunk.map(item => item.transfer));
    }
    return [updatedPlan];
  });
  if (!published) { res.status(409).json({ error: "تم اعتماد التوجيه من جلسة أخرى" }); return; }
  res.json(published);
});

// ─── Normalisation (mirrors students.ts) ───────────────────────────────────────
function norm(s: string): string {
  return String(s ?? "")
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/\u200B|\u200C|\u200D|\uFEFF/g, "")
    .replace(/[أإآا]/g, "ا")
    .replace(/[ةه]/g, "ه")
    .replace(/ى/g, "ي")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

// Split a "الرغبات" cell like "1 -جذع مشترك علوم و تكنولوجيا2 -جذع مشترك آداب3 -تعليم مهني4 -تكوين مهني"
// into an ordered array of choice labels.
function parseChoices(cell: string): string[] {
  const text = String(cell ?? "");
  const parts = text.split(/\d+\s*-/).map(p => p.trim()).filter(Boolean);
  return parts;
}

/**
 * Scientific subjects keys for 4AM (maths, physics/tech, SVT/science).
 * The orientation to جذع مشترك علوم is allowed even with avg < 14
 * when the student's average on these three subjects is above 10.
 */
const SCIENCE_SUBJECTS = ["maths", "physique", "svt"] as const;

function scienceAvg(scores: Record<string, number>): number | null {
  const vals = SCIENCE_SUBJECTS.map(k => scores[k]).filter((v): v is number => typeof v === "number" && v >= 0);
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function suggestTrack(annualAvg: number | null, scores: Record<string, number>): string | null {
  if (annualAvg === null) return null;
  if (annualAvg < 8)  return "تكوين مهني";
  if (annualAvg < 10) return "تعليم مهني";
  // avg >= 10: suggest علوم if avg >= 14 OR if average of scientific subjects > 10
  const sAvg = scienceAvg(scores);
  if (annualAvg >= 14 || (sAvg !== null && sAvg > 10)) return "جذع مشترك علوم";
  return "جذع مشترك آداب وفلسفة";
}

/**
 * Check whether a student's first choice is compatible with the suggested track.
 * The choices from Excel often include extra words like "و تكنولوجيا", so we use
 * keyword matching instead of exact string equality:
 *   - suggested "جذع مشترك علوم" matches any choice containing "علوم"
 *   - suggested "جذع مشترك آداب وفلسفة" matches any choice containing "آداب"
 *   - vocational tracks are matched by exact normalised comparison
 */
function tracksCompatible(choice: string, suggested: string): boolean {
  const n = (s: string) => String(s ?? "")
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[أإآا]/g, "ا")
    .replace(/[ةه]/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

  const nc = n(choice);
  const ns = n(suggested);

  if (nc === ns) return true;

  // Keyword-based matching for the two secondary tracks
  if (ns.includes("علوم") && nc.includes("علوم")) return true;
  if (ns.includes("اداب") && nc.includes("اداب")) return true;
  if (ns.includes("مهني") && nc.includes("مهني") && ns.includes("تكوين") && nc.includes("تكوين")) return true;
  if (ns.includes("مهني") && nc.includes("مهني") && ns.includes("تعليم") && nc.includes("تعليم")) return true;

  return false;
}

// ── POST /api/orientation/wishes/import ────────────────────────────────────────
router.post("/orientation/wishes/import", upload.array("files", 20), async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const userId = req.user!.id;
  const annee = String((req.body as any).annee ?? "").trim();
  if (!annee) { res.status(400).json({ error: "annee مطلوبة" }); return; }

  const files = (req.files as Express.Multer.File[]) ?? [];
  if (!files.length) { res.status(400).json({ error: "لم يتم إرفاق أي ملف" }); return; }

  const students = await db.select().from(studentsTable)
    .where(and(eq(studentsTable.userId, userId), eq(studentsTable.annee, annee), eq(studentsTable.niveau, "4AM" as Niveau)));

  const seenNationalIds = new Set<string>();
  const toInsert: (typeof orientationWishesTable.$inferInsert)[] = [];
  const unmatched: string[] = [];
  let matched = 0;

  for (const file of files) {
    let rows: any[][];
    try {
      const wb = XLSX.read(file.buffer, { type: "buffer" });
      const ws = wb.Sheets[wb.SheetNames[0]!];
      if (!ws) continue;
      rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
    } catch {
      continue;
    }

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i]!;
      const [rawNationalId, lastName, firstName, birthDate, wishesCell] = row;
      const nationalId = rawNationalId ? String(rawNationalId).trim() : "";
      const last = String(lastName ?? "").trim();
      const first = String(firstName ?? "").trim();
      if (!last && !first) continue;

      const dedupeKey = nationalId || `${norm(last)}|${norm(first)}`;
      if (seenNationalIds.has(dedupeKey)) continue;
      seenNationalIds.add(dedupeKey);

      const choices = parseChoices(wishesCell);

      const fullNameA = norm(`${last} ${first}`);
      const fullNameB = norm(`${first} ${last}`);
      const student = students.find(s => {
        const n = norm(s.nomPrenom);
        return n === fullNameA || n === fullNameB;
      });

      if (student) matched++;
      else unmatched.push(`${last} ${first}`.trim());

      toInsert.push({
        id: crypto.randomUUID(),
        userId,
        annee,
        nationalId: nationalId || null,
        lastName: last,
        firstName: first,
        birthDate: birthDate ? String(birthDate).trim() : null,
        choices,
        studentId: student?.id ?? null,
      });
    }
  }

  await db.transaction(async (tx) => {
    await tx.delete(orientationWishesTable).where(
      and(eq(orientationWishesTable.userId, userId), eq(orientationWishesTable.annee, annee))
    );
    const CHUNK = 500;
    for (let i = 0; i < toInsert.length; i += CHUNK) {
      await tx.insert(orientationWishesTable).values(toInsert.slice(i, i + CHUNK));
    }
  });

  res.json(ImportOrientationWishesResponse.parse({
    success: true,
    imported: toInsert.length,
    matched,
    unmatched,
  }));
});

// ── GET /api/orientation/wishes ─────────────────────────────────────────────────
router.get("/orientation/wishes", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const userId = req.user!.id;
  const annee = String((req.query as any).annee ?? "").trim();
  if (!annee) { res.status(400).json({ error: "annee مطلوبة" }); return; }

  const wishes = await db.select().from(orientationWishesTable)
    .where(and(eq(orientationWishesTable.userId, userId), eq(orientationWishesTable.annee, annee)));

  const studentIds = wishes.map(w => w.studentId).filter((id): id is string => !!id);
  const students = studentIds.length
    ? await db.select().from(studentsTable).where(and(eq(studentsTable.userId, userId), inArray(studentsTable.id, studentIds)))
    : [];
  const studentMap = new Map(students.map(s => [s.id, s]));

  const grades = studentIds.length
    ? await db.select().from(gradesTable).where(and(eq(gradesTable.userId, userId), inArray(gradesTable.studentId, studentIds)))
    : [];

  // gradeMap: studentId → trimestre → subject → score (mirrors /api/results)
  const gradeMap: Record<string, Record<string, Record<string, number>>> = {};
  const storedAvgMap: Record<string, Record<string, number>> = {};
  const AVG_SUBJECT = "__avg__";
  for (const g of grades) {
    if (g.subject === AVG_SUBJECT) {
      storedAvgMap[g.studentId] ??= {};
      storedAvgMap[g.studentId]![String(g.trimestre)] = parseFloat(String(g.score));
    } else {
      gradeMap[g.studentId] ??= {};
      gradeMap[g.studentId][String(g.trimestre)] ??= {};
      gradeMap[g.studentId][String(g.trimestre)]![g.subject] = parseFloat(String(g.score));
    }
  }

  const subs4AM = getSubjectsForLevel("4AM");
  const result = wishes.map(w => {
    const student = w.studentId ? studentMap.get(w.studentId) ?? null : null;
    let annualAvg: number | null = null;
    let latestScores: Record<string, number> = {};
    if (student) {
      const scores = gradeMap[student.id] ?? {};
      const storedAvgs = storedAvgMap[student.id] ?? {};
      const t1 = storedAvgs["1"] ?? calcWeightedAvg(scores["1"] ?? {}, subs4AM);
      const t2 = storedAvgs["2"] ?? calcWeightedAvg(scores["2"] ?? {}, subs4AM);
      const t3 = storedAvgs["3"] ?? calcWeightedAvg(scores["3"] ?? {}, subs4AM);
      const avgs = [t1, t2, t3].filter((v): v is number => v !== null);
      annualAvg = avgs.length > 0 ? Math.round((avgs.reduce((a, b) => a + b, 0) / avgs.length) * 100) / 100 : null;
      // use the most recent trimester with data for the science/literary heuristic
      latestScores = scores["3"] ?? scores["2"] ?? scores["1"] ?? {};
    }
    const suggestedTrack = student ? suggestTrack(annualAvg, latestScores) : null;
    const firstChoice = w.choices[0] ?? null;
    const firstChoiceMatchesSuggestion = suggestedTrack && firstChoice
      ? tracksCompatible(firstChoice, suggestedTrack)
      : null;

    return {
      id: w.id,
      annee: w.annee,
      nationalId: w.nationalId,
      lastName: w.lastName,
      firstName: w.firstName,
      birthDate: w.birthDate,
      choices: w.choices,
      studentId: w.studentId,
      matchedStudent: student,
      annualAvg,
      suggestedTrack,
      firstChoiceMatchesSuggestion,
    };
  });

  result.sort((a, b) => `${a.lastName}${a.firstName}`.localeCompare(`${b.lastName}${b.firstName}`, "ar"));

  res.json(result);
});

export default router;
