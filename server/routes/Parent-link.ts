/**
 * A parent links their account to their child.
 *
 *  GET  /api/public/schools/search?q=...   find a school by name / wilaya / commune (public, name only)
 *  POST /api/parent-link                   body: { schoolId | joinCode, studentName, phone, parentName? }
 *
 * The child is found by comparing the typed phone number with the parents' phone numbers
 * in the school's students file, and the typed name with the recorded name. Both must match.
 */
import { Router } from "express";
import { and, desc, eq, ilike, isNotNull, or } from "drizzle-orm";
import { db, schoolInfoTable, schoolMembersTable, studentsTable } from "../../shared/db.js";
import { logAudit } from "../lib/audit.js";
import { logger } from "../lib/logger.js";
import {
  NAME_MATCH_THRESHOLD,
  cleanPhone,
  nameScore,
  phoneKeys,
  phonesMatch,
  recordFailure,
  tooManyAttempts,
} from "../services/parentVerification.js";

const router = Router();
const MAX_PARENTS_PER_STUDENT = 3;

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, match => `\\${match}`);
}

// ── Public school search (names only — no owner ids, no join codes) ───────────────────────────
router.get("/public/schools/search", async (req, res): Promise<void> => {
  const q = String(req.query.q ?? "").trim().slice(0, 80);
  if (q.length < 3) { res.json({ schools: [] }); return; }

  const ip = req.ip ?? "unknown";
  if (tooManyAttempts(`search:${ip}`, 60)) { res.status(429).json({ error: "محاولات كثيرة. حاول بعد قليل." }); return; }
  recordFailure(`search:${ip}`); // counts every search; 60 per 15 minutes is plenty for a person

  const pattern = `%${escapeLike(q)}%`;
  const rows = await db.select({
    id: schoolInfoTable.id,
    nom: schoolInfoTable.nom,
    wilaya: schoolInfoTable.wilaya,
    commune: schoolInfoTable.commune,
  })
    .from(schoolInfoTable)
    .where(or(
      ilike(schoolInfoTable.nom, pattern),
      ilike(schoolInfoTable.commune, pattern),
      ilike(schoolInfoTable.wilaya, pattern),
    ))
    .limit(10);

  res.json({ schools: rows.filter(row => row.nom.trim() !== "") });
});

// ── Link the logged-in parent to a student ───────────────────────────────────────────────────
router.post("/parent-link", async (req, res): Promise<void> => {
  if (!req.isAuthenticated() || !req.user) { res.status(401).json({ error: "سجّل الدخول أولاً" }); return; }
  if (req.memberContext) {
    res.status(409).json({ error: "حسابك مرتبط بمدرسة بالفعل.", alreadyLinked: true });
    return;
  }

  const userKey = `link:user:${req.user.id}`;
  const ipKey = `link:ip:${req.ip ?? "unknown"}`;
  if (tooManyAttempts(userKey, 8) || tooManyAttempts(ipKey, 25)) {
    res.status(429).json({ error: "محاولات فاشلة كثيرة. حاول بعد 15 دقيقة، أو تواصل مع إدارة المدرسة." });
    return;
  }

  const body = (req.body ?? {}) as {
    schoolId?: unknown; joinCode?: unknown; studentName?: unknown; phone?: unknown; parentName?: unknown;
  };
  const studentName = typeof body.studentName === "string" ? body.studentName.trim().slice(0, 255) : "";
  const phone = typeof body.phone === "string" ? body.phone.trim().slice(0, 60) : "";
  const joinCode = typeof body.joinCode === "string" ? body.joinCode.toUpperCase().trim() : "";
  const schoolId = typeof body.schoolId === "string" ? body.schoolId.trim() : "";
  const parentName = typeof body.parentName === "string" ? body.parentName.trim().slice(0, 200) : "";

  if (studentName.split(/\s+/).filter(Boolean).length < 2) {
    res.status(400).json({ error: "اكتب اسم ابنك واسمه العائلي (كلمتان على الأقل)." });
    return;
  }
  if (phoneKeys(phone).length === 0) {
    res.status(400).json({ error: "رقم الهاتف غير صالح. اكتب الرقم كما هو مسجّل لدى المدرسة." });
    return;
  }
  if (!joinCode && !schoolId) {
    res.status(400).json({ error: "اختر المدرسة أولاً." });
    return;
  }

  // 1. The school
  const [school] = await db.select({ userId: schoolInfoTable.userId, nom: schoolInfoTable.nom })
    .from(schoolInfoTable)
    .where(joinCode ? eq(schoolInfoTable.joinCode, joinCode) : eq(schoolInfoTable.id, schoolId))
    .limit(1);
  if (!school) {
    recordFailure(userKey); recordFailure(ipKey);
    res.status(404).json({ error: "المدرسة غير موجودة. تحقق من اختيارك أو من الرمز." });
    return;
  }

  // 2. Students of that school whose parent phone matches the typed number
  const students = await db.select({
    id: studentsTable.id,
    nomPrenom: studentsTable.nomPrenom,
    niveau: studentsTable.niveau,
    classe: studentsTable.classe,
    annee: studentsTable.annee,
    parentPhone: studentsTable.parentPhone,
  })
    .from(studentsTable)
    .where(and(eq(studentsTable.userId, school.userId), isNotNull(studentsTable.parentPhone)))
    .orderBy(desc(studentsTable.annee));

  const candidates = students
    .filter(student => phonesMatch(phone, student.parentPhone))
    .map(student => ({ student, score: nameScore(studentName, student.nomPrenom) }))
    .filter(candidate => candidate.score >= NAME_MATCH_THRESHOLD)
    .sort((a, b) => b.score - a.score || b.student.annee.localeCompare(a.student.annee));

  // The same child can appear in several school years; only a tie between different children is ambiguous.
  const best = candidates[0];
  const ambiguous = best && candidates.some(c =>
    c.student.id !== best.student.id &&
    c.student.annee === best.student.annee &&
    Math.abs(c.score - best.score) < 0.05,
  );

  if (!best) {
    recordFailure(userKey); recordFailure(ipKey);
    // One generic answer on purpose: it must not reveal which part (school, name or number) was right.
    res.status(404).json({
      error: "لم نجد تلميذاً بهذه البيانات في هذه المدرسة. تأكد من كتابة اسم ابنك كما في سجلات المدرسة، ومن أن رقمك هو المسجّل لدى الإدارة. وإن كان رقمك تغيّر فاطلب من الإدارة تحديثه.",
    });
    return;
  }
  if (ambiguous) {
    res.status(409).json({ error: "وجدنا أكثر من تلميذ بنفس البيانات. اكتب اسم ابنك كاملاً كما في السجلات." });
    return;
  }

  // 3. At most a few parents per child
  const linked = await db.select({ id: schoolMembersTable.id })
    .from(schoolMembersTable)
    .where(and(
      eq(schoolMembersTable.schoolUserId, school.userId),
      eq(schoolMembersTable.linkedStudentId, best.student.id),
      eq(schoolMembersTable.role, "parent"),
    ));
  if (linked.length >= MAX_PARENTS_PER_STUDENT) {
    res.status(409).json({ error: "تم ربط هذا التلميذ بالعدد الأقصى من حسابات الأولياء. تواصل مع إدارة المدرسة." });
    return;
  }

  // 4. Create the parent membership
  const user = req.user;
  const displayName = parentName || [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || "ولي أمر";
  try {
    await db.insert(schoolMembersTable).values({
      schoolUserId: school.userId,
      memberUserId: user.id,
      role: "parent",
      name: displayName.slice(0, 255),
      email: user.email ?? null,
      phone: cleanPhone(phone),
      assignedClasses: [],
      linkedStudentId: best.student.id,
    });
  } catch (error) {
    logger.error({ error }, "parent-link insert failed");
    res.status(500).json({ error: "تعذر ربط الحساب. حاول مرة أخرى." });
    return;
  }

  await logAudit({
    userId: school.userId,
    actorId: user.id,
    actorName: displayName,
    action: "parent_link",
    description: "ربط حساب ولي أمر بتلميذ عبر مطابقة الاسم والهاتف",
    entity: "student",
    entityId: best.student.id,
    details: { matchScore: Number(best.score.toFixed(2)) },
    req,
  });

  res.status(201).json({
    success: true,
    school: { nom: school.nom },
    student: { nomPrenom: best.student.nomPrenom, niveau: best.student.niveau, classe: best.student.classe },
  });
});

export default router;