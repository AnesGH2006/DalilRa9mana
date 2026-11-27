/**
 * Platform reviews — real user testimonials shown on the login page.
 *
 * GET  /api/reviews          public list of approved reviews
 * GET  /api/reviews/me       eligibility + the caller's own review
 * POST /api/reviews          submit/update own review
 * GET  /api/reviews/admin    all reviews incl. pending (admin)
 * POST /api/reviews/admin/:id/status  approve | reject (admin)
 * DELETE /api/reviews/admin/:id       remove (admin)
 */
import { Router } from "express";
import { desc, eq } from "drizzle-orm";
import { db, reviewsTable, schoolInfoTable, usersTable } from "../../shared/db.js";

const router = Router();

const ALLOWED_AUDIENCES = new Set(["school", "teacher", "parent"]);
const AUDIENCE_LABELS: Record<string, string> = {
  school: "مدير مؤسسة",
  teacher: "أستاذ / مشرف",
  parent: "ولي أمر",
};

function isAdmin(req: { isAuthenticated(): boolean; user?: { role?: string } }): boolean {
  return req.isAuthenticated() && req.user?.role === "admin";
}

function displayName(user: { firstName?: string | null; lastName?: string | null; email?: string | null }): string {
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return name || user.email?.split("@")[0] || "مستخدم";
}

async function reviewEligibility(userId: string): Promise<{ eligible: boolean; accountAgeDays: number; review: typeof reviewsTable.$inferSelect | null }> {
  const [user] = await db.select({ createdAt: usersTable.createdAt }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  const [review] = await db.select().from(reviewsTable).where(eq(reviewsTable.userId, userId)).limit(1);
  const accountAgeDays = user ? Math.floor((Date.now() - new Date(user.createdAt).getTime()) / 86400000) : 0;
  return { eligible: true, accountAgeDays, review: review ?? null };
}

// Public — approved reviews only, shown on the login page.
router.get("/reviews", async (_req, res): Promise<void> => {
  try {
    const rows = await db
      .select({
        id: reviewsTable.id,
        rating: reviewsTable.rating,
        comment: reviewsTable.comment,
        audience: reviewsTable.audience,
        createdAt: reviewsTable.createdAt,
        firstName: usersTable.firstName,
        lastName: usersTable.lastName,
        wilaya: schoolInfoTable.wilaya,
      })
      .from(reviewsTable)
      .innerJoin(usersTable, eq(reviewsTable.userId, usersTable.id))
      .leftJoin(schoolInfoTable, eq(schoolInfoTable.userId, usersTable.id))
      .where(eq(reviewsTable.status, "approved"))
      .orderBy(desc(reviewsTable.createdAt))
      .limit(50);

    res.set("Cache-Control", "public, max-age=300").json({
      reviews: rows.map(row => ({
        id: row.id,
        rating: row.rating,
        comment: row.comment,
        audience: AUDIENCE_LABELS[row.audience] ?? row.audience,
        name: displayName(row),
        wilaya: row.wilaya || null,
        createdAt: row.createdAt,
      })),
    });
  } catch (error) {
    req_log_error(error);
    res.status(500).json({ error: "تعذر تحميل الآراء" });
  }
});

function req_log_error(error: unknown): void {
  console.error("reviews route error", error);
}

// The caller's own review + whether they may submit one yet.
router.get("/reviews/me", async (req, res): Promise<void> => {
  if (!req.isAuthenticated() || !req.user) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const { eligible, accountAgeDays, review } = await reviewEligibility(req.user.id);
    res.set("Cache-Control", "private, no-store").json({
      eligible,
      minAgeDays: 0,
      accountAgeDays,
      daysUntilEligible: 0,
      review: review ? {
        rating: review.rating,
        comment: review.comment,
        audience: review.audience,
        status: review.status,
        createdAt: review.createdAt,
      } : null,
    });
  } catch (error) {
    req_log_error(error);
    res.status(500).json({ error: "تعذر تحميل حالة التقييم" });
  }
});

// Submit or update the caller's review. Editing re-sends it to moderation.
router.post("/reviews", async (req, res): Promise<void> => {
  if (!req.isAuthenticated() || !req.user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { rating, comment, audience } = req.body ?? {};
  const ratingNum = Number(rating);
  const text = String(comment ?? "").trim();
  const aud = String(audience ?? "school");

  if (!Number.isInteger(ratingNum) || ratingNum < 1 || ratingNum > 5) {
    res.status(400).json({ error: "التقييم يجب أن يكون بين 1 و 5 نجوم" });
    return;
  }
  if (text.length < 10 || text.length > 1000) {
    res.status(400).json({ error: "التعليق يجب أن يكون بين 10 و 1000 حرف" });
    return;
  }
  if (!ALLOWED_AUDIENCES.has(aud)) {
    res.status(400).json({ error: "نوع المقيّم غير صالح" });
    return;
  }

  try {
    const { review } = await reviewEligibility(req.user.id);

    const values = {
      userId: req.user.id,
      rating: ratingNum,
      comment: text,
      audience: aud,
      status: "pending",
      updatedAt: new Date(),
    };

    if (review) {
      await db.update(reviewsTable).set(values).where(eq(reviewsTable.id, review.id));
    } else {
      await db.insert(reviewsTable).values(values);
    }
    res.json({ success: true, status: "pending" });
  } catch (error) {
    req_log_error(error);
    res.status(500).json({ error: "تعذر حفظ التقييم" });
  }
});

// ── Admin moderation ──────────────────────────────────────────────────────────

router.get("/reviews/admin", async (req, res): Promise<void> => {
  if (!isAdmin(req)) { res.status(403).json({ error: "Admin only" }); return; }
  try {
    const rows = await db
      .select({
        id: reviewsTable.id,
        rating: reviewsTable.rating,
        comment: reviewsTable.comment,
        audience: reviewsTable.audience,
        status: reviewsTable.status,
        createdAt: reviewsTable.createdAt,
        firstName: usersTable.firstName,
        lastName: usersTable.lastName,
        email: usersTable.email,
        wilaya: schoolInfoTable.wilaya,
      })
      .from(reviewsTable)
      .innerJoin(usersTable, eq(reviewsTable.userId, usersTable.id))
      .leftJoin(schoolInfoTable, eq(schoolInfoTable.userId, usersTable.id))
      .orderBy(desc(reviewsTable.createdAt))
      .limit(200);
    res.set("Cache-Control", "private, no-store").json({
      reviews: rows.map(row => ({
        ...row,
        name: displayName(row),
        audienceLabel: AUDIENCE_LABELS[row.audience] ?? row.audience,
      })),
    });
  } catch (error) {
    req_log_error(error);
    res.status(500).json({ error: "تعذر تحميل التقييمات" });
  }
});

router.post("/reviews/admin/:id/status", async (req, res): Promise<void> => {
  if (!isAdmin(req)) { res.status(403).json({ error: "Admin only" }); return; }
  const status = String(req.body?.status ?? "");
  if (!["approved", "rejected", "pending"].includes(status)) {
    res.status(400).json({ error: "حالة غير صالحة" });
    return;
  }
  try {
    const [updated] = await db.update(reviewsTable)
      .set({ status, updatedAt: new Date() })
      .where(eq(reviewsTable.id, req.params.id))
      .returning({ id: reviewsTable.id });
    if (!updated) { res.status(404).json({ error: "التقييم غير موجود" }); return; }
    res.json({ success: true });
  } catch (error) {
    req_log_error(error);
    res.status(500).json({ error: "تعذر تحديث التقييم" });
  }
});

router.delete("/reviews/admin/:id", async (req, res): Promise<void> => {
  if (!isAdmin(req)) { res.status(403).json({ error: "Admin only" }); return; }
  try {
    await db.delete(reviewsTable).where(eq(reviewsTable.id, req.params.id));
    res.json({ success: true });
  } catch (error) {
    req_log_error(error);
    res.status(500).json({ error: "تعذر حذف التقييم" });
  }
});

export default router;
