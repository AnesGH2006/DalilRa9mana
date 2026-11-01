import { Router, type IRouter, type Request, type Response } from "express";
import { db, schoolInfoTable, schoolMembersTable, usersTable } from "../../shared/db.js";
import { eq, inArray, isNotNull } from "drizzle-orm";
import { PARENT_PLAN, STAFF_PLAN } from "../middlewares/staffAccess.js";

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

export default router;
