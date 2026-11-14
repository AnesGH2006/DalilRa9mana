import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema.js";
const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;
export const isDatabaseConfigured = Boolean(connectionString);
// Keep Drizzle's inferred types even when local development has no database.
// The fallback is intentionally unreachable until a database-backed query is made.
export const pool = new Pool({
  connectionString: connectionString ?? "postgresql://127.0.0.1:1/unconfigured",
  connectionTimeoutMillis: 1500,
});

// pg.Pool emits an error when an idle client loses its connection. Logging it
// prevents a transient network failure from crashing the whole server.
pool.on("error", (err) => {
  console.error("Unexpected error on idle database client", err);
});

export const db = drizzle(pool, { schema });
export * from "./schema.js";
