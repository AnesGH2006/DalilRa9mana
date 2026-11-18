export const FREE_STUDENT_LIMIT = 50;

export const PAID_PLAN_PRICES_DZD = {
  basic: 2000,
  pro: 3000,
} as const;

/** Official CCP account for manual bank-transfer payments (receipt photo + contact review). */
export const CCP_ACCOUNT = "0001538792";

/**
 * Features reserved for the Pro (3000 DA) school plan.
 * The Basic (2000 DA) plan unlocks everything else.
 */
export const PRO_ONLY_PREFIXES = [
  "/reports/census",
  "/timetable/fet",
  "/reports/rgf",
  "/exams",
  "/exam-reports",
] as const;

/** Individual staff subscription (teachers / supervisors). */
export const STAFF_PLAN = "staff";
export const STAFF_PLAN_PRICE_DZD = 1000;

/** Parent subscription for child progress and timetable monitoring. */
export const PARENT_PLAN = "parent";
export const PARENT_PLAN_PRICE_DZD = 500;
