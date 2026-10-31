import * as oidc from "openid-client";
import { Router, type IRouter, type Request, type Response } from "express";
import {
  GetCurrentAuthUserResponse,
  ExchangeMobileAuthorizationCodeBody,
  ExchangeMobileAuthorizationCodeResponse,
  LogoutMobileSessionResponse,
} from "../../shared/schemas.js";
import { db, usersTable, schoolMembersTable } from "../../shared/db.js";
import { and, eq, isNull } from "drizzle-orm";
import {
  clearSession,
  getOidcConfig,
  getSessionId,
  createSession,
  deleteSession,
  SESSION_COOKIE,
  SESSION_TTL,
  ISSUER_URL,
  OIDC_CLIENT_ID,
  type SessionData,
} from "../lib/auth.js";

const OIDC_COOKIE_TTL = 10 * 60 * 1000;
const router: IRouter = Router();

function getOrigin(req: Request): string {
  const requestHost = req.headers.host ?? "";
  const isLocalhost = /^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(requestHost);
  if (isLocalhost && process.env.NODE_ENV !== "production") {
    return `http://${requestHost}`;
  }
  // Explicit override for deployments using a custom domain.
  if (process.env.APP_BASE_URL) {
    return process.env.APP_BASE_URL.replace(/\/$/, "");
  }
  // Last resort: use the public proxy host when APP_BASE_URL is not configured.
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers["host"] || "localhost";
  return `${proto}://${host}`;
}

function setSessionCookie(res: Response, sid: string) {
  res.cookie(SESSION_COOKIE, sid, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL,
  });
}

function setOidcCookie(res: Response, name: string, value: string) {
  res.cookie(name, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: OIDC_COOKIE_TTL,
  });
}

function getSafeReturnTo(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

async function upsertUser(claims: Record<string, unknown>) {
  const adminEmails = (process.env.ADMIN_EMAILS || "").split(",").map(e => e.trim().toLowerCase()).filter(Boolean);
  const email = (claims.email as string) || null;
  const isAdminEmail = email && adminEmails.includes(email.toLowerCase());

  const id = claims.sub as string;
  const identityFields = {
    email,
    firstName: (claims.first_name || claims.given_name) as string || null,
    lastName: (claims.last_name || claims.family_name) as string || null,
    profileImageUrl: (claims.profile_image_url || claims.picture) as string | null,
  };

  // On conflict, only update identity fields — never overwrite role/subscription
  // NOTE: id must NOT appear in the set clause (PG forbids updating the PK in ON CONFLICT)
  const [user] = await db.insert(usersTable)
    .values({
      id,
      ...identityFields,
      role: isAdminEmail ? "admin" : "user",
      subscriptionStatus: isAdminEmail ? "active" : "pending",
      subscriptionPlan: isAdminEmail ? "pro" : "free",
    })
    .onConflictDoUpdate({
      target: usersTable.id,
      set: { ...identityFields, updatedAt: new Date() },
    })
    .returning();

  // If ADMIN_EMAILS is set and user is an admin email but not yet promoted, fix that
  if (isAdminEmail && user.role !== "admin") {
    const [promoted] = await db.update(usersTable)
      .set({ role: "admin", subscriptionStatus: "active", updatedAt: new Date() })
      .where(eq(usersTable.id, user.id))
      .returning();
    return promoted;
  }

  return user;
}

// GET /api/dev-login — instant test login (only when ALLOW_DEV_LOGIN=true)
router.get("/dev-login", async (req: Request, res: Response) => {
  if (process.env.ALLOW_DEV_LOGIN !== "true") {
    // Old bookmarks to the development endpoint should use real authentication.
    res.redirect(`/api/login?returnTo=${encodeURIComponent("/")}`);
    return;
  }
  const testUser = {
    id: "dev-test-user",
    email: "dev@test.local",
    firstName: "مدير",
    lastName: "تجريبي",
    profileImageUrl: null as string | null,
    role: "admin" as const,
    subscriptionStatus: "active" as const,
  };
  try {
    // Upsert test user in DB — do NOT include id in the set clause (PG forbids updating PK)
    await db.insert(usersTable).values(testUser)
      .onConflictDoUpdate({
        target: usersTable.id,
        set: { role: "admin", subscriptionStatus: "active", updatedAt: new Date() },
      });
    const now = Math.floor(Date.now() / 1000);
    const sessionData: SessionData = {
      user: testUser,
      access_token: "dev-token",
      expires_at: now + SESSION_TTL / 1000,
    };
    const sid = await createSession(sessionData);
    setSessionCookie(res, sid);
    // Redirect to the same origin the request came from (works for both dev and prod)
    res.redirect(`${getOrigin(req)}/`);
  } catch (err) {
    req.log.error({ err }, "Dev login failed — database unavailable");
    res.status(503).json({ error: "Database unavailable — cannot create dev session" });
  }
});

router.get("/auth/user", (req: Request, res: Response) => {
  res.set("Cache-Control", "private, no-store");
  if (!req.isAuthenticated() || !req.user) {
    res.json(GetCurrentAuthUserResponse.parse({ user: null }));
    return;
  }
  const userWithContext = { ...req.user, memberContext: req.memberContext ?? null };
  res.json(GetCurrentAuthUserResponse.parse({ user: userWithContext }));
});

router.get("/login", async (req: Request, res: Response) => {
  let config;
  try {
    config = await getOidcConfig();
  } catch (err) {
    req.log.error({ err }, "Google OAuth configuration failed — check GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and issuer access");
    res.redirect("/?auth_error=config_error");
    return;
  }
  const callbackUrl = `${getOrigin(req)}/api/callback`;
  const returnTo = getSafeReturnTo(req.query.returnTo);
  const state = oidc.randomState();
  const nonce = oidc.randomNonce();
  const codeVerifier = oidc.randomPKCECodeVerifier();
  const codeChallenge = await oidc.calculatePKCECodeChallenge(codeVerifier);
  const redirectTo = oidc.buildAuthorizationUrl(config, {
    redirect_uri: callbackUrl,
    scope: "openid email profile",
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    prompt: "consent",
    state,
    nonce,
  });
  setOidcCookie(res, "code_verifier", codeVerifier);
  setOidcCookie(res, "nonce", nonce);
  setOidcCookie(res, "state", state);
  setOidcCookie(res, "return_to", returnTo);
  res.redirect(redirectTo.href);
});

router.get("/callback", async (req: Request, res: Response) => {
  const config = await getOidcConfig();
  const callbackUrl = `${getOrigin(req)}/api/callback`;
  const codeVerifier = req.cookies?.code_verifier;
  const nonce = req.cookies?.nonce;
  const expectedState = req.cookies?.state;
  if (!codeVerifier || !expectedState) { res.redirect("/api/login"); return; }
  const currentUrl = new URL(`${callbackUrl}?${new URL(req.url, `http://${req.headers.host}`).searchParams}`);
  let tokens: oidc.TokenEndpointResponse & oidc.TokenEndpointResponseHelpers;
  try {
    tokens = await oidc.authorizationCodeGrant(config, currentUrl, { pkceCodeVerifier: codeVerifier, expectedNonce: nonce, expectedState, idTokenExpected: true });
  } catch (err) {
    req.log.error({ err, callbackUrl, codeVerifier: !!codeVerifier, expectedState: !!expectedState }, "OIDC callback failed");
    res.redirect("/?auth_error=callback_failed"); return;
  }
  const returnTo = getSafeReturnTo(req.cookies?.return_to);
  res.clearCookie("code_verifier", { path: "/" });
  res.clearCookie("nonce", { path: "/" });
  res.clearCookie("state", { path: "/" });
  res.clearCookie("return_to", { path: "/" });
  const claims = tokens.claims();
  if (!claims) { res.redirect("/api/login"); return; }
  let dbUser;
  try {
    dbUser = await upsertUser(claims as unknown as Record<string, unknown>);
  } catch (err) {
    req.log.error({ err }, "Database error during user upsert in callback — DB may be unavailable");
    res.redirect("/?auth_error=db_unavailable");
    return;
  }
  // Link any unlinked school_members records that match this user's email
  if (dbUser.email) {
    try {
      await db.update(schoolMembersTable)
        .set({ memberUserId: dbUser.id })
        .where(and(
          eq(schoolMembersTable.email, dbUser.email),
          isNull(schoolMembersTable.memberUserId),
        ));
    } catch { /* non-fatal */ }
  }
  const now = Math.floor(Date.now() / 1000);
  const sessionData: SessionData = {
    user: {
      id: dbUser.id,
      email: dbUser.email,
      firstName: dbUser.firstName,
      lastName: dbUser.lastName,
      profileImageUrl: dbUser.profileImageUrl,
      role: dbUser.role as "user" | "admin",
      subscriptionStatus: dbUser.subscriptionStatus as "pending" | "active" | "suspended",
      subscriptionPlan: dbUser.subscriptionPlan as "free" | "basic" | "pro",
      subscriptionExpiresAt: dbUser.subscriptionExpiresAt?.toISOString() ?? null,
    },
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: tokens.expiresIn() ? now + tokens.expiresIn()! : claims.exp,
  };
  let sid;
  try {
    sid = await createSession(sessionData);
  } catch (err) {
    req.log.error({ err }, "Database error during session creation — DB may be unavailable");
    res.redirect("/?auth_error=db_unavailable");
    return;
  }
  setSessionCookie(res, sid);
  res.redirect(returnTo);
});

router.get("/logout", async (req: Request, res: Response) => {
  const origin = getOrigin(req);
  const sid = getSessionId(req);
  await clearSession(res, sid);
  // If OIDC is broken we still clear the local session and redirect home
  // rather than leaving the user stuck on a broken logout page.
  let endSessionUrl: URL;
  try {
    const config = await getOidcConfig();
    if (!OIDC_CLIENT_ID) throw new Error("OIDC client ID is not configured");
    endSessionUrl = oidc.buildEndSessionUrl(config, { client_id: OIDC_CLIENT_ID, post_logout_redirect_uri: origin });
  } catch (err) {
    req.log.error({ err }, "OIDC end-session URL build failed — redirecting home after local session clear");
    res.redirect("/");
    return;
  }
  res.redirect(endSessionUrl.href);
});

router.post("/mobile-auth/token-exchange", async (req: Request, res: Response) => {
  const parsed = ExchangeMobileAuthorizationCodeBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Missing or invalid required parameters" }); return; }
  const { code, code_verifier, redirect_uri, state, nonce } = parsed.data;
  try {
    const config = await getOidcConfig();
    const callbackUrl = new URL(redirect_uri);
    callbackUrl.searchParams.set("code", code);
    callbackUrl.searchParams.set("state", state);
    callbackUrl.searchParams.set("iss", ISSUER_URL);
    const tokens = await oidc.authorizationCodeGrant(config, callbackUrl, { pkceCodeVerifier: code_verifier, expectedNonce: nonce ?? undefined, expectedState: state, idTokenExpected: true });
    const claims = tokens.claims();
    if (!claims) { res.status(401).json({ error: "No claims in ID token" }); return; }
    const dbUser = await upsertUser(claims as unknown as Record<string, unknown>);
    const now = Math.floor(Date.now() / 1000);
    const sessionData: SessionData = {
      user: {
        id: dbUser.id,
        email: dbUser.email,
        firstName: dbUser.firstName,
        lastName: dbUser.lastName,
        profileImageUrl: dbUser.profileImageUrl,
        role: dbUser.role as "user" | "admin",
        subscriptionStatus: dbUser.subscriptionStatus as "pending" | "active" | "suspended",
        subscriptionPlan: dbUser.subscriptionPlan as "free" | "basic" | "pro",
        subscriptionExpiresAt: dbUser.subscriptionExpiresAt?.toISOString() ?? null,
      },
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: tokens.expiresIn() ? now + tokens.expiresIn()! : claims.exp,
    };
    const sid = await createSession(sessionData);
    res.json(ExchangeMobileAuthorizationCodeResponse.parse({ token: sid }));
  } catch (err) {
    req.log.error({ err }, "Mobile token exchange error");
    res.status(500).json({ error: "Token exchange failed" });
  }
});

router.post("/mobile-auth/logout", async (req: Request, res: Response) => {
  const sid = getSessionId(req);
  if (sid) await deleteSession(sid);
  res.json(LogoutMobileSessionResponse.parse({ success: true }));
});

export default router;
