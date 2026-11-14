/**
 * SMS Credits Service — per-school quota tracking
 */
import { eq } from "drizzle-orm";
import { db, schoolSubscriptionsTable } from "../../shared/db.js";
import { logger } from "../lib/logger.js";

const DEFAULT_CREDITS = 100;

/** Calculate SMS credits from the Arabic-aware message segment count. */
export function calculateCreditsNeeded(message: string): number {
  const length = message.trim().length;
  if (length <= 70) return 1;
  return Math.ceil(length / 67);
}

export interface SubscriptionInfo {
  schoolId: string;
  smsCreditsRemaining: number;
  subscriptionStatus: "pending" | "active" | "suspended";
}

/** Get or create a subscription row for the school owner */
export async function getOrCreateSubscription(schoolId: string): Promise<SubscriptionInfo> {
  const [existing] = await db
    .select()
    .from(schoolSubscriptionsTable)
    .where(eq(schoolSubscriptionsTable.schoolId, schoolId))
    .limit(1);

  if (existing) {
    return {
      schoolId: existing.schoolId,
      smsCreditsRemaining: existing.smsCreditsRemaining,
      subscriptionStatus: existing.subscriptionStatus,
    };
  }

  const [created] = await db
    .insert(schoolSubscriptionsTable)
    .values({
      schoolId,
      smsCreditsRemaining: DEFAULT_CREDITS,
      subscriptionStatus: "active",
    })
    .returning();

  logger.info({ schoolId, credits: DEFAULT_CREDITS }, "Created school SMS subscription");

  return {
    schoolId: created!.schoolId,
    smsCreditsRemaining: created!.smsCreditsRemaining,
    subscriptionStatus: created!.subscriptionStatus,
  };
}

/** Check if the school has enough credits */
export async function hasCredits(schoolId: string, count: number): Promise<boolean> {
  const sub = await getOrCreateSubscription(schoolId);
  if (sub.subscriptionStatus !== "active") return false;
  return sub.smsCreditsRemaining >= count;
}

/** Deduct credits after a successful send. Returns remaining balance. */
export async function deductCredits(schoolId: string, count: number): Promise<number> {
  const sub = await getOrCreateSubscription(schoolId);

  if (sub.subscriptionStatus !== "active") {
    throw new Error("اشتراك SMS غير نشط");
  }

  if (sub.smsCreditsRemaining < count) {
    throw new Error(`رصيد SMS غير كافٍ. المتبقي: ${sub.smsCreditsRemaining}، المطلوب: ${count}`);
  }

  const remaining = sub.smsCreditsRemaining - count;

  await db
    .update(schoolSubscriptionsTable)
    .set({ smsCreditsRemaining: remaining })
    .where(eq(schoolSubscriptionsTable.schoolId, schoolId));

  return remaining;
}

/** Add credits (admin top-up) */
export async function addCredits(schoolId: string, amount: number): Promise<number> {
  const sub = await getOrCreateSubscription(schoolId);
  const newBalance = sub.smsCreditsRemaining + amount;

  await db
    .update(schoolSubscriptionsTable)
    .set({ smsCreditsRemaining: newBalance })
    .where(eq(schoolSubscriptionsTable.schoolId, schoolId));

  return newBalance;
}
