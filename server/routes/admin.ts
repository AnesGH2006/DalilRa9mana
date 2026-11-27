import { Router, type IRouter, type Request, type Response } from "express";
import { db, paymentRequestsTable, paymentsTable, schoolInfoTable, schoolMembersTable, sessionsTable, usersTable } from "../../shared/db.js";
import { eq, gt, inArray, isNotNull, ne } from "drizzle-orm";
import { PARENT_PLAN, STAFF_PLAN } from "../middlewares/staffAccess.js";

const TRIAL_DAYS = 15;
const GRANTABLE_PLANS = ["basic", "pro", STAFF_PLAN, PARENT_PLAN] as const;
type GrantablePlan = (typeof GRANTABLE_PLANS)[number];

function trialExpiry(): Date {
  return new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
}

/** Pick a plan for a granted trial: requested plan, else keep their paid-type plan, else "pro". */
function resolveGrantPlan(requested: unknown, current: string | null | undefined): GrantablePlan {
  if (typeof requested === "string" && (GRANTABLE_PLANS as readonly string[]).includes(requested)) {
    return requested as GrantablePlan;
  }
  if (current && (GRANTABLE_PLANS as readonly string[]).includes(current)) return current as GrantablePlan;
  return "pro";
}

/** True when the user already has an unexpired paid plan — skip them in bulk grants. */
function hasLivePaidPlan(user: { subscriptionStatus: string | null; subscriptionPlan: string | null; subscriptionExpiresAt: Date | null }): boolean {
  if (user.subscriptionStatus !== "active") return false;
  const plan = String(user.subscriptionPlan ?? "");
  if (!["basic", "pro", STAFF_PLAN, PARENT_PLAN].includes(plan)) return false;
  const exp = user.subscriptionExpiresAt ? new Date(user.subscriptionExpiresAt).getTime() : null;
  return exp === null || exp > Date.now();
}

const router: IRouter = Router();

function isAdmin(req: Request): boolean {
  return req.isAuthenticated() && req.user?.role === "admin";
}

// GET /api/admin/users — list all users (admin only)
router.get("/admin/users", async (req: Request, res: Response): Promise<void> => {
  if (!isAdmin(req)) { res.status(403).json({ error: "Forbidden" }); return; }
  const users = await db.select().from(usersTable).orderBy(usersTable.createdAt);
  const memberAccounts = await db
    .select({ memberUserId: schoolMembersTable.memberUserId })
    .from(schoolMembersTable)
    .where(isNotNull(schoolMembersTable.memberUserId));
  const memberUserIds = new Set(memberAccounts.map(member => member.memberUserId));
  res.json(users.map(u => ({
    id: u.id,
    email: u.email,
    firstName: u.firstName,
    lastName: u.lastName,
    profileImageUrl: u.profileImageUrl,
    role: u.role,
    subscriptionStatus: u.subscriptionStatus,
    subscriptionPlan: u.subscriptionPlan,
    subscriptionExpiresAt: u.subscriptionExpiresAt,
    createdAt: u.createdAt,
  })).filter(u =>
    !memberUserIds.has(u.id)
    && u.subscriptionPlan !== STAFF_PLAN
    && u.subscriptionPlan !== PARENT_PLAN
  ));
});

// GET /api/admin/staff — list signed-in teachers, supervisors, and counselors
router.get("/admin/staff", async (req: Request, res: Response): Promise<void> => {
  if (!isAdmin(req)) { res.status(403).json({ error: "Forbidden" }); return; }

  const rows = await db
    .select({ member: schoolMembersTable, user: usersTable, school: schoolInfoTable })
    .from(schoolMembersTable)
    .innerJoin(usersTable, eq(schoolMembersTable.memberUserId, usersTable.id))
    .leftJoin(schoolInfoTable, eq(schoolMembersTable.schoolUserId, schoolInfoTable.userId))
    .where(inArray(schoolMembersTable.role, ["teacher", "supervisor", "counselor"]))
    .orderBy(schoolMembersTable.createdAt);

  const staff = rows.map(({ member, user, school }) => ({
    id: user.id,
    memberId: member.id,
    email: user.email ?? member.email,
    firstName: user.firstName,
    lastName: user.lastName,
    memberName: member.name,
    memberRole: member.role,
    schoolName: school?.nom ?? null,
    role: user.role,
    subscriptionStatus: user.subscriptionStatus,
    subscriptionPlan: user.subscriptionPlan,
    subscriptionExpiresAt: user.subscriptionExpiresAt,
    createdAt: member.createdAt,
  }));
  const memberUserIds = new Set(staff.map(user => user.id));
  const standaloneStaff = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.subscriptionPlan, STAFF_PLAN))
    .orderBy(usersTable.createdAt);

  res.json([
    ...staff,
    ...standaloneStaff
      .filter(user => !memberUserIds.has(user.id))
      .map(user => ({
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        subscriptionStatus: user.subscriptionStatus,
        subscriptionPlan: user.subscriptionPlan,
        subscriptionExpiresAt: user.subscriptionExpiresAt,
        createdAt: user.createdAt,
      })),
  ]);
});

// GET /api/admin/parents — list parent subscriptions separately (admin only)
router.get("/admin/parents", async (req: Request, res: Response): Promise<void> => {
  if (!isAdmin(req)) { res.status(403).json({ error: "Forbidden" }); return; }

  const rows = await db
    .select({ member: schoolMembersTable, user: usersTable })
    .from(schoolMembersTable)
    .leftJoin(usersTable, eq(schoolMembersTable.memberUserId, usersTable.id))
    .where(eq(schoolMembersTable.role, "parent"))
    .orderBy(schoolMembersTable.createdAt);

  const parents = rows.map(({ member, user }) => ({
    id: user?.id ?? member.id,
    memberId: member.id,
    email: user?.email ?? member.email,
    firstName: user?.firstName ?? member.name,
    lastName: user?.lastName ?? null,
    role: "parent",
    subscriptionStatus: user?.subscriptionStatus ?? "pending",
    subscriptionPlan: user?.subscriptionPlan ?? null,
    subscriptionExpiresAt: user?.subscriptionExpiresAt ?? null,
    createdAt: member.createdAt,
    schoolUserId: member.schoolUserId,
    linkedStudentId: member.linkedStudentId,
  }));
  const memberUserIds = new Set(parents.flatMap(parent => parent.id === parent.memberId ? [] : [parent.id]));
  const standaloneParents = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.subscriptionPlan, PARENT_PLAN))
    .orderBy(usersTable.createdAt);

  res.json([
    ...parents,
    ...standaloneParents
      .filter(user => !memberUserIds.has(user.id))
      .map(user => ({
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: "parent",
        subscriptionStatus: user.subscriptionStatus,
        subscriptionPlan: user.subscriptionPlan,
        subscriptionExpiresAt: user.subscriptionExpiresAt,
        createdAt: user.createdAt,
      })),
  ]);
});

// PATCH /api/admin/users/:id — update subscription/role (admin only)
router.patch("/admin/users/:id", async (req: Request, res: Response): Promise<void> => {
  if (!isAdmin(req)) { res.status(403).json({ error: "Forbidden" }); return; }
  const id = String(req.params["id"]);
  const { subscriptionStatus, role, subscriptionExpiresAt } = req.body as {
    subscriptionStatus?: "pending" | "active" | "suspended";
    role?: "user" | "admin";
    subscriptionExpiresAt?: string | null;
  };

  const updates: Partial<typeof usersTable.$inferInsert> = { updatedAt: new Date() };
  if (subscriptionStatus) {
    updates.subscriptionStatus = subscriptionStatus;
    if (subscriptionStatus === "active") {
      const [existing] = await db.select({ subscriptionPlan: usersTable.subscriptionPlan })
        .from(usersTable)
        .where(eq(usersTable.id, id))
        .limit(1);
      if (!existing) { res.status(404).json({ error: "User not found" }); return; }
      if (existing.subscriptionPlan !== STAFF_PLAN && existing.subscriptionPlan !== PARENT_PLAN) {
        updates.subscriptionPlan = "pro";
      }
    }
  }
  if (role) updates.role = role;
  if (subscriptionExpiresAt !== undefined)
    updates.subscriptionExpiresAt = subscriptionExpiresAt ? new Date(subscriptionExpiresAt) : null;

  const [updated] = await db.update(usersTable).set(updates).where(eq(usersTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "User not found" }); return; }
  res.json({ success: true, user: { id: updated.id, email: updated.email, subscriptionStatus: updated.subscriptionStatus, role: updated.role } });
});

// POST /api/admin/activate — activate user by email (requires admin session + optional ADMIN_SECRET token)
router.post("/admin/activate", async (req: Request, res: Response): Promise<void> => {
  if (!isAdmin(req)) { res.status(403).json({ error: "Forbidden" }); return; }
  const { email, token, months } = req.body as { email?: string; token?: string; months?: number };
  const adminSecret = process.env.ADMIN_SECRET;
  // If ADMIN_SECRET is configured, require it as an extra confirmation layer
  if (adminSecret && token !== adminSecret) { res.status(403).json({ error: "Invalid token" }); return; }
  if (!email) { res.status(400).json({ error: "Email required" }); return; }

  const expiresAt = months
    ? new Date(Date.now() + (months || 1) * 30 * 24 * 60 * 60 * 1000)
    : null;

  const [updated] = await db.update(usersTable)
    .set({ subscriptionStatus: "active", subscriptionPlan: "pro", subscriptionExpiresAt: expiresAt, updatedAt: new Date() })
    .where(eq(usersTable.email, email))
    .returning();

  if (!updated) { res.status(404).json({ error: "User not found" }); return; }
  res.json({ success: true, email: updated.email, subscriptionStatus: updated.subscriptionStatus, subscriptionExpiresAt: updated.subscriptionExpiresAt });
});

// POST /api/admin/users/:id/grant-trial — grant a free 15-day trial to any account (admin only).
// Bypasses the once-per-account rule so old/expired users can be given a month.
router.post("/admin/users/:id/grant-trial", async (req: Request, res: Response): Promise<void> => {
  if (!isAdmin(req)) { res.status(403).json({ error: "Forbidden" }); return; }
  const id = String(req.params["id"]);
  const plan = resolveGrantPlan(req.body?.plan, undefined);

  const [existing] = await db.select().from(usersTable).where(eq(usersTable.id, id)).limit(1);
  if (!existing) { res.status(404).json({ error: "User not found" }); return; }
  if (existing.role === "admin") { res.status(400).json({ error: "لا يمكن منح تجربة لحساب مشرف" }); return; }

  const grantPlan = resolveGrantPlan(req.body?.plan, existing.subscriptionPlan);
  const expiresAt = trialExpiry();
  const [updated] = await db.update(usersTable).set({
    subscriptionStatus: "active",
    subscriptionPlan: grantPlan,
    subscriptionExpiresAt: expiresAt,
    trialStartedAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(usersTable.id, id)).returning();

  res.json({ success: true, userId: updated!.id, plan: grantPlan, expiresAt: expiresAt.toISOString(), trialDays: TRIAL_DAYS });
});

// POST /api/admin/grant-trial-bulk — grant a 15-day trial to every account without a live paid plan.
router.post("/admin/grant-trial-bulk", async (req: Request, res: Response): Promise<void> => {
  if (!isAdmin(req)) { res.status(403).json({ error: "Forbidden" }); return; }
  const requestedPlan = typeof req.body?.plan === "string" ? req.body.plan : undefined;

  const users = await db.select().from(usersTable).where(ne(usersTable.role, "admin"));
  const eligible = users.filter(u => !hasLivePaidPlan(u));
  if (eligible.length === 0) { res.json({ success: true, granted: 0, skipped: users.length }); return; }

  const expiresAt = trialExpiry();
  const now = new Date();
  let granted = 0;
  for (const u of eligible) {
    const plan = resolveGrantPlan(requestedPlan, u.subscriptionPlan);
    await db.update(usersTable).set({
      subscriptionStatus: "active",
      subscriptionPlan: plan,
      subscriptionExpiresAt: expiresAt,
      trialStartedAt: now,
      updatedAt: now,
    }).where(eq(usersTable.id, u.id));
    granted++;
  }

  res.json({ success: true, granted, skipped: users.length - granted, expiresAt: expiresAt.toISOString(), trialDays: TRIAL_DAYS });
});

// POST /api/admin/revoke-trials — end every live free trial immediately (admin only).
// Accounts with a successful payment (approved CCP request or paid transaction)
// keep their paid plan; everyone else on a trial drops to the free plan.
router.post("/admin/revoke-trials", async (req: Request, res: Response): Promise<void> => {
  if (!isAdmin(req)) { res.status(403).json({ error: "Forbidden" }); return; }

  const users = await db.select().from(usersTable).where(ne(usersTable.role, "admin"));
  const [approvedRequests, paidPayments] = await Promise.all([
    db.select({ userId: paymentRequestsTable.userId }).from(paymentRequestsTable).where(eq(paymentRequestsTable.status, "approved")),
    db.select({ userId: paymentsTable.userId }).from(paymentsTable).where(eq(paymentsTable.status, "paid")),
  ]);
  const paidUserIds = new Set([...approvedRequests, ...paidPayments].map(row => row.userId));

  const now = new Date();
  const TRIAL_WINDOW_MS = 40 * 24 * 60 * 60 * 1000;
  const targets = users.filter(u => {
    if (!u.trialStartedAt || u.subscriptionStatus !== "active" || paidUserIds.has(u.id)) return false;
    if (!["basic", "pro", STAFF_PLAN, PARENT_PLAN].includes(String(u.subscriptionPlan))) return false;
    const exp = u.subscriptionExpiresAt ? new Date(u.subscriptionExpiresAt).getTime() : null;
    if (exp === null || exp <= now.getTime()) return false;
    // A trial grant always sets expiresAt ≈ trialStartedAt + 30d. Paid plans
    // (1 year) or manual activations don't match this window, so they are safe
    // even when no payment row exists (e.g. admin-granted paid access).
    const trialStart = new Date(u.trialStartedAt).getTime();
    return exp - trialStart > 0 && exp - trialStart <= TRIAL_WINDOW_MS;
  });

  for (const u of targets) {
    await db.update(usersTable).set({
      subscriptionStatus: "active",
      subscriptionPlan: "free",
      subscriptionExpiresAt: null,
      updatedAt: now,
    }).where(eq(usersTable.id, u.id));
  }

  res.json({ success: true, revoked: targets.length, skippedPaid: paidUserIds.size });
});

// GET /api/admin/usage — platform activity overview: is the site being used?
// Combines users.last_seen_at (throttled per-request tracking) with live sessions.
router.get("/admin/usage", async (req: Request, res: Response): Promise<void> => {
  if (!isAdmin(req)) { res.status(403).json({ error: "Forbidden" }); return; }

  const DAY = 24 * 60 * 60 * 1000;
  const now = Date.now();

  const [users, liveSessions] = await Promise.all([
    db.select({
      id: usersTable.id,
      email: usersTable.email,
      firstName: usersTable.firstName,
      lastName: usersTable.lastName,
      role: usersTable.role,
      createdAt: usersTable.createdAt,
      lastSeenAt: usersTable.lastSeenAt,
    }).from(usersTable),
    db.select({ sess: sessionsTable.sess }).from(sessionsTable).where(gt(sessionsTable.expire, new Date())),
  ]);

  const onlineUserIds = new Set(
    liveSessions
      .map(row => (row.sess as { user?: { id?: string } } | null)?.user?.id)
      .filter((id): id is string => Boolean(id))
  );

  const nonAdmin = users.filter(u => u.role !== "admin");
  const activeWithin = (ms: number) =>
    nonAdmin.filter(u => u.lastSeenAt && now - new Date(u.lastSeenAt).getTime() <= ms).length;
  const createdWithin = (ms: number) =>
    nonAdmin.filter(u => now - new Date(u.createdAt).getTime() <= ms).length;

  const signupsByDay: { date: string; count: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const start = new Date(now - i * DAY);
    start.setHours(0, 0, 0, 0);
    const end = start.getTime() + DAY;
    signupsByDay.push({
      date: start.toISOString().slice(0, 10),
      count: nonAdmin.filter(u => {
        const c = new Date(u.createdAt).getTime();
        return c >= start.getTime() && c < end;
      }).length,
    });
  }

  const recentlyActive = nonAdmin
    .filter(u => u.lastSeenAt)
    .sort((a, b) => new Date(b.lastSeenAt!).getTime() - new Date(a.lastSeenAt!).getTime())
    .slice(0, 10)
    .map(u => ({
      id: u.id,
      name: [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email || "مستخدم",
      email: u.email,
      lastSeenAt: u.lastSeenAt,
    }));

  res.set("Cache-Control", "private, no-store").json({
    totalUsers: nonAdmin.length,
    onlineNow: onlineUserIds.size,
    activeToday: activeWithin(DAY),
    active7d: activeWithin(7 * DAY),
    active30d: activeWithin(30 * DAY),
    newUsers7d: createdWithin(7 * DAY),
    newUsers30d: createdWithin(30 * DAY),
    signupsByDay,
    recentlyActive,
  });
});

export default router;
