import assert from "node:assert/strict";
import { test } from "node:test";
import ExcelJS from "exceljs";
import { injectStudentValuesIntoWorkbook } from "./excel-injection.js";

test("injects matched values while preserving template formatting, formulas, merges, and print layout", async () => {
  const source = new ExcelJS.Workbook();
  const worksheet = source.addWorksheet("Grades");
  worksheet.mergeCells("A1:D1");
  worksheet.getCell("A1").value = "Annual grades";
  worksheet.getRow(2).values = ["Matricule", "Student name", "Exam score", "Double", "Absences"];
  worksheet.getCell("A3").value = "2023001";
  worksheet.getCell("B3").value = "Aymen Benali";
  worksheet.getCell("C3").value = null;
  worksheet.getCell("C3").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFF00" } };
  worksheet.getCell("C3").border = { bottom: { style: "thin", color: { argb: "FF000000" } } };
  worksheet.getCell("D3").value = { formula: "C3*2" };
  worksheet.getCell("A4").value = "2023002";
  worksheet.getCell("C4").value = { formula: "10+5" };
  worksheet.getCell("A5").value = "2023003";
  worksheet.mergeCells("C5:D5");
  worksheet.getColumn(3).width = 18;
  worksheet.pageSetup.printArea = "A1:E5";

  const originalBuffer = Buffer.from(await source.xlsx.writeBuffer());
  const baseline = new ExcelJS.Workbook();
  await baseline.xlsx.load(originalBuffer as unknown as Buffer);
  const baselineSheet = baseline.getWorksheet("Grades")!;
  const originalStyle = structuredClone(baselineSheet.getCell("C3").style);
  const originalFormula = structuredClone(baselineSheet.getCell("D3").value);
  const originalMerges = [...baselineSheet.model.merges];

  const result = await injectStudentValuesIntoWorkbook(originalBuffer, [
    { student_id: "2023001", name: "Aymen Benali", value: 15.5, values: { absences: 2 } },
    { student_id: "2023002", name: "Sarah Mansouri", value: 18 },
    { student_id: "2023003", name: "Merged target", value: 11 },
    { student_id: "2023001", name: "Duplicate payload", value: 12 },
    { student_id: "missing", name: "Unknown", value: 8 },
  ], { worksheetName: "Grades", headerRow: 2, targetColumns: { value: "Exam score", absences: "Absences" } });

  const output = new ExcelJS.Workbook();
  await output.xlsx.load(result.buffer as unknown as Buffer);
  const outputSheet = output.getWorksheet("Grades")!;

  assert.equal(result.updated, 2);
  assert.equal(result.updatedStudents, 1);
  assert.deepEqual(result.skipped.map(item => item.reason), [
    "formula_target_cell",
    "merged_target_cell",
    "duplicate_payload_id",
    "student_not_found",
  ]);
  assert.equal(outputSheet.getCell("C3").value, 15.5);
  assert.equal(outputSheet.getCell("E3").value, 2);
  assert.deepEqual(outputSheet.getCell("C3").style, originalStyle);
  assert.deepEqual(outputSheet.getCell("D3").value, originalFormula);
  assert.deepEqual(outputSheet.model.merges, originalMerges);
  assert.equal(outputSheet.getColumn(3).width, 18);
  assert.equal(outputSheet.pageSetup.printArea, "A1:E5");

  const untouchedSource = new ExcelJS.Workbook();
  await untouchedSource.xlsx.load(originalBuffer as unknown as Buffer);
  assert.equal(untouchedSource.getWorksheet("Grades")!.getCell("C3").value, null);
});