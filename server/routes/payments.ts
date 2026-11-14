import { Router, type Request, type Response } from "express";
import { desc, eq } from "drizzle-orm";
import { db, paymentsTable, schoolInfoTable, usersTable } from "../../shared/db.js";
import { isSchoolStage } from "../../shared/school-stage.js";
import { generateActivationBatch, redeemActivationCode } from "../services/activationCodeService.js";
import { activateFreePlan, activatePaidPlanTrial, completeDemoPayment, createDemoCheckout, createChargilyCheckout, settleChargilyPayment, verifyChargilySignature, verifyChargilyCheckout } from "../services/paymentService.js";
import { PAID_PLAN_PRICES_DZD } from "../../shared/subscription.js";
import {
  STAFF_PLAN,
  STAFF_PLAN_PRICE_DZD,
  PARENT_PLAN,
  PARENT_PLAN_PRICE_DZD,
  hasOwnStaffSubscription,
} from "../middlewares/staffAccess.js";

const router = Router();

function requireAuth(req: Request, res: Response): boolean {
  if (!req.isAuthenticated() || !req.user) { res.status(401).json({ error: "Unauthorized" }); return false; }
  return true;
}

function requireAdmin(req: Request, res: Response): boolean {
  if (!requireAuth(req, res)) return false;
  if (req.user!.role !== "admin") { res.status(403).json({ error: "Forbidden" }); return false; }
  return true;
}

/** Public origin of this app, used for the page Chargily sends people back to after paying. */
function appOrigin(req: Request): string {
  const configured = (process.env.PUBLIC_APP_URL || process.env.APP_BASE_URL)?.replace(/\/$/, "");
  if (configured) return configured;
  const proto = req.get("x-forwarded-proto")?.split(",")[0]?.trim() || req.protocol;
  return `${proto}://${req.get("host")}`;
}

/**
 * What this logged-in account is allowed to buy. Used by the payments page and by the checkout guard.
 *  - teacher / supervisor: the staff plan
 *  - registered parent: the parent plan
 *  - an account that runs a school (has school info): the school plans only
 *  - any other account (a solo teacher, or a parent who has not registered with a school yet):
 *    the school plans, plus the staff plan and the parent plan
 */
async function purchaseOptions(req: Request): Promise<Array<{ plan: string; amountDzd: number }>> {
  const member = req.memberContext;
  if (member) {
    if (member.role === "teacher" || member.role === "supervisor") {
      return [{ plan: STAFF_PLAN, amountDzd: STAFF_PLAN_PRICE_DZD }];
    }
    if (member.role === "parent") {
      return [{ plan: PARENT_PLAN, amountDzd: PARENT_PLAN_PRICE_DZD }];
    }
    return [];
  }
  if (req.user?.role === "admin") return [];

  const schoolOptions = Object.entries(PAID_PLAN_PRICES_DZD).map(([plan, amountDzd]) => ({ plan, amountDzd: Number(amountDzd) }));
  const [school] = await db.select({ id: schoolInfoTable.id }).from(schoolInfoTable).where(eq(schoolInfoTable.userId, req.user!.id)).limit(1);
  return school
    ? schoolOptions
    : [
        ...schoolOptions,
        { plan: STAFF_PLAN, amountDzd: STAFF_PLAN_PRICE_DZD },
        { plan: PARENT_PLAN, amountDzd: PARENT_PLAN_PRICE_DZD },
      ];
}

/** Is this account's own paid plan currently active? */
function ownPlanIsActive(req: Request): boolean {
  const user = req.user!;
  const member = req.memberContext;
  if (member?.role === "teacher" || member?.role === "supervisor") return hasOwnStaffSubscription(user);

  const plan = String(user.subscriptionPlan);
  const expires = user.subscriptionExpiresAt ? new Date(String(user.subscriptionExpiresAt)) : null;
  const live = String(user.subscriptionStatus) === "active" && (!expires || expires.getTime() > Date.now());
  if (member?.role === "parent") return live && plan === PARENT_PLAN;
  if (member) return false;
  return (live && (plan === "basic" || plan === "pro" || plan === PARENT_PLAN)) || hasOwnStaffSubscription(user);
}

// GET /api/payments/me — everything the payments pages need for the logged-in account.
router.get("/payments/me", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const user = req.user!;
  const member = req.memberContext;
  const role = member ? member.role : (user.role === "admin" ? "admin" : "owner");
  const expires = user.subscriptionExpiresAt ? new Date(String(user.subscriptionExpiresAt)) : null;
  const [trial] = await db.select({ startedAt: usersTable.trialStartedAt })
    .from(usersTable)
    .where(eq(usersTable.id, user.id))
    .limit(1);

  const [last] = await db.select({
    amountDzd: paymentsTable.amountDzd,
    status: paymentsTable.status,
    paidAt: paymentsTable.paidAt,
  })
    .from(paymentsTable)
    .where(eq(paymentsTable.userId, user.id))
    .orderBy(desc(paymentsTable.createdAt))
    .limit(1);

  const options = await purchaseOptions(req);
  const schoolExpires = member?.schoolSubscriptionExpiresAt ? new Date(member.schoolSubscriptionExpiresAt).getTime() : null;
  const schoolPlanActive = !!member
    && String(member.schoolSubscriptionStatus) === "active"
    && (!schoolExpires || schoolExpires > Date.now())
    && (member.schoolSubscriptionPlan === "basic" || member.schoolSubscriptionPlan === "pro");
  const staffTrialAvailable = !trial?.startedAt
    && !ownPlanIsActive(req)
    && !schoolPlanActive
    && user.role !== "admin"
    && options.some(option => option.plan === STAFF_PLAN);

  res.set("Cache-Control", "private, no-store").json({
    role,
    registered: Boolean(member),
    plan: String(user.subscriptionPlan),
    status: String(user.subscriptionStatus),
    expiresAt: expires && !Number.isNaN(expires.getTime()) ? expires.toISOString() : null,
    active: ownPlanIsActive(req),
    trialAvailable: role === "owner"
      && user.role !== "admin"
      && !member
      && !trial?.startedAt
      && !ownPlanIsActive(req),
    staffTrialAvailable,
    trialStartedAt: trial?.startedAt?.toISOString() ?? null,
    options,
    lastPayment: last ? { amountDzd: last.amountDzd, status: last.status, paidAt: last.paidAt } : null,
    prices: {
      school: Object.fromEntries(Object.entries(PAID_PLAN_PRICES_DZD).map(([plan, amount]) => [plan, Number(amount)])),
      staff: STAFF_PLAN_PRICE_DZD,
      parent: PARENT_PLAN_PRICE_DZD,
    },
  });
});

router.post("/payments/trial", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const member = req.memberContext;
  const isStaffMember = member?.role === "teacher" || member?.role === "supervisor";
  if (req.user!.role === "admin" || (member && !isStaffMember)) {
    res.status(403).json({ error: "التجربة غير متاحة لهذا الدور" });
    return;
  }

  let plan: "basic" | "pro" | "staff";
  if (isStaffMember || req.body?.plan === STAFF_PLAN) {
    if (req.body?.plan !== STAFF_PLAN) {
      res.status(400).json({ error: "اختر باقة الأستاذ للتجربة المجانية" });
      return;
    }
    plan = STAFF_PLAN;
  } else {
    const schoolPlan = req.body?.plan;
    if (schoolPlan !== "basic" && schoolPlan !== "pro") {
      res.status(400).json({ error: "اختر باقة أساسي أو Pro للتجربة المجانية" });
      return;
    }
    plan = schoolPlan;
  }

  try {
    if (plan === STAFF_PLAN) {
      const options = await purchaseOptions(req);
      if (!options.some(option => option.plan === STAFF_PLAN)) {
        res.status(403).json({ error: "باقة الأستاذ غير متاحة لهذا الحساب" });
        return;
      }
    } else {
      const [school] = await db.select({ stage: schoolInfoTable.stage })
        .from(schoolInfoTable)
        .where(eq(schoolInfoTable.userId, req.user!.id))
        .limit(1);
      if (!school || !isSchoolStage(school.stage)) {
        res.status(409).json({ error: "اختر مرحلة المؤسسة واحفظها قبل بدء التجربة المجانية." });
        return;
      }
    }
    const expiresAt = await activatePaidPlanTrial(req.user!.id, plan);
    res.json({
      success: true,
      plan,
      expiresAt: expiresAt.toISOString(),
      trialDays: 30,
    });
  } catch (error) {
    res.status(409).json({ error: error instanceof Error ? error.message : "تعذر تفعيل التجربة المجانية" });
  }
});

router.post("/payments/activation-codes/batches", async (req, res): Promise<void> => {
  if (!requireAdmin(req, res)) return;
  const count = Number(req.body?.count);
  const expiresAt = req.body?.expiresAt ? new Date(String(req.body.expiresAt)) : undefined;
  if (expiresAt && Number.isNaN(expiresAt.getTime())) { res.status(400).json({ error: "Invalid expiresAt" }); return; }
  try {
    res.status(201).json(await generateActivationBatch(count, expiresAt));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Unable to generate codes" });
  }
});
router.get("/payments/verify", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  try {
    const result = await verifyChargilyCheckout(String(req.query.checkout_id ?? ""), req.user!.id);
    if (!result.paid) { res.status(402).json({ error: "الدفع لم يكتمل بعد" }); return; }
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : "verify failed" });
  }
});
router.post("/payments/redeem-code", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  try {
    res.json(await redeemActivationCode(String(req.body?.code ?? ""), req.user!.id));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Unable to redeem code" });
  }
});

router.post("/payments/free/activate", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  if (req.user!.role === "admin" || req.memberContext) {
    res.status(403).json({ error: "This account cannot activate the free school plan" });
    return;
  }
  try {
    await activateFreePlan(req.user!.id);
    res.json({ success: true, subscriptionPlan: "free", subscriptionStatus: "active" });
  } catch (error) {
    res.status(409).json({ error: error instanceof Error ? error.message : "Unable to activate free plan" });
  }
});

router.post("/payments/checkout", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  if (process.env.PAYMENTS_MODE !== "demo") {
    res.status(404).json({ error: "Demo payments are disabled" });
    return;
  }
  const returnUrl = typeof req.body?.returnUrl === "string" ? req.body.returnUrl : "/";
  const amountDzd = Number(req.body?.amountDzd ?? 1000);
  const options = await purchaseOptions(req);
  if (!options.some(option => option.amountDzd === amountDzd)) {
    res.status(403).json({ error: "هذه الخطة غير متاحة لهذا الحساب" });
    return;
  }
  try {
    const payment = await createDemoCheckout(req.user!.id, returnUrl, amountDzd);
    res.status(201).json({ id: payment!.id, checkoutUrl: payment!.checkoutUrl, amountDzd: payment!.amountDzd });
  } catch (error) {
    res.status(503).json({ error: error instanceof Error ? error.message : "Demo payment unavailable" });
  }
});

router.post("/payments/demo/complete", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  if (process.env.PAYMENTS_MODE !== "demo") {
    res.status(404).json({ error: "Demo payments are disabled" });
    return;
  }
  try {
    const payment = await completeDemoPayment(String(req.body?.paymentId ?? ""), req.user!.id);
    const metadata = payment.metadata as { returnUrl?: string } | null;
    res.json({ success: true, returnUrl: metadata?.returnUrl ?? "/" });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Unable to complete demo payment" });
  }
});

router.post("/payments/chargily/checkout", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const amountDzd = Number(req.body?.amountDzd ?? 1000);

  // Each kind of account may only buy its own plan.
  const options = await purchaseOptions(req);
  if (!options.some(option => option.amountDzd === amountDzd)) {
    res.status(403).json({ error: "هذه الخطة غير متاحة لهذا الحساب" });
    return;
  }

  // Always send people back to the payment-return page, whatever the client asked for.
  // That page waits for the webhook to activate the plan, then sends the person to the right screen.
  // (Ignoring the client's returnUrl also avoids redirects to other sites and to pages that no longer exist.)
  const returnUrl = `${appOrigin(req)}/payment-return`;

  try {
    const payment = await createChargilyCheckout(req.user!.id, returnUrl, amountDzd);
    res.status(201).json({ id: payment!.id, checkoutUrl: payment!.checkoutUrl, amountDzd: payment!.amountDzd });
  } catch (error) {
    req.log.error({ error }, "Chargily checkout creation failed");
    res.status(503).json({ error: error instanceof Error ? error.message : "Payment provider unavailable" });
  }
});

// Chargily Pay v2 webhook.
//  - The signature arrives in the `signature` header (HMAC-SHA256 of the RAW body, keyed with the API secret key).
//  - The payload is an event: { id, type: "checkout.paid" | ..., data: { id, status, metadata, ... } },
//    so the checkout id and status are inside `data`, not at the top level.
router.post("/payments/chargily/webhook", async (req, res): Promise<void> => {
  const rawBody = (req as Request & { rawBody?: string }).rawBody ?? JSON.stringify(req.body);
  const signature = req.header("signature") ?? req.header("x-chargily-signature");

  if (!verifyChargilySignature(rawBody, signature)) {
    req.log?.warn?.(
      { hasSignature: Boolean(signature), hasRawBody: Boolean((req as Request & { rawBody?: string }).rawBody) },
      "Chargily webhook rejected: invalid signature",
    );
    res.status(401).json({ error: "Invalid signature" });
    return;
  }

  const event = req.body as {
    type?: string;
    data?: { id?: string; status?: string; metadata?: { paymentId?: string; userId?: string } | null };
  };
  const checkout = event.data;
  if (!checkout?.id) { res.status(400).json({ error: "Invalid webhook payload" }); return; }

  const status = event.type === "checkout.paid" ? "paid" : (checkout.status ?? "");
  const result = await settleChargilyPayment({
    reference: checkout.id,
    userId: checkout.metadata?.userId,
    status,
  });
  req.log?.info?.({ eventType: event.type, checkoutId: checkout.id, ...result }, "Chargily webhook processed");
  res.json({ received: true, ...result });
});

export default router;