import { Router, type Request } from "express";
import multer from "multer";
import * as XLSX from "xlsx";
import { and, eq, inArray } from "drizzle-orm";
import { db, absencesTable, gradesTable, studentsTable } from "../../shared/db.js";
import { injectStudentValuesIntoWorkbook, inspectExcelTemplate, type ExcelInjectionOptions, type StudentCellPayload } from "../lib/excel-injection.js";
import { canUseStaffFeature } from "../middlewares/staffAccess.js";

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024, files: 1 },
});

/**
 * Who may read a spreadsheet and inject values into a template:
 *  - the school owner
 *  - a teacher/supervisor who has the "imports" permission AND unlocked "Excel export"
 *    (school paid plan, or their own 2,000 DZD staff plan)
 * These routes only work on the file the user uploads, so they never touch school data.
 */
function mayUseInjection(req: Request): boolean {
  if (!req.isAuthenticated() || !req.user) return false;
  const member = req.memberContext;
  if (!member) return true;
  return member.role !== "parent"
    && member.permissions.includes("imports")
    && canUseStaffFeature(req, "excel_export");
}

const INJECTION_DENIED = "هذه الميزة متاحة لمسؤول المؤسسة أو لمن فعّل اشتراك تصدير Excel";

function normalizeHeader(value: unknown): string {
  return String(value ?? "").normalize("NFKC").toLowerCase().replace(/[\u064B-\u065F\u0670\u0640]/g, "").replace(/\s+/g, " ").trim();
}

function isStudentIdHeader(value: unknown): boolean {
  const header = normalizeHeader(value);
  return /matricule|student\s*id|student\s*number|رقم\s*(التسجيل|التلميذ|التعريف)|المعرف|الرقم\s*المدرسي/.test(header);
}

function isNameHeader(value: unknown): boolean {
  return /student\s*name|full\s*name|nom\s*et\s*prenom|الاسم\s*واللقب|اسم\s*التلميذ|اللقب|الاسم/.test(normalizeHeader(value));
}

function isNonDataHeader(value: unknown): boolean {
  return /matricule|student\s*id|رقم|اسم|اللقب|name|nom|classe|قسم|المستوى|الجنس|sexe|gender|date|تاريخ|سنة|year/.test(normalizeHeader(value));
}

function parseNumericCell(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const normalized = String(value ?? "").trim().replace(",", ".");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

router.post("/excel-injection/extract", upload.single("source"), async (req, res): Promise<void> => {
  if (!mayUseInjection(req)) { res.status(403).json({ error: INJECTION_DENIED }); return; }
  if (!req.file) { res.status(400).json({ error: "ارفع ملف المصدر أولاً" }); return; }
  if (!/\.xlsx$/i.test(req.file.originalname)) { res.status(400).json({ error: "ملف المصدر يجب أن يكون بصيغة .xlsx" }); return; }
  const mode = req.body?.mode === "absences" ? "absences" : "grades";
  try {
    const workbook = XLSX.read(req.file.buffer, { type: "buffer", raw: false, cellDates: false });
    let best: { name: string; rows: unknown[][]; headerRow: number; idColumn: number; nameColumn: number; fieldColumns: Array<{ key: string; label: string; column: number }> } | null = null;
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) continue;
      const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: "", blankrows: false });
      for (let headerRow = 0; headerRow < Math.min(rows.length, 20); headerRow += 1) {
        const headers = rows[headerRow] ?? [];
        const idColumn = headers.findIndex(isStudentIdHeader);
        if (idColumn < 0) continue;
        const nameColumn = headers.findIndex(isNameHeader);
        const fieldColumns = headers.flatMap((header, column) => {
          if (column === idColumn || column === nameColumn || isNonDataHeader(header)) return [];
          const values = rows.slice(headerRow + 1, Math.min(rows.length, headerRow + 501)).map(row => parseNumericCell(row[column]));
          const numericCount = values.filter(value => value !== null).length;
          if (numericCount < 1 || numericCount / Math.max(1, values.length) < 0.5) return [];
          const label = String(header ?? "").trim() || `عمود ${column + 1}`;
          if (mode === "grades" && values.some(value => value !== null && (value < 0 || value > 20))) return [];
          if (mode === "absences" && !/غياب|مبرر|غير مبرر|ساعات|absence|absent|justif|hour/i.test(label)) return [];
          return [{ key: `field_${column}`, label, column }];
        });
        if (!fieldColumns.length) continue;
        const candidate = { name: sheetName, rows, headerRow, idColumn, nameColumn, fieldColumns };
        if (!best || fieldColumns.length > best.fieldColumns.length) best = candidate;
      }
    }
    if (!best) {
      res.status(400).json({ error: "تعذر اكتشاف عمود Matricule مع أعمدة درجات أو غيابات رقمية في الملف" });
      return;
    }
    const rows = best.rows.slice(best.headerRow + 1).flatMap(row => {
      const studentId = String(row[best!.idColumn] ?? "").trim();
      if (!studentId) return [];
      const values = Object.fromEntries(best!.fieldColumns.map(field => [field.key, parseNumericCell(row[field.column])]).filter(([, value]) => value !== null));
      return [{ student_id: studentId, name: best!.nameColumn >= 0 ? String(row[best!.nameColumn] ?? "").trim() : "", value: Object.values(values)[0] ?? null, values }];
    }).slice(0, 10000);
    res.json({ worksheetName: best.name, headerRow: best.headerRow + 1, fields: best.fieldColumns.map(({ key, label }) => ({ key, label })), rows });
  } catch (error) {
    req.log.error({ error }, "Excel source extraction failed");
    res.status(400).json({ error: "تعذر قراءة ملف المصدر. تحقق من سلامة ملف XLSX" });
  }
});

router.post("/excel-injection/inspect", upload.single("template"), async (req, res): Promise<void> => {
  if (!mayUseInjection(req)) { res.status(403).json({ error: INJECTION_DENIED }); return; }
  if (!req.file) { res.status(400).json({ error: "ارفع القالب أولاً" }); return; }
  try {
    const result = await inspectExcelTemplate(req.file.buffer, {
      worksheetName: typeof req.body?.worksheetName === "string" ? req.body.worksheetName : undefined,
      headerRow: Number(req.body?.headerRow) || 1,
      dataStartRow: Number(req.body?.dataStartRow) || 2,
      studentIdHeader: typeof req.body?.studentIdHeader === "string" ? req.body.studentIdHeader : "Matricule",
    });
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "تعذر قراءة القالب" });
  }
});

// School data stays owner-only: it reads grades/absences of the whole school.
router.get("/excel-injection/school-data", async (req, res): Promise<void> => {
  if (!req.isAuthenticated() || !req.user || req.memberContext) { res.status(403).json({ error: "مسؤول المؤسسة فقط" }); return; }
  const annee = String(req.query.annee ?? "2026-2027");
  const niveau = typeof req.query.niveau === "string" ? req.query.niveau : undefined;
  const classe = typeof req.query.classe === "string" ? req.query.classe : undefined;
  const kind = req.query.kind === "absences" ? "absences" : "grades";
  const trimestre = ["1", "2", "3"].includes(String(req.query.trimestre)) ? Number(req.query.trimestre) : undefined;
  const baseConditions = [eq(studentsTable.userId, req.user.id), eq(studentsTable.annee, annee)];
  const classRows = await db.selectDistinct({ classe: studentsTable.classe }).from(studentsTable)
    .where(and(...baseConditions, ...(niveau ? [eq(studentsTable.niveau, niveau as never)] : [])))
    .orderBy(studentsTable.classe);
  const conditions = [...baseConditions];
  if (niveau) conditions.push(eq(studentsTable.niveau, niveau as never));
  if (classe) conditions.push(eq(studentsTable.classe, classe));
  const students = await db.select().from(studentsTable).where(and(...conditions));
  const ids = students.map(student => student.id);
  if (!ids.length) { res.json({ rows: [], fields: [], classes: classRows.map(row => row.classe) }); return; }
  const grades = kind === "grades"
    ? await db.select().from(gradesTable).where(and(eq(gradesTable.userId, req.user.id), inArray(gradesTable.studentId, ids), eq(gradesTable.annee, annee), ...(trimestre ? [eq(gradesTable.trimestre, trimestre)] : [])))
    : [];
  const absences = kind === "absences"
    ? await db.select().from(absencesTable).where(and(eq(absencesTable.userId, req.user.id), inArray(absencesTable.studentId, ids), eq(absencesTable.annee, annee), ...(trimestre ? [eq(absencesTable.trimestre, trimestre)] : [])))
    : [];
  const valuesByStudent = new Map<string, Record<string, number>>();
  const fieldLabels = new Map<string, string>();
  for (const grade of grades) {
    const score = Number(grade.score);
    if (!Number.isFinite(score)) continue;
    const values = valuesByStudent.get(grade.studentId) ?? {};
    const key = grade.subject === "__avg__"
      ? `t${grade.trimestre}_average`
      : `t${grade.trimestre}_${normalizeHeader(grade.subject).replace(/[^\p{L}\p{N}]+/gu, "_")}_${grade.gradeType}`;
    const label = grade.subject === "__avg__"
      ? `معدل الفصل ${grade.trimestre}`
      : `ف${grade.trimestre} · ${grade.subject} · ${grade.gradeType}`;
    values[key] = score;
    fieldLabels.set(key, label);
    valuesByStudent.set(grade.studentId, values);
  }
  const absenceMap = new Map<string, { justified_hours: number; unjustified_hours: number }>();
  for (const absence of absences) {
    const current = absenceMap.get(absence.studentId) ?? { justified_hours: 0, unjustified_hours: 0 };
    current.justified_hours += absence.justifiedHours;
    current.unjustified_hours += absence.unjustifiedHours;
    absenceMap.set(absence.studentId, current);
  }
  const rows = students.map(student => {
    const gradeValues = valuesByStudent.get(student.id) ?? {};
    const termAvgs = [1, 2, 3].map(term => gradeValues[`t${term}_average`]).filter((value): value is number => value !== undefined);
    const absence = absenceMap.get(student.id) ?? { justified_hours: 0, unjustified_hours: 0 };
    return {
      student_id: student.raqm ?? student.id,
      name: student.nomPrenom,
      value: termAvgs.length ? Number((termAvgs.reduce((sum, value) => sum + value, 0) / termAvgs.length).toFixed(2)) : null,
      values: kind === "grades" ? gradeValues : absence,
    };
  });
  const fields = kind === "grades"
    ? [{ key: "value", label: trimestre ? `معدل الفصل ${trimestre}` : "المعدل السنوي" }, ...[...fieldLabels].map(([key, label]) => ({ key, label }))]
    : [{ key: "justified_hours", label: "ساعات الغياب المبررة" }, { key: "unjustified_hours", label: "ساعات الغياب غير المبررة" }];
  res.json({ rows, fields, classes: classRows.map(row => row.classe) });
});

router.post("/excel-injection", upload.single("template"), async (req, res): Promise<void> => {
  if (!mayUseInjection(req)) {
    res.status(403).json({ error: INJECTION_DENIED });
    return;
  }
  if (!req.file) {
    res.status(400).json({ error: "ارفع ملف قالب Excel أولاً" });
    return;
  }
  if (!/\.xlsx$/i.test(req.file.originalname)) {
    res.status(400).json({ error: "يجب أن يكون القالب بصيغة .xlsx" });
    return;
  }

  let students: StudentCellPayload[];
  let options: ExcelInjectionOptions;
  try {
    const parsedStudents: unknown = JSON.parse(String(req.body?.studentsJson ?? ""));
    const parsedOptions: unknown = JSON.parse(String(req.body?.optionsJson ?? "{}"));
    if (!Array.isArray(parsedStudents)) throw new Error("studentsJson يجب أن يكون مصفوفة JSON");
    if (!parsedOptions || typeof parsedOptions !== "object") throw new Error("optionsJson غير صالح");
    students = parsedStudents as StudentCellPayload[];
    options = parsedOptions as ExcelInjectionOptions;
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "بيانات JSON غير صالحة" });
    return;
  }

  try {
    const result = await injectStudentValuesIntoWorkbook(req.file.buffer, students, options);
    res.set({
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="injected-${Date.now()}.xlsx"`,
      "X-Excel-Updated": String(result.updated),
      "X-Excel-Updated-Students": String(result.updatedStudents),
      "X-Excel-Skipped": String(result.skipped.length),
      "X-Excel-Skip-Report": encodeURIComponent(JSON.stringify(result.skipped.slice(0, 10))),
    });
    res.send(result.buffer);
  } catch (error) {
    req.log.error({ error }, "Excel injection failed");
    res.status(400).json({ error: error instanceof Error ? error.message : "تعذر معالجة ملف Excel" });
  }
});

export default router;