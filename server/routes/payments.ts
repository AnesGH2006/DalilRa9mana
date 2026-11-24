import { Router, type Request, type Response } from "express";
import { desc, eq, and } from "drizzle-orm";
import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { db, paymentsTable, paymentRequestsTable, schoolInfoTable, usersTable } from "../../shared/db.js";
import { CCP_ACCOUNT, PAID_PLAN_PRICES_DZD, STAFF_PLAN, STAFF_PLAN_PRICE_DZD, PARENT_PLAN, PARENT_PLAN_PRICE_DZD } from "../../shared/subscription.js";
import { isSchoolStage } from "../../shared/school-stage.js";
import { generateActivationBatch, redeemActivationCode } from "../services/activationCodeService.js";
import { activateFreePlan, activatePaidPlanTrial, completeDemoPayment, createDemoCheckout, createChargilyCheckout, settleChargilyPayment, verifyChargilySignature, verifyChargilyCheckout } from "../services/paymentService.js";
import {
  hasOwnStaffSubscription,
} from "../middlewares/staffAccess.js";
import { isFreeTrialEnabled, isChargilyEnabled, setSiteSetting, TRIAL_ENABLED_KEY, CHARGILY_ENABLED_KEY } from "../services/siteSettings.js";

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
  const trialEnabled = await isFreeTrialEnabled();
  const chargilyEnabled = await isChargilyEnabled();
  const staffTrialAvailable = trialEnabled
    && !trial?.startedAt
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
    trialAvailable: trialEnabled
      && role === "owner"
      && user.role !== "admin"
      && !member
      && !trial?.startedAt
      && !ownPlanIsActive(req),
    trialEnabled,
    chargilyEnabled,
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
  if (!(await isFreeTrialEnabled())) {
    res.status(403).json({ error: "التجربة المجانية متوقفة حالياً" });
    return;
  }
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

// ─── Admin: global free-trial toggle ──────────────────────────────────────────

// GET /api/payments/admin/trial-setting — current free-trial flag.
router.get("/payments/admin/trial-setting", async (req, res): Promise<void> => {
  if (!requireAdmin(req, res)) return;
  res.json({ trialEnabled: await isFreeTrialEnabled() });
});

// POST /api/payments/admin/trial-setting — { enabled: boolean }
router.post("/payments/admin/trial-setting", async (req, res): Promise<void> => {
  if (!requireAdmin(req, res)) return;
  const enabled = req.body?.enabled === true || req.body?.enabled === "true";
  await setSiteSetting(TRIAL_ENABLED_KEY, enabled ? "true" : "false");
  res.json({ success: true, trialEnabled: enabled });
});

// GET /api/payments/admin/chargily-setting — current Chargily flag.
router.get("/payments/admin/chargily-setting", async (req, res): Promise<void> => {
  if (!requireAdmin(req, res)) return;
  res.json({ chargilyEnabled: await isChargilyEnabled() });
});

// POST /api/payments/admin/chargily-setting — { enabled: boolean }
router.post("/payments/admin/chargily-setting", async (req, res): Promise<void> => {
  if (!requireAdmin(req, res)) return;
  const enabled = req.body?.enabled === true || req.body?.enabled === "true";
  await setSiteSetting(CHARGILY_ENABLED_KEY, enabled ? "true" : "false");
  res.json({ success: true, chargilyEnabled: enabled });
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
  if (!(await isChargilyEnabled())) {
    res.status(403).json({ error: "الدفع الإلكتروني معطّل حالياً — استخدم الدفع عبر CCP" });
    return;
  }
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

// ─── Manual CCP payments ──────────────────────────────────────────────────────
// The customer transfers to the CCP account, then submits a request with the
// receipt photo + an email or Facebook contact. An admin reviews and activates
// the chosen plan (basic 2000 / pro 3000) for one year.

const RECEIPTS_DIR = path.resolve(process.cwd(), "server", "uploads", "receipts");
fs.mkdirSync(RECEIPTS_DIR, { recursive: true });

const receiptUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, RECEIPTS_DIR),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || "").toLowerCase() || ".jpg";
      cb(null, `${Date.now()}-${crypto.randomBytes(6).toString("hex")}${ext}`);
    },
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /image\//.test(file.mimetype) || /\.(jpe?g|png|webp|heic)$/i.test(file.originalname);
    cb(ok ? null : new Error("يجب أن يكون الملف صورة"), ok);
  },
});

const SCHOOL_PLANS = ["basic", "pro"] as const;

function ccpAmount(plan: string): number | null {
  if ((SCHOOL_PLANS as readonly string[]).includes(plan)) return PAID_PLAN_PRICES_DZD[plan as "basic" | "pro"];
  if (plan === STAFF_PLAN) return STAFF_PLAN_PRICE_DZD;
  if (plan === PARENT_PLAN) return PARENT_PLAN_PRICE_DZD;
  return null;
}

// POST /api/payments/ccp/request — submit a manual CCP payment request (multipart).
router.post("/payments/ccp/request", (req, res, next) => {
  receiptUpload.single("receipt")(req, res, (err: any) => {
    if (err) {
      const message = err?.code === "LIMIT_FILE_SIZE"
        ? "حجم الصورة كبير جداً (الحد الأقصى 8MB)"
        : (err?.message ?? "تعذر رفع الصورة");
      res.status(400).json({ error: message });
      return;
    }
    next();
  });
}, async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const plan = String(req.body?.plan ?? "");
  const amountDzd = ccpAmount(plan);
  if (!amountDzd) { res.status(400).json({ error: "اختر باقة صحيحة" }); return; }

  const contactEmail = String(req.body?.contactEmail ?? "").trim().slice(0, 255) || null;
  const contactFacebook = String(req.body?.contactFacebook ?? "").trim().slice(0, 255) || null;
  if (!contactEmail && !contactFacebook) {
    res.status(400).json({ error: "أدخل بريدك الإلكتروني أو حسابك على فيسبوك للتواصل" });
    return;
  }
  const receipt = (req as Request & { file?: Express.Multer.File }).file;
  if (!receipt) { res.status(400).json({ error: "أرفق صورة وصل الدفع (CCP)" }); return; }

  // A school account may only request school plans; staff/parent their own plans.
  const options = await purchaseOptions(req);
  if (!options.some(o => o.plan === plan)) {
    res.status(403).json({ error: "هذه الباقة غير متاحة لهذا الحساب" });
    return;
  }

  const [existing] = await db.select({ id: paymentRequestsTable.id }).from(paymentRequestsTable)
    .where(and(eq(paymentRequestsTable.userId, req.user!.id), eq(paymentRequestsTable.status, "pending"))).limit(1);
  if (existing) { res.status(409).json({ error: "لديك طلب دفع قيد المراجعة بالفعل" }); return; }

  const [request] = await db.insert(paymentRequestsTable).values({
    userId: req.user!.id,
    plan,
    amountDzd,
    contactEmail,
    contactFacebook,
    receiptPath: receipt.filename,
    status: "pending",
  }).returning();

  res.status(201).json({ success: true, id: request!.id, status: "pending", ccpAccount: CCP_ACCOUNT });
});

// GET /api/payments/ccp/mine — the caller's own CCP requests.
router.get("/payments/ccp/mine", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const rows = await db.select({
    id: paymentRequestsTable.id,
    plan: paymentRequestsTable.plan,
    amountDzd: paymentRequestsTable.amountDzd,
    status: paymentRequestsTable.status,
    reviewNote: paymentRequestsTable.reviewNote,
    createdAt: paymentRequestsTable.createdAt,
    reviewedAt: paymentRequestsTable.reviewedAt,
  }).from(paymentRequestsTable)
    .where(eq(paymentRequestsTable.userId, req.user!.id))
    .orderBy(desc(paymentRequestsTable.createdAt))
    .limit(10);
  res.json({ ccpAccount: CCP_ACCOUNT, requests: rows });
});

// GET /api/payments/ccp/receipt/:id — serve the receipt image to its owner or an admin.
router.get("/payments/ccp/receipt/:id", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const [row] = await db.select().from(paymentRequestsTable).where(eq(paymentRequestsTable.id, String(req.params.id))).limit(1);
  if (!row?.receiptPath) { res.status(404).json({ error: "Not found" }); return; }
  if (row.userId !== req.user!.id && req.user!.role !== "admin") { res.status(403).json({ error: "Forbidden" }); return; }
  const filePath = path.join(RECEIPTS_DIR, path.basename(row.receiptPath));
  if (!fs.existsSync(filePath)) { res.status(404).json({ error: "Receipt file missing" }); return; }
  res.sendFile(filePath);
});

// GET /api/payments/ccp/admin/requests — admin list of pending/all requests.
router.get("/payments/ccp/admin/requests", async (req, res): Promise<void> => {
  if (!requireAdmin(req, res)) return;
  const status = typeof req.query.status === "string" ? req.query.status : "pending";
  const rows = await db.select({
    id: paymentRequestsTable.id,
    userId: paymentRequestsTable.userId,
    plan: paymentRequestsTable.plan,
    amountDzd: paymentRequestsTable.amountDzd,
    contactEmail: paymentRequestsTable.contactEmail,
    contactFacebook: paymentRequestsTable.contactFacebook,
    status: paymentRequestsTable.status,
    reviewNote: paymentRequestsTable.reviewNote,
    createdAt: paymentRequestsTable.createdAt,
    reviewedAt: paymentRequestsTable.reviewedAt,
    userFirstName: usersTable.firstName,
    userLastName: usersTable.lastName,
    userEmail: usersTable.email,
  }).from(paymentRequestsTable)
    .innerJoin(usersTable, eq(usersTable.id, paymentRequestsTable.userId))
    .where(status === "all" ? undefined : eq(paymentRequestsTable.status, status as any))
    .orderBy(desc(paymentRequestsTable.createdAt))
    .limit(200);
  res.json({ requests: rows });
});

// POST /api/payments/ccp/admin/review — approve (activates plan +1 year) or reject.
router.post("/payments/ccp/admin/review", async (req, res): Promise<void> => {
  if (!requireAdmin(req, res)) return;
  const id = String(req.body?.id ?? "");
  const action = String(req.body?.action ?? "");
  const note = typeof req.body?.note === "string" ? req.body.note.slice(0, 500) : null;
  if (!id || (action !== "approve" && action !== "reject")) {
    res.status(400).json({ error: "id and action (approve|reject) are required" });
    return;
  }

  const [row] = await db.select().from(paymentRequestsTable).where(eq(paymentRequestsTable.id, id)).limit(1);
  if (!row) { res.status(404).json({ error: "Request not found" }); return; }
  if (row.status !== "pending") { res.status(409).json({ error: "Request already reviewed" }); return; }

  if (action === "reject") {
    await db.update(paymentRequestsTable).set({
      status: "rejected", reviewNote: note, reviewedBy: req.user!.id, reviewedAt: new Date(),
    }).where(eq(paymentRequestsTable.id, id));
    res.json({ success: true, status: "rejected" });
    return;
  }

  // Approve: activate the requested plan for one year (extends an active plan).
  const now = new Date();
  const [user] = await db.select({
    subscriptionPlan: usersTable.subscriptionPlan,
    subscriptionStatus: usersTable.subscriptionStatus,
    subscriptionExpiresAt: usersTable.subscriptionExpiresAt,
  }).from(usersTable).where(eq(usersTable.id, row.userId)).limit(1);
  const currentExpiry = user?.subscriptionExpiresAt ? new Date(user.subscriptionExpiresAt) : null;
  const base = currentExpiry && currentExpiry.getTime() > now.getTime() ? currentExpiry : now;
  const expiresAt = new Date(base.getTime());
  expiresAt.setFullYear(expiresAt.getFullYear() + 1);

  await db.update(usersTable).set({
    subscriptionPlan: row.plan,
    subscriptionStatus: "active",
    subscriptionExpiresAt: expiresAt,
    updatedAt: now,
  }).where(eq(usersTable.id, row.userId));

  await db.update(paymentRequestsTable).set({
    status: "approved", reviewNote: note, reviewedBy: req.user!.id, reviewedAt: now,
  }).where(eq(paymentRequestsTable.id, id));

  res.json({ success: true, status: "approved", plan: row.plan, expiresAt: expiresAt.toISOString() });
});

export default router;