import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import type { PoolClient } from "pg";
import { getEnv } from "../config/env";
import { createPostgresPool } from "../db/postgres";

type CoachEnv = {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
};

type CoachTeamMember = {
  team_id: string;
  email: string | null;
  user_id: string | null;
};

type CoachTeam = {
  id: string;
  name: string;
  coach_id: string;
};

type CoachOrder = {
  id: string;
  team_id: string;
  title: string | null;
  scheduled_date: string;
  order_status: string | null;
  payment_status: string | null;
  created_at: string;
  updated_at: string | null;
  request_payload: Record<string, unknown> | null;
  parent_order_id: string | null;
  is_split_child: boolean | null;
  split_group: string | null;
  subtotal_cents: number | null;
  delivery_fee_cents: number | null;
  service_fee_cents: number | null;
  sales_tax_cents: number | null;
  tip_cents: number | null;
  total_with_tip_cents: number | null;
  total_amount: number | null;
};

type CoachOrderIntentItem = {
  item_id?: string;
  product_id?: string;
  menu_item_id?: string | null;
  name?: string;
  quantity?: number;
  notes?: string | null;
  modifiers?: Array<{
    group_id?: string;
    modifier_group_id?: string;
    options?: Array<{
      option_id?: string;
      modifier_id?: string;
      quantity?: number;
    }>;
  }>;
  assignees?: Array<{
    member_id?: string | null;
    name?: string | null;
    is_extra?: boolean | null;
  }>;
};

type PhantomRestaurantRow = { id: string; name: string };
type PhantomAgentRow = { id: string };
type PhantomValidationRow = { id: string };
type PhantomQuoteRow = { id: string };

const COACH_ROOT = "/Users/akayla/Desktop/mealops_platform";
const COACH_ENV_FILES = [
  path.join(COACH_ROOT, ".env"),
  path.join(COACH_ROOT, ".env.demo.local"),
];
const DEMO_COACH_EMAILS = ["coach@team.edu"];
const COACH_AGENT_ID = "agent_coachimhungry";
const DEMO_MENU_ITEM_DELTAS = [
  {
    id: "item_salmon",
    restaurantId: "rest_lb_steakhouse",
    category: "Entrees",
    name: "Wood-Fired Salmon",
    description: "Salmon entree added so Phantom matches the Coach demo order set.",
    priceCents: 3900,
    modifierGroupIds: ["mg_side"],
  },
  {
    id: "item_new_york",
    restaurantId: "rest_lb_steakhouse",
    category: "Entrees",
    name: "14oz New York Strip",
    description: "New York strip entree added so Phantom matches the Coach demo order set.",
    priceCents: 5100,
    modifierGroupIds: ["mg_temp", "mg_side", "mg_addons"],
  },
  {
    id: "item_truffle_mash",
    restaurantId: "rest_lb_steakhouse",
    category: "Sides",
    name: "Truffle Mash",
    description: "Truffle mash side added so Phantom matches the Coach demo order set.",
    priceCents: 1200,
    modifierGroupIds: [],
  },
  {
    id: "item_sunrise_carnitas_burrito",
    restaurantId: "rest_sunrise_taqueria",
    category: "Entrees",
    name: "Carnitas Burrito",
    description: "Carnitas burrito added so Phantom matches the Coach demo order set.",
    priceCents: 1699,
    modifierGroupIds: ["mg_taco_salsa", "mg_taco_extras"],
  },
  {
    id: "item_sunrise_street_tacos",
    restaurantId: "rest_sunrise_taqueria",
    category: "Entrees",
    name: "Street Taco Trio",
    description: "Street taco trio added so Phantom matches the Coach demo order set.",
    priceCents: 1399,
    modifierGroupIds: ["mg_taco_tortilla", "mg_taco_salsa", "mg_taco_extras"],
  },
  {
    id: "item_sunrise_elote",
    restaurantId: "rest_sunrise_taqueria",
    category: "Sides",
    name: "Roasted Street Corn",
    description: "Roasted street corn added so Phantom matches the Coach demo order set.",
    priceCents: 699,
    modifierGroupIds: [],
  },
  {
    id: "item_sakura_salmon_crunch_roll",
    restaurantId: "rest_sakura_sushi_house",
    category: "Sushi Rolls",
    name: "Salmon Crunch Roll",
    description: "Salmon crunch roll alias added so Phantom matches the Coach demo order set.",
    priceCents: 1599,
    modifierGroupIds: ["mg_sakura_addons", "mg_sakura_sauce"],
  },
];
const DEMO_MODIFIER_DELTAS = [
  {
    id: "mod_green_balsamic",
    modifierGroupId: "mg_green_dressing",
    name: "Balsamic Vinaigrette",
    priceCents: 0,
  },
  {
    id: "extra_wasabi",
    modifierGroupId: "mg_sakura_addons",
    name: "Extra Wasabi",
    priceCents: 0,
  },
  {
    id: "mod_noodle_medium_heat",
    modifierGroupId: "mg_noodle_spice",
    name: "Medium Heat",
    priceCents: 0,
  },
  {
    id: "mod_noodle_mild_heat",
    modifierGroupId: "mg_noodle_spice",
    name: "Mild Heat",
    priceCents: 0,
  },
];

function normalizeText(value: unknown) {
  if (value == null) return null;
  const text = String(value).trim();
  return text || null;
}

function normalizeKey(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function compositeKey(restaurantId: string, value: unknown) {
  return `${restaurantId}::${normalizeKey(value)}`;
}

function parseEnvContent(content: string) {
  const env: Record<string, string> = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const cleaned = line.startsWith("export ") ? line.slice(7) : line;
    const equalsIndex = cleaned.indexOf("=");
    if (equalsIndex <= 0) continue;
    const key = cleaned.slice(0, equalsIndex).trim();
    let value = cleaned.slice(equalsIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

async function loadCoachEnv(): Promise<CoachEnv> {
  const merged: Record<string, string> = {};
  for (const filePath of COACH_ENV_FILES) {
    try {
      const content = await fs.readFile(filePath, "utf8");
      Object.assign(merged, parseEnvContent(content));
    } catch {
      // ignore missing file
    }
  }

  const supabaseUrl = normalizeText(merged.SUPABASE_URL);
  const supabaseServiceRoleKey = normalizeText(
    merged.SUPABASE_SERVICE_ROLE_KEY || merged.SUPABASE_SERVICE_ROLE,
  );

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error("Coach demo Supabase credentials were not found in mealops_platform env files.");
  }

  return { supabaseUrl, supabaseServiceRoleKey };
}

async function coachRest<T>(env: CoachEnv, resource: string, params: Record<string, string>) {
  const url = new URL(`/rest/v1/${resource}`, env.supabaseUrl.replace(/\/$/, ""));
  Object.entries(params).forEach(([key, value]) => {
    if (value != null) url.searchParams.set(key, value);
  });

  const response = await fetch(url, {
    headers: {
      apikey: env.supabaseServiceRoleKey,
      Authorization: `Bearer ${env.supabaseServiceRoleKey}`,
      Accept: "application/json",
    },
  });
  const payloadText = await response.text();
  const payload = payloadText ? JSON.parse(payloadText) : null;
  if (!response.ok) {
    throw new Error(`Coach Supabase request failed for ${resource}: ${response.status} ${payloadText}`);
  }
  return payload as T;
}

function inFilter(values: string[]) {
  return `(${values.join(",")})`;
}

function getCoachOrderIntent(payload: Record<string, unknown> | null) {
  if (!payload || typeof payload !== "object") return null;
  return (
    (payload.order_intent as Record<string, unknown> | undefined) ||
    (payload.orderIntent as Record<string, unknown> | undefined) ||
    null
  );
}

function getCoachPaymentProfile(payload: Record<string, unknown> | null) {
  const orderIntent = getCoachOrderIntent(payload);
  return (
    (payload?.payment_profile as Record<string, unknown> | undefined) ||
    (orderIntent?.payment_profile as Record<string, unknown> | undefined) ||
    null
  );
}

function toPhantomStatus(status: string | null | undefined) {
  switch (status) {
    case "pending_confirmation":
      return "needs_approval";
    case "confirmed":
      return "accepted";
    case "completed":
      return "completed";
    case "cancelled":
      return "cancelled";
    case "failed":
      return "failed";
    default:
      return "received";
  }
}

function buildExternalReference(orderId: string) {
  return `coach-demo-${orderId}`;
}

function getRestaurantIdForOrder(
  order: CoachOrder,
  phantomRestaurantIds: Set<string>,
  restaurantNameToId: Map<string, string>,
) {
  const payload = order.request_payload || {};
  const orderIntent = getCoachOrderIntent(payload);
  const restaurantSnapshot =
    (orderIntent?.restaurant_snapshot as Record<string, unknown> | undefined) ||
    (payload.restaurant_snapshot as Record<string, unknown> | undefined) ||
    null;
  const providerIds =
    (restaurantSnapshot?.provider_restaurant_ids as Record<string, unknown> | undefined) ||
    {};

  const candidates = [
    normalizeText((payload as Record<string, unknown>).provider_restaurant_id),
    normalizeText((orderIntent?.source as Record<string, unknown> | undefined)?.provider_restaurant_id),
    normalizeText(providerIds.mcp),
    normalizeText(restaurantSnapshot?.api_id),
    normalizeText(restaurantSnapshot?.name),
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    if (phantomRestaurantIds.has(candidate)) return candidate;
    const byName = restaurantNameToId.get(candidate.toLowerCase());
    if (byName) return byName;
  }

  return null;
}

function getOrderItems(order: CoachOrder) {
  const orderIntent = getCoachOrderIntent(order.request_payload);
  const items = (orderIntent?.items as CoachOrderIntentItem[] | undefined) || [];
  return Array.isArray(items) ? items : [];
}

function computeHeadcount(items: CoachOrderIntentItem[]) {
  const assignees = new Set<string>();
  let extras = 0;
  let unassigned = 0;
  let totalQuantity = 0;

  for (const item of items) {
    const quantity = Math.max(1, Number(item?.quantity ?? 1));
    totalQuantity += quantity;
    const itemAssignees = Array.isArray(item?.assignees) ? item.assignees : [];
    if (!itemAssignees.length) {
      unassigned += quantity;
      continue;
    }
    for (const assignee of itemAssignees) {
      if (assignee?.is_extra) {
        extras += 1;
        continue;
      }
      const key = normalizeText(assignee?.member_id) || normalizeText(assignee?.name);
      if (key) assignees.add(key);
    }
  }

  return Math.max(assignees.size + extras + unassigned, totalQuantity, 1);
}

function buildFulfillmentAddress(orderIntent: Record<string, unknown> | null) {
  const address = orderIntent?.delivery_address as Record<string, unknown> | undefined;
  if (!address) return undefined;
  const address1 = normalizeText(address.line1);
  const city = normalizeText(address.city);
  const state = normalizeText(address.state);
  const postalCode = normalizeText(address.postal_code);
  if (!address1 || !city || !state || !postalCode) return undefined;
  return {
    address1,
    city,
    state,
    postal_code: postalCode,
    notes: normalizeText(address.instructions) || undefined,
  };
}

function buildCanonicalOrderIntent(
  order: CoachOrder,
  phantomRestaurantId: string,
  teamName: string | null,
  splitMeta: { groupId?: string; groupIndex?: number; groupSize?: number },
) {
  const orderIntent = getCoachOrderIntent(order.request_payload);
  const paymentProfile = getCoachPaymentProfile(order.request_payload);
  const customer = {
    name:
      normalizeText((orderIntent?.purchaser_contact as Record<string, unknown> | undefined)?.name) ||
      normalizeText((order.request_payload as Record<string, unknown> | undefined)?.user_name) ||
      "MealOps Customer",
    email:
      normalizeText((orderIntent?.purchaser_contact as Record<string, unknown> | undefined)?.email) ||
      normalizeText((order.request_payload as Record<string, unknown> | undefined)?.user_email) ||
      undefined,
    phone:
      normalizeText((orderIntent?.purchaser_contact as Record<string, unknown> | undefined)?.phone) ||
      normalizeText((order.request_payload as Record<string, unknown> | undefined)?.user_phone) ||
      undefined,
    teamName: teamName || undefined,
  };
  const items = getOrderItems(order)
    .map((item) => {
      const menuItemId =
        normalizeText(item?.item_id) ||
        normalizeText(item?.product_id) ||
        normalizeText(item?.menu_item_id);
      if (!menuItemId) return null;
      const modifiers = (Array.isArray(item?.modifiers) ? item.modifiers : []).flatMap((group) => {
        const modifierGroupId =
          normalizeText(group?.modifier_group_id) || normalizeText(group?.group_id);
        return (Array.isArray(group?.options) ? group.options : [])
          .map((option) => {
            const modifierId =
              normalizeText(option?.modifier_id) || normalizeText(option?.option_id);
            if (!modifierGroupId || !modifierId) return null;
            return {
              modifier_group_id: modifierGroupId,
              modifier_id: modifierId,
              quantity: Math.max(1, Number(option?.quantity ?? 1)),
            };
          })
          .filter(Boolean);
      });
      return {
        item_id: menuItemId,
        quantity: Math.max(1, Number(item?.quantity ?? 1)),
        notes: normalizeText(item?.notes) || undefined,
        modifiers,
      };
    })
    .filter(Boolean) as Array<{
      item_id: string;
      quantity: number;
      notes?: string;
      modifiers: Array<{ modifier_group_id: string; modifier_id: string; quantity: number }>;
    }>;

  const pricing = (orderIntent?.pricing as Record<string, unknown> | undefined) || {};
  const tipCents =
    Number.isFinite(Number(order.tip_cents)) ? Number(order.tip_cents) : Number(pricing.tip_cents ?? 0) || 0;

  return {
    restaurant_id: phantomRestaurantId,
    agent_id: COACH_AGENT_ID,
    external_order_reference: buildExternalReference(order.id),
    customer,
    fulfillment_type:
      normalizeText(orderIntent?.fulfillment_type) ||
      "delivery",
    requested_fulfillment_time: order.scheduled_date,
    fulfillment_address: buildFulfillmentAddress(orderIntent),
    headcount: computeHeadcount(items),
    tip_cents: tipCents,
    budget_constraints: {
      max_total_cents:
        Number.isFinite(Number(order.total_with_tip_cents))
          ? Number(order.total_with_tip_cents)
          : Math.round(Number(order.total_amount ?? 0) * 100),
    },
    payment_policy:
      paymentProfile && normalizeText(paymentProfile.payment_method_id)
        ? "stored_payment"
        : "required_before_submit",
    items,
    dietary_constraints:
      Array.isArray(orderIntent?.dietary_constraints)
        ? orderIntent.dietary_constraints.filter((value) => typeof value === "string")
        : [],
    packaging_instructions:
      normalizeText((orderIntent?.notes as Record<string, unknown> | undefined)?.delivery_instructions) ||
      normalizeText((orderIntent?.delivery_address as Record<string, unknown> | undefined)?.instructions) ||
      undefined,
    substitution_policy: "strict",
    approval_requirements: {
      manager_approval_required: toPhantomStatus(order.order_status) === "needs_approval",
    },
    payment_profile: paymentProfile,
    metadata: {
      source: "coach_demo_sync",
      coach_order_id: order.id,
      coach_team_id: order.team_id,
      coach_status: order.order_status,
      coach_payment_status: order.payment_status,
      coach_title: order.title,
      split_group_id: splitMeta.groupId,
      split_group_index: splitMeta.groupIndex,
      split_group_size: splitMeta.groupSize,
      ui_payment_snapshot:
        (order.request_payload as Record<string, unknown> | undefined)?.ui_payment_snapshot || null,
    },
  };
}

function getQuoteValues(order: CoachOrder) {
  const orderIntent = getCoachOrderIntent(order.request_payload);
  const pricing = (orderIntent?.pricing as Record<string, unknown> | undefined) || {};
  const subtotal =
    Number.isFinite(Number(order.subtotal_cents)) ? Number(order.subtotal_cents) : Number(pricing.subtotal_cents ?? 0) || 0;
  const deliveryFee =
    Number.isFinite(Number(order.delivery_fee_cents)) ? Number(order.delivery_fee_cents) : Number(pricing.delivery_fee_cents ?? 0) || 0;
  const serviceFee =
    Number.isFinite(Number(order.service_fee_cents)) ? Number(order.service_fee_cents) : Number(pricing.service_fee_cents ?? 0) || 0;
  const tax =
    Number.isFinite(Number(order.sales_tax_cents)) ? Number(order.sales_tax_cents) : Number(pricing.tax_cents ?? 0) || 0;
  const tip =
    Number.isFinite(Number(order.tip_cents)) ? Number(order.tip_cents) : Number(pricing.tip_cents ?? 0) || 0;
  const total =
    Number.isFinite(Number(order.total_with_tip_cents))
      ? Number(order.total_with_tip_cents)
      : Number.isFinite(Number(pricing.total_cents))
        ? Number(pricing.total_cents)
        : Math.round(Number(order.total_amount ?? 0) * 100);
  return {
    subtotal,
    fees: deliveryFee + serviceFee,
    tax,
    tip,
    total,
  };
}

function buildStatusTimeline(orderId: string, finalStatus: string, createdAt: string, updatedAt: string) {
  const events = [
    {
      id: `evt_${orderId}_received`,
      orderId,
      status: "received",
      message: "Imported from CoachImHungry demo data.",
      createdAt,
    },
  ];

  const push = (status: string, message: string, createdAtOverride = updatedAt) => {
    events.push({
      id: `evt_${orderId}_${status}_${events.length + 1}`,
      orderId,
      status,
      message,
      createdAt: createdAtOverride,
    });
  };

  switch (finalStatus) {
    case "needs_approval":
      push("needs_approval", "Awaiting restaurant manager approval.");
      break;
    case "accepted":
      push("accepted", "Order accepted by the restaurant.");
      break;
    case "completed":
      push("accepted", "Order accepted by the restaurant.");
      push("completed", "Order completed.");
      break;
    case "cancelled":
      push("cancelled", "Order cancelled.");
      break;
    case "failed":
      push("failed", "Order failed.");
      break;
    default:
      break;
  }

  return events;
}

async function ensureDemoMenuDeltas(client: PoolClient) {
  for (const item of DEMO_MENU_ITEM_DELTAS) {
    await client.query(
      `insert into canonical_menu_items (
         id, restaurant_id, category, name, description, image_url, price_cents, availability, mapping_status, modifier_group_ids, pos_ref
       ) values (
         $1, $2, $3, $4, $5, null, $6, 'available', 'mapped', $7::text[], $8::jsonb
       )
       on conflict (id) do update set
         restaurant_id = excluded.restaurant_id,
         category = excluded.category,
         name = excluded.name,
         description = excluded.description,
         price_cents = excluded.price_cents,
         availability = excluded.availability,
         mapping_status = excluded.mapping_status,
         modifier_group_ids = excluded.modifier_group_ids,
         pos_ref = excluded.pos_ref`,
      [
        item.id,
        item.restaurantId,
        item.category,
        item.name,
        item.description,
        item.priceCents,
        item.modifierGroupIds,
        JSON.stringify({ provider: "toast", externalId: item.id }),
      ],
    );
  }

  for (const modifier of DEMO_MODIFIER_DELTAS) {
    await client.query(
      `insert into canonical_modifiers (id, modifier_group_id, name, price_cents, is_available)
       values ($1, $2, $3, $4, true)
       on conflict (id) do update set
         modifier_group_id = excluded.modifier_group_id,
         name = excluded.name,
         price_cents = excluded.price_cents,
         is_available = excluded.is_available`,
      [modifier.id, modifier.modifierGroupId, modifier.name, modifier.priceCents],
    );
  }
}

async function main() {
  const phantomEnv = getEnv();
  const coachEnv = await loadCoachEnv();
  const pool = createPostgresPool(phantomEnv);

  const coachMembers = await coachRest<CoachTeamMember[]>(coachEnv, "team_members", {
    select: "team_id,email,user_id",
    email: `in.${inFilter(DEMO_COACH_EMAILS)}`,
    user_id: "not.is.null",
  });
  const teamIds = [...new Set((coachMembers || []).map((row) => row.team_id).filter(Boolean))];
  if (!teamIds.length) {
    throw new Error("No Coach demo teams were found to sync.");
  }

  const teams = await coachRest<CoachTeam[]>(coachEnv, "teams", {
    select: "id,name,coach_id",
    id: `in.${inFilter(teamIds)}`,
    order: "name.asc",
  });
  const teamNameById = new Map((teams || []).map((team) => [team.id, team.name]));

  const coachOrders = await coachRest<CoachOrder[]>(coachEnv, "meal_orders", {
    select: [
      "id",
      "team_id",
      "title",
      "scheduled_date",
      "order_status",
      "payment_status",
      "created_at",
      "updated_at",
      "request_payload",
      "parent_order_id",
      "is_split_child",
      "split_group",
      "subtotal_cents",
      "delivery_fee_cents",
      "service_fee_cents",
      "sales_tax_cents",
      "tip_cents",
      "total_with_tip_cents",
      "total_amount",
    ].join(","),
    team_id: `in.${inFilter(teamIds)}`,
    order: "created_at.asc",
  });

  const childRows = coachOrders.filter((row) => normalizeText(row.parent_order_id));
  const splitParentIds = new Set(childRows.map((row) => normalizeText(row.parent_order_id)!).filter(Boolean));
  const childRowsByParent = new Map<string, CoachOrder[]>();
  for (const row of childRows) {
    const parentId = normalizeText(row.parent_order_id)!;
    const bucket = childRowsByParent.get(parentId) ?? [];
    bucket.push(row);
    childRowsByParent.set(parentId, bucket);
  }

  const rowsToSync = coachOrders.filter((row) => !splitParentIds.has(row.id));
  const warnings: string[] = [];

  const client = await pool.connect();
  try {
    await client.query("begin");
    await ensureDemoMenuDeltas(client);

    const phantomRestaurants = await client.query<PhantomRestaurantRow>("select id, name from restaurants");
    const phantomRestaurantIds = new Set(phantomRestaurants.rows.map((row) => row.id));
    const restaurantNameToId = new Map(
      phantomRestaurants.rows.map((row) => [row.name.toLowerCase(), row.id]),
    );
    const agents = await client.query<PhantomAgentRow>("select id from agents where id = $1", [COACH_AGENT_ID]);
    if (!agents.rows.length) {
      throw new Error(`Phantom agent ${COACH_AGENT_ID} was not found.`);
    }

    const menuItemsResult = await client.query<{ id: string; restaurant_id: string; name: string }>(
      "select id, restaurant_id, name from canonical_menu_items",
    );
    const modifierGroupsResult = await client.query<{ id: string; restaurant_id: string; name: string }>(
      "select id, restaurant_id, name from canonical_modifier_groups",
    );
    const modifiersResult = await client.query<{
      id: string;
      modifier_group_id: string;
      group_restaurant_id: string;
      name: string;
    }>(
      `select
         m.id,
         m.modifier_group_id,
         g.restaurant_id as group_restaurant_id,
         m.name
       from canonical_modifiers m
       join canonical_modifier_groups g on g.id = m.modifier_group_id`,
    );
    const validMenuItemIds = new Set(menuItemsResult.rows.map((row) => row.id));
    const validModifierGroupIds = new Set(modifierGroupsResult.rows.map((row) => row.id));
    const validModifierIds = new Set(modifiersResult.rows.map((row) => row.id));
    const menuItemIdByRestaurantAndName = new Map<string, string>();
    const modifierGroupIdByRestaurantAndName = new Map<string, string>();
    const modifierIdByRestaurantAndName = new Map<string, string>();
    const modifierGroupIdByModifierId = new Map<string, string>();

    for (const row of menuItemsResult.rows) {
      menuItemIdByRestaurantAndName.set(compositeKey(row.restaurant_id, row.name), row.id);
    }
    for (const row of modifierGroupsResult.rows) {
      modifierGroupIdByRestaurantAndName.set(compositeKey(row.restaurant_id, row.name), row.id);
    }
    for (const row of modifiersResult.rows) {
      modifierIdByRestaurantAndName.set(compositeKey(row.group_restaurant_id, row.name), row.id);
      modifierGroupIdByModifierId.set(row.id, row.modifier_group_id);
    }

    await client.query(
      "delete from audit_logs where actor_type = 'agent' and actor_id = $1 and target_type = 'order'",
      [COACH_AGENT_ID],
    );
    await client.query("delete from agent_orders where agent_id = $1", [COACH_AGENT_ID]);

    const touchedRestaurants = new Set<string>();
    let insertedOrders = 0;

    for (const row of rowsToSync) {
      const phantomRestaurantId = getRestaurantIdForOrder(row, phantomRestaurantIds, restaurantNameToId);
      if (!phantomRestaurantId) {
        warnings.push(`Skipped ${row.id} (${row.title || "Untitled"}) because no Phantom restaurant mapping was found.`);
        continue;
      }

      const rawItems = getOrderItems(row);
      const siblingRows = normalizeText(row.parent_order_id)
        ? [...(childRowsByParent.get(normalizeText(row.parent_order_id)!) || [])].sort((left, right) =>
            (normalizeText(left.title) || "").localeCompare(normalizeText(right.title) || "") ||
            left.created_at.localeCompare(right.created_at),
          )
        : [];
      const splitGroupId = normalizeText(row.parent_order_id) || undefined;
      const splitGroupIndex = splitGroupId
        ? siblingRows.findIndex((entry) => entry.id === row.id) + 1
        : undefined;
      const splitGroupSize = splitGroupId ? siblingRows.length || undefined : undefined;

      const canonicalIntent = buildCanonicalOrderIntent(
        row,
        phantomRestaurantId,
        teamNameById.get(row.team_id) || null,
        { groupId: splitGroupId, groupIndex: splitGroupIndex, groupSize: splitGroupSize },
      );

      const orderId = `coach_${row.id}`;
      const validItems = canonicalIntent.items
        .map((item, itemIndex) => {
          const rawItem = rawItems[itemIndex];
          const resolvedItemId =
            (validMenuItemIds.has(item.item_id) && item.item_id) ||
            menuItemIdByRestaurantAndName.get(compositeKey(phantomRestaurantId, rawItem?.name));

          if (!resolvedItemId) {
            warnings.push(
              `Skipped item ${item.item_id || rawItem?.name || "unknown"} on ${row.title || row.id} because Phantom is missing that canonical menu item.`,
            );
            return null;
          }

          const rawModifierGroups = Array.isArray(rawItem?.modifiers) ? rawItem.modifiers : [];
          const resolvedModifiers = (item.modifiers || []).flatMap((modifier, modifierIndex) => {
            const sourceGroup = rawModifierGroups.find((group) =>
              (normalizeText(group?.modifier_group_id) || normalizeText(group?.group_id))
                === modifier.modifier_group_id,
            ) || rawModifierGroups[modifierIndex];
            const sourceOption = (Array.isArray(sourceGroup?.options) ? sourceGroup.options : []).find((option) =>
              (normalizeText(option?.modifier_id) || normalizeText(option?.option_id)) === modifier.modifier_id,
            );
            const sourceGroupName =
              normalizeText(sourceGroup?.group_name) ||
              normalizeText(sourceGroup?.group_id) ||
              normalizeText(sourceGroup?.modifier_group_id);
            const sourceOptionName =
              normalizeText(sourceOption?.name) ||
              normalizeText(sourceOption?.option_id) ||
              normalizeText(sourceOption?.modifier_id);

            let resolvedModifierGroupId =
              (validModifierGroupIds.has(modifier.modifier_group_id) && modifier.modifier_group_id) ||
              modifierGroupIdByRestaurantAndName.get(
                compositeKey(phantomRestaurantId, sourceGroupName),
              );

            let resolvedModifierId =
              (validModifierIds.has(modifier.modifier_id) && modifier.modifier_id) ||
              modifierIdByRestaurantAndName.get(
                compositeKey(phantomRestaurantId, sourceOptionName),
              );

            if (!resolvedModifierGroupId && resolvedModifierId) {
              resolvedModifierGroupId = modifierGroupIdByModifierId.get(resolvedModifierId);
            }

            if (!resolvedModifierGroupId || !resolvedModifierId) {
              warnings.push(
                `Skipped modifier ${modifier.modifier_group_id}/${modifier.modifier_id} on ${row.title || row.id} because Phantom is missing that canonical modifier mapping.`,
              );
              return [];
            }

            return [
              {
                modifier_group_id: resolvedModifierGroupId,
                modifier_id: resolvedModifierId,
                quantity: modifier.quantity,
              },
            ];
          });

          return {
            ...item,
            item_id: resolvedItemId,
            modifiers: resolvedModifiers,
          };
        })
        .filter(Boolean) as typeof canonicalIntent.items;
      if (!validItems.length) {
        warnings.push(`Skipped ${row.id} (${row.title || "Untitled"}) because no valid Phantom menu items remained after mapping.`);
        continue;
      }
      canonicalIntent.items = validItems;
      canonicalIntent.headcount = computeHeadcount(rawItems);

      const finalStatus = toPhantomStatus(row.order_status);
      const approvalRequired = finalStatus === "needs_approval";
      const quote = getQuoteValues(row);
      const customer = canonicalIntent.customer as { name: string; email?: string };
      const updatedAt = normalizeText(row.updated_at) || row.created_at;

      await client.query(
        `insert into agent_orders (
           id, restaurant_id, agent_id, external_order_reference, customer_name, customer_email, team_name,
           fulfillment_type, requested_fulfillment_time, headcount, status, approval_required,
           total_estimate_cents, order_intent, packaging_instructions, dietary_constraints, created_at, updated_at
         ) values (
           $1, $2, $3, $4, $5, $6, $7,
           $8, $9, $10, $11, $12,
           $13, $14::jsonb, $15, $16, $17, $18
         )`,
        [
          orderId,
          phantomRestaurantId,
          COACH_AGENT_ID,
          buildExternalReference(row.id),
          customer.name,
          customer.email ?? null,
          canonicalIntent.customer.teamName ?? null,
          canonicalIntent.fulfillment_type,
          row.scheduled_date,
          canonicalIntent.headcount,
          finalStatus,
          approvalRequired,
          quote.total,
          JSON.stringify(canonicalIntent),
          canonicalIntent.packaging_instructions ?? null,
          canonicalIntent.dietary_constraints ?? [],
          row.created_at,
          updatedAt,
        ],
      );

      for (let itemIndex = 0; itemIndex < canonicalIntent.items.length; itemIndex += 1) {
        const item = canonicalIntent.items[itemIndex]!;
        const itemId = `${orderId}_item_${itemIndex + 1}`;
        await client.query(
          "insert into agent_order_items (id, order_id, menu_item_id, quantity, notes) values ($1, $2, $3, $4, $5)",
          [itemId, orderId, item.item_id, item.quantity, item.notes ?? null],
        );

        let modifierOrdinal = 0;
        for (const modifier of item.modifiers || []) {
          if (!validModifierGroupIds.has(modifier.modifier_group_id) || !validModifierIds.has(modifier.modifier_id)) {
            warnings.push(
              `Skipped modifier ${modifier.modifier_group_id}/${modifier.modifier_id} on ${row.title || row.id} because Phantom is missing that canonical modifier mapping.`,
            );
            continue;
          }
          modifierOrdinal += 1;
          await client.query(
            `insert into agent_order_modifiers (id, order_item_id, modifier_group_id, modifier_id, quantity)
             values ($1, $2, $3, $4, $5)`,
            [
              `${itemId}_mod_${modifierOrdinal}`,
              itemId,
              modifier.modifier_group_id,
              modifier.modifier_id,
              modifier.quantity,
            ],
          );
        }
      }

      await client.query(
        "insert into order_validation_results (id, order_id, valid, issues, checked_at) values ($1, $2, $3, $4::jsonb, $5)",
        [`val_${orderId}`, orderId, true, JSON.stringify([]), row.created_at],
      );
      await client.query(
        `insert into order_quotes
         (id, order_id, subtotal_cents, tax_cents, fees_cents, tip_cents, total_cents, currency, quoted_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [`quote_${orderId}`, orderId, quote.subtotal, quote.tax, quote.fees, quote.tip, quote.total, "USD", row.created_at],
      );

      for (const event of buildStatusTimeline(orderId, finalStatus, row.created_at, updatedAt)) {
        await client.query(
          "insert into order_status_events (id, order_id, status, message, created_at) values ($1, $2, $3, $4, $5)",
          [event.id, event.orderId, event.status, event.message, event.createdAt],
        );
      }

      await client.query(
        `insert into audit_logs
         (id, restaurant_id, actor_type, actor_id, action, target_type, target_id, summary, created_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          `audit_${orderId}`,
          phantomRestaurantId,
          "agent",
          COACH_AGENT_ID,
          "order_synced",
          "order",
          orderId,
          `Synced CoachImHungry order ${row.title || row.id} into Phantom demo.`,
          updatedAt,
        ],
      );

      touchedRestaurants.add(phantomRestaurantId);
      insertedOrders += 1;
    }

    for (const restaurantId of touchedRestaurants) {
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
           count(*) filter (
             where requested_fulfillment_time > now()
               and status not in ('rejected', 'failed', 'cancelled', 'completed')
           )::int as upcoming_scheduled_order_volume
         from agent_orders
         where restaurant_id = $1
         group by restaurant_id, (created_at at time zone 'UTC')::date`,
        [restaurantId],
      );
    }

    await client.query("commit");
    console.log(
      JSON.stringify(
        {
          insertedOrders,
          touchedRestaurants: Array.from(touchedRestaurants),
          warnings,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
