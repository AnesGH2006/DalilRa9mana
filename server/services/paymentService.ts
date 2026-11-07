import { createHmac, timingSafeEqual } from "node:crypto";
import { and, eq, isNull, lt, or } from "drizzle-orm";
import { db, paymentsTable, usersTable } from "../../shared/db.js";
import { PAID_PLAN_PRICES_DZD } from "../../shared/subscription.js";

const DEFAULT_AMOUNT_DZD = 1000;
export const PAID_PLAN_TRIAL_DAYS = 30;

// إضافة جميع المبالغ المتاحة في بطاقات الواجهة
const ALLOWED_AMOUNTS_DZD = new Set([
  1000, // ولي الأمر
  2000, // الأستاذ / المستشار Pro
  8000, // المؤسسة (School Admin)
  3000,
  7000,
  DEFAULT_AMOUNT_DZD,
  ...Object.values(PAID_PLAN_PRICES_DZD),
]);

function requireAllowedAmount(amountDzd: number): number {
  if (!Number.isInteger(amountDzd) || !ALLOWED_AMOUNTS_DZD.has(amountDzd)) {
    throw new Error("Unsupported payment amount");
  }
  return amountDzd;
}

import { STAFF_PLAN, PARENT_PLAN } from "../middlewares/staffAccess.js";

function paidPlanForAmount(amountDzd: number): string | null {
  if (amountDzd === 1000) return PARENT_PLAN;   // "parent"
  if (amountDzd === 2000) return STAFF_PLAN;    // "staff"
  if (amountDzd === 3000 || amountDzd === PAID_PLAN_PRICES_DZD.basic) return "basic";
  if (amountDzd === 7000 || amountDzd === PAID_PLAN_PRICES_DZD.pro) return "pro";
  return null;
}

function chargilyBase() {
  return process.env.CHARGILY_API_URL
    ?? (process.env.CHARGILY_MODE === "test"
      ? "https://pay.chargily.net/test/api/v2/checkouts"
      : "https://pay.chargily.net/api/v2/checkouts");
}



export async function createChargilyCheckout(userId: string, returnUrl: string, requestedAmountDzd = DEFAULT_AMOUNT_DZD) {
  const amountDzd = requireAllowedAmount(requestedAmountDzd);
  const apiKey = process.env.CHARGILY_API_KEY;
  const endpoint = process.env.CHARGILY_API_URL
      ? process.env.CHARGILY_API_URL
      : (process.env.CHARGILY_MODE === "test"
          ? "https://pay.chargily.net/test/api/v2/checkouts"
          : "https://pay.chargily.net/api/v2/checkouts")
          webhook_endpoint: `${new URL(returnUrl).origin}/api/payments/chargily/webhook`;

  if (!apiKey) throw new Error("CHARGILY_API_KEY is not configured");

  const [payment] = await db.insert(paymentsTable).values({
    userId,
    provider: "chargily",
    amountDzd,
    status: "pending",
    metadata: { returnUrl },
  }).returning();
  if (!payment) throw new Error("Unable to create payment record");

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": "RafikRa9mana/1.0",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ 
      amount: amountDzd, 
      currency: "dzd", 
      success_url: returnUrl, 
      failure_url: returnUrl, 
      metadata: { paymentId: payment.id, userId } 
    }),
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    await db.update(paymentsTable).set({ status: "failed", updatedAt: new Date() }).where(eq(paymentsTable.id, payment.id));
    const providerMessage = await response.text().catch(() => "");
    let detail = providerMessage.trim();
    if (/<!doctype html|<html/i.test(detail)) {
      detail = "بوابة Chargily أرجعت صفحة حماية بدل استجابة API. تحقق من رابط البيئة ومفتاح API.";
    }
    try {
      const parsed = JSON.parse(detail) as { message?: string; error?: string };
      detail = parsed.message ?? parsed.error ?? detail;
    } catch {
      // Keep raw provider response
    }
    throw new Error(`Chargily checkout failed with HTTP ${response.status}${detail ? `: ${detail.slice(0, 240)}` : ""}`);
  }

  const payload = await response.json() as { id?: string; checkout_url?: string; url?: string };
  const checkoutUrl = payload.checkout_url ?? payload.url;
  if (!payload.id || !checkoutUrl) throw new Error("Chargily returned an incomplete checkout response");

  const [updated] = await db.update(paymentsTable)
    .set({ providerReference: payload.id, checkoutUrl, updatedAt: new Date() })
    .where(eq(paymentsTable.id, payment.id))
    .returning();
    
  return updated;
}
export function verifyChargilySignature(rawBody: string, signature: string | undefined): boolean {
  const secret = process.env.CHARGILY_WEBHOOK_SECRET ?? process.env.CHARGILY_API_KEY;
  if (!secret || !signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const left = Buffer.from(expected, "utf8");
  const right = Buffer.from(signature, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}
export async function activateFreePlan(userId: string): Promise<void> {
  const [user] = await db.select({
    subscriptionStatus: usersTable.subscriptionStatus,
    subscriptionPlan: usersTable.subscriptionPlan,
  }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);

  if (!user) throw new Error("User not found");
  if (user.subscriptionStatus === "active" && user.subscriptionPlan !== "free") {
    throw new Error("An active paid plan cannot be downgraded to free");
  }
  if (user.subscriptionStatus === "active" && user.subscriptionPlan === "free") return;
  if (user.subscriptionStatus !== "pending") {
    throw new Error("This account cannot activate the free plan");
  }

  await db.update(usersTable).set({
    subscriptionStatus: "active",
    subscriptionPlan: "free",
    subscriptionExpiresAt: null,
    updatedAt: new Date(),
  }).where(eq(usersTable.id, userId));
}

export async function activatePaidPlanTrial(userId: string, plan: "basic" | "pro"): Promise<Date> {
  const [user] = await db.select({
    subscriptionStatus: usersTable.subscriptionStatus,
    subscriptionPlan: usersTable.subscriptionPlan,
    subscriptionExpiresAt: usersTable.subscriptionExpiresAt,
    trialStartedAt: usersTable.trialStartedAt,
  }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);

  if (!user) throw new Error("User not found");
  if (user.trialStartedAt) throw new Error("تم استخدام التجربة المجانية لهذا الحساب مسبقاً");
  const now = new Date();
  const expiresAt = user.subscriptionExpiresAt ? new Date(user.subscriptionExpiresAt) : null;
  const currentPlanActive = user.subscriptionStatus === "active"
    && user.subscriptionPlan !== "free"
    && (!expiresAt || expiresAt.getTime() > now.getTime());
  if (currentPlanActive) throw new Error("لديك اشتراك مدفوع نشط بالفعل");

  const eligibleAccount = or(
    eq(usersTable.subscriptionStatus, "pending"),
    and(eq(usersTable.subscriptionStatus, "active"), eq(usersTable.subscriptionPlan, "free")),
    and(eq(usersTable.subscriptionStatus, "active"), lt(usersTable.subscriptionExpiresAt, now)),
  );
  const [updated] = await db.update(usersTable).set({
    subscriptionStatus: "active",
    subscriptionPlan: plan,
    subscriptionExpiresAt: new Date(now.getTime() + PAID_PLAN_TRIAL_DAYS * 24 * 60 * 60 * 1000),
    trialStartedAt: now,
    updatedAt: now,
  }).where(and(
    eq(usersTable.id, userId),
    isNull(usersTable.trialStartedAt),
    eligibleAccount,
  )).returning({ subscriptionExpiresAt: usersTable.subscriptionExpiresAt });

  if (!updated?.subscriptionExpiresAt) {
    throw new Error("تعذر تفعيل التجربة؛ تحقق من حالة الاشتراك أو أن التجربة لم تُستخدم سابقاً");
  }
  return updated.subscriptionExpiresAt;
}

export async function verifyChargilyCheckout(checkoutId: string, userId: string) {
  const [payment] = await db.select().from(paymentsTable).where(and(
    eq(paymentsTable.provider, "chargily"),
    eq(paymentsTable.providerReference, checkoutId),
    eq(paymentsTable.userId, userId),
  )).limit(1);
  if (!payment) throw new Error("Payment not found");
  if (payment.status === "paid") return { paid: true };

  const base = process.env.CHARGILY_API_URL
    ?? (process.env.CHARGILY_MODE === "test"
      ? "https://pay.chargily.net/test/api/v2/checkouts"
      : "https://pay.chargily.net/api/v2/checkouts");

  const r = await fetch(`${base}/${encodeURIComponent(checkoutId)}`, {
    headers: { Accept: "application/json", Authorization: `Bearer ${process.env.CHARGILY_API_KEY}` },
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error(`Chargily returned ${r.status}`);
  const data = await r.json() as { status?: string };
  if (data.status !== "paid") return { paid: false, status: data.status };
  await settleChargilyPayment({ reference: checkoutId, status: "paid" });
  return { paid: true };
}
export async function createDemoCheckout(userId: string, returnUrl: string, requestedAmountDzd = DEFAULT_AMOUNT_DZD) {
  const amountDzd = requireAllowedAmount(requestedAmountDzd);
  const [payment] = await db.insert(paymentsTable).values({
    userId,
    provider: "chargily",
    amountDzd,
    status: "pending",
    metadata: { returnUrl, mode: "demo" },
  }).returning();
  if (!payment) throw new Error("Unable to create demo payment record");

  const reference = `demo-${payment.id}`;
  const checkoutUrl = `/payment-demo?paymentId=${encodeURIComponent(payment.id)}`;
  const [updated] = await db.update(paymentsTable)
    .set({ providerReference: reference, checkoutUrl, updatedAt: new Date() })
    .where(eq(paymentsTable.id, payment.id))
    .returning();
  return updated;
}

export async function completeDemoPayment(paymentId: string, userId: string) {
  const [payment] = await db.select().from(paymentsTable)
    .where(and(eq(paymentsTable.id, paymentId), eq(paymentsTable.userId, userId)))
    .limit(1);
  if (!payment || payment.providerReference !== `demo-${payment.id}`) {
    throw new Error("Demo payment not found");
  }
  if (payment.status === "paid") return payment;

  const now = new Date();
  const plan = paidPlanForAmount(payment.amountDzd);
  await db.transaction(async (tx) => {
    await tx.update(paymentsTable)
      .set({ status: "paid", paidAt: now, updatedAt: now })
      .where(eq(paymentsTable.id, payment.id));
    await tx.update(usersTable)
      .set({
        subscriptionStatus: "active",
        ...(plan ? { subscriptionPlan: plan } : {}),
        subscriptionExpiresAt: new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000),
        updatedAt: now,
      })
      .where(eq(usersTable.id, userId));
  });
  return { ...payment, status: "paid" as const, paidAt: now };
}

export async function settleChargilyPayment(input: { reference: string; userId?: string; status: string }) {
  if (!['paid', 'success', 'completed'].includes(input.status.toLowerCase())) return { settled: false };
  const [payment] = await db.select().from(paymentsTable).where(and(eq(paymentsTable.provider, "chargily"), eq(paymentsTable.providerReference, input.reference))).limit(1);
  if (!payment) return { settled: false };
  if (payment.status === "paid") return { settled: true, idempotent: true };

  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.update(paymentsTable).set({ status: "paid", paidAt: now, updatedAt: now }).where(eq(paymentsTable.id, payment.id));
    const plan = paidPlanForAmount(payment.amountDzd);
    await tx.update(usersTable).set({
      subscriptionStatus: "active",
      ...(plan ? { subscriptionPlan: plan } : {}),
      subscriptionExpiresAt: new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000),
      updatedAt: now,
    }).where(eq(usersTable.id, payment.userId));
  });
  return { settled: true, idempotent: false };
}