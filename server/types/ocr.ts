/**
 * Vision OCR contracts for Algerian grade / attendance sheets.
 * (Requested as src/types/ocr.ts — lives under server/ to match this repo.)
 */

export const ATTENDANCE_STATUSES = ["PRESENT", "ABSENT", "EXCUSED"] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

/** One student row extracted from a grade or attendance sheet image. */
export interface StudentGradeRecord {
  /** رقم التعريف المدرسي */
  matricule: string | null;
  /** الاسم واللقب */
  student_name: string;
  /** التقويم المستمر — 0.00 to 20.00 */
  continuous_eval: number | null;
  /** الفرض الأول — 0.00 to 20.00 */
  test_1: number | null;
  /** الاختبار — 0.00 to 20.00 */
  exam: number | null;
  status: AttendanceStatus;
  notes: string | null;
}

export interface OcrScanResult {
  success: boolean;
  total_students: number;
  records: StudentGradeRecord[];
  raw_text_debug?: string;
}
