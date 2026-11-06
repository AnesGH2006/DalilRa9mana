import { createServer } from "http";
import app from "./app.js";
import { logger } from "./lib/logger.js";
import { initSocketIO } from "./socket/index.js";
import { isDatabaseConfigured } from "../shared/db.js";
import { startNotificationWorker } from "./services/notificationQueue.js";

// ── Startup environment validation ────────────────────────────────────────────
// Log warnings for optional or environment-specific variables; only hard-exit
// for truly required values that cannot be recovered from.
const HARD_REQUIRED: Record<string, string> = {
  DATABASE_URL: "PostgreSQL connection string — required for sessions and data",
};

let startupOk = true;
for (const [key, description] of Object.entries(HARD_REQUIRED)) {
  if (!process.env[key]) {
    logger.error({ envVar: key }, `Missing required environment variable: ${key} (${description})`);
    startupOk = false;
  }
}

if (!process.env.GOOGLE_CLIENT_ID && !process.env.OIDC_CLIENT_ID) {
  logger.warn(
    { envVar: "GOOGLE_CLIENT_ID" },
    "Missing Google OAuth client ID (set GOOGLE_CLIENT_ID). Login will be unavailable.",
  );
}

if (!startupOk) {
  logger.fatal("Server cannot start safely — one or more required environment variables are missing. Set them and restart.");
  process.exit(1);
}

if (!process.env.SESSION_SECRET) {
  logger.warn(
    "SESSION_SECRET is not set. Set it to a long random string to protect session cookies.",
  );
}

if (!process.env.GEMINI_API_KEY) {
  logger.warn(
    { envVar: "GEMINI_API_KEY" },
    "GEMINI_API_KEY is not set. POST /api/ocr/scan-grades will use each user's saved Gemini key, or return 503 if none is available.",
  );
}

// ── Verify database connectivity (non-fatal) ──────────────────────────────────
// We attempt a quick connectivity probe and log the result, but we do NOT
// exit on failure.  In autoscale/Cloud Run the managed database may not be
// reachable under the development hostname; the deploy must still promote so
// the runtime can inject the correct production DATABASE_URL on subsequent
// deploys.  Individual routes return 503 when the pool is unavailable.
import { db } from "../shared/db.js";
import { sql } from "drizzle-orm";

async function probeDb(attempt = 1): Promise<void> {
  if (!isDatabaseConfigured) {
    logger.warn("DATABASE_URL is not configured — skipping database health probe. Database-dependent routes will fail until it is set.");
    return;
  }

  const MAX_ATTEMPTS = 5;
  const DELAY_MS = 3000;
  try {
    await db.execute(sql`SELECT 1`);
    
    // Create tables in dependency order: base tables first, then tables that reference them
    // 1. Create users table (no dependencies)
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS users (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        email varchar UNIQUE,
        first_name varchar,
        last_name varchar,
        profile_image_url varchar,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS school_info (
        id varchar(64) PRIMARY KEY,
        user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        nom varchar(255) NOT NULL DEFAULT '',
        wilaya varchar(100) NOT NULL DEFAULT '',
        commune varchar(100) NOT NULL DEFAULT '',
        stage varchar(10) NOT NULL DEFAULT 'moyen',
        annee varchar(20) NOT NULL DEFAULT '2025-2026',
        directeur varchar(255) DEFAULT '',
        phone varchar(30) DEFAULT '',
        sms_gateway_url varchar(500) DEFAULT '',
        sms_gateway_api_key varchar(500) DEFAULT '',
        join_code varchar(10),
        support_phone varchar(30) DEFAULT '',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await db.execute(sql`ALTER TABLE school_info ADD COLUMN IF NOT EXISTS stage varchar(10) NOT NULL DEFAULT 'moyen'`);
    await db.execute(sql`ALTER TABLE school_info ADD COLUMN IF NOT EXISTS directeur varchar(255) DEFAULT ''`);
    await db.execute(sql`ALTER TABLE school_info ADD COLUMN IF NOT EXISTS phone varchar(30) DEFAULT ''`);
    await db.execute(sql`ALTER TABLE school_info ADD COLUMN IF NOT EXISTS sms_gateway_url varchar(500) DEFAULT ''`);
    await db.execute(sql`ALTER TABLE school_info ADD COLUMN IF NOT EXISTS sms_gateway_api_key varchar(500) DEFAULT ''`);
    await db.execute(sql`ALTER TABLE school_info ADD COLUMN IF NOT EXISTS join_code varchar(10)`);
    await db.execute(sql`ALTER TABLE school_info ADD COLUMN IF NOT EXISTS support_phone varchar(30) DEFAULT ''`);
    await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS school_info_join_code_unique ON school_info(join_code)`);
    
    // 2. Create enum types needed by students table
    await db.execute(sql`DO $$ BEGIN CREATE TYPE niveau AS ENUM ('1AM','2AM','3AM','4AM'); EXCEPTION WHEN duplicate_object THEN null; END $$`);
    await db.execute(sql`ALTER TYPE niveau ADD VALUE IF NOT EXISTS '1AS'`);
    await db.execute(sql`ALTER TYPE niveau ADD VALUE IF NOT EXISTS '2AS'`);
    await db.execute(sql`ALTER TYPE niveau ADD VALUE IF NOT EXISTS '3AS'`);
    await db.execute(sql`DO $$ BEGIN CREATE TYPE sexe AS ENUM ('M','F'); EXCEPTION WHEN duplicate_object THEN null; END $$`);
    await db.execute(sql`DO $$ BEGIN CREATE TYPE statut_eleve AS ENUM ('nouveau','redoublant'); EXCEPTION WHEN duplicate_object THEN null; END $$`);
    await db.execute(sql`DO $$ BEGIN CREATE TYPE resultat_eleve AS ENUM ('admis','non_admis'); EXCEPTION WHEN duplicate_object THEN null; END $$`);
    
    // 3. Create students table (references users)
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS students (
        id varchar(64) PRIMARY KEY,
        user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        nom_prenom varchar(255) NOT NULL,
        date_naissance varchar(30),
        niveau niveau NOT NULL,
        classe varchar(10) NOT NULL,
        sexe sexe NOT NULL,
        statut statut_eleve NOT NULL DEFAULT 'nouveau',
        resultat resultat_eleve,
        annee varchar(20) NOT NULL DEFAULT '2025-2026',
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    
    // 4. Create grades table (references users and students)
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS grades (
        id varchar(64) PRIMARY KEY,
        user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        student_id varchar(64) NOT NULL REFERENCES students(id) ON DELETE CASCADE,
        annee varchar(20) NOT NULL DEFAULT '2025-2026',
        trimestre integer NOT NULL CHECK (trimestre IN (1,2,3)),
        subject varchar(50) NOT NULL,
        grade_type varchar(20) NOT NULL DEFAULT 'general',
        score numeric(5,2) NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await db.execute(sql`ALTER TABLE grades ADD COLUMN IF NOT EXISTS grade_type varchar(20) NOT NULL DEFAULT 'general'`);
    
    // 5. Create student_daily_attendance table (references users and students)
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS student_daily_attendance (
        id varchar(64) PRIMARY KEY,
        user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        student_id varchar(64) NOT NULL REFERENCES students(id) ON DELETE CASCADE,
        attendance_date varchar(10) NOT NULL,
        annee varchar(20) NOT NULL DEFAULT '2025-2026',
        status varchar(100) NOT NULL,
        is_absent boolean NOT NULL,
        parent_absence_reason varchar(500),
        parent_absence_reason_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_student_daily_attendance_user_student_date"
        ON student_daily_attendance(user_id, student_id, attendance_date);
      CREATE INDEX IF NOT EXISTS "IDX_student_daily_attendance_user_date"
        ON student_daily_attendance(user_id, attendance_date)
    `);
    await db.execute(sql`ALTER TABLE student_daily_attendance ADD COLUMN IF NOT EXISTS annee varchar(20) NOT NULL DEFAULT '2025-2026'`);
    await db.execute(sql`ALTER TABLE student_daily_attendance ADD COLUMN IF NOT EXISTS parent_absence_reason varchar(500)`);
    await db.execute(sql`ALTER TABLE student_daily_attendance ADD COLUMN IF NOT EXISTS parent_absence_reason_at timestamptz`);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS student_documents (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        student_id varchar(64) NOT NULL REFERENCES students(id) ON DELETE CASCADE,
        doc_type varchar(40) NOT NULL,
        fields jsonb NOT NULL,
        created_by varchar,
        created_by_name varchar(255),
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "IDX_student_documents_student"
      ON student_documents(student_id, created_at)
    `);
    
    // Repair names imported from combined Excel name columns before the parser fix.
    await db.execute(sql`UPDATE students SET nom_prenom = regexp_replace(nom_prenom, '^(.+)\\s+\\1$', '\\1') WHERE nom_prenom ~ '^(.+)\\s+\\1$'`);
    logger.info("Database connection verified");
  } catch (err) {
    if (attempt < MAX_ATTEMPTS) {
      logger.warn({ err, attempt }, `Database probe failed — retrying in ${DELAY_MS / 1000}s (attempt ${attempt}/${MAX_ATTEMPTS})`);
      await new Promise(r => setTimeout(r, DELAY_MS));
      return probeDb(attempt + 1);
    }
    // After all retries, log the error but keep the server running.
    // The production environment will inject the correct DATABASE_URL;
    // the server must stay up so the deployment promote step can succeed.
    logger.error(
      { err },
      "Database connection failed after retries — server will continue running. " +
      "Check DATABASE_URL and ensure the database is reachable. " +
      "DB-dependent routes will return errors until connectivity is restored.",
    );
  }
}

// ── HTTP server ───────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT || "8080");

const httpServer = createServer(app);
initSocketIO(httpServer);

httpServer.listen(PORT, "0.0.0.0", () => {
  logger.info({ port: PORT }, "Server listening");
  startNotificationWorker();
  // Probe DB in the background after the port is open so the health check
  // can succeed even while we are still waiting for the database.
  probeDb().catch(() => {/* already logged inside probeDb */});
});
