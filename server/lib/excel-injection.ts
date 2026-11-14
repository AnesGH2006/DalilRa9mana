import ExcelJS from "exceljs";

export interface StudentCellPayload {
  student_id: string | number;
  name?: string;
  value: string | number | boolean | null;
  values?: Record<string, string | number | boolean | null>;
}

export interface ExcelInjectionOptions {
  targetColumn?: string | number;
  targetColumns?: Record<string, string | number>;
  worksheetName?: string;
  studentIdHeader?: string;
  headerRow?: number;
  dataStartRow?: number;
  overwriteExisting?: boolean;
  maxTemplateBytes?: number;
}

export type ExcelInjectionSkipReason =
  | "invalid_student_id"
  | "invalid_value"
  | "duplicate_payload_id"
  | "student_not_found"
  | "duplicate_template_id"
  | "merged_target_cell"
  | "formula_target_cell"
  | "existing_target_value";

export interface ExcelInjectionSkip {
  index: number;
  student_id: string | number;
  reason: ExcelInjectionSkipReason;
  detail: string;
}

export interface ExcelInjectionResult {
  buffer: Buffer;
  worksheetName: string;
  updated: number;
  updatedStudents: number;
  skipped: ExcelInjectionSkip[];
}

const DEFAULT_MAX_TEMPLATE_BYTES = 50 * 1024 * 1024;

function normalizeText(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function normalizeStudentId(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).normalize("NFKC").trim().toLocaleUpperCase();
}

function cellDisplayText(cell: ExcelJS.Cell): string {
  const displayed = cell.text;
  if (displayed) return displayed.trim();

  const value: unknown = cell.value;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value).trim();
  }
  if (value && typeof value === "object") {
    if ("text" in value && typeof value.text === "string") return value.text.trim();
    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText.map(part => typeof part?.text === "string" ? part.text : "").join("").trim();
    }
    if ("result" in value && (typeof value.result === "string" || typeof value.result === "number")) {
      return String(value.result).trim();
    }
  }
  return "";
}

function isFormulaCell(cell: ExcelJS.Cell): boolean {
  const value: unknown = cell.value;
  return Boolean(value && typeof value === "object" && ("formula" in value || "sharedFormula" in value));
}

function hasExistingValue(cell: ExcelJS.Cell): boolean {
  const value: unknown = cell.value;
  return value !== null && value !== undefined && !(typeof value === "string" && value.trim() === "");
}

function findHeaderColumn(worksheet: ExcelJS.Worksheet, rowNumber: number, header: string): number {
  const normalizedHeader = normalizeText(header);
  const row = worksheet.getRow(rowNumber);
  for (let column = 1; column <= row.cellCount; column += 1) {
    if (normalizeText(cellDisplayText(row.getCell(column))) === normalizedHeader) return column;
  }
  throw new Error(`Header "${header}" was not found in row ${rowNumber} of worksheet "${worksheet.name}"`);
}

/** Injects one value per matched Matricule without writing files or changing cell styles. */
export async function injectStudentValuesIntoWorkbook(
  template: Buffer | Uint8Array,
  students: StudentCellPayload[],
  options: ExcelInjectionOptions,
): Promise<ExcelInjectionResult> {
  if (!(template instanceof Uint8Array) || template.byteLength === 0) {
    throw new Error("Template must be a non-empty XLSX buffer");
  }
  const maxTemplateBytes = options.maxTemplateBytes ?? DEFAULT_MAX_TEMPLATE_BYTES;
  if (!Number.isInteger(maxTemplateBytes) || maxTemplateBytes <= 0) {
    throw new Error("maxTemplateBytes must be a positive integer");
  }
  if (template.byteLength > maxTemplateBytes) {
    throw new Error(`Template exceeds the ${maxTemplateBytes}-byte processing limit`);
  }
  if (!Array.isArray(students)) throw new Error("Student payload must be an array");
  if (!options.targetColumns && (options.targetColumn === undefined || (typeof options.targetColumn !== "string" && (!Number.isInteger(options.targetColumn) || options.targetColumn < 1)))) {
    throw new Error("targetColumn must be a header name or a 1-based column number");
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(template) as unknown as Buffer);

  const worksheet = options.worksheetName
    ? workbook.getWorksheet(options.worksheetName)
    : workbook.worksheets[0];
  if (!worksheet) throw new Error(options.worksheetName
    ? `Worksheet "${options.worksheetName}" was not found`
    : "Workbook does not contain a worksheet");

  const headerRow = options.headerRow ?? 1;
  const dataStartRow = options.dataStartRow ?? headerRow + 1;
  if (!Number.isInteger(headerRow) || headerRow < 1 || !Number.isInteger(dataStartRow) || dataStartRow <= headerRow) {
    throw new Error("headerRow and dataStartRow must be valid 1-based row numbers");
  }

  const idColumn = findHeaderColumn(worksheet, headerRow, options.studentIdHeader ?? "Matricule");
  const requestedTargets = options.targetColumns ?? { value: options.targetColumn! };
  const resolvedTargets = Object.fromEntries(Object.entries(requestedTargets).map(([field, column]) => [
    field,
    typeof column === "number" ? column : findHeaderColumn(worksheet, headerRow, column),
  ]));
  if (Object.values(resolvedTargets).some(column => column === idColumn)) throw new Error("The target column cannot be the Matricule column");

  const rowsByStudentId = new Map<string, ExcelJS.Row[]>();
  for (let rowNumber = dataStartRow; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const studentId = normalizeStudentId(cellDisplayText(row.getCell(idColumn)));
    if (!studentId) continue;
    const matches = rowsByStudentId.get(studentId) ?? [];
    matches.push(row);
    rowsByStudentId.set(studentId, matches);
  }

  const skipped: ExcelInjectionSkip[] = [];
  const seenPayloadIds = new Set<string>();
  let updated = 0;
  let updatedStudents = 0;

  for (const [index, student] of students.entries()) {
    if (!student || typeof student !== "object") {
      skipped.push({ index, student_id: "", reason: "invalid_student_id", detail: "Payload entry must be an object" });
      continue;
    }
    const studentId = normalizeStudentId(student?.student_id);
    const displayId = student?.student_id ?? "";
    if (!studentId) {
      skipped.push({ index, student_id: displayId, reason: "invalid_student_id", detail: "Student ID is empty" });
      continue;
    }
    const values = { value: student.value, ...(student.values ?? {}) };
    const invalidValue = Object.entries(values).some(([, value]) =>
      value !== null && typeof value !== "string" && typeof value !== "boolean" &&
      !(typeof value === "number" && Number.isFinite(value)),
    );
    if (invalidValue) {
      skipped.push({ index, student_id: displayId, reason: "invalid_value", detail: "Value must be a finite number, string, boolean, or null" });
      continue;
    }
    if (seenPayloadIds.has(studentId)) {
      skipped.push({ index, student_id: displayId, reason: "duplicate_payload_id", detail: "Student ID appears more than once in the payload" });
      continue;
    }
    seenPayloadIds.add(studentId);

    const matchingRows = rowsByStudentId.get(studentId) ?? [];
    if (matchingRows.length === 0) {
      skipped.push({ index, student_id: displayId, reason: "student_not_found", detail: "Student ID was not found in the template" });
      continue;
    }
    if (matchingRows.length > 1) {
      skipped.push({ index, student_id: displayId, reason: "duplicate_template_id", detail: `Student ID appears in ${matchingRows.length} template rows` });
      continue;
    }

    let studentWasUpdated = false;
    for (const [field, value] of Object.entries(values)) {
      if (value === undefined || !(field in resolvedTargets)) continue;
      const targetCell = matchingRows[0]!.getCell(resolvedTargets[field]!);
      if (targetCell.isMerged) {
        skipped.push({ index, student_id: displayId, reason: "merged_target_cell", detail: `${field}: ${targetCell.address} is part of a merged range` });
        continue;
      }
      if (isFormulaCell(targetCell)) {
        skipped.push({ index, student_id: displayId, reason: "formula_target_cell", detail: `${field}: ${targetCell.address} contains a formula` });
        continue;
      }
      if (!options.overwriteExisting && hasExistingValue(targetCell)) {
        skipped.push({ index, student_id: displayId, reason: "existing_target_value", detail: `${field}: ${targetCell.address} already contains a value` });
        continue;
      }
      targetCell.value = value;
      updated += 1;
      studentWasUpdated = true;
    }
    if (studentWasUpdated) updatedStudents += 1;
  }

  const output = await workbook.xlsx.writeBuffer();
  return { buffer: Buffer.from(output), worksheetName: worksheet.name, updated, updatedStudents, skipped };
}

export interface ExcelTemplateInspection {
  worksheetNames: string[];
  worksheetName: string;
  headers: string[];
  studentIdHeader: string | null;
  rows: Array<{ rowNumber: number; studentId: string; name: string }>;
}

export async function inspectExcelTemplate(template: Buffer | Uint8Array, options: {
  worksheetName?: string;
  headerRow?: number;
  dataStartRow?: number;
  studentIdHeader?: string;
} = {}): Promise<ExcelTemplateInspection> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(template) as unknown as Buffer);
  const worksheet = options.worksheetName ? workbook.getWorksheet(options.worksheetName) : workbook.worksheets[0];
  if (!worksheet) throw new Error("Worksheet was not found");
  const headerRow = options.headerRow ?? 1;
  const dataStartRow = options.dataStartRow ?? headerRow + 1;
  const headerCells = worksheet.getRow(headerRow);
  const headers = Array.from({ length: headerCells.cellCount }, (_, index) => cellDisplayText(headerCells.getCell(index + 1))).filter(Boolean);
  let idColumn = 0;
  if (options.studentIdHeader) {
    try { idColumn = findHeaderColumn(worksheet, headerRow, options.studentIdHeader); } catch { idColumn = 0; }
  }
  if (!idColumn) {
    const headerRowValues = worksheet.getRow(headerRow);
    for (let column = 1; column <= headerRowValues.cellCount; column += 1) {
      if (/matricule|student\s*id|رقم\s*(التسجيل|التلميذ|التعريف)|المعرف|الرقم\s*المدرسي/i.test(normalizeText(cellDisplayText(headerRowValues.getCell(column))))) {
        idColumn = column;
        break;
      }
    }
  }
  const nameColumn = headers.findIndex(header => /name|nom|اسم/i.test(header)) + 1;
  const rows: ExcelTemplateInspection["rows"] = [];
  if (idColumn > 0) {
    for (let rowNumber = dataStartRow; rowNumber <= Math.min(worksheet.rowCount, dataStartRow + 199); rowNumber += 1) {
      const row = worksheet.getRow(rowNumber);
      const studentId = normalizeStudentId(cellDisplayText(row.getCell(idColumn)));
      if (studentId) rows.push({ rowNumber, studentId, name: nameColumn > 0 ? cellDisplayText(row.getCell(nameColumn)) : "" });
    }
  }
  return { worksheetNames: workbook.worksheets.map(sheet => sheet.name), worksheetName: worksheet.name, headers, studentIdHeader: idColumn ? cellDisplayText(worksheet.getRow(headerRow).getCell(idColumn)) : null, rows };
}