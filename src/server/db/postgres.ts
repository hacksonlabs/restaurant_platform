import { Pool, type QueryResultRow } from "pg";
import type { AppEnv } from "../config/env";

let sharedPool: Pool | null = null;

function inferHostFromSupabaseUrl(url: string) {
  const ref = new URL(url).hostname.split(".")[0];
  return `db.${ref}.supabase.co`;
}

export function createPostgresPool(env: AppEnv) {
  if (sharedPool) {
    return sharedPool;
  }

  const connectionString = env.databaseUrl
    ? env.databaseUrl
    : env.supabaseUrl && env.supabaseDbPassword
      ? `postgresql://postgres:${encodeURIComponent(env.supabaseDbPassword)}@${inferHostFromSupabaseUrl(env.supabaseUrl)}:5432/postgres`
      : "";

  if (!connectionString) {
    throw new Error("DATABASE_URL or SUPABASE_DB_PASSWORD is required when DEMO_MODE=false.");
  }

  sharedPool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  return sharedPool;
}

export async function queryRows<T extends QueryResultRow>(pool: Pool, text: string, values: unknown[] = []) {
  const result = await pool.query<T>(text, values);
  return result.rows;
}
