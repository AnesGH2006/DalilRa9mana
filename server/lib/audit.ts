/**
 * Audit logging helper.
 * Call `logAudit(...)` from routes with a useful description; otherwise the API
 * mutation middleware records the successful request without storing its body.
 */
import type { NextFunction, Request, Response } from "express";
import { db, auditLogsTable } from "../../shared/db.js";

const explicitlyAuditedRequests = new WeakSet<Request>();

export interface AuditPayload {
  /** Head-admin account whose data was affected */
  userId: string;
  /** Who actually triggered the action (defaults to userId) */
  actorId?: string;
  actorName?: string;
  /** Short machine-readable key: "grade_edit", "student_import", "absence_log", etc. */
  action: string;
  /** Arabic description shown in the UI */
  description: string;
  entity?: string;
  entityId?: string;
  details?: Record<string, unknown>;
  req?: Request;
}

export function logAudit(payload: AuditPayload): Promise<void> {
  if (payload.req) explicitlyAuditedRequests.add(payload.req);

  const ip = payload.req
    ? (
        (payload.req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ||
        payload.req.socket?.remoteAddress ||
        null
      )
    : null;

  return db.insert(auditLogsTable)
    .values({
      userId:      payload.userId,
      actorId:     payload.actorId ?? payload.userId,
      actorName:   payload.actorName ?? null,
      action:      payload.action,
      description: payload.description,
      entity:      payload.entity ?? null,
      entityId:    payload.entityId ?? null,
      details:     payload.details ?? null,
      ipAddress:   ip ?? null,
    })
    .then(() => undefined)
    .catch((error: unknown) => {
      payload.req?.log.error({ error, action: payload.action }, "Audit log insert failed");
    });
}

const RESOURCE_META: Record<string, { entity: string; label: string }> = {
  students: { entity: "student", label: "التلاميذ" },
  grades: { entity: "grade", label: "الدرجات" },
  absences: { entity: "absence", label: "الغيابات" },
  members: { entity: "member", label: "الأعضاء" },
  payments: { entity: "payment", label: "المدفوعات" },
  "school-info": { entity: "settings", label: "معلومات المؤسسة" },
  school: { entity: "settings", label: "معلومات المؤسسة" },
  documents: { entity: "document", label: "الوثائق" },
  orientation: { entity: "orientation", label: "التوجيه" },
  timetable: { entity: "timetable", label: "الجداول" },
  notifications: { entity: "notification", label: "الإشعارات" },
  sms: { entity: "sms", label: "الرسائل" },
  bem: { entity: "exam", label: "الامتحانات" },
  bac: { entity: "exam", label: "الامتحانات" },
};

const METHOD_META: Record<string, { action: string; verb: string }> = {
  POST: { action: "operation", verb: "تنفيذ عملية على" },
  PUT: { action: "update", verb: "تعديل" },
  PATCH: { action: "update", verb: "تعديل" },
  DELETE: { action: "delete", verb: "حذف" },
};

export function auditApiMutation(req: Request, res: Response, next: NextFunction): void {
  if (!METHOD_META[req.method]) {
    next();
    return;
  }

  const baseUrl = req.baseUrl;
  const requestPath = req.path;
  res.once("finish", () => {
    if (
      res.statusCode < 200
      || res.statusCode >= 300
      || !req.user
      || explicitlyAuditedRequests.has(req)
    ) return;

    const routePath = typeof req.route?.path === "string"
      ? `${baseUrl}${req.route.path}`
      : `${baseUrl}${requestPath}`;
    const resourceKey = routePath.replace(/^\/api\/?/, "").split("/")[0] || "api";
    const resource = RESOURCE_META[resourceKey] ?? {
      entity: resourceKey.replace(/s$/, "").replace(/[^a-z0-9_-]/gi, "").slice(0, 60) || "operation",
      label: `المسار ${resourceKey}`,
    };
    const method = METHOD_META[req.method]!;

    void logAudit({
      userId: req.memberContext?.schoolUserId ?? req.user.id,
      actorId: req.memberContext?.memberId ?? req.user.id,
      actorName: req.memberContext?.name
        || [req.user.firstName, req.user.lastName].filter(Boolean).join(" ").trim()
        || req.user.email
        || undefined,
      action: `${resource.entity}_${method.action}`.slice(0, 80),
      description: `${method.verb} ${resource.label}`,
      entity: resource.entity,
      details: { method: req.method, endpoint: routePath, statusCode: res.statusCode },
      req,
    });
  });

  next();
}
