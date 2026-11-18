import type { Request, Response, NextFunction } from "express";
import { hasOwnStaffSubscription } from "./staffAccess.js";
import { PRO_ONLY_PREFIXES } from "../../shared/subscription.js";

/**
 * Pro-plan gate for premium school features (census, exam reports, FET, RGF).
 * Basic (2000 DA) does NOT include them; Pro (3000 DA) does.
 * Admins always pass; school members inherit the owner's plan.
 */
export function requireProPlan(req: Request, res: Response, next: NextFunction): void {
  if (req.user?.role === "admin") { next(); return; }

  const member = req.memberContext;
  let plan: string | undefined;
  let status: string | undefined;
  let expiresAt: string | Date | null | undefined;

  if (member) {
    plan = member.schoolSubscriptionPlan;
    status = member.schoolSubscriptionStatus;
    expiresAt = member.schoolSubscriptionExpiresAt;
  } else if (req.user) {
    plan = String(req.user.subscriptionPlan ?? "");
    status = String(req.user.subscriptionStatus ?? "");
    expiresAt = req.user.subscriptionExpiresAt as any;
  }

  const unexpired = !expiresAt || new Date(expiresAt).getTime() > Date.now();
  if (plan === "pro" && status === "active" && unexpired) { next(); return; }

  res.status(403).json({
    error: "هذه الميزة تتطلب باقة Pro (3000 دج/سنة)",
    requiredPlan: "pro",
    priceDzd: 3000,
    proOnlyPrefixes: [...PRO_ONLY_PREFIXES],
  });
}

/** True when the request path targets a Pro-only feature. */
export function isProOnlyPath(path: string): boolean {
  return PRO_ONLY_PREFIXES.some(prefix => path === prefix || path.startsWith(`${prefix}/`) || path.startsWith(prefix));
}

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

  // Anyone who personally holds the staff plan (a teacher or supervisor added by a school,
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