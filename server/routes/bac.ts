import { Router, type IRouter } from "express";
import multer from "multer";
import * as XLSX from "xlsx";
import { parseHTMLWorkbook } from "./students.js";
import {
  getBacSubjectsForFiliere,
  LYCEE_BAC_FILIERE_LABELS,
  normalizeLyceeBacFiliere,
  type LyceeBacFiliere,
} from "../../shared/subjects.js";
import { getSchoolStageForRequest } from "../config/school-stage.js";

const router: IRouter = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    if (/\.(xlsx|xls)$/i.test(file.originalname)) callback(null, true);
    else callback(new Error("يجب أن يكون الملف بصيغة Excel (.xlsx أو .xls)"));
  },
});

type BacSubjectKey = ReturnType<typeof getBacSubjectsForFiliere>[number]["key"];

function normalizeHeader(value: string): string {
  return value.toLowerCase()
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[أإآا]/g, "ا")
    .replace(/[ةه]/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/\s+/g, "")
    .replace(/[^\p{L}\p{N}]/gu, "");
}

function detectSubject(header: string): BacSubjectKey | null {
  const value = normalizeHeader(header);
  if (value.includes("رياضيات") || value.includes("math")) return "maths";
  if (value.includes("عربي") || value.includes("arab")) return "arabe";
  if (value.includes("فرنسي") || value.includes("franc")) return "francais";
  if (value.includes("انجليزي") || value.includes("anglais") || value.includes("english")) return "anglais";
  if (value.includes("تاريخ") || value.includes("جغرافيا") || value.includes("histoire") || value.includes("geographie")) return "histoire_geo";
  if (value.includes("فلسف") || value.includes("philosoph")) return "philosophy";
  if (value.includes("اسلام") || value.includes("islam")) return "islam";
  if (value.includes("طبيعي") || value.includes("طبيعه") || value.includes("حياه") || value.includes("svt") || value.includes("sciencesnaturelles") || value.includes("sciencenaturelle")) return "svt";
  if (value.includes("فيزي") || value.includes("physique") || value.includes("physics")) return "physique";
  if (value.includes("تقني") || value.includes("technique") || value.includes("technolog")) return "technical";
  if (value.includes("محاسب") || value.includes("comptab")) return "accounting";
  if (value.includes("اقتصاد") || value.includes("management") || value.includes("econom")) return "economics";
  if (value.includes("قانون") || value.includes("droit") || value.includes("law")) return "law";
  if (value.includes("ثالث") && (value.includes("لغه") || value.includes("langue"))) return "third_language";
  return null;
}

function parseScore(value: unknown): number | null {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const raw = String(value).trim()
    .replace(/[٠-٩]/g, digit => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/\u066B/g, ".")
    .replace(",", ".");
  const score = Number(raw);
  return Number.isFinite(score) && score >= 0 && score <= 20 ? score : null;
}

function parseExcel(buffer: Buffer): { rows: unknown[][]; error?: string } {
  if (buffer.toString("utf-8").trimStart().startsWith("<")) return parseHTMLWorkbook(buffer);
  try {
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) return { rows: [], error: "الملف لا يحتوي على أوراق عمل" };
    const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[firstSheetName]!, {
      defval: null,
      header: 1,
    }) as unknown[][];
    return { rows };
  } catch {
    return { rows: [], error: "تعذرت قراءة الملف. تأكد أنه ملف Excel سليم." };
  }
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

router.post("/bac/analyze", upload.single("file"), async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (getSchoolStageForRequest(req) !== "lycee") {
    res.status(403).json({ error: "تحليل البكالوريا متاح للثانويات فقط" });
    return;
  }
  if (!req.file) { res.status(400).json({ error: "اختر ملف نتائج البكالوريا أولاً" }); return; }

  const { rows, error: parseError } = parseExcel(req.file.buffer);
  if (parseError) { res.status(400).json({ error: parseError }); return; }
  if (!rows.length) { res.status(400).json({ error: "الملف فارغ أو لا يحتوي على بيانات" }); return; }

  let headerRow = -1;
  let headers: string[] = [];
  for (let index = 0; index < Math.min(rows.length, 20); index++) {
    const candidate = rows[index] ?? [];
    const textCount = candidate.filter(cell => typeof cell === "string" && cell.trim().length > 1).length;
    if (textCount >= 3 && candidate.some(cell => /اسم|لقب|nom|name|تلميذ|متعلم/i.test(String(cell ?? "")))) {
      headerRow = index;
      headers = candidate.map(cell => String(cell ?? "").trim());
      break;
    }
  }
  if (headerRow < 0) { res.status(400).json({ error: "تعذر العثور على صف العناوين أو عمود أسماء المترشحين" }); return; }

  const nameColumn = headers.findIndex(header => /اسم|لقب|nom|name|تلميذ|متعلم/i.test(header));
  if (nameColumn < 0) { res.status(400).json({ error: "لم يتم العثور على عمود أسماء المترشحين" }); return; }
  const filiereColumn = headers.findIndex(header => /شعب|fili[eè]re|stream|specialit[eé]/i.test(header));
  const averageColumn = headers.findIndex(header =>
    /معدل|moyenne|average|avg/i.test(header) && !detectSubject(header),
  );
  const subjectColumns = new Map<BacSubjectKey, number>();
  headers.forEach((header, index) => {
    const key = detectSubject(header);
    if (key && !subjectColumns.has(key)) subjectColumns.set(key, index);
  });
  if (subjectColumns.size === 0 && averageColumn < 0) {
    res.status(400).json({ error: "لم يتم التعرف على أعمدة المواد. استخدم عناوين مثل الرياضيات، العربية، العلوم أو الفيزياء." });
    return;
  }

  const defaultFiliere = typeof req.body.filiere === "string"
    ? normalizeLyceeBacFiliere(req.body.filiere)
    : null;
  if (req.body.filiere && !defaultFiliere) {
    res.status(400).json({ error: "الشعبة الافتراضية غير صالحة" });
    return;
  }

  const students: Array<{
    name: string;
    filiere: LyceeBacFiliere;
    scores: Partial<Record<BacSubjectKey, number>>;
    average: number;
    averageSource: "file" | "computed";
    passed: boolean;
    rank: number;
  }> = [];
  const rowsWithoutFiliere: string[] = [];
  const rowsWithoutScores: string[] = [];

  for (const row of rows.slice(headerRow + 1)) {
    const name = String(row[nameColumn] ?? "").trim();
    if (!name) continue;
    const rawFiliere = filiereColumn >= 0 ? String(row[filiereColumn] ?? "").trim() : "";
    const filiere = rawFiliere
      ? normalizeLyceeBacFiliere(rawFiliere)
      : defaultFiliere;
    if (!filiere) {
      rowsWithoutFiliere.push(name);
      continue;
    }
    const subjects = getBacSubjectsForFiliere(filiere);
    const scores: Partial<Record<BacSubjectKey, number>> = {};
    for (const subject of subjects) {
      const column = subjectColumns.get(subject.key);
      if (column === undefined) continue;
      const score = parseScore(row[column]);
      if (score !== null) scores[subject.key] = score;
    }
    const availableSubjects = subjects.filter(subject => scores[subject.key] !== undefined);
    const fileAverage = averageColumn >= 0 ? parseScore(row[averageColumn]) : null;
    if (!availableSubjects.length && fileAverage === null) {
      rowsWithoutScores.push(name);
      continue;
    }
    const coefficientTotal = availableSubjects.reduce((total, subject) => total + subject.coef, 0);
    const calculatedAverage = coefficientTotal > 0
      ? round2(availableSubjects.reduce(
        (total, subject) => total + scores[subject.key]! * subject.coef,
        0,
      ) / coefficientTotal)
      : null;
    const average = fileAverage ?? calculatedAverage;
    if (average === null) continue;
    students.push({
      name, filiere, scores, average,
      averageSource: fileAverage === null ? "computed" : "file",
      passed: average >= 10,
      rank: 0,
    });
  }

  if (rowsWithoutFiliere.length) {
    res.status(400).json({
      error: `تعذر تحديد الشعبة لـ ${rowsWithoutFiliere.length} مترشح. أضف عمود الشعبة أو اختر شعبة افتراضية.`,
      missingFiliereCount: rowsWithoutFiliere.length,
      sampleNames: rowsWithoutFiliere.slice(0, 5),
    });
    return;
  }
  if (!students.length) {
    res.status(400).json({ error: "لم يتم العثور على مترشحين لديهم علامات صالحة بين 0 و20" });
    return;
  }

  const grouped = new Map<LyceeBacFiliere, typeof students>();
  for (const student of students) {
    const group = grouped.get(student.filiere) ?? [];
    group.push(student);
    grouped.set(student.filiere, group);
  }
  for (const group of grouped.values()) {
    group.sort((a, b) => b.average - a.average || a.name.localeCompare(b.name, "ar"));
    group.forEach((student, index) => { student.rank = index + 1; });
  }

  const trackStats = Array.from(grouped.entries()).map(([filiere, group]) => ({
    filiere,
    label: LYCEE_BAC_FILIERE_LABELS[filiere],
    total: group.length,
    passCount: group.filter(student => student.passed).length,
    failCount: group.filter(student => !student.passed).length,
    passRate: round2(group.filter(student => student.passed).length / group.length * 100),
    average: round2(group.reduce((sum, student) => sum + student.average, 0) / group.length),
    topStudent: group[0]!,
  }));
  const subjectStats = Array.from(grouped.entries()).flatMap(([filiere, group]) =>
    getBacSubjectsForFiliere(filiere)
      .filter(subject => subjectColumns.has(subject.key))
      .map(subject => {
        const scores = group.map(student => student.scores[subject.key]).filter((score): score is number => score !== undefined);
        return {
          filiere,
          filiereLabel: LYCEE_BAC_FILIERE_LABELS[filiere],
          key: subject.key,
          label: subject.arLabel,
          coefficient: subject.coef,
          average: scores.length ? round2(scores.reduce((sum, score) => sum + score, 0) / scores.length) : null,
          passCount: scores.filter(score => score >= 10).length,
          total: scores.length,
        };
      }),
  );
  const sortedStudents = [...students].sort((a, b) => a.filiere.localeCompare(b.filiere) || a.rank - b.rank);
  const result = {
    fileName: req.file.originalname,
    summary: {
      total: students.length,
      passCount: students.filter(student => student.passed).length,
      failCount: students.filter(student => !student.passed).length,
      passRate: round2(students.filter(student => student.passed).length / students.length * 100),
      average: round2(students.reduce((sum, student) => sum + student.average, 0) / students.length),
    },
    trackStats,
    subjectStats,
    scoreDistribution: Array.from({ length: 20 }, (_, score) => ({
      range: `${score}–${score + 1}`,
      count: students.filter(student => Math.min(Math.floor(student.average), 19) === score).length,
    })),
    warnings: rowsWithoutScores.length
      ? [`تم تجاوز ${rowsWithoutScores.length} مترشح لعدم وجود معدل أو علامات صالحة: ${rowsWithoutScores.slice(0, 5).join("، ")}`]
      : [],
    students: sortedStudents,
  };
  req.log.info({
    file: req.file.originalname,
    total: result.summary.total,
    tracks: trackStats.length,
    subjects: subjectColumns.size,
  }, "Baccalaureate results analyzed");
  res.json(result);
});

export default router;
