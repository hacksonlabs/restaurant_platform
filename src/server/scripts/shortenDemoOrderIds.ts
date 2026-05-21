import { Client } from "pg";
import { getEnv } from "../config/env";
import { assertSupabaseReady } from "../db/supabase";

const ORDER_ID_RENAMES = [
  {
    from: "order_lb_demo_001",
    to: "order_lbk82p1x",
  },
] as const;

async function renameOrderId(client: Client, from: string, to: string) {
  const existing = await client.query("select id from agent_orders where id = $1", [from]);
  if (!existing.rowCount) {
    return { renamed: false, reason: "missing_source" as const };
  }

  const collision = await client.query("select id from agent_orders where id = $1", [to]);
  if (collision.rowCount) {
    return { renamed: false, reason: "target_exists" as const };
  }

  await client.query("update agent_order_items set order_id = $1 where order_id = $2", [to, from]);
  await client.query("update order_validation_results set order_id = $1 where order_id = $2", [to, from]);
  await client.query("update order_quotes set order_id = $1 where order_id = $2", [to, from]);
  await client.query("update pos_order_submissions set order_id = $1 where order_id = $2", [to, from]);
  await client.query("update order_status_events set order_id = $1 where order_id = $2", [to, from]);
  await client.query("update api_idempotency_records set order_id = $1 where order_id = $2", [to, from]);
  await client.query("update order_retry_attempts set order_id = $1 where order_id = $2", [to, from]);
  await client.query("update event_ingestion_records set order_id = $1 where order_id = $2", [to, from]);
  await client.query(
    "update audit_logs set target_id = $1 where target_type = 'agent_order' and target_id = $2",
    [to, from],
  );
  await client.query("update agent_orders set id = $1 where id = $2", [to, from]);

  return { renamed: true, reason: "renamed" as const };
}

async function main() {
  const env = getEnv();
  await assertSupabaseReady(env);

  const client = new Client({ connectionString: env.databaseUrl });
  await client.connect();

  try {
    await client.query("begin");

    const results = [];
    for (const rename of ORDER_ID_RENAMES) {
      results.push({
        ...rename,
        ...(await renameOrderId(client, rename.from, rename.to)),
      });
    }

    await client.query("commit");
    console.log(JSON.stringify({ ok: true, results }, null, 2));
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
