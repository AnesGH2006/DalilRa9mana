import type { Request, Response, NextFunction } from "express";
import { hasOwnStaffSubscription } from "./staffAccess.js";

const FREE_TIER_PATHS = [
  /^\/school(?:\/|$)/,
  /^\/students(?:\/|$)/,
  /^\/stats$/,
  /^\/results(?:\/|$)/,
  /^\/grades(?:\/|$)/,
  /^\/health$/,
];

// Routes that must work for people who have no plan of their own:
//  - public lookups (no login, e.g. the school join-code lookup)
//  - auth endpoints
//  - parent self-registration (the parent is a normal logged-in user until this succeeds)
const ALWAYS_ALLOWED_PATHS = [
  /^\/public(?:\/|$)/,
  /^\/auth(?:\/|$)/,
  /^\/parent-register$/,
  // payment routes do their own auth checks; staff and parents must be able to reach them to pay
  /^\/payments(?:\/|$)/,
];

export function requirePaidPlan(req: Request, res: Response, next: NextFunction): void {
  if (ALWAYS_ALLOWED_PATHS.some(path => path.test(req.path))) {
    next();
    return;
  }

  const user = req.user;
  if (!user || !req.isAuthenticated() || user.role === "admin" || req.memberContext?.role === "parent") {
    next();
    return;
  }

  const member = req.memberContext;
  const isSchoolStaff = !!member && member.role !== "parent";

  // Anyone who personally paid the 2,000 DZD Pro plan (a teacher or supervisor added by a school,
  // or a solo teacher with their own class list) passes here.
  // Which paid feature they may use is decided per route (requireStaffFeature)
  // and by their role permissions, not by this general gate.
  if (hasOwnStaffSubscription(user)) {
    next();
    return;
  }

  const plan = isSchoolStaff ? member?.schoolSubscriptionPlan : user.subscriptionPlan;
  const status = isSchoolStaff ? member?.schoolSubscriptionStatus : user.subscriptionStatus;
  const expiresAt = isSchoolStaff ? member?.schoolSubscriptionExpiresAt : user.subscriptionExpiresAt;
  const unexpired = !expiresAt || new Date(expiresAt).getTime() > Date.now();
  if ((plan === "basic" || plan === "pro") && status === "active" && unexpired) {
    next();
    return;
  }
  const expiredPaidPlan = (plan === "basic" || plan === "pro") && status === "active" && !unexpired;
  if (((plan === "free" && status === "active") || expiredPaidPlan) && FREE_TIER_PATHS.some(path => path.test(req.path))) {
    next();
    return;
  }
  res.status(403).json({ error: "This feature requires a paid subscription", requiredPlan: "basic" });
}