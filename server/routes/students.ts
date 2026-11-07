import crypto from "crypto";
import { Router, type IRouter } from "express";
import { logAudit } from "../lib/audit.js";
import { eq, and, ilike, inArray } from "drizzle-orm";
import multer from "multer";
import * as XLSX from "xlsx";
import { db, studentsTable, gradesTable, absencesTable, usersTable } from "../../shared/db.js";
import {
  ListStudentsResponse, ImportStudentsResponse, DashboardStatsResponse,
  NiveauEnum, SexeEnum, StatutEnum,
} from "../../shared/schemas.js";
import type { SchoolLevel } from "../../shared/school-stage.js";
import { FREE_STUDENT_LIMIT } from "../../shared/subscription.js";
import { getSchoolLevelsForRequest, getSchoolStageForRequest } from "../config/school-stage.js";
import { SCHOOL_STAGE_LEVELS, type SchoolStage } from "../../shared/school-stage.js";
import { normalizeLyceeBacFiliere } from "../../shared/subjects.js";

const router: IRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
async function ensureFreeStudentLimit(userId: string, newStudents: number): Promise<boolean> {
  const [user] = await db.select({ subscriptionPlan: usersTable.subscriptionPlan }).from(usersTable)
    .where(eq(usersTable.id, userId)).limit(1);
  if (user?.subscriptionPlan !== "free") return true;
  const existingStudents = await db.select({ id: studentsTable.id }).from(studentsTable)
    .where(eq(studentsTable.userId, userId));
  return existingStudents.length + newStudents <= FREE_STUDENT_LIMIT;
}

// ─── Normalisation ─────────────────────────────────────────────────────────────
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

function contains(hay: string, needles: string[]): boolean {
  const h = norm(hay);
  return needles.some(n => h.includes(norm(n)));
}

// ─── HTML entity decoder ──────────────────────────────────────────────────────
function decodeHTMLEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_: string, n: string) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_: string, h: string) => String.fromCharCode(parseInt(h, 16)));
}

// ─── HTML-XLS parser ─────────────────────────────────────────────────────────
export function parseHTMLWorkbook(buffer: Buffer): { rows: unknown[][]; error?: string } {
  const text = buffer.toString("utf-8");
  const trimmed = text.trimStart();
  if (!trimmed.startsWith("<")) return { rows: [], error: "ليس ملف HTML" };
  if (/<frameset/i.test(text) && /<frame\s/i.test(text) && !/<tbody/i.test(text)) {
    return { rows: [], error: "هذا الملف يستخدم نسق الإطارات (Frameset). الرجاء تصدير الملف بصيغة .xlsx مباشرة." };
  }

  const rows: unknown[][] = [];
  const tagRegex = /<[^>]+>/g;
  const trSplitRegex = /<tr[^>]*>/gi;
  const segments: string[] = [];
  let lastIdx = 0;
  let m: RegExpExecArray | null;
  while ((m = trSplitRegex.exec(text)) !== null) {
    if (lastIdx > 0) segments.push(text.slice(lastIdx, m.index));
    lastIdx = m.index + m[0].length;
  }
  if (lastIdx > 0) segments.push(text.slice(lastIdx));

  for (const seg of segments) {
    const cells: string[] = [];
    const tdRe = /<t[dh][^>]*>([\s\S]*?)(?:<\/t[dh]>|$)/gi;
    let tdMatch: RegExpExecArray | null;
    while ((tdMatch = tdRe.exec(seg)) !== null) {
      const raw = tdMatch[1]!.replace(tagRegex, "");
      const cell = decodeHTMLEntities(raw).replace(/\s+/g, " ").trim();
      cells.push(cell);
    }
    if (cells.length > 0) rows.push(cells);
  }
  return { rows };
}

// ─── Gender inference from Arabic name ───────────────────────────────────────
const FEMALE_NAMES = new Set([
  "فاطمة","عائشة","مريم","زينب","سارة","نور","هند","ليلى","أمينة","خديجة",
  "سلمى","رقية","حفصة","أسماء","رحمة","وسام","إيمان","هاجر","آية","نجاة",
  "كوثر","منال","هدى","ندى","شيماء","نهال","ملاك","بشرى","أمال","سهام",
  "إخلاص","اخلاص","سجى","صفاء","وفاء","دلال","ربيعة","حياة","نسرين","لمياء",
  "ياسمين","زهرة","نادية","سميرة","نجمة","جميلة","مليكة","لطيفة","رزيقة","زليخة",
  "حنان","إيناس","رانية","نسيمة","كريمة","حليمة","فريدة","نفيسة","مسعودة",
  "وئام","إيناس","أنيسة","حياة","سعاد","نعيمة","صفية","فضيلة","قمر","بدور",
  "تسنيم","شهد","لجين","غادة","روضة","عبير","بسمة","هيفاء","لبنى","شيماء",
]);
const MALE_NAMES = new Set([
  "محمد","أحمد","علي","عمر","يوسف","إبراهيم","خالد","عبد","عبدالله","حسن",
  "حسين","عبدالرحمن","طارق","كريم","سامي","رامي","أنس","بلال","سعيد","رشيد",
  "مصطفى","إسماعيل","نور","يونس","إلياس","ياسين","أمين","زكريا","هارون","صالح",
  "عمار","رضا","فيصل","أيوب","منصور","سليم","ثابت","حمزة","معاذ","صلاح",
]);

function inferGenderFromName(fullName: string): "M" | "F" | null {
  if (!fullName) return null;
  const words = fullName.trim().split(/\s+/);
  for (const word of words) {
    const w = word.replace(/[\u064B-\u065F\u0670\u0640]/g, "");
    for (const fn of FEMALE_NAMES) if (w === fn || w.includes(fn)) return "F";
    for (const mn of MALE_NAMES) if (w === mn || w.includes(mn)) return "M";
  }
  for (let i = 1; i < words.length; i++) {
    const w = words[i]!.replace(/[\u064B-\u065F\u0670\u0640]/g, "");
    if (w.length > 3 && (w.endsWith("ة") || w.endsWith("ى") || w.endsWith("اء"))) return "F";
  }
  return null;
}

// ─── Column keywords ──────────────────────────────────────────────────────────
const NAME_N   = ["اسم ولقب","اللقب و الاسم","اللقب والاسم","لقب و اسم","لقب واسم","اسم","لقب","الاسم واللقب","nom prenom","nom et prenom","eleve","élève","name","full name","التلميذ","المتعلم"];
const PRENOM_N = ["الاسم","prenom","prénom","first name","fname","الإسم"];
const NOM_N    = ["اللقب","nom de famille","last name","lname","family"];
const BIRTH_N  = ["ميلاد","تاريخ الميلاد","naissance","birth","dob","تاريخ الازدياد","تاريخ"];
const LEVEL_N  = ["مستوى","niveau","level","year","grade","السنة","الصف","المستوى"];
const CLASS_N  = ["فوج","قسم","classe","section","class","division","group","الفوج","القسم"];
const GENDER_N = ["جنس","الجنس","sexe","genre","gender","sex","النوع"];
const STATUS_N = ["الإعادة","اعاده","إعاده","وضعية","حالة","statut","status","situation","انتساب","الوضعية","redoublan"];
const RESULT_N = ["نتيجه","نتيجة","résultat","resultat","result","mention","قرار","النتيجة"];

// ✅ FIX 1: أزلنا "رقم" و"الرقم" لأنهما يلتقطان "رقم التعريف" الوطني (16 خانة)
//    وأضفنا "رقم القيد" بشكل صريح
const RAQM_N  = ["رقم القيد","رقم التلميذ","رقم الفوج","رقم المتعلم","no","n°","numero","numéro","#"];
const PHONE_N = ["رقم هاتف الولي","هاتف الولي","هاتف ولي الأمر","رقم الهاتف","الهاتف","phone","tel","telephone","téléphone","mobile","gsm","portable","contact"];
const FILIERE_N = ["الشعبة","شعبة","filiere","filière","stream","specialite","spécialité"];

// ─── Column detector ──────────────────────────────────────────────────────────
function findCol(headers: string[], needles: string[]): string | null {
  return headers.find(h => contains(h, needles)) ?? null;
}

function cellStr(row: Record<string, unknown>, key: string | null): string {
  if (!key) return "";
  const v = row[key];
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

function isHeaderRow(row: unknown[]): boolean {
  const cells = row.map(c => norm(String(c ?? "")));
  const joined = cells.join(" ");
  return (
    (contains(joined, GENDER_N) && contains(joined, NAME_N.concat(NOM_N))) ||
    (contains(joined, LEVEL_N)  && contains(joined, NAME_N.concat(NOM_N))) ||
    (contains(joined, NAME_N)   && cells.filter(c => c.length > 1).length >= 3) ||
    // ✅ FIX: detect header by presence of رقم التعريف (national ID column)
    joined.includes(norm("رقم التعريف")) ||
    joined.includes(norm("رقم القيد"))
  );
}

// ─── Value normalisers ────────────────────────────────────────────────────────

// ✅ FIX 2: "أنثى" بعد norm() تصبح "انثي" — أضفنا هذه الحالة صراحةً
function normalizeGender(val: string): "M" | "F" | null {
  const raw = String(val ?? "")
    .replace(/[\u0009\u000A\u000D\u0020\u00A0\u200B\u200C\u200D\uFEFF\u3000]/g, "")
    .trim();
  if (!raw) return null;

  // Apply same normalization as norm() for comparison
  const v = raw
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[أإآا]/g, "ا")
    .replace(/[ةه]/g, "ه")
    .replace(/ى/g, "ي")
    .toLowerCase();

  // Male
  if (/^ذكر$/.test(v) || /^ذ$/.test(v) || /^م$/.test(v)) return "M";
  if (/^(m|male|masculin|garcon|garçon|homme|h|1)$/.test(v)) return "M";

  // Female — "أنثى" normalizes to "انثي", "أنثى" direct also handled
  if (/^انثي$/.test(v) || /^انثى$/.test(v) || /^اناث$/.test(v)) return "F";
  if (/^انثي/.test(v) || /^انثى/.test(v) || /^انوث/.test(v)) return "F";
  if (/^ا$/.test(v) || /^أ$/.test(v)) return "F";
  if (/^(f|female|feminin|féminin|fille|femme|2)$/.test(v)) return "F";

  if (raw.length === 1) {
    if (["m","h","1"].includes(raw.toLowerCase())) return "M";
    if (["f","2"].includes(raw.toLowerCase())) return "F";
  }
  return null;
}

// ✅ FIX 3: "أولى" after norm() = "اولي", "ثانية" = "ثانيه" — regex updated
function normalizeLevel(val: string, stage: SchoolStage): SchoolLevel | null {
  if (!val) return null;
  const v = String(val)
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[أإآا]/g, "ا")
    .replace(/[ةه]/g, "ه")
    .replace(/ى/g, "ي")
    .toLowerCase()
    .trim();

  const explicitLevel = v.match(/(?:^|\D)([1-4])\s*a\s*([ms])(?:\D|$)/);
  if (explicitLevel) return `${explicitLevel[1]}A${explicitLevel[2]!.toUpperCase()}` as SchoolLevel;

  const levelNumber = /(اول|اولي|اولى|سنه اول|premiere|1ere|1ère|first)/.test(v) ? "1"
    : /(ثان|ثاني|ثانيه|deuxieme|2eme|2ème|second)/.test(v) ? "2"
    : /(ثالث|ثالثه|troisieme|3eme|3ème|third)/.test(v) ? "3"
    : /(رابع|رابعه|quatrieme|4eme|4ème|fourth)/.test(v) ? "4"
    : null;
  if (levelNumber) return `${levelNumber}A${stage === "lycee" ? "S" : "M"}` as SchoolLevel;

  const digits = v
    .replace(/١/g,"1").replace(/٢/g,"2").replace(/٣/g,"3").replace(/٤/g,"4")
    .replace(/[^\d]/g," ").trim();
  const first = digits.split(/\s+/).find(d => d.length > 0);
  if (!first) return null;
  const digitLevel = first[0];
  if (!digitLevel || !["1", "2", "3", "4"].includes(digitLevel)) return null;
  const stageSuffix = stage === "lycee" ? "S" : "M";
  return `${digitLevel}A${stageSuffix}` as SchoolLevel;
}

function normalizeStatut(val: string): "nouveau" | "redoublant" {
  const v = norm(String(val ?? ""));
  if (!v || v === "لا" || v === "no" || v === "non") return "nouveau";
  if (/^(r|redoublan|معيد|اعاده|إعاده|مكرر|تكرار|نعم|yes|oui)/.test(v)) return "redoublant";
  return "nouveau";
}

function normalizeResultat(val: string): "admis" | "non_admis" | "mustarrak" | null {
  if (!val) return null;
  const v = norm(val);
  if (/^(a|admis|ناجح|نجح|recu|reçu|pass|oui)/.test(v)) return "admis";
  if (/^(m|must|استدراك|مستدرك|rattrap|oral)/.test(v)) return "mustarrak";
  if (/^(n|non|راسب|رسب|non_admis|refuse|refusé|fail|la)/.test(v)) return "non_admis";
  return null;
}

const AR_CLASS: Record<string, string> = {
  "أ":"A","ا":"A","ب":"B","ج":"C","د":"D","ه":"E","هـ":"E","و":"F","ز":"G",
};

// ─── Core import ──────────────────────────────────────────────────────────────
function processRows(
  raw: unknown[][],
  userId: string,
  annee: string,
  niveau: SchoolLevel|null,
  classe: string|null,
  stage: SchoolStage,
  logger: { info: (...a: any[]) => void }
): { toInsert: typeof studentsTable.$inferInsert[]; skipped: number; errors: string[] } {
  const errors: string[] = [];
  let skipped = 0;

  let headerRowIdx = 0;
  for (let i = 0; i < Math.min(15, raw.length); i++) {
    if (isHeaderRow(raw[i] as unknown[])) { headerRowIdx = i; break; }
  }

  const headerCells = (raw[headerRowIdx] as unknown[]).map(c => String(c ?? "").trim());
  const dataRows    = raw.slice(headerRowIdx + 1);

  logger.info({ headerRowIdx, headers: headerCells }, "Headers detected");

  let detectedNiveau = niveau;
  if (!detectedNiveau) {
    for (let i = 0; i < headerRowIdx; i++) {
      const titleText = (raw[i] as unknown[]).join(" ");
      detectedNiveau = normalizeLevel(titleText, stage);
      if (detectedNiveau) break;
    }
  }
  if (!detectedNiveau) detectedNiveau = normalizeLevel(headerCells.join(" "), stage);

  let colNom      = findCol(headerCells, NOM_N);
  let colPrenom   = findCol(headerCells, PRENOM_N);
  const colName   = findCol(headerCells, NAME_N);
  const colBirth  = findCol(headerCells, BIRTH_N);
  const colLevel  = findCol(headerCells, LEVEL_N);
  const colClass  = findCol(headerCells, CLASS_N);
  const colGender = findCol(headerCells, GENDER_N);
  const colStatus = findCol(headerCells, STATUS_N);
  const colResult = findCol(headerCells, RESULT_N);
  const colRaqm   = findCol(headerCells, RAQM_N);   // ✅ now correctly picks "رقم القيد"
  const colPhone  = findCol(headerCells, PHONE_N);   // رقم هاتف الولي
  const colFiliere = findCol(headerCells, FILIERE_N);

  // A combined "الاسم واللقب" header contains both keywords, so fuzzy
  // detection returns the same column for nom and prenom. Use it as one name.
  if (colNom && colPrenom && colNom === colPrenom) {
    colNom = null;
    colPrenom = null;
  }

  logger.info({ colNom, colPrenom, colName, colLevel, colClass, colGender, colRaqm, colPhone, colFiliere }, "Column map");

  function rowToObj(r: unknown[]): Record<string, unknown> {
    const obj: Record<string, unknown> = {};
    headerCells.forEach((h, i) => { if (h) obj[h] = (r as unknown[])[i] ?? ""; });
    return obj;
  }

  const toInsert: typeof studentsTable.$inferInsert[] = [];

  for (let i = 0; i < dataRows.length; i++) {
    const rawRow = dataRows[i] as unknown[];
    if (!rawRow || rawRow.every(c => !c || String(c).trim() === "")) { skipped++; continue; }
    const row = rowToObj(rawRow);

    // ── رقم القيد ─────────────────────────────────────────────────────────────
    const raqmRaw = cellStr(row, colRaqm);
    // ✅ FIX: only accept raqm values that fit in a safe integer (not national IDs)
    const raqmNum = raqmRaw && !isNaN(Number(raqmRaw)) ? Number(raqmRaw) : null;
    const raqm = raqmNum !== null && raqmNum < 2_147_483_647 && raqmNum > 0 ? raqmNum : null;

    // ── الاسم ─────────────────────────────────────────────────────────────────
    let nomPrenom = "";
    if (colNom && colPrenom) {
      // ✅ File has separate "اللقب" and "الاسم" columns — combine them
      nomPrenom = [cellStr(row, colNom), cellStr(row, colPrenom)].filter(Boolean).join(" ");
    } else if (colNom) {
      nomPrenom = cellStr(row, colNom);
    } else if (colPrenom) {
      nomPrenom = cellStr(row, colPrenom);
    } else if (colName) {
      nomPrenom = cellStr(row, colName);
    }
    if (!nomPrenom) {
      for (const h of headerCells) {
        const v = cellStr(row, h);
        if (v && v.length > 2 && /[\u0600-\u06FFa-zA-Z]/.test(v)) { nomPrenom = v; break; }
      }
    }
    if (!nomPrenom) { skipped++; continue; }

    // ── المستوى ───────────────────────────────────────────────────────────────
    const niveauFinal = detectedNiveau ?? normalizeLevel(cellStr(row, colLevel), stage);
    if (!niveauFinal) {
      if (errors.length < 30) errors.push(`صف ${i + headerRowIdx + 2}: مستوى غير محدد ← "${nomPrenom}"`);
      skipped++; continue;
    }
    if (!SCHOOL_STAGE_LEVELS[stage].some(level => level === niveauFinal)) {
      if (errors.length < 30) errors.push(`صف ${i + headerRowIdx + 2}: المستوى ${niveauFinal} لا يطابق نوع المؤسسة`);
      skipped++; continue;
    }

    // ── القسم ─────────────────────────────────────────────────────────────────
    let classeRaw = classe ?? cellStr(row, colClass);
    if (!classeRaw) classeRaw = "A";
    classeRaw = AR_CLASS[classeRaw] ?? classeRaw.toUpperCase().replace(/\s+/g, "");

    // ── الجنس ─────────────────────────────────────────────────────────────────
    const genderRaw = cellStr(row, colGender);
    let sexe: "M"|"F"|null = normalizeGender(genderRaw);
    if (!sexe) sexe = inferGenderFromName(nomPrenom);
    if (!sexe) {
      sexe = "M";
      if (errors.length < 30) errors.push(`صف ${i+headerRowIdx+2}: جنس غير محدد — افتراضي ذكر ← "${nomPrenom}"`);
    }

    const dateNaissance = cellStr(row, colBirth) || null;
    const statut  = normalizeStatut(cellStr(row, colStatus));
    const resultat = normalizeResultat(cellStr(row, colResult));
    const rawFiliere = cellStr(row, colFiliere);
    const filiere = rawFiliere ? normalizeLyceeBacFiliere(rawFiliere) : null;
    if (rawFiliere && stage === "lycee" && !filiere && niveauFinal !== "1AS") {
      if (errors.length < 30) errors.push(`صف ${i + headerRowIdx + 2}: الشعبة غير معروفة ← "${rawFiliere}"`);
      skipped++;
      continue;
    }

    // ── رقم هاتف الولي ────────────────────────────────────────────────────────
    const rawPhone = cellStr(row, colPhone).replace(/\s+/g, "");
    // Keep only valid-looking phone strings (digits, +, -, parentheses, min 7 chars)
    const parentPhone = rawPhone && /^[+0-9()\-]{7,20}$/.test(rawPhone) ? rawPhone : null;

    toInsert.push({
      id: crypto.randomBytes(16).toString("hex"),
      userId, nomPrenom, dateNaissance,
      niveau: niveauFinal, classe: classeRaw,
      filiere: stage === "lycee" && niveauFinal !== "1AS" ? filiere : null,
      sexe, statut, resultat, annee, raqm, parentPhone,
    });
  }

  return { toInsert, skipped, errors };
}

// ─── Routes ───────────────────────────────────────────────────────────────────

router.patch("/students/:id/filiere", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (getSchoolStageForRequest(req) !== "lycee") { res.status(403).json({ error: "هذا الإجراء متاح للثانويات فقط" }); return; }
  const { filiere } = req.body as { filiere?: unknown };
  if (filiere !== null && typeof filiere !== "string") {
    res.status(400).json({ error: "الشعبة غير صالحة" });
    return;
  }
  const normalized = filiere ? normalizeLyceeBacFiliere(filiere) : null;
  if (filiere && !normalized) {
    res.status(400).json({ error: "الشعبة غير معروفة" });
    return;
  }
  try {
    const [student] = await db.select({ id: studentsTable.id, niveau: studentsTable.niveau })
      .from(studentsTable)
      .where(and(eq(studentsTable.id, req.params.id), eq(studentsTable.userId, req.user!.id)))
      .limit(1);
    if (!student) { res.status(404).json({ error: "التلميذ غير موجود" }); return; }
    if (student.niveau === "1AS" && normalized) {
      res.status(400).json({ error: "لا تُحدد شعبة البكالوريا للسنة الأولى ثانوي" });
      return;
    }
    const [updated] = await db.update(studentsTable).set({ filiere: normalized })
      .where(and(eq(studentsTable.id, student.id), eq(studentsTable.userId, req.user!.id)))
      .returning();
    res.json(updated);
  } catch (error) {
    req.log.error(error, "Failed to update student filiere");
    res.status(500).json({ error: "تعذر حفظ شعبة التلميذ" });
  }
});

// Single student lookup (used by QR scan page)
router.get("/students/:id", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const userId = req.user!.id;
  try {
    const rows = await db.select().from(studentsTable)
      .where(and(eq(studentsTable.id, req.params.id), eq(studentsTable.userId, userId), inArray(studentsTable.niveau, getSchoolLevelsForRequest(req))))
      .limit(1);
    if (!rows.length) {
      res.status(404).json({ error: "التلميذ غير موجود" });
      return;
    }
    res.json(rows[0]);
  } catch {
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

router.get("/students", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const userId = req.user!.id;
  const { annee, niveau, classe, sexe, statut, q, filiere } = req.query as Record<string, string>;
  const conds = [eq(studentsTable.userId, userId), inArray(studentsTable.niveau, getSchoolLevelsForRequest(req))];
  if (annee) conds.push(eq(studentsTable.annee, annee));
  if (niveau && NiveauEnum.safeParse(niveau).success) conds.push(eq(studentsTable.niveau, niveau as any));
  if (classe) conds.push(eq(studentsTable.classe, classe));
  if (sexe && SexeEnum.safeParse(sexe).success) conds.push(eq(studentsTable.sexe, sexe as any));
  if (statut && StatutEnum.safeParse(statut).success) conds.push(eq(studentsTable.statut, statut as any));
  if (filiere) {
    const normalizedFiliere = normalizeLyceeBacFiliere(filiere);
    if (!normalizedFiliere || getSchoolStageForRequest(req) !== "lycee") {
      res.status(400).json({ error: "الشعبة غير صالحة" });
      return;
    }
    conds.push(eq(studentsTable.filiere, normalizedFiliere));
  }
  if (q) conds.push(ilike(studentsTable.nomPrenom, `%${q}%`));
  const students = await db.select().from(studentsTable)
    .where(and(...conds))
    .orderBy(studentsTable.niveau, studentsTable.classe, studentsTable.raqm, studentsTable.nomPrenom);
  res.json(ListStudentsResponse.parse({ students, total: students.length }));
});

router.get("/stats", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const userId = req.user!.id;
    const { annee } = req.query as Record<string, string>;
    const conds = [eq(studentsTable.userId, userId), inArray(studentsTable.niveau, getSchoolLevelsForRequest(req))];
    if (annee) conds.push(eq(studentsTable.annee, annee));
    const all = await db.select().from(studentsTable).where(and(...conds));
    const studentIds = all.map(student => student.id);
    const gradeRows = studentIds.length
      ? await db.select().from(gradesTable).where(and(
        eq(gradesTable.userId, userId),
        inArray(gradesTable.studentId, studentIds),
        ...(annee ? [eq(gradesTable.annee, annee)] : []),
      ))
      : [];
    const absenceRows = studentIds.length
      ? await db.select().from(absencesTable).where(and(
        eq(absencesTable.userId, userId),
        inArray(absencesTable.studentId, studentIds),
        ...(annee ? [eq(absencesTable.annee, annee)] : []),
      ))
      : [];
    const average = (scores: number[]) => scores.length
      ? Math.round((scores.reduce((sum, score) => sum + score, 0) / scores.length) * 100) / 100
      : null;
    const currentYear = new Date().getFullYear();
    const calcAge = (dob: string | null): number | null => {
      if (!dob) return null;
      // Accepts formats: YYYY-MM-DD, DD/MM/YYYY
      let year: number | null = null;
      const isoMatch = dob.match(/^(\d{4})-\d{2}-\d{2}/);
      const slashMatch = dob.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
      if (isoMatch) year = parseInt(isoMatch[1]!);
      else if (slashMatch) year = parseInt(slashMatch[3]!);
      if (!year || year < 1990 || year > currentYear) return null;
      return currentYear - year;
    };

    const byLevel = getSchoolLevelsForRequest(req).map(niveau => {
      const g = all.filter(s => s.niveau === niveau);
      const levelStudentIds = new Set(g.map(student => student.id));
      const levelGrades = gradeRows.filter(grade => levelStudentIds.has(grade.studentId));
      const levelAbsences = absenceRows.filter(absence => levelStudentIds.has(absence.studentId));
      const ages = g.map(s => calcAge(s.dateNaissance)).filter((a): a is number => a !== null);
      const avgAge = ages.length ? Math.round((ages.reduce((s, a) => s + a, 0) / ages.length) * 10) / 10 : null;
      const minAge = ages.length ? Math.min(...ages) : null;
      const maxAge = ages.length ? Math.max(...ages) : null;
      const ageDist: { age: number; count: number }[] = [];
      for (const age of ages) {
        const existing = ageDist.find(a => a.age === age);
        if (existing) existing.count++;
        else ageDist.push({ age, count: 1 });
      }
      ageDist.sort((a, b) => a.age - b.age);
      return {
        niveau, total: g.length,
        boys: g.filter(s => s.sexe === "M").length,
        girls: g.filter(s => s.sexe === "F").length,
        admis: g.filter(s => s.resultat === "admis").length,
        nonAdmis: g.filter(s => s.resultat === "non_admis").length,
        mustarrak: g.filter(s => s.resultat === "mustarrak").length,
        nouveau: g.filter(s => s.statut === "nouveau").length,
        redoublant: g.filter(s => s.statut === "redoublant").length,
        averageGrade: average(levelGrades.map(grade => Number(grade.score)).filter(Number.isFinite)),
        justifiedHours: levelAbsences.reduce((sum, absence) => sum + absence.justifiedHours, 0),
        unjustifiedHours: levelAbsences.reduce((sum, absence) => sum + absence.unjustifiedHours, 0),
        avgAge, minAge, maxAge, ageDist,
      };
    }).filter(l => l.total > 0);
    const gradesBySubject = [...new Set(gradeRows.map(grade => grade.subject))].map(subject => {
      const subjectGrades = gradeRows.filter(grade => grade.subject === subject)
        .map(grade => Number(grade.score)).filter(Number.isFinite);
      return {
        subject,
        average: average(subjectGrades) ?? 0,
        count: subjectGrades.length,
        passed: subjectGrades.filter(score => score >= 10).length,
      };
    });
    res.json(DashboardStatsResponse.parse({
      total: all.length,
      boys: all.filter(s => s.sexe === "M").length,
      girls: all.filter(s => s.sexe === "F").length,
      admis: all.filter(s => s.resultat === "admis").length,
      nonAdmis: all.filter(s => s.resultat === "non_admis").length,
      mustarrak: all.filter(s => s.resultat === "mustarrak").length,
      nouveau: all.filter(s => s.statut === "nouveau").length,
      redoublant: all.filter(s => s.statut === "redoublant").length,
      gradeCount: gradeRows.length,
      averageGrade: average(gradeRows.map(grade => Number(grade.score)).filter(Number.isFinite)),
      gradesBySubject,
      justifiedHours: absenceRows.reduce((sum, absence) => sum + absence.justifiedHours, 0),
      unjustifiedHours: absenceRows.reduce((sum, absence) => sum + absence.unjustifiedHours, 0),
      byLevel,
    }));
  } catch (err) {
    req.log.error({ err }, "Stats query failed");
    res.status(500).json({ error: "Failed to load stats" });
  }
});

router.post("/students/import", upload.single("file"), async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!req.file) { res.status(400).json({ error: "No file uploaded" }); return; }

  const userId = req.user!.id;
  const annee  = (req.query.annee as string) || "2026-2027";
  const stage = getSchoolStageForRequest(req);

  let raw: unknown[][] = [];
  const fileText = req.file.buffer.toString("utf-8").trimStart();
  const isHTML   = fileText.startsWith("<");

  if (isHTML) {
    const { rows, error } = parseHTMLWorkbook(req.file.buffer);
    if (error) { res.status(400).json({ error }); return; }
    raw = rows;
  } else {
    try {
      const wb = XLSX.read(req.file.buffer, { type: "buffer", raw: false });
      const ws = wb.Sheets[wb.SheetNames[0]!];
      raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: false, blankrows: false });
    } catch {
      res.status(400).json({ error: "صيغة الملف غير صالحة. استخدم .xlsx أو ملف .xls من المنظومة." });
      return;
    }
  }

  if (!raw.length) {
    res.status(400).json({ error: "الملف فارغ أو لا يحتوي على بيانات قابلة للقراءة" });
    return;
  }

  // Extract class/level from title rows
  let titleClasse: string|null = null;
  let titleNiveau: SchoolLevel|null = null;
  for (let i = 0; i < Math.min(8, raw.length); i++) {
    const text = (raw[i] as unknown[]).join(" ");
    if (/متوسط|ثانوي|lycee|secondaire/i.test(text)) {
      const classMatch = text.match(/متوسط\s*(\d+)/);
      if (classMatch) titleClasse = classMatch[1]!.replace(/^0+/, "") || "1";
      const secondaryClassMatch = text.match(/(?:ثانوي|lycee|secondaire)\s*(\d+)/i);
      if (!titleClasse && secondaryClassMatch) titleClasse = secondaryClassMatch[1]!.replace(/^0+/, "") || "1";
      titleNiveau = normalizeLevel(text, stage);
      break;
    }
  }

  const { toInsert, skipped, errors } = processRows(raw, userId, annee, titleNiveau, titleClasse, stage, req.log);

  if (!(await ensureFreeStudentLimit(userId, toInsert.length))) {
    res.status(403).json({ error: `الخطة المجانية محدودة بـ ${FREE_STUDENT_LIMIT} تلميذاً`, requiredPlan: "basic" });
    return;
  }

  if (toInsert.length > 0) {
    for (let b = 0; b < toInsert.length; b += 200) {
      await db.insert(studentsTable).values(toInsert.slice(b, b + 200));
    }
  }

  req.log.info({ userId, imported: toInsert.length, skipped, errors: errors.slice(0,5) }, "Students imported");

  logAudit({
    userId,
    actorId:  userId,
    actorName: req.user!.firstName ?? req.user!.email ?? undefined,
    action:      "student_import",
    description: `استيراد ${toInsert.length} تلميذ من ملف Excel (${req.file!.originalname})`,
    entity:      "student",
    details:     { imported: toInsert.length, skipped, file: req.file!.originalname, annee },
    req,
  });

  res.json(ImportStudentsResponse.parse({ imported: toInsert.length, skipped, errors }));
});

router.post("/students/preview", upload.single("file"), async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "No file" }); return; }
  if (!req.file) { res.status(400).json({ error: "No file" }); return; }
  const fileText = req.file.buffer.toString("utf-8").trimStart();
  const isHTML = fileText.startsWith("<");
  let raw: unknown[][] = [];
  if (isHTML) {
    const { rows, error } = parseHTMLWorkbook(req.file.buffer);
    if (error) { res.status(400).json({ error }); return; }
    raw = rows;
  } else {
    try {
      const wb = XLSX.read(req.file.buffer, { type: "buffer", raw: false });
      const ws = wb.Sheets[wb.SheetNames[0]!];
      raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: false, blankrows: false });
    } catch {
      res.status(400).json({ error: "ملف Excel غير صالح" }); return;
    }
  }
  let headerRowIdx = 0;
  for (let i = 0; i < Math.min(15, raw.length); i++) {
    if (isHeaderRow(raw[i] as unknown[])) { headerRowIdx = i; break; }
  }
  const headers = (raw[headerRowIdx] as unknown[]).map(c => String(c ?? "").trim());
  const samples = raw.slice(headerRowIdx+1, headerRowIdx+4).map(r =>
    Object.fromEntries(headers.map((h, i) => [h, String((r as unknown[])[i] ?? "")]))
  );
  res.json({ headerRow: headerRowIdx, headers, samples });
});

router.delete("/students/:id", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const userId = req.user!.id;
  const { id } = req.params;
  const [deleted] = await db.delete(studentsTable)
    .where(and(eq(studentsTable.id, id), eq(studentsTable.userId, userId), inArray(studentsTable.niveau, getSchoolLevelsForRequest(req))))
    .returning({ id: studentsTable.id });

  if (!deleted) { res.status(404).json({ error: "Student not found" }); return; }
  res.json({ success: true, deletedId: deleted.id });
});

router.delete("/students", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const userId = req.user!.id;
  const { annee } = req.query as Record<string, string>;
  const conds = [eq(studentsTable.userId, userId), inArray(studentsTable.niveau, getSchoolLevelsForRequest(req))];
  if (annee) conds.push(eq(studentsTable.annee, annee));
  await db.delete(studentsTable).where(and(...conds));
  res.json({ success: true });
});

/**
 * POST /api/students/auto-detect-repeaters?annee=2026-2027
 *
 * Smart repeater detection: compares the target year's student list with the
 * previous year.  A student who appears in the SAME niveau in the previous
 * year is a repeater (redoublant); one who moved up a niveau (or is brand new)
 * stays "nouveau".
 *
 * Returns { detected, alreadyMarked, total }
 */
router.post("/students/auto-detect-repeaters", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const userId = req.user!.id;
  const { annee } = req.query as Record<string, string>;
  if (!annee) { res.status(400).json({ error: "annee query param required" }); return; }

  // Derive previous year  e.g. "2025-2026" → "2024-2025"
  const parts = annee.split("-");
  if (parts.length !== 2) { res.status(400).json({ error: "invalid annee format" }); return; }
  const prevAnnee = `${parseInt(parts[0]!) - 1}-${parseInt(parts[1]!) - 1}`;

  // Normalize Arabic for robust name matching
  function normAr(s: string): string {
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

  try {
    const [currentStudents, prevStudents] = await Promise.all([
      db.select().from(studentsTable).where(and(eq(studentsTable.userId, userId), eq(studentsTable.annee, annee), inArray(studentsTable.niveau, getSchoolLevelsForRequest(req)))),
      db.select().from(studentsTable).where(and(eq(studentsTable.userId, userId), eq(studentsTable.annee, prevAnnee), inArray(studentsTable.niveau, getSchoolLevelsForRequest(req)))),
    ]);

    if (prevStudents.length === 0) {
      res.json({ detected: 0, alreadyMarked: 0, total: currentStudents.length, prevAnnee, warning: "لا توجد بيانات للسنة السابقة" });
      return;
    }

    // Build a lookup: normalizedName → Set<niveau> for previous year
    const prevMap = new Map<string, Set<string>>();
    for (const s of prevStudents) {
      const key = normAr(s.nomPrenom);
      if (!prevMap.has(key)) prevMap.set(key, new Set());
      prevMap.get(key)!.add(s.niveau);
    }

    let detected = 0;
    let alreadyMarked = 0;

    for (const student of currentStudents) {
      const normName = normAr(student.nomPrenom);
      const prevNiveaux = prevMap.get(normName);
      const wasInSameNiveau = prevNiveaux?.has(student.niveau) ?? false;

      if (wasInSameNiveau) {
        if (student.statut === "redoublant") {
          alreadyMarked++;
        } else {
          await db.update(studentsTable)
            .set({ statut: "redoublant" })
            .where(eq(studentsTable.id, student.id));
          detected++;
        }
      }
    }

    res.json({ detected, alreadyMarked, total: currentStudents.length, prevAnnee });
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? "Server error" });
  }
});

export default router;