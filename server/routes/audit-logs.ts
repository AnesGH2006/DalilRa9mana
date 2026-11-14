/**
 * GET /api/audit-logs
 * Returns the audit log for the authenticated head-admin.
 * Only accessible to head-admins (not members).
 */
import { Router, type Request, type Response } from "express";
import { eq, desc, and, gte } from "drizzle-orm";
import { db, auditLogsTable } from "../../shared/db.js";

const router = Router();

router.get("/audit-logs", async (req: Request, res: Response): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  // Members cannot access audit logs — head-admin only
  if (req.memberContext) { res.status(403).json({ error: "Forbidden" }); return; }

  const userId = req.user!.id;
  const requestedLimit = Number(req.query.limit ?? 200);
  const limit = Number.isSafeInteger(requestedLimit)
    ? Math.min(Math.max(requestedLimit, 1), 500)
    : 200;
  const requestedOffset = Number(req.query.offset ?? 0);
  const offset = Number.isSafeInteger(requestedOffset) ? Math.max(requestedOffset, 0) : 0;
  const since  = req.query.since ? new Date(String(req.query.since)) : null;

  const conds = [eq(auditLogsTable.userId, userId)];
  if (since && !isNaN(since.getTime())) {
    conds.push(gte(auditLogsTable.createdAt, since));
  }

  const rows = await db
    .select()
    .from(auditLogsTable)
    .where(and(...conds))
    .orderBy(desc(auditLogsTable.createdAt))
    .limit(limit)
    .offset(offset);

  res.json(rows);
});

export default router;
