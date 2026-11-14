import type { Request, Response, NextFunction } from "express";
import {
  STAFF_PLAN,
  STAFF_PLAN_PRICE_DZD,
  PARENT_PLAN,
  PARENT_PLAN_PRICE_DZD,
} from "../../shared/subscription.js";

export { STAFF_PLAN, STAFF_PLAN_PRICE_DZD, PARENT_PLAN, PARENT_PLAN_PRICE_DZD };

export type StaffFeature =
  | "ocr_grades"
  | "ocr_absences"
  | "excel_export"
  | "average_calculator"
  | "parent_notifications";

/** What each paying role gets for the staff plan. */
export const STAFF_BUNDLES: Record<"teacher" | "supervisor", StaffFeature[]> = {
  teacher: ["ocr_grades", "excel_export", "average_calculator"],
  supervisor: ["ocr_absences", "excel_export", "parent_notifications"],
};

type SubscriptionFields = {
  subscriptionPlan?: unknown;
  subscriptionStatus?: unknown;
  subscriptionExpiresAt?: unknown;
};

/** True when this user personally holds an active, unexpired staff subscription. */
export function hasOwnStaffSubscription(user: SubscriptionFields | undefined | null): boolean {
  if (!user) return false;
  if (String(user.subscriptionPlan) !== STAFF_PLAN) return false;
  if (String(user.subscriptionStatus) !== "active") return false;
  if (!user.subscriptionExpiresAt) return false;
  const expires = new Date(String(user.subscriptionExpiresAt)).getTime();
  return Number.isFinite(expires) && expires > Date.now();
}

/**
 * Can the logged-in user use this paid feature?
 *  - school owner / admin: same rule as before (admin, or an active subscription)
 *  - parent: never (parents are not part of the staff plan)
 *  - teacher / supervisor: yes if the SCHOOL has a paid plan (basic/pro),
 *    or if they personally paid the staff plan and the feature is in their role's bundle
 *  - counselor and other roles: only through the school's paid plan
 */
export function canUseStaffFeature(req: Request, feature: StaffFeature): boolean {
  if (!req.isAuthenticated() || !req.user) return false;

  const member = req.memberContext;
  if (!member) {
    if (req.user.role === "admin") return true;
    const expires = req.user.subscriptionExpiresAt ? new Date(String(req.user.subscriptionExpiresAt)).getTime() : null;
    return String(req.user.subscriptionStatus) === "active" && (!expires || expires > Date.now());
  }
  if (member.role === "parent") return false;

  const schoolPlan = String(member.schoolSubscriptionPlan);
  const schoolExpires = member.schoolSubscriptionExpiresAt ? new Date(member.schoolSubscriptionExpiresAt).getTime() : null;
  const schoolPaid = String(member.schoolSubscriptionStatus) === "active"
    && (!schoolExpires || schoolExpires > Date.now())
    && (schoolPlan === "basic" || schoolPlan === "pro");
  if (schoolPaid) return true;

  const bundle = STAFF_BUNDLES[member.role as "teacher" | "supervisor"];
  return !!bundle && bundle.includes(feature) && hasOwnStaffSubscription(req.user);
}

/** Route guard: respond 402 with the staff plan details when the feature is not unlocked. */
export function requireStaffFeature(feature: StaffFeature) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (canUseStaffFeature(req, feature)) {
      next();
      return;
    }
    res.status(402).json({
      error: `هذه الميزة تتطلب اشتراك الأستاذ/المشرف (${STAFF_PLAN_PRICE_DZD} دج في السنة)`,
      requiredPlan: STAFF_PLAN,
      priceDzd: STAFF_PLAN_PRICE_DZD,
      feature,
    });
  };
}