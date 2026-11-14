export const FREE_STUDENT_LIMIT = 50;

export const PAID_PLAN_PRICES_DZD = {
  basic: 1500,
  pro: 3000,
} as const;

/** Individual staff subscription (teachers / supervisors). */
export const STAFF_PLAN = "staff";
export const STAFF_PLAN_PRICE_DZD = 1000;

/** Parent subscription for child progress and timetable monitoring. */
export const PARENT_PLAN = "parent";
export const PARENT_PLAN_PRICE_DZD = 500;
