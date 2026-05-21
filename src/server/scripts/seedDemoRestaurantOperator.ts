import { Client } from "pg";
import { getEnv } from "../config/env";
import { assertSupabaseReady } from "../db/supabase";

type AuthUser = {
  id: string;
  email?: string;
};

const DEMO_OPERATOR = {
  operatorUserId: "op_demo_rest",
  email: "demo@restaurant.com",
  password: "password",
  fullName: "Restaurant Demo Operator",
  memberships: [
    {
      membershipId: "membership_demo_rest_green_leaf_owner",
      restaurantId: "rest_green_leaf_salads",
      fallbackLocationId: "loc_green_leaf_salads_main",
    },
  ],
} as const;

function authHeaders(serviceRoleKey: string) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
  };
}

function authUrl(baseUrl: string, path: string) {
  return `${baseUrl.replace(/\/$/, "")}/auth/v1${path}`;
}

async function parseResponse(response: Response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function normalizeAuthUser(payload: unknown): AuthUser | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  if ("user" in (payload as Record<string, unknown>) && (payload as Record<string, unknown>).user) {
    return (payload as { user: AuthUser }).user;
  }
  return payload as AuthUser;
}

async function listAuthUsers(env: ReturnType<typeof getEnv>) {
  const response = await fetch(authUrl(env.supabaseUrl, "/admin/users?page=1&per_page=200"), {
    headers: authHeaders(env.supabaseServiceRoleKey),
  });
  const payload = await parseResponse(response);
  if (!response.ok) {
    throw new Error(`Unable to list Supabase Auth users: ${response.status} ${JSON.stringify(payload)}`);
  }
  return Array.isArray((payload as any)?.users) ? ((payload as any).users as AuthUser[]) : [];
}

async function createAuthUser(env: ReturnType<typeof getEnv>) {
  const response = await fetch(authUrl(env.supabaseUrl, "/admin/users"), {
    method: "POST",
    headers: authHeaders(env.supabaseServiceRoleKey),
    body: JSON.stringify({
      email: DEMO_OPERATOR.email,
      password: DEMO_OPERATOR.password,
      email_confirm: true,
      user_metadata: { full_name: DEMO_OPERATOR.fullName },
    }),
  });
  const payload = await parseResponse(response);
  if (!response.ok) {
    throw new Error(`Unable to create Supabase Auth user: ${response.status} ${JSON.stringify(payload)}`);
  }
  const user = normalizeAuthUser(payload);
  if (!user?.id) {
    throw new Error("Supabase Auth create user response did not include a user id.");
  }
  return user;
}

async function ensureAuthUser(env: ReturnType<typeof getEnv>) {
  const users = await listAuthUsers(env);
  const existing = users.find((user) => user.email?.toLowerCase() === DEMO_OPERATOR.email);
  if (existing?.id) {
    return { user: existing, created: false };
  }
  const created = await createAuthUser(env);
  return { user: created, created: true };
}

async function main() {
  const env = getEnv();
  await assertSupabaseReady(env);

  const { user, created } = await ensureAuthUser(env);
  const client = new Client({ connectionString: env.databaseUrl });
  await client.connect();

  try {
    await client.query("begin");

    await client.query(
      `insert into operator_users
       (id, email, full_name, supabase_user_id, created_at, last_login_at)
       values ($1, $2, $3, $4::uuid, now(), null)
       on conflict (id) do update
       set email = excluded.email,
           full_name = excluded.full_name,
           supabase_user_id = excluded.supabase_user_id`,
      [DEMO_OPERATOR.operatorUserId, DEMO_OPERATOR.email, DEMO_OPERATOR.fullName, user.id],
    );

    await client.query(
      `delete from operator_memberships
       where operator_user_id = $1
         and restaurant_id <> all($2::text[])`,
      [DEMO_OPERATOR.operatorUserId, DEMO_OPERATOR.memberships.map((membership) => membership.restaurantId)],
    );

    for (const membership of DEMO_OPERATOR.memberships) {
      const locationResult = await client.query(
        `select id
         from restaurant_locations
         where restaurant_id = $1
         order by id asc
         limit 1`,
        [membership.restaurantId],
      );
      const locationId = (locationResult.rows[0]?.id as string | undefined) ?? membership.fallbackLocationId;
      await client.query(
        `insert into operator_memberships
         (id, operator_user_id, restaurant_id, location_id, role, created_at)
         values ($1, $2, $3, $4, 'owner', now())
         on conflict (id) do update
         set operator_user_id = excluded.operator_user_id,
             restaurant_id = excluded.restaurant_id,
             location_id = excluded.location_id,
             role = excluded.role`,
        [membership.membershipId, DEMO_OPERATOR.operatorUserId, membership.restaurantId, locationId],
      );
    }

    const orderCounts = await client.query(
      `select restaurant_id, count(*)::int as order_count
       from agent_orders
       where restaurant_id = any($1::text[])
       group by restaurant_id
       order by restaurant_id asc`,
      [DEMO_OPERATOR.memberships.map((membership) => membership.restaurantId)],
    );

    await client.query("commit");

    console.log(
      JSON.stringify(
        {
          ok: true,
          createdAuthUser: created,
          email: DEMO_OPERATOR.email,
          password: DEMO_OPERATOR.password,
          operatorUserId: DEMO_OPERATOR.operatorUserId,
          restaurantOrderCounts: orderCounts.rows,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
