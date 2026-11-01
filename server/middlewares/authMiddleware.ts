import { type Request, type Response, type NextFunction } from "express";
import { eq } from "drizzle-orm";
import { getSession, getSessionId, type SessionData } from "../lib/auth.js";
import { db, schoolMembersTable, usersTable } from "../../shared/db.js";
import type { AuthUser, MemberContext, SchoolSubscriptionPlan } from "../../shared/types.js";
import { DEFAULT_STAFF_PERMISSIONS, normalizeStaffPermissions } from "../../shared/member-permissions.js";

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      memberContext?: MemberContext;
      isAuthenticated(): boolean;
    }
  }
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  const sid = getSessionId(req);

  if (!sid) {
    req.isAuthenticated = () => false;
    next();
    return;
  }

  let session: SessionData | null;
  try {
    session = await getSession(sid);
  } catch (error) {
    req.log.error({ error }, "Unable to verify the current sign-in session");
    res.set("Cache-Control", "private, no-store").status(503).json({ error: "Unable to verify sign-in session" });
    return;
  }

  if (!session) {
    req.isAuthenticated = () => false;
    next();
    return;
  }

  // Keep authorization state current after asynchronous payment webhooks.
  let currentUser: typeof usersTable.$inferSelect | undefined;
  try {
    [currentUser] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, session.user.id))
      .limit(1);
  } catch (error) {
    req.log.error({ error, userId: session.user.id }, "Unable to refresh the authenticated user");
    res.set("Cache-Control", "private, no-store").status(503).json({ error: "Unable to verify user account" });
    return;
  }
  req.user = currentUser
    ? {
        ...session.user,
        email: currentUser.email,
        firstName: currentUser.firstName,
        lastName: currentUser.lastName,
        profileImageUrl: currentUser.profileImageUrl,
        role: currentUser.role,
        subscriptionStatus: currentUser.subscriptionStatus,
        subscriptionPlan: currentUser.subscriptionPlan as AuthUser["subscriptionPlan"],
        subscriptionExpiresAt: currentUser.subscriptionExpiresAt?.toISOString() ?? null,
      }
    : session.user;
  req.isAuthenticated = () => true;

  // Enrich with member context if this user is a teacher/parent sub-account
  try {
    const [member] = await db
      .select()
      .from(schoolMembersTable)
      .where(eq(schoolMembersTable.memberUserId, session.user.id))
      .limit(1);

    if (member) {
      req.memberContext = {
        memberId: member.id,
        schoolUserId: member.schoolUserId,
        role: member.role,
        permissions: member.role === "parent"
          ? []
          : member.permissions == null
            ? [...DEFAULT_STAFF_PERMISSIONS[member.role]]
            : normalizeStaffPermissions(member.permissions, member.role),
        assignedClasses: (member.assignedClasses as string[]) ?? [],
        linkedStudentId: member.linkedStudentId ?? null,
        name: member.name,
      };
      if (member.role !== "parent") {
        const [schoolOwner] = await db.select({
          subscriptionPlan: usersTable.subscriptionPlan,
          subscriptionStatus: usersTable.subscriptionStatus,
        })
          .from(usersTable)
          .where(eq(usersTable.id, member.schoolUserId))
          .limit(1);
        if (schoolOwner) {
          req.memberContext.schoolSubscriptionPlan = schoolOwner.subscriptionPlan as SchoolSubscriptionPlan;
          req.memberContext.schoolSubscriptionStatus = schoolOwner.subscriptionStatus;
        }
      }
    }
  } catch (error) {
    req.log.error({ error, userId: session.user.id }, "Unable to load school-member permissions");
    res.set("Cache-Control", "private, no-store").status(503).json({ error: "Unable to verify account permissions" });
    return;
  }

  next();
}
