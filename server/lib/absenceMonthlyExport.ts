import ExcelJS from "exceljs";

export interface MonthlyAbsenceRecord {
  attendanceDate: string;
  studentName: string;
  dateNaissance?: string | null;
  raqm?: number | null;
  classe?: string | null;
  niveau?: string | null;
  status?: string | null;
}

const HEADERS = ["الحساب البريدي", "اللقب", "الاسم", "تاريخ الازدياد", "الرتبة", "تاريخ الغياب", "على الساعة", "تاريخ العودة من الغياب", "على الساعة"];

function splitStudentName(value: string): { last: string; first: string } {
  const parts = String(value ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { last: "", first: parts[0] ?? "" };
  return { last: parts.slice(0, -1).join(" "), first: parts[parts.length - 1]! };
}

function findHeaderRow(ws: ExcelJS.Worksheet): number {
  for (let rowNumber = 1; rowNumber <= Math.min(ws.rowCount, 15); rowNumber += 1) {
    const row = ws.getRow(rowNumber);
    for (let col = 1; col <= Math.max(row.cellCount, HEADERS.length); col += 1) {
      if (String(row.getCell(col).text ?? "").includes("الحساب البريدي")) return rowNumber;
    }
  }
  return 4;
}

async function loadWorkbook(template?: Buffer): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  if (template?.length) {
    await workbook.xlsx.load(template as unknown as Buffer);
    return workbook;
  }
  const ws = workbook.addWorksheet("وزارة  التربية الوطنية");
  ws.getCell("A1").value = "الجمهورية الجزائرية الديمقراطية الشعبية";
  ws.getCell("A2").value = "وزارة التربية الوطنية";
  ws.getCell("A3").value = "قائمة الغيابات الشهرية";
  HEADERS.forEach((header, index) => { ws.getRow(4).getCell(index + 1).value = header; });
  ws.columns = HEADERS.map(() => ({ width: 18 }));
  return workbook;
}

export async function buildMonthlyAbsenceWorkbook(records: MonthlyAbsenceRecord[], template?: Buffer): Promise<Buffer> {
  const workbook = await loadWorkbook(template);
  const ws = workbook.worksheets[0];
  if (!ws) throw new Error("Workbook does not contain a worksheet");
  const headerRow = findHeaderRow(ws);
  const dataStartRow = headerRow + 1;

  records.forEach((record, index) => {
    const rowNumber = dataStartRow + index;
    const row = ws.getRow(rowNumber);
    const { last, first } = splitStudentName(record.studentName);
    row.getCell(1).value = "";
    row.getCell(2).value = last;
    row.getCell(3).value = first;
    row.getCell(4).value = record.dateNaissance ?? "";
    row.getCell(5).value = record.raqm ?? "";
    row.getCell(6).value = record.attendanceDate;
    row.getCell(7).value = "";
    row.getCell(8).value = "";
    row.getCell(9).value = "";
  });

  const output = await workbook.xlsx.writeBuffer();
  return Buffer.from(output);
}
