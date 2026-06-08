import type { AppEnv } from "../config/env";

const REQUIRED_TABLES = [
  "pos_providers",
  "restaurants",
  "restaurant_locations",
  "pos_connections",
  "canonical_menu_items",
  "canonical_modifier_groups",
  "canonical_modifiers",
  "pos_menu_mappings",
  "agents",
  "agent_api_keys",
  "operator_users",
  "operator_memberships",
  "operator_sessions",
  "restaurant_agent_permissions",
  "ordering_rules",
  "agent_orders",
  "agent_order_items",
  "agent_order_modifiers",
  "order_validation_results",
  "order_quotes",
  "pos_order_submissions",
  "order_status_events",
  "reporting_daily_metrics",
  "audit_logs",
  "api_idempotency_records",
  "order_retry_attempts",
  "event_ingestion_records",
] as const;

const REQUIRED_COLUMNS: Record<string, readonly string[]> = {
  restaurant_locations: ["latitude", "longitude"],
  canonical_menu_items: ["image_url"],
  agent_api_keys: ["scopes", "revoked_at"],
  operator_users: ["supabase_user_id"],
  order_validation_results: ["idempotency_key"],
  order_quotes: ["idempotency_key"],
  pos_order_submissions: ["payload_snapshot", "attempt_count"],
} as const;

function authHeaders(env: AppEnv) {
  return {
    apikey: env.supabaseServiceRoleKey,
    Authorization: `Bearer ${env.supabaseServiceRoleKey}`,
  };
}

function getRestUrl(env: AppEnv, path: string) {
  return `${env.supabaseUrl.replace(/\/$/, "")}/rest/v1/${path}`;
}

function missingTableError(tableName: string) {
  return new Error(
    [
      `Supabase is reachable, but the Phantom schema is not installed yet.`,
      `Missing table: public.${tableName}.`,
      `Apply /Users/akayla/Desktop/restaurant_platform/db/schema.sql first, then /Users/akayla/Desktop/restaurant_platform/db/seed.sql, and restart with DEMO_MODE=false.`,
    ].join(" "),
  );
}

function missingColumnError(tableName: string, columnName: string) {
  return new Error(
    [
      `Supabase is reachable, but the Phantom schema is out of date.`,
      `Missing column: public.${tableName}.${columnName}.`,
      `Apply the latest /Users/akayla/Desktop/restaurant_platform/db/schema.sql migration updates, then restart with DEMO_MODE=false.`,
    ].join(" "),
  );
}

export async function assertSupabaseReady(env: AppEnv) {
  if (!env.supabaseUrl) {
    throw new Error("SUPABASE_URL is required when DEMO_MODE=false.");
  }

  if (!env.supabaseServiceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required when DEMO_MODE=false.");
  }

  const response = await fetch(getRestUrl(env, "pos_providers?select=id&limit=1"), {
    headers: authHeaders(env),
  });

  if (!response.ok) {
    const body = await response.text();

    if (response.status === 404 && body.includes("PGRST205")) {
      throw missingTableError("pos_providers");
    }

    throw new Error(`Supabase readiness check failed: ${response.status} ${body}`);
  }

  for (const table of REQUIRED_TABLES) {
    const tableResponse = await fetch(getRestUrl(env, `${table}?select=*&limit=0`), {
      headers: authHeaders(env),
    });

    if (!tableResponse.ok) {
      const body = await tableResponse.text();

      if (tableResponse.status === 404 && body.includes("PGRST205")) {
        throw missingTableError(table);
      }

      throw new Error(`Supabase table check failed for ${table}: ${tableResponse.status} ${body}`);
    }
  }

  for (const [table, columns] of Object.entries(REQUIRED_COLUMNS)) {
    for (const column of columns) {
      const columnResponse = await fetch(getRestUrl(env, `${table}?select=id,${column}&limit=0`), {
        headers: authHeaders(env),
      });

      if (!columnResponse.ok) {
        const body = await columnResponse.text();

        if (body.includes(column)) {
          throw missingColumnError(table, column);
        }

        throw new Error(`Supabase column check failed for ${table}.${column}: ${columnResponse.status} ${body}`);
      }
    }
  }
}
