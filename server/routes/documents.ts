/**
 * Student documents: OCR a document (medical report, absence justification, enrollment form, ...),
 * review the result, then attach it to a student's file.
 *
 *  GET    /api/documents/types                    document types the caller may use
 *  POST   /api/documents/ocr?type=...&engine=...  read an image, return fields for review (nothing is saved)
 *  POST   /api/documents                          save reviewed fields on a student
 *  GET    /api/documents/by-student/:studentId    list a student's documents (only the types the caller may see)
 *  DELETE /api/documents/:id                      delete a document
 *
 * Rules:
 *  - parents never use these routes
 *  - members need the "imports" permission and a school with an active paid plan
 *  - sensitive types (medical report) are limited to the school owner and counselors, and every save/view/delete is audited
 *  - the original image is never stored, only the reviewed fields
 */
import { Router, type Request } from "express";
import multer from "multer";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, studentsTable, studentDocumentsTable, auditLogsTable } from "../../shared/db.js";
import { logger } from "../lib/logger.js";
import { getUserGeminiKey, getUserGroqKey } from "../lib/groq-key.js";
import type { OcrEngine } from "../services/ocrService.js";
import {
  DOCUMENT_TYPES,
  extractDocument,
  isDocumentType,
  type DocumentActor,
  type DocumentTypeDef,
  type DocumentTypeId,
} from "../services/documentOcrService.js";

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      cb(new Error("يجب أن يكون الملف صورة (JPEG, PNG, WebP)"));
      return;
    }
    cb(null, true);
  },
});

function actorOf(req: Request): DocumentActor | null {
  if (!req.isAuthenticated() || !req.user) return null;
  const member = req.memberContext;
  if (!member) return "owner";
  if (member.role === "counselor" || member.role === "supervisor" || member.role === "teacher") return member.role;
  return null;
}

/** The school owner's user id: the tenant that owns all students and documents. */
function schoolIdOf(req: Request): string {
  return req.memberContext?.schoolUserId ?? req.user!.id;
}

function schoolPlanActive(req: Request): boolean {
  const member = req.memberContext;
  if (!member) return req.user!.role === "admin" || String(req.user!.subscriptionStatus) === "active";
  const plan = String(member.schoolSubscriptionPlan);
  return String(member.schoolSubscriptionStatus) === "active" && (plan === "basic" || plan === "pro");
}

function canUseDocType(req: Request, docType: DocumentTypeId): boolean {
  const actor = actorOf(req);
  if (!actor || !schoolPlanActive(req)) return false;
  if (actor !== "owner" && !req.memberContext!.permissions.includes("imports")) return false;
  const def: DocumentTypeDef = DOCUMENT_TYPES[docType];
  return def.roles.includes(actor);
}

function allowedTypeIds(req: Request): DocumentTypeId[] {
  return (Object.keys(DOCUMENT_TYPES) as DocumentTypeId[]).filter(id => canUseDocType(req, id));
}

function actorName(req: Request): string {
  if (req.memberContext?.name) return req.memberContext.name;
  const user = req.user!;
  return [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || "مدير المؤسسة";
}

async function audit(req: Request, action: string, description: string, entityId?: string, details?: Record<string, unknown>) {
  try {
    await db.insert(auditLogsTable).values({
      userId: schoolIdOf(req),
      actorId: req.user!.id,
      actorName: actorName(req),
      action,
      description,
      entity: "student_document",
      entityId: entityId ?? null,
      details: details ?? null,
      ipAddress: req.ip ?? null,
    });
  } catch (error) {
    logger.warn({ error, action }, "Audit log insert failed");
  }
}

router.get("/documents/types", (req, res): void => {
  if (!actorOf(req)) { res.status(403).json({ error: "غير مسموح" }); return; }
  const types = allowedTypeIds(req).map(id => {
    const def: DocumentTypeDef = DOCUMENT_TYPES[id];
    return { id: def.id, label: def.label, sensitive: def.sensitive, fields: def.fields };
  });
  res.set("Cache-Control", "private, no-store").json({ types });
});

router.post("/documents/ocr", upload.single("image"), async (req, res): Promise<void> => {
  const requestedType = req.query.type;
  if (!isDocumentType(requestedType)) { res.status(400).json({ error: "نوع الوثيقة غير معروف" }); return; }
  if (!canUseDocType(req, requestedType)) { res.status(403).json({ error: "غير مسموح لك بهذا النوع من الوثائق" }); return; }
  if (!req.file) { res.status(400).json({ error: "أرفق صورة الوثيقة في الحقل 'image'" }); return; }

  const engineParam = String(req.query.engine ?? "auto") as OcrEngine;
  const engine: OcrEngine = ["auto", "gemini", "vision"].includes(engineParam) ? engineParam : "auto";

  try {
    // The user's own keys first; staff accounts fall back to the school owner's keys.
    let [geminiApiKey, groqApiKey] = await Promise.all([getUserGeminiKey(req.user!.id), getUserGroqKey(req.user!.id)]);
    if (!geminiApiKey && !groqApiKey && req.memberContext) {
      const schoolId = schoolIdOf(req);
      [geminiApiKey, groqApiKey] = await Promise.all([getUserGeminiKey(schoolId), getUserGroqKey(schoolId)]);
    }
    if (!geminiApiKey && !groqApiKey) {
      res.status(428).json({ error: "لم يتم ضبط أي مفتاح OCR بعد. أضف مفتاح Gemini أو Groq من الإعدادات.", suggestion: "settings_required" });
      return;
    }

    const result = await extractDocument(req.file.buffer, requestedType, engine, { geminiApiKey, groqApiKey });
    res.set("Cache-Control", "private, no-store").json({ success: true, ...result });
  } catch (error: any) {
    logger.error({ err: error, docType: requestedType }, "Document OCR failed");
    const message = error?.message ?? "Unknown error";
    const quota = /(?:API\s+429|RESOURCE_EXHAUSTED|rate_limit_exceeded|tokens per minute|quota exceeded)/i.test(message);
    res.status(quota ? 503 : 422).json({
      error: quota ? "حصة خدمة OCR ممتلئة مؤقتًا. حاول لاحقاً أو أضف مفتاحاً آخر." : "تعذرت قراءة الوثيقة. جرّب صورة أوضح.",
    });
  }
});

router.post("/documents", async (req, res): Promise<void> => {
  const body = (req.body ?? {}) as { studentId?: unknown; docType?: unknown; fields?: unknown };
  const docType = body.docType;
  if (typeof body.studentId !== "string" || !isDocumentType(docType)) { res.status(400).json({ error: "بيانات غير صالحة" }); return; }
  if (!canUseDocType(req, docType)) { res.status(403).json({ error: "غير مسموح لك بهذا النوع من الوثائق" }); return; }
  if (!body.fields || typeof body.fields !== "object" || Array.isArray(body.fields)) { res.status(400).json({ error: "الحقول غير صالحة" }); return; }

  const def: DocumentTypeDef = DOCUMENT_TYPES[docType];
  const raw = body.fields as Record<string, unknown>;
  const fields: Record<string, string> = {};
  for (const field of def.fields) {
    const value = raw[field.key];
    fields[field.key] = typeof value === "string" ? value.trim().slice(0, 2000) : "";
  }
  if (!Object.values(fields).some(value => value !== "")) { res.status(400).json({ error: "لا توجد بيانات للحفظ" }); return; }

  const schoolId = schoolIdOf(req);
  const [student] = await db.select({ id: studentsTable.id, nomPrenom: studentsTable.nomPrenom })
    .from(studentsTable)
    .where(and(eq(studentsTable.id, body.studentId), eq(studentsTable.userId, schoolId)))
    .limit(1);
  if (!student) { res.status(404).json({ error: "التلميذ غير موجود" }); return; }

  const [created] = await db.insert(studentDocumentsTable).values({
    userId: schoolId,
    studentId: student.id,
    docType,
    fields,
    createdBy: req.user!.id,
    createdByName: actorName(req),
  }).returning({ id: studentDocumentsTable.id });

  await audit(req, "document_add", `إضافة وثيقة (${def.label}) لملف التلميذ ${student.nomPrenom}`, created?.id, { docType, studentId: student.id });
  res.status(201).json({ success: true, id: created?.id });
});

router.get("/documents/by-student/:studentId", async (req, res): Promise<void> => {
  const requestedType = req.query.type;
  if (requestedType !== undefined && !isDocumentType(requestedType)) {
    res.status(400).json({ error: "نوع الوثيقة غير معروف" });
    return;
  }
  const allowed = allowedTypeIds(req);
  const visibleTypes = typeof requestedType === "string" && isDocumentType(requestedType)
    ? allowed.filter(type => type === requestedType)
    : allowed;
  if (visibleTypes.length === 0) { res.status(403).json({ error: "غير مسموح" }); return; }
  const schoolId = schoolIdOf(req);
  const studentId = String(req.params.studentId ?? "");

  const rows = await db.select({
    id: studentDocumentsTable.id,
    docType: studentDocumentsTable.docType,
    fields: studentDocumentsTable.fields,
    createdByName: studentDocumentsTable.createdByName,
    createdAt: studentDocumentsTable.createdAt,
  })
    .from(studentDocumentsTable)
    .where(and(
      eq(studentDocumentsTable.userId, schoolId),
      eq(studentDocumentsTable.studentId, studentId),
      inArray(studentDocumentsTable.docType, visibleTypes),
    ))
    .orderBy(desc(studentDocumentsTable.createdAt))
    .limit(200);

  if (rows.some(row => isDocumentType(row.docType) && (DOCUMENT_TYPES[row.docType] as DocumentTypeDef).sensitive)) {
    await audit(req, "document_view", "اطلاع على وثائق حساسة في ملف تلميذ", undefined, { studentId });
  }
  res.set("Cache-Control", "private, no-store").json({ documents: rows });
});

router.delete("/documents/:id", async (req, res): Promise<void> => {
  const id = String(req.params.id ?? "");
  const schoolId = schoolIdOf(req);
  const [doc] = await db.select({ id: studentDocumentsTable.id, docType: studentDocumentsTable.docType, studentId: studentDocumentsTable.studentId })
    .from(studentDocumentsTable)
    .where(and(eq(studentDocumentsTable.id, id), eq(studentDocumentsTable.userId, schoolId)))
    .limit(1);
  if (!doc || !isDocumentType(doc.docType)) { res.status(404).json({ error: "الوثيقة غير موجودة" }); return; }
  if (!canUseDocType(req, doc.docType)) { res.status(403).json({ error: "غير مسموح" }); return; }

  await db.delete(studentDocumentsTable).where(and(eq(studentDocumentsTable.id, id), eq(studentDocumentsTable.userId, schoolId)));
  await audit(req, "document_delete", "حذف وثيقة من ملف تلميذ", id, { docType: doc.docType, studentId: doc.studentId });
  res.json({ success: true });
});

export default router;