import { Router, type IRouter, type Request, type Response } from "express";
import { db, pageViewsTable } from "../../shared/db.js";

const router: IRouter = Router();

// Per user+path throttle so SPA re-renders don't flood the table.
const lastTracked = new Map<string, number>();
const MIN_INTERVAL_MS = 60_000;
const PRUNE_AFTER_MS = 10 * MIN_INTERVAL_MS;

// POST /api/track/page — record one page view for the admin activity dashboard.
router.post("/track/page", async (req: Request, res: Response): Promise<void> => {
  if (!req.isAuthenticated() || !req.user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const path = String(req.body?.path ?? "").slice(0, 200);
  if (!path.startsWith("/") || path.startsWith("//")) { res.status(400).json({ error: "Invalid path" }); return; }

  const key = `${req.user.id}:${path}`;
  const now = Date.now();
  if (now - (lastTracked.get(key) ?? 0) < MIN_INTERVAL_MS) {
    res.json({ ok: true, skipped: true });
    return;
  }
  lastTracked.set(key, now);
  if (lastTracked.size > 20_000) {
    for (const [k, v] of lastTracked) if (now - v > PRUNE_AFTER_MS) lastTracked.delete(k);
  }

  try {
    await db.insert(pageViewsTable).values({ userId: req.user.id, path });
  } catch { /* analytics must never break the app */ }
  res.json({ ok: true });
});

export default router;
