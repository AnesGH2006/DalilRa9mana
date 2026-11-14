import { Router, type IRouter } from "express";
import multer from "multer";
import * as XLSX from "xlsx";
import { parseHTMLWorkbook } from "./students.js";
import { db } from "../../shared/db.js";
import { bemSessionsTable } from "../../shared/schema.js";
import { eq, desc } from "drizzle-orm";
import { randomUUID } from "crypto";

const router: IRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/\.(xlsx|xls)$/i.test(file.originalname)) cb(null, true);
    else cb(new Error("Only .xlsx/.xls files are allowed"));
  },
});

const BEM_SUBJECTS = [
  { key: "math",    arLabel: "الرياضيات",                       coef: 4 },
  { key: "arabic",  arLabel: "اللغة العربية",                   coef: 5 },
  { key: "french",  arLabel: "اللغة الفرنسية",                  coef: 3 },
  { key: "english", arLabel: "اللغة الإنجليزية",                coef: 2 },
  { key: "islamic", arLabel: "التربية الإسلامية",               coef: 2 },
  { key: "civic",   arLabel: "التربية المدنية",                 coef: 1 },
  { key: "history", arLabel: "التاريخ والجغرافيا",              coef: 3 },
  { key: "science", arLabel: "علوم الطبيعة والحياة",            coef: 2 },
  { key: "physics", arLabel: "العلوم الفيزيائية والتكنولوجية", coef: 2 },
  { key: "pe",      arLabel: "التربية البدنية والرياضية",       coef: 1 },
];

function normalise(s: string): string {
  return String(s).toLowerCase()
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[أإآا]/g, "ا")
    .replace(/[ةه]/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/\s+/g, "")
    .replace(/[^\p{L}\p{N}]/gu, "");
}

function parseScore(val: unknown): number | null {
  if (val === null || val === undefined || val === "") return null;
  const str = String(val).replace(/\u066B/g, ".").replace(",", ".");
  const n = parseFloat(str);
  if (isNaN(n)) return null;
  return Math.max(0, Math.min(20, n));
}

// ── Round to 2 decimal places, avoiding float precision errors ──────────────
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function detectSubjectKey(header: string): string | null {
  const h = normalise(header);
  if (h.includes("رياضيات")) return "math";
  if (h.includes("عربيه") || h.includes("عربية") || h.includes("العربيه")) return "arabic";
  if (h.includes("فرنسيه") || h.includes("فرنسية") || h.includes("الفرنسيه")) return "french";
  if (h.includes("إنجليزيه") || h.includes("انجليزيه") || h.includes("إنجليزية") || h.includes("انجليزية")) return "english";
  if (h.includes("إسلاميه") || h.includes("اسلاميه") || h.includes("إسلامية") || h.includes("اسلامية")) return "islamic";
  if (h.includes("مدنيه") || h.includes("مدنية")) return "civic";
  if (h.includes("ميلاد")) return null;
  if (h.includes("تاريخ") || h.includes("جغرافيا")) return "history";
  if (h.includes("علومط") || (h.includes("علوم") && (h.includes("طبيعه") || h.includes("طبيعة") || h.includes("حياه") || h.includes("حياة")))) return "science";
  if (h.includes("فيزياء") || h.includes("فيزيائيه") || h.includes("فيزيائية") || h.includes("تكنولوجيا")) return "physics";
  if (h.includes("بدنيه") || h.includes("بدنية") || h.includes("رياضيه") || h.includes("رياضية")) return "pe";
  return null;
}

function isNameColumn(header: string): boolean {
  const h = normalise(header);
  return h.includes("لقب") || h.includes("اسم") || h.includes("إسم") ||
    h.includes("nom") || h.includes("name") || h.includes("prenom") ||
    h.includes("متعلم") || h.includes("تلميذ");
}

// ── Expanded average-column detection ─────────────────────────────────────────
// Catches: "معدل", "المعدل", "معدل الفصل", "معدل BEM", "معدل شهادة التعليم المتوسط",
//          "معدل الانتقال", "معدل الدور", "معدل الثلاثي", "معدل العام" etc.
function isAverageColumn(header: string): boolean {
  const h = normalise(header);
  if (!h.includes("معدل")) return false;
  // Exclude subject-specific averages (e.g. "معدل الرياضيات")
  const isSubjectAvg =
    h.includes("رياضيات") || h.includes("عربيه") || h.includes("عربية") ||
    h.includes("فرنسيه") || h.includes("فرنسية") || h.includes("إنجليزيه") ||
    h.includes("انجليزيه") || h.includes("إسلاميه") || h.includes("اسلاميه") ||
    h.includes("مدنيه") || h.includes("مدنية") || h.includes("تاريخ") ||
    h.includes("جغرافيا") || h.includes("فيزياء") || h.includes("فيزيائيه") ||
    h.includes("علوم") || h.includes("بدنيه") || h.includes("بدنية");
  if (isSubjectAvg) return false;
  // Accept if just "معدل" or "المعدل" (alone after normalise)
  if (h === "معدل" || h === "المعدل") return true;
  // Accept "معدل" + any of these contextual keywords
  const okWords = ["bem", "شتم", "شهاده", "انتقال", "فصل", "دور", "ثلاثي", "عام", "سنوي", "إجمالي", "اجمالي", "عام", "نهائي", "الفصل", "الثلاثي", "الدور"];
  return okWords.some(w => h.includes(w));
}

function detectGender(name: string): "male" | "female" | "unknown" {
  const femaleSuffixes = ["ة", "ى", "اء", "ين", "ينة", "ية"];
  const maleNames = ["محمد", "أحمد", "علي", "عمر", "يوسف", "إبراهيم", "خالد", "عبد"];
  const femaleNames = ["فاطمة", "عائشة", "مريم", "زينب", "سارة", "نور", "هند", "ليلى", "أمينة", "خديجة", "سلمى", "رقية", "حفصة", "أسماء", "رحمة", "وسام", "إيمان", "هاجر", "آية", "نجاة"];
  const n = name.trim();
  for (const fn of femaleNames) if (n.includes(fn)) return "female";
  for (const mn of maleNames) if (n.includes(mn)) return "male";
  for (const sf of femaleSuffixes) if (n.endsWith(sf) && n.length > sf.length + 2) return "female";
  return "unknown";
}

// ── Parse a file buffer into rows (handles both binary XLSX and HTML-disguised XLS) ──
function parseFileToRows(buffer: Buffer): { rows: unknown[][]; error?: string } {
  const text = buffer.toString("utf-8").trimStart();

  if (text.startsWith("<")) {
    // HTML-disguised XLS (Algerian Ministry format)
    return parseHTMLWorkbook(buffer);
  }

  // Binary XLSX/XLS
  try {
    const wb = XLSX.read(buffer, { type: "buffer" });
    const sheetName = wb.SheetNames[0];
    if (!sheetName) return { rows: [], error: "الملف فارغ" };
    const sheet = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { defval: null, header: 1 }) as unknown[][];
    return { rows };
  } catch {
    return { rows: [], error: "تعذّر قراءة ملف Excel. تأكد أن الملف بصيغة .xlsx أو .xls صحيحة." };
  }
}

// ── GET /bem/sessions ── load persisted sessions for current user ──────────────
router.get("/bem/sessions", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const user = req.user as { id: string };
  const sessions = await db
    .select({ id: bemSessionsTable.id, fileName: bemSessionsTable.fileName, label: bemSessionsTable.label, createdAt: bemSessionsTable.createdAt })
    .from(bemSessionsTable)
    .where(eq(bemSessionsTable.userId, user.id))
    .orderBy(desc(bemSessionsTable.createdAt));
  res.json(sessions);
});

// ── GET /bem/sessions/:id ── load full data for one session ──────────────────
router.get("/bem/sessions/:id", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const user = req.user as { id: string };
  const [session] = await db
    .select()
    .from(bemSessionsTable)
    .where(eq(bemSessionsTable.id, req.params.id))
    .limit(1);
  if (!session || session.userId !== user.id) { res.status(404).json({ error: "Not found" }); return; }
  res.json(session.data);
});

// ── POST /bem/analyze ── parse file + persist result ──────────────────────────
router.post("/bem/analyze", upload.single("file"), async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!req.file) { res.status(400).json({ error: "No file uploaded" }); return; }

  const { rows: allRows, error: parseError } = parseFileToRows(req.file.buffer);
  if (parseError) { res.status(400).json({ error: parseError }); return; }
  if (!allRows.length) { res.status(400).json({ error: "الملف فارغ أو لا يحتوي على بيانات" }); return; }

  let headerRowIndex = -1;
  let headers: string[] = [];
  for (let i = 0; i < Math.min(20, allRows.length); i++) {
    const row = allRows[i] as unknown[];
    const textCells = row.filter(c => typeof c === "string" && c.trim().length > 1);
    if (textCells.length >= 3) {
      headerRowIndex = i;
      headers = row.map(c => (c == null ? "" : String(c).trim()));
      break;
    }
  }

  if (headerRowIndex === -1) {
    res.status(400).json({ error: "تعذّر الكشف عن صف العناوين" });
    return;
  }

  let nameColIdx = -1;
  let avgColIdx  = -1;
  const subjectColMap: Record<string, number> = {};

  for (let i = 0; i < headers.length; i++) {
    const h = headers[i];
    if (!h) continue;
    if (nameColIdx === -1 && isNameColumn(h)) { nameColIdx = i; continue; }
    if (avgColIdx  === -1 && isAverageColumn(h)) { avgColIdx = i; continue; }
    const subjKey = detectSubjectKey(h);
    if (subjKey && !(subjKey in subjectColMap)) subjectColMap[subjKey] = i;
  }

  const dataRows = allRows.slice(headerRowIndex + 1);

  const students: Array<{
    name: string; gender: "male" | "female" | "unknown";
    scores: Record<string, number | null>;
    average: number | null; passed: boolean | null; rank: number;
  }> = [];

  for (const rawRow of dataRows) {
    const row = rawRow as unknown[];
    if (!row || row.every(c => c === null || String(c ?? "").trim() === "")) continue;
    const name = nameColIdx >= 0 ? String(row[nameColIdx] ?? "").trim() : "";
    if (!name || !isNaN(Number(name))) continue;

    const scores: Record<string, number | null> = {};
    for (const subj of BEM_SUBJECTS) {
      const ci = subjectColMap[subj.key];
      scores[subj.key] = ci !== undefined ? parseScore(row[ci]) : null;
    }

    let average: number | null = null;

    // ── Trust the file's pre-calculated average first ──────────────────────────
    if (avgColIdx >= 0) average = parseScore(row[avgColIdx]);

    // ── Fallback: weighted average with epsilon-safe rounding ──────────────────
    if (average === null) {
      let totalScore = 0, totalCoef = 0;
      for (const subj of BEM_SUBJECTS) {
        const s = scores[subj.key];
        if (s !== null) { totalScore += s * subj.coef; totalCoef += subj.coef; }
      }
      if (totalCoef > 0) average = round2(totalScore / totalCoef);
    }

    students.push({
      name, gender: detectGender(name), scores, average,
      passed: average !== null ? average >= 10 : null, rank: 0,
    });
  }

  if (students.length === 0) {
    res.status(400).json({
      error: "لم يتم العثور على بيانات تلاميذ في الملف",
      debug: { headerRowIndex, headers, nameColIdx, avgColIdx, subjectColMap,
               sample: allRows.slice(headerRowIndex + 1, headerRowIndex + 3) },
    });
    return;
  }

  // Sort + rank
  const sorted = [...students].filter(s => s.average !== null)
    .sort((a, b) => (b.average ?? 0) - (a.average ?? 0));
  sorted.forEach((s, i) => { s.rank = i + 1; });
  const noAvg = students.filter(s => s.average === null);
  const allRanked = [...sorted, ...noAvg];

  const passCount = sorted.filter(s => s.passed).length;
  const classAvg = sorted.length
    ? round2(sorted.reduce((sum, s) => sum + (s.average ?? 0), 0) / sorted.length)
    : null;

  const males   = students.filter(s => s.gender === "male");
  const females = students.filter(s => s.gender === "female");
  const genderStats = {
    males:          males.length,
    females:        females.length,
    unknown:        students.filter(s => s.gender === "unknown").length,
    malePass:       males.filter(s => s.passed).length,
    maleFail:       males.filter(s => s.passed === false).length,
    femalePass:     females.filter(s => s.passed).length,
    femaleFail:     females.filter(s => s.passed === false).length,
    malePassRate:   males.length > 0 ? round2(males.filter(s => s.passed).length / males.length * 100) : 0,
    femalePassRate: females.length > 0 ? round2(females.filter(s => s.passed).length / females.length * 100) : 0,
  };

  const detectedSubjects = BEM_SUBJECTS.filter(s => subjectColMap[s.key] !== undefined);
  const subjectStats = detectedSubjects.map(subj => {
    const scores = students.map(s => s.scores[subj.key]).filter((v): v is number => v !== null);
    const passC  = scores.filter(v => v >= 10).length;
    const avg    = scores.length > 0 ? round2(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
    return {
      key: subj.key, arLabel: subj.arLabel, coef: subj.coef,
      avg, passCount: passC, total: scores.length,
      passRate: scores.length > 0 ? round2(passC / scores.length * 100) : 0,
    };
  });

  const scoreDistribution = Array.from({ length: 20 }, (_, i) => ({
    range: String(i),
    count: students.filter(s => s.average !== null && Math.floor(s.average) === i).length,
  }));

  const result = {
    students: allRanked,
    summary: {
      total: students.length, withAvg: sorted.length,
      passCount, failCount: sorted.filter(s => !s.passed).length,
      passRate: sorted.length > 0 ? round2(passCount / sorted.length * 100) : 0,
      classAvg,
      first: sorted[0] ?? null,
      last:  sorted[sorted.length - 1] ?? null,
    },
    genderStats,
    subjectStats,
    scoreDistribution,
    detectedSubjects: detectedSubjects.map(s => ({ key: s.key, arLabel: s.arLabel, coef: s.coef })),
    fileName: req.file.originalname,
    avgColDetected: avgColIdx >= 0,
    avgColHeader: avgColIdx >= 0 ? headers[avgColIdx] : null,
  };

  req.log.info({ file: req.file.originalname, total: students.length, passed: passCount, avgColIdx, avgColHeader: result.avgColHeader }, "BEM analyzed");

  // ── Persist to DB ─────────────────────────────────────────────────────────
  const user = req.user as { id: string };
  try {
    const sessionId = randomUUID();
    await db.insert(bemSessionsTable).values({
      id: sessionId,
      userId: user.id,
      fileName: req.file.originalname,
      label: req.file.originalname.replace(/\.(xlsx?|xls)$/i, ""),
      data: result as any,
    });
    res.json({ ...result, sessionId });
  } catch (e) {
    // Still return result even if DB save fails
    req.log.error(e, "Failed to save BEM session to DB");
    res.json(result);
  }
});

export default router;
