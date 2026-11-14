/**
 * Generic document OCR (medical report, absence justification, enrollment form, any other document).
 *
 * Each document type is just a definition: which fields to read, who may use it, and a short hint.
 * Adding a new type means adding one entry to DOCUMENT_TYPES — no new route or new prompt plumbing.
 *
 * Results are only returned for human review. Nothing is saved here.
 */
import { logger } from "../lib/logger.js";
import {
  prepareImage,
  resolveEngine,
  callVisionEngine,
  extractJsonObjectCandidate,
  type ApiKeys,
  type OcrEngine,
} from "./ocrService.js";

export type DocumentActor = "owner" | "counselor" | "supervisor" | "teacher";

export interface DocumentField {
  key: string;
  label: string;
}

export interface DocumentTypeDef {
  id: string;
  label: string;
  /** Health or other highly personal data: tighter access and audit trail. */
  sensitive: boolean;
  /** Which kinds of accounts may read/add this document type. */
  roles: DocumentActor[];
  fields: DocumentField[];
  /** One or two sentences describing the document to the vision model. */
  intro: string;
  /** Extra rules specific to this type. */
  rules: string[];
}

export const DOCUMENT_TYPES = {
  medical_report: {
    id: "medical_report",
    label: "تقرير طبي",
    sensitive: true,
    roles: ["owner", "counselor"],
    fields: [
      { key: "studentName", label: "اسم التلميذ" },
      { key: "reportDate", label: "تاريخ التقرير" },
      { key: "doctorName", label: "اسم الطبيب" },
      { key: "facility", label: "المؤسسة الصحية أو العيادة" },
      { key: "diagnosis", label: "التشخيص" },
      { key: "restDays", label: "عدد أيام الراحة" },
      { key: "restFrom", label: "بداية الراحة" },
      { key: "restTo", label: "نهاية الراحة" },
      { key: "sportExemption", label: "الإعفاء من الرياضة (نعم أو لا)" },
      { key: "notes", label: "ملاحظات" },
    ],
    intro: "هذه صورة تقرير أو شهادة طبية خاصة بتلميذ، قد تكون مطبوعة أو مكتوبة بخط اليد، بالعربية أو الفرنسية.",
    rules: [
      "انقل التشخيص والملاحظات كما هي مكتوبة بدون تفسير طبي أو إضافة.",
      "sportExemption: اكتب \"نعم\" فقط إذا ذُكر الإعفاء من الرياضة صراحة، و\"لا\" إذا ذُكر عدم الإعفاء، وإلا اتركه فارغاً.",
    ],
  },
  absence_justification: {
    id: "absence_justification",
    label: "تبرير غياب",
    sensitive: false,
    roles: ["owner", "counselor", "supervisor"],
    fields: [
      { key: "studentName", label: "اسم التلميذ" },
      { key: "absenceFrom", label: "بداية الغياب" },
      { key: "absenceTo", label: "نهاية الغياب" },
      { key: "reason", label: "سبب الغياب" },
      { key: "guardianName", label: "اسم الولي" },
      { key: "guardianPhone", label: "هاتف الولي" },
      { key: "notes", label: "ملاحظات" },
    ],
    intro: "هذه صورة رسالة أو استمارة يبرر فيها ولي أمر غياب ابنه أو ابنته عن المدرسة.",
    rules: ["اكتب السبب كما ذكره الولي دون تعديل."],
  },
  enrollment_form: {
    id: "enrollment_form",
    label: "استمارة تسجيل",
    sensitive: false,
    roles: ["owner", "counselor", "supervisor"],
    fields: [
      { key: "studentName", label: "اسم التلميذ" },
      { key: "birthDate", label: "تاريخ الميلاد" },
      { key: "birthPlace", label: "مكان الميلاد" },
      { key: "level", label: "المستوى" },
      { key: "classe", label: "القسم" },
      { key: "guardianName", label: "اسم الولي" },
      { key: "guardianPhone", label: "هاتف الولي" },
      { key: "address", label: "العنوان" },
    ],
    intro: "هذه صورة استمارة تسجيل أو معلومات تلميذ في مؤسسة تعليمية جزائرية.",
    rules: [],
  },
  generic: {
    id: "generic",
    label: "وثيقة أخرى",
    sensitive: false,
    roles: ["owner", "counselor", "supervisor"],
    fields: [
      { key: "studentName", label: "اسم التلميذ (إن وُجد)" },
      { key: "title", label: "عنوان الوثيقة" },
      { key: "date", label: "التاريخ" },
      { key: "summary", label: "ملخص المحتوى في سطرين" },
      { key: "notes", label: "ملاحظات أخرى" },
    ],
    intro: "هذه صورة وثيقة مدرسية أو إدارية.",
    rules: ["في حقل summary لخّص محتوى الوثيقة في سطرين كحد أقصى بدون إضافة معلومات غير موجودة."],
  },
} as const satisfies Record<string, DocumentTypeDef>;

export type DocumentTypeId = keyof typeof DOCUMENT_TYPES;

export function isDocumentType(value: unknown): value is DocumentTypeId {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(DOCUMENT_TYPES, value);
}

function buildPrompt(def: DocumentTypeDef): string {
  const example = JSON.stringify({ fields: Object.fromEntries(def.fields.map(field => [field.key, ""])) });
  const list = def.fields.map(field => `- ${field.key}: ${field.label}`).join("\n");
  const extra = def.rules.map(rule => `- ${rule}`).join("\n");
  return `${def.intro}

أعد كائن JSON فقط بهذا الشكل — لا تضف أي نص قبله أو بعده:
${example}

الحقول المطلوبة:
${list}

قواعد:
- انسخ كل قيمة كما هي مكتوبة في الوثيقة (عربية أو فرنسية)، دون تصحيح أو ترجمة أو تلخيص إلا إذا طُلب ذلك صراحة.
- إذا لم يوجد الحقل في الوثيقة أو كان غير مقروء فاتركه نصاً فارغاً "" ولا تخمّن.
- التواريخ بصيغة YYYY-MM-DD متى كانت واضحة تماماً، وإلا انسخها كما هي.
- اقرأ الوثيقة حتى لو كانت الكتابة يدوية أو الصورة مائلة أو غير واضحة، وابذل أفضل جهدك.
${extra}
- لا تخترع بيانات غير موجودة في الصورة.`;
}

export interface DocumentOcrResult {
  engine: OcrEngine;
  docType: DocumentTypeId;
  fields: Record<string, string>;
  filledCount: number;
  totalCount: number;
}

function parseFields(content: string, def: DocumentTypeDef): Record<string, string> | null {
  const candidate = extractJsonObjectCandidate(content);
  if (!candidate) return null;
  try {
    const parsed = JSON.parse(candidate) as { fields?: unknown };
    const raw = parsed.fields && typeof parsed.fields === "object" ? (parsed.fields as Record<string, unknown>) : null;
    if (!raw) return null;
    const fields: Record<string, string> = {};
    for (const field of def.fields) {
      const value = raw[field.key];
      fields[field.key] = typeof value === "string" || typeof value === "number" ? String(value).trim().slice(0, 2000) : "";
    }
    return Object.values(fields).some(value => value !== "") ? fields : null;
  } catch (error) {
    logger.warn({ error, docType: def.id }, "Failed to parse document OCR JSON");
    return null;
  }
}

export async function extractDocument(
  buffer: Buffer,
  docType: DocumentTypeId,
  engine: OcrEngine,
  apiKeys: ApiKeys,
): Promise<DocumentOcrResult> {
  const def: DocumentTypeDef = DOCUMENT_TYPES[docType];
  const resolved = resolveEngine(engine, apiKeys);
  if (resolved !== "gemini" && resolved !== "vision") {
    throw new Error("قراءة الوثائق تحتاج مفتاح Gemini أو Groq. أضف مفتاحاً من الإعدادات.");
  }

  const { data, mimeType } = await prepareImage(buffer);
  const prompt = buildPrompt(def);

  const attempt = async (which: "gemini" | "vision") => {
    const content = await callVisionEngine(which, data, mimeType, prompt, apiKeys);
    return parseFields(content, def);
  };

  let usedEngine: "gemini" | "vision" = resolved;
  let fields: Record<string, string> | null = null;
  let primaryError: Error | null = null;

  try {
    fields = await attempt(resolved);
  } catch (error) {
    primaryError = error instanceof Error ? error : new Error(String(error));
    logger.warn({ err: primaryError.message, engine: resolved, docType }, "Document OCR primary engine failed");
  }

  if (!fields) {
    const other: "gemini" | "vision" = resolved === "gemini" ? "vision" : "gemini";
    const otherKey = other === "gemini" ? apiKeys.geminiApiKey : apiKeys.groqApiKey;
    if (otherKey) {
      try {
        fields = await attempt(other);
        if (fields) {
          usedEngine = other;
          primaryError = null;
        }
      } catch (error) {
        const secondary = error instanceof Error ? error : new Error(String(error));
        logger.warn({ err: secondary.message, engine: other, docType }, "Document OCR secondary engine failed");
        if (!primaryError) primaryError = secondary;
      }
    }
  }

  if (!fields) {
    if (primaryError) throw primaryError;
    throw new Error("لم يتم التعرف على محتوى الوثيقة. جرّب صورة أوضح.");
  }

  const filledCount = Object.values(fields).filter(value => value !== "").length;
  return { engine: usedEngine, docType, fields, filledCount, totalCount: def.fields.length };
}