/**
 * Gemini 1.5 Flash vision OCR for Algerian school grade/attendance sheets.
 * (Requested as src/services/visionOcrService.ts)
 */
import { GoogleGenerativeAI } from "@google/generative-ai";
import { logger } from "../lib/logger.js";
import {
  ATTENDANCE_STATUSES,
  type AttendanceStatus,
  type OcrScanResult,
  type StudentGradeRecord,
} from "../types/ocr.js";

export const GEMINI_VISION_MODEL = "gemini-1.5-flash";

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/jpg"]);

const ARABIC_INDIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const EASTERN_ARABIC_DIGITS = "۰۱۲۳۴۵۶۷۸۹";

const SCAN_PROMPT = `You are an expert OCR engine for Algerian middle-school (CEM / lycée) paper sheets.

The image is a printed or handwritten grade sheet and/or attendance sheet in Arabic (and sometimes French).

Extract EVERY student row. Do not invent students that are not visible.

Rules:
1. Read Arabic handwritten names carefully. Keep original Arabic script. Trim extra spaces.
2. matricule is رقم التعريف المدرسي / رقم التسجيل / رقم التلميذ. Use null if missing.
3. Map columns:
   - continuous_eval = التقويم المستمر / المراقبة المستمرة / CC
   - test_1 = الفرض الأول / الفرض 1 / F1
   - exam = الاختبار / الامتحان / DUT
4. Numbers: convert European commas to dots ("14,5" → 14.5). Convert Arabic-Indic digits to Western digits. Grades are on 20. If a value is outside 0–20, treat it as unreadable (null). Empty cells are null, never 0 unless 0 is clearly written.
5. status:
   - PRESENT if the student is present, unmarked, or has grades filled
   - ABSENT for غائب / غ / غ.م / absent without excuse
   - EXCUSED for غياب مبرر / غ مبرر / معذور / excused
6. notes: extra remarks (مرض, قرار, إلخ) or null.
7. Return STRICT JSON only: an array of objects matching:
{
  "matricule": string | null,
  "student_name": string,
  "continuous_eval": number | null,
  "test_1": number | null,
  "exam": number | null,
  "status": "PRESENT" | "ABSENT" | "EXCUSED",
  "notes": string | null
}

If the model wrapper requires an object, use { "records": [ ...same objects... ] }.
No markdown, no commentary.`;

export class VisionOcrServiceError extends Error {
  constructor(
    message: string,
    public readonly code: "MISSING_API_KEY" | "VISION_API_FAILED" | "PARSE_FAILED" | "INVALID_IMAGE",
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "VisionOcrServiceError";
  }
}

export function resolveGeminiApiKey(userStoredKey?: string | null): string {
  const envKey = process.env.GEMINI_API_KEY?.trim();
  if (envKey) return envKey;
  const stored = userStoredKey?.trim();
  if (stored) return stored;
  throw new VisionOcrServiceError(
    "GEMINI_API_KEY is not configured. Set GEMINI_API_KEY in the server environment, or save a Gemini key in assistant settings.",
    "MISSING_API_KEY",
  );
}

export function isAllowedOcrImageMime(mimeType: string): boolean {
  const normalized = mimeType.toLowerCase() === "image/jpg" ? "image/jpeg" : mimeType.toLowerCase();
  return ALLOWED_MIME.has(normalized);
}

export function toWesternDigits(value: string): string {
  return value.replace(/[٠-٩۰-۹]/g, (ch) => {
    const ar = ARABIC_INDIC_DIGITS.indexOf(ch);
    if (ar >= 0) return String(ar);
    const fa = EASTERN_ARABIC_DIGITS.indexOf(ch);
    return fa >= 0 ? String(fa) : ch;
  });
}

/** Parse a grade, converting European commas. Returns null for empty/invalid/out-of-range. */
export function parseGradeScore(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) return null;
    return clampGrade(raw);
  }
  if (typeof raw !== "string") return null;
  const trimmed = toWesternDigits(raw).trim();
  if (!trimmed || /^(غائب|غ|abs|absent|-|—|–)$/i.test(trimmed)) return null;
  const normalized = trimmed.replace(/\s/g, "").replace(",", ".");
  const value = Number(normalized);
  if (!Number.isFinite(value)) return null;
  return clampGrade(value);
}

function clampGrade(value: number): number | null {
  if (value < 0 || value > 20) return null;
  return Math.round(value * 100) / 100;
}

export function parseAttendanceStatus(raw: unknown): AttendanceStatus {
  if (typeof raw === "string") {
    const upper = raw.trim().toUpperCase();
    if ((ATTENDANCE_STATUSES as readonly string[]).includes(upper)) {
      return upper as AttendanceStatus;
    }
    const text = raw.trim();
    if (/معذور|مبرر|excused|غ\s*م/i.test(text)) return "EXCUSED";
    if (/غائب|absent|^غ\.?$|غ\.م/i.test(text)) return "ABSENT";
  }
  return "PRESENT";
}

function asNullableString(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  const text = String(raw).trim();
  return text.length > 0 ? text : null;
}

export function normalizeStudentRecord(raw: unknown): StudentGradeRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const studentName = asNullableString(row.student_name ?? row.studentName ?? row.name);
  if (!studentName) return null;

  const continuous = parseGradeScore(row.continuous_eval ?? row.continuousEval);
  const test1 = parseGradeScore(row.test_1 ?? row.test1);
  const exam = parseGradeScore(row.exam);

  return {
    matricule: asNullableString(row.matricule),
    student_name: studentName,
    continuous_eval: continuous,
    test_1: test1,
    exam,
    status: parseAttendanceStatus(row.status),
    notes: asNullableString(row.notes),
  };
}

export function parseVisionJson(text: string): StudentGradeRecord[] {
  const trimmed = text.trim();
  const jsonCandidate = extractJsonCandidate(trimmed);
  if (!jsonCandidate) {
    throw new VisionOcrServiceError("Gemini returned no JSON payload", "PARSE_FAILED");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonCandidate) as unknown;
  } catch (err) {
    throw new VisionOcrServiceError("Failed to parse Gemini JSON output", "PARSE_FAILED", err);
  }

  const list = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === "object" && Array.isArray((parsed as { records?: unknown }).records)
      ? (parsed as { records: unknown[] }).records
      : null;

  if (!list) {
    throw new VisionOcrServiceError("Gemini JSON did not contain a student records array", "PARSE_FAILED");
  }

  const records: StudentGradeRecord[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    const record = normalizeStudentRecord(item);
    if (!record) continue;
    const key = `${record.matricule ?? ""}::${record.student_name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    records.push(record);
  }
  return records;
}

function extractJsonCandidate(text: string): string | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = (fenced?.[1] ?? text).trim();
  if (body.startsWith("[") || body.startsWith("{")) {
    const endArr = body.lastIndexOf("]");
    const endObj = body.lastIndexOf("}");
    const end = Math.max(endArr, endObj);
    if (end > 0) return body.slice(0, end + 1);
    return body;
  }
  const arrStart = body.indexOf("[");
  const objStart = body.indexOf("{");
  if (arrStart < 0 && objStart < 0) return null;
  const start = arrStart >= 0 && (objStart < 0 || arrStart < objStart) ? arrStart : objStart;
  const closer = body[start] === "[" ? "]" : "}";
  const end = body.lastIndexOf(closer);
  if (end <= start) return null;
  return body.slice(start, end + 1);
}

export async function scanGradeSheetImage(
  imageBuffer: Buffer,
  mimeType: string,
  options: { userGeminiKey?: string | null; includeRawDebug?: boolean } = {},
): Promise<OcrScanResult> {
  const mime = mimeType.toLowerCase() === "image/jpg" ? "image/jpeg" : mimeType.toLowerCase();
  if (!isAllowedOcrImageMime(mime)) {
    throw new VisionOcrServiceError(
      "Unsupported image type. Upload JPEG, PNG, or WebP.",
      "INVALID_IMAGE",
    );
  }
  if (!imageBuffer?.length) {
    throw new VisionOcrServiceError("Empty image buffer", "INVALID_IMAGE");
  }

  const apiKey = resolveGeminiApiKey(options.userGeminiKey);
  const client = new GoogleGenerativeAI(apiKey);
  const model = client.getGenerativeModel({
    model: GEMINI_VISION_MODEL,
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0,
    },
  });

  let rawText = "";
  try {
    const result = await model.generateContent([
      { text: SCAN_PROMPT },
      {
        inlineData: {
          mimeType: mime,
          data: imageBuffer.toString("base64"),
        },
      },
    ]);
    rawText = result.response.text() ?? "";
  } catch (err) {
    logger.error({ err }, "Gemini vision OCR request failed");
    const detail = err instanceof Error ? err.message : "Unknown Vision API error";
    throw new VisionOcrServiceError(
      `Gemini Vision API failed (${GEMINI_VISION_MODEL}): ${detail}`,
      "VISION_API_FAILED",
      err,
    );
  }

  try {
    const records = parseVisionJson(rawText);
    const payload: OcrScanResult = {
      success: true,
      total_students: records.length,
      records,
    };
    if (options.includeRawDebug) {
      payload.raw_text_debug = rawText.slice(0, 8000);
    }
    return payload;
  } catch (err) {
    if (err instanceof VisionOcrServiceError) {
      err.message = `${err.message}. Raw output starts with: ${rawText.slice(0, 180)}`;
      throw err;
    }
    throw new VisionOcrServiceError("Failed to validate Gemini OCR output", "PARSE_FAILED", err);
  }
}
