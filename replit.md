# Dalil Ra9mana — دليل الرقمنة

Algerian school management SaaS with separately deployed CEM and lycée instances. Full-stack Arabic-language web app.

## Stack

- **Frontend**: React 19 + Vite 7 + Tailwind CSS 4 + Wouter (routing) + Radix UI + Framer Motion
- **Backend**: Express 5 + TypeScript + Socket.IO
- **Database**: PostgreSQL via Drizzle ORM
- **Auth**: Google OpenID Connect (PKCE)
- **Desktop agent**: Electron (Windows-only, in `agent/`)

## Running the app

```bash
pnpm run dev
```

Starts both the Express server (port 8080) and the Vite dev server (port 5000) concurrently via the **Start application** workflow.

## Database

Schema is managed with Drizzle ORM. Push schema changes to the database:

```bash
pnpm run db:push
```

Browse the database visually:

```bash
pnpm run db:studio
```

Set `DATABASE_URL` to the PostgreSQL connection string for the environment.

## Separate CEM and lycée deployments

CEM and lycée must run as separate deployments against separate PostgreSQL databases.
Never configure the two deployments with the same `DATABASE_URL`.

Set `SCHOOL_STAGE` to `moyen` for the CEM deployment or `lycee` for the lycée
deployment. Set the same value for both the build and server runtime; the frontend
uses it to fix the available levels, and the server uses it to validate and scope
student data. The stage is fixed per deployment and cannot be switched from a
browser setting. The default is `moyen` for existing CEM deployments.

Each deployment must also use its own `SESSION_SECRET` and public `APP_BASE_URL`.
Register the matching OAuth callback URL for each deployment. To prepare a
lycée database, run the database migration (`pnpm tsx scripts/migrate.ts`) before
starting the app so the `1AS`–`3AS` levels are available.

## Subscription plans

- Free: up to 50 students with core student, grade, result, and dashboard features.
- Basic: 3,000 DZD/year.
- Pro: 7,000 DZD/year.

Run the database migration before deploying so existing subscriptions are preserved
and the selected plan is stored for each account.

## Environment variables / secrets

| Key | Required | Notes |
|-----|----------|-------|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `SCHOOL_STAGE` | Optional | `moyen` for CEM or `lycee` for lycée; keep the same setting for build and runtime |
| `SESSION_SECRET` | ✅ | Long random string for session cookies |
| `GOOGLE_CLIENT_ID` | ✅ | Google OAuth web client ID |
| `GOOGLE_CLIENT_SECRET` | ✅ | Google OAuth web client secret |
| `APP_BASE_URL` | Production | Public application URL |
| `ADMIN_EMAILS` | Optional | Comma-separated Google accounts promoted to active admins |
| `ALLOW_DEV_LOGIN` | Local/temporary only | Enables the test admin account at `/api/dev-login`; disable after testing |
| `GROQ_API_KEY` | — | لا حاجة له؛ يضيف كل مشترك مفتاحه الشخصي من الإعدادات |
| `SMTP_HOST/USER/PASS/PORT` | Optional | Email notifications |
| `TWILIO_ACCOUNT_SID` | Optional | SMS/WhatsApp via Twilio |
| `SMS_API_KEY` | Optional | Alternate SMS gateway |
| `CHARGILY_API_KEY` | Payment required | Chargily Pay API key for checkout creation |
| `CHARGILY_WEBHOOK_SECRET` | Payment required | Secret used to verify Chargily payment webhooks |
| `CHARGILY_MODE` | Optional | Use `test` for the Chargily test API; production is the default |
| `CHARGILY_API_URL` | Optional | Override the Chargily checkout endpoint |
| `PAYMENTS_MODE` | Optional | Set to `demo` for simulated payments; use `chargily` for real provider checkout |

## Project structure

```
server/          Express API + Socket.IO server
client/          React frontend (Vite)
shared/          Shared types, Drizzle schema, DB client
agent/           Windows Electron desktop agent (separate deployment)
artifacts/       Sub-projects (video, mockup sandbox, analyzer)
```

## Desktop agent

The Electron agent in `agent/` is Windows-only and connects to the deployed SaaS URL via WebSocket. See `agent/README.md` for build and installation instructions. It cannot run on Replit directly.

## User preferences

- Keep the Arabic RTL layout and direction throughout the UI.

## النشر على Render

1. أنشئ خدمة **Web Service** جديدة واربطها بمستودع المشروع.
2. اختر **Node**، ثم ضع الأوامر التالية:
	- **Build Command:** `npm run build`
	- **Start Command:** `npm start`
3. من **Environment Variables** أضف المتغيرات التالية:
	- `DATABASE_URL`: رابط قاعدة بيانات PostgreSQL.
	- `SESSION_SECRET`: نص عشوائي طويل لحماية جلسات الدخول.
4. اضغط **Create Web Service**. سيستمع الخادم تلقائيًا إلى المنفذ الذي يرسله Render عبر `PORT`.

### متغيرات المصادقة في Render

أضف متغيرات Google OAuth التالية في إعدادات الخدمة:

- `GOOGLE_CLIENT_ID`: معرّف عميل Google OAuth.
- `GOOGLE_CLIENT_SECRET`: سر عميل Google OAuth.
- `OIDC_ISSUER_URL`: اختياري، والإعداد الافتراضي هو `https://accounts.google.com`.
- `APP_BASE_URL`: عنوان الخدمة العام: `https://dalilra9mana.onrender.com`.

يجب أن يطابق عنوان callback المسجل في Google Cloud Console:
`https://dalilra9mana.onrender.com/api/callback`

### الحصول على مفتاح Groq

1. افتح [console.groq.com](https://console.groq.com) وسجّل الدخول أو أنشئ حسابًا.
2. افتح صفحة **API Keys** واضغط **Create API Key**.
3. انسخ المفتاح مرة واحدة، ثم سجّل الدخول إلى التطبيق وافتح **الإعدادات**.
4. ألصق المفتاح في قسم **مفتاح المساعد الذكي Groq** واحفظه. يُحفظ مشفراً لكل مشترك.
5. لا تضع المفتاح في Git أو داخل ملفات الواجهة.

إذا لم يضف المشترك مفتاحه، سيطلب منه المساعد إضافته من الإعدادات. أما `DATABASE_URL` و`SESSION_SECRET` فهما مطلوبان في Render لتشغيل التطبيق.

### تسجيل الدخول على Render

استخدم زر **تسجيل الدخول** في التطبيق أو افتح `/api/login`. الحسابات العادية تبقى في صفحة الاشتراك حتى تصبح حالتها نشطة؛ لإتاحة حساب Google كمدير نشط، أضف بريده إلى `ADMIN_EMAILS` في إعدادات Render ثم أعد النشر.

للاختبار المؤقت بحساب المدير التجريبي، أضف `ALLOW_DEV_LOGIN=true` إلى متغيرات البيئة في Render ثم أعد النشر، وبعدها افتح `/api/dev-login`. هذا ينشئ جلسة المدير التجريبي `dev-test-user` مباشرة. احذف المتغير أو عيّنه إلى `false` بعد الاختبار، لأن الرابط يمنح صلاحيات المدير.

في Render يجب إعداد `GOOGLE_CLIENT_ID` و`GOOGLE_CLIENT_SECRET` وضبط `APP_BASE_URL`، ثم إضافة رابط callback التالي إلى إعدادات Google OAuth:
`https://dalilra9mana.onrender.com/api/callback`
