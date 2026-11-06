import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

async function migrate() {
  console.log("Running migration...");

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS sessions (
      sid varchar PRIMARY KEY,
      sess jsonb NOT NULL,
      expire timestamp NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON sessions(expire);
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS users (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      email varchar UNIQUE,
      first_name varchar,
      last_name varchar,
      profile_image_url varchar,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  `);
  await db.execute(sql`DO $$ BEGIN CREATE TYPE subscription_status AS ENUM ('pending','active','suspended'); EXCEPTION WHEN duplicate_object THEN null; END $$;`);
  await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_status subscription_status NOT NULL DEFAULT 'pending';`);
  await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_plan varchar(20);`);
  await db.execute(sql`UPDATE users SET subscription_plan = CASE WHEN subscription_status = 'active' THEN 'pro' ELSE 'free' END WHERE subscription_plan IS NULL;`);
  await db.execute(sql`ALTER TABLE users ALTER COLUMN subscription_plan SET DEFAULT 'free';`);
  await db.execute(sql`ALTER TABLE users ALTER COLUMN subscription_plan SET NOT NULL;`);
  await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_expires_at timestamptz;`);

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
    );
  `);

  await db.execute(sql`ALTER TABLE school_info ADD COLUMN IF NOT EXISTS stage varchar(10) NOT NULL DEFAULT 'moyen';`);
  await db.execute(sql`ALTER TABLE school_info ADD COLUMN IF NOT EXISTS directeur varchar(255) DEFAULT '';`);
  await db.execute(sql`ALTER TABLE school_info ADD COLUMN IF NOT EXISTS phone varchar(30) DEFAULT '';`);
  await db.execute(sql`ALTER TABLE school_info ADD COLUMN IF NOT EXISTS sms_gateway_url varchar(500) DEFAULT '';`);
  await db.execute(sql`ALTER TABLE school_info ADD COLUMN IF NOT EXISTS sms_gateway_api_key varchar(500) DEFAULT '';`);
  await db.execute(sql`ALTER TABLE school_info ADD COLUMN IF NOT EXISTS join_code varchar(10);`);
  await db.execute(sql`ALTER TABLE school_info ADD COLUMN IF NOT EXISTS support_phone varchar(30) DEFAULT '';`);
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS school_info_join_code_unique ON school_info(join_code);`);

  await db.execute(sql`DO $$ BEGIN CREATE TYPE niveau AS ENUM ('1AM','2AM','3AM','4AM'); EXCEPTION WHEN duplicate_object THEN null; END $$;`);
  await db.execute(sql`ALTER TYPE niveau ADD VALUE IF NOT EXISTS '1AS';`);
  await db.execute(sql`ALTER TYPE niveau ADD VALUE IF NOT EXISTS '2AS';`);
  await db.execute(sql`ALTER TYPE niveau ADD VALUE IF NOT EXISTS '3AS';`);
  await db.execute(sql`DO $$ BEGIN CREATE TYPE sexe AS ENUM ('M','F'); EXCEPTION WHEN duplicate_object THEN null; END $$;`);
  await db.execute(sql`DO $$ BEGIN CREATE TYPE statut_eleve AS ENUM ('nouveau','redoublant'); EXCEPTION WHEN duplicate_object THEN null; END $$;`);
  await db.execute(sql`DO $$ BEGIN CREATE TYPE resultat_eleve AS ENUM ('admis','non_admis'); EXCEPTION WHEN duplicate_object THEN null; END $$;`);

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
    );
  `);
  await db.execute(sql`
    UPDATE students
    SET nom_prenom = regexp_replace(nom_prenom, '^(.+)\\s+\\1$', '\\1')
    WHERE nom_prenom ~ '^(.+)\\s+\\1$';
  `);

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
    );
  `);
  await db.execute(sql`ALTER TABLE grades ADD COLUMN IF NOT EXISTS grade_type varchar(20) NOT NULL DEFAULT 'general';`);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS absences (
      id varchar(64) PRIMARY KEY,
      user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      student_id varchar(64) NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      annee varchar(20) NOT NULL DEFAULT '2025-2026',
      trimestre integer NOT NULL,
      justified_hours integer NOT NULL DEFAULT 0,
      unjustified_hours integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);

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
      ON student_daily_attendance(user_id, attendance_date);
  `);

  await db.execute(sql`ALTER TABLE student_daily_attendance ADD COLUMN IF NOT EXISTS annee varchar(20) NOT NULL DEFAULT '2025-2026'`);
  await db.execute(sql`ALTER TABLE student_daily_attendance ADD COLUMN IF NOT EXISTS parent_absence_reason varchar(500)`);
  await db.execute(sql`ALTER TABLE student_daily_attendance ADD COLUMN IF NOT EXISTS parent_absence_reason_at timestamptz`);

  await db.execute(sql`DO $$ BEGIN CREATE TYPE payment_status AS ENUM ('pending','paid','failed','refunded'); EXCEPTION WHEN duplicate_object THEN null; END $$;`);
  await db.execute(sql`DO $$ BEGIN CREATE TYPE payment_provider AS ENUM ('chargily','activation_code'); EXCEPTION WHEN duplicate_object THEN null; END $$;`);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS payments (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      provider payment_provider NOT NULL,
      provider_reference varchar(255),
      amount_dzd integer NOT NULL DEFAULT 1000,
      status payment_status NOT NULL DEFAULT 'pending',
      checkout_url varchar(2000),
      metadata jsonb,
      paid_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "UQ_payments_provider_reference" ON payments(provider, provider_reference);
    CREATE INDEX IF NOT EXISTS "IDX_payments_user_created" ON payments(user_id, created_at);
    CREATE INDEX IF NOT EXISTS "IDX_payments_status" ON payments(status);
  `);

  console.log("Migration complete.");
  await pool.end();
}

migrate().catch(e => { console.error(e); process.exit(1); });
