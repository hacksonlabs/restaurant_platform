import { Client } from "pg";
import { getEnv } from "../config/env";
import { assertSupabaseReady } from "../db/supabase";

const DEMO_RESTAURANT_IDS = [
  "rest_lb_steakhouse",
  "rest_pizza_palace",
  "rest_green_leaf_salads",
  "rest_sakura_sushi_house",
  "rest_sunrise_taqueria",
  "rest_midnight_noodle_bar",
  "rest_harbor_sandwich_co",
] as const;

async function refreshReportingMetrics(client: Client, restaurantId: string) {
  await client.query("delete from reporting_daily_metrics where restaurant_id = $1", [restaurantId]);
  await client.query(
    `insert into reporting_daily_metrics (
       id,
       restaurant_id,
       date,
       total_orders,
       revenue_cents,
       average_order_value_cents,
       approval_rate,
       success_rate,
       rejected_orders,
       average_lead_time_minutes,
       upcoming_scheduled_order_volume
     )
     select
       'metric_' || restaurant_id || '_' || to_char((created_at at time zone 'UTC')::date, 'YYYY_MM_DD') as id,
       restaurant_id,
       (created_at at time zone 'UTC')::date as date,
       count(*)::int as total_orders,
       coalesce(sum(total_estimate_cents), 0)::int as revenue_cents,
       round(coalesce(avg(total_estimate_cents), 0))::int as average_order_value_cents,
       coalesce(
         round(
           avg(
             case
               when approval_required = false or status in ('approved', 'submitted_to_pos', 'accepted', 'preparing', 'ready', 'completed') then 1
               else 0
             end
           )::numeric,
           4
         ),
         0
       ) as approval_rate,
       coalesce(
         round(
           avg(
             case
               when status in ('submitted_to_pos', 'accepted', 'preparing', 'ready', 'completed') then 1
               else 0
             end
           )::numeric,
           4
         ),
         0
       ) as success_rate,
       count(*) filter (where status in ('rejected', 'failed', 'cancelled'))::int as rejected_orders,
       round(
         avg(
           greatest(
             extract(epoch from (requested_fulfillment_time - created_at)) / 60,
             0
           )
         )
       )::int as average_lead_time_minutes,
       count(*) filter (where requested_fulfillment_time >= now() and status not in ('rejected', 'failed', 'cancelled'))::int as upcoming_scheduled_order_volume
     from agent_orders
     where restaurant_id = $1
     group by restaurant_id, (created_at at time zone 'UTC')::date`,
    [restaurantId],
  );
}

async function main() {
  const env = getEnv();
  await assertSupabaseReady(env);

  const client = new Client({ connectionString: env.databaseUrl });
  await client.connect();

  try {
    await client.query("begin");

    await client.query(
      `update restaurants
       set default_approval_mode = 'auto',
           updated_at = now()
       where id = any($1::text[])`,
      [DEMO_RESTAURANT_IDS],
    );

    await client.query(
      `update ordering_rules
       set auto_accept_enabled = true,
           manager_approval_threshold_cents = 2147483647
       where restaurant_id = any($1::text[])`,
      [DEMO_RESTAURANT_IDS],
    );

    const updatedOrders = await client.query(
      `update agent_orders
       set status = 'accepted',
           approval_required = false,
           updated_at = now(),
           order_intent = case
             when order_intent is null then jsonb_build_object('approval_requirements', jsonb_build_object('manager_approval_required', false))
             else jsonb_set(
               order_intent,
               '{approval_requirements,manager_approval_required}',
               'false'::jsonb,
               true
             )
           end
       where restaurant_id = any($1::text[])
         and status in ('needs_approval', 'approved')
       returning id, restaurant_id`,
      [DEMO_RESTAURANT_IDS],
    );

    for (const row of updatedOrders.rows) {
      await client.query(
        `update order_status_events
         set status = 'accepted',
             message = 'Order auto-accepted for the hosted demo.'
         where order_id = $1
           and status = 'approved'`,
        [row.id],
      );
      await client.query(
        `insert into order_status_events (id, order_id, status, message, created_at)
         values ($1, $2, 'accepted', 'Order auto-accepted for the hosted demo.', now())
         on conflict (id) do nothing`,
        [`evt_auto_accepted_${row.id}`, row.id],
      );
    }

    for (const restaurantId of DEMO_RESTAURANT_IDS) {
      await refreshReportingMetrics(client, restaurantId);
    }

    await client.query("commit");

    console.log(
      JSON.stringify(
        {
          ok: true,
          restaurantsUpdated: DEMO_RESTAURANT_IDS.length,
          ordersAutoApproved: updatedOrders.rowCount ?? 0,
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
