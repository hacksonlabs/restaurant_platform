insert into pos_providers (id, name) values
  ('toast', 'Toast'),
  ('square', 'Square'),
  ('deliverect', 'Deliverect'),
  ('olo', 'Olo')
on conflict (id) do update set
  name = excluded.name;

insert into restaurants (
  id, name, location, timezone, pos_provider, agent_ordering_enabled,
  default_approval_mode, contact_email, contact_phone, fulfillment_types_supported,
  created_at, updated_at
) values (
  'rest_lb_steakhouse', 'LB Steakhouse', 'San Jose, CA', 'America/Los_Angeles', 'toast', true,
  'threshold_review', 'ops@lbsteakhouse.example', '(408) 555-0193',
  array['pickup', 'delivery', 'catering']::text[],
  '2026-05-01T18:00:00.000Z', '2026-05-01T18:00:00.000Z'
)
on conflict (id) do update set
  name = excluded.name,
  location = excluded.location,
  timezone = excluded.timezone,
  pos_provider = excluded.pos_provider,
  agent_ordering_enabled = excluded.agent_ordering_enabled,
  default_approval_mode = excluded.default_approval_mode,
  contact_email = excluded.contact_email,
  contact_phone = excluded.contact_phone,
  fulfillment_types_supported = excluded.fulfillment_types_supported,
  updated_at = excluded.updated_at;

insert into restaurant_locations (id, restaurant_id, name, address1, city, state, postal_code) values
  ('loc_lb_main', 'rest_lb_steakhouse', 'Santana Row', '334 Santana Row', 'San Jose', 'CA', '95128')
on conflict (id) do update set
  restaurant_id = excluded.restaurant_id,
  name = excluded.name,
  address1 = excluded.address1,
  city = excluded.city,
  state = excluded.state,
  postal_code = excluded.postal_code;

insert into pos_connections (
  id, restaurant_id, provider, status, mode, restaurant_guid, location_id, metadata, last_tested_at, last_synced_at
) values (
  'posconn_lb_toast', 'rest_lb_steakhouse', 'toast', 'sandbox', 'mock',
  'toast-rest-guid-lb-steakhouse', 'toast-location-lb-main', '{"source":"demo"}'::jsonb,
  '2026-05-01T18:00:00.000Z', '2026-05-01T18:00:00.000Z'
)
on conflict (id) do update set
  restaurant_id = excluded.restaurant_id,
  provider = excluded.provider,
  status = excluded.status,
  mode = excluded.mode,
  restaurant_guid = excluded.restaurant_guid,
  location_id = excluded.location_id,
  metadata = excluded.metadata,
  last_tested_at = excluded.last_tested_at,
  last_synced_at = excluded.last_synced_at;

insert into canonical_modifier_groups (
  id, restaurant_id, name, selection_type, required, min_selections, max_selections
) values
  ('mg_temp', 'rest_lb_steakhouse', 'Steak Temperature', 'single', true, 1, 1),
  ('mg_side', 'rest_lb_steakhouse', 'Choice of Side', 'single', true, 1, 1),
  ('mg_addons', 'rest_lb_steakhouse', 'Add Ons', 'multi', false, 0, 3)
on conflict (id) do update set
  restaurant_id = excluded.restaurant_id,
  name = excluded.name,
  selection_type = excluded.selection_type,
  required = excluded.required,
  min_selections = excluded.min_selections,
  max_selections = excluded.max_selections;

insert into canonical_modifiers (id, modifier_group_id, name, price_cents, is_available) values
  ('mod_rare', 'mg_temp', 'Rare', 0, true),
  ('mod_medium_rare', 'mg_temp', 'Medium Rare', 0, true),
  ('mod_medium', 'mg_temp', 'Medium', 0, true),
  ('mod_truffle_fries', 'mg_side', 'Truffle Fries', 0, true),
  ('mod_mashed', 'mg_side', 'Yukon Gold Mash', 0, true),
  ('mod_asparagus', 'mg_side', 'Charred Asparagus', 200, true),
  ('mod_sauce', 'mg_addons', 'Peppercorn Sauce', 250, true),
  ('mod_shrimp', 'mg_addons', 'Garlic Shrimp', 900, true)
on conflict (id) do update set
  modifier_group_id = excluded.modifier_group_id,
  name = excluded.name,
  price_cents = excluded.price_cents,
  is_available = excluded.is_available;

insert into canonical_menu_items (
  id, restaurant_id, category, name, description, price_cents, availability, mapping_status, modifier_group_ids, pos_ref
) values
  ('item_ribeye', 'rest_lb_steakhouse', 'Steaks', '16oz Prime Ribeye', 'Dry-aged ribeye with rosemary butter.', 5600, 'available', 'mapped', array['mg_temp','mg_side','mg_addons']::text[], '{"provider":"toast","externalId":"toast_item_ribeye"}'::jsonb),
  ('item_filet', 'rest_lb_steakhouse', 'Steaks', '8oz Center Cut Filet', 'Tender filet with sea salt finish.', 4900, 'available', 'mapped', array['mg_temp','mg_side','mg_addons']::text[], '{"provider":"toast","externalId":"toast_item_filet"}'::jsonb),
  ('item_caesar', 'rest_lb_steakhouse', 'Starters', 'Tableside Caesar', 'Romaine, parmesan, brioche crumb.', 1600, 'available', 'mapped', array[]::text[], '{"provider":"toast","externalId":"toast_item_caesar"}'::jsonb),
  ('item_butter_cake', 'rest_lb_steakhouse', 'Dessert', 'Butter Cake', 'Warm vanilla butter cake with berries.', 1400, 'available', 'needs_review', array[]::text[], '{"provider":"toast","externalId":"toast_item_butter_cake"}'::jsonb)
on conflict (id) do update set
  restaurant_id = excluded.restaurant_id,
  category = excluded.category,
  name = excluded.name,
  description = excluded.description,
  price_cents = excluded.price_cents,
  availability = excluded.availability,
  mapping_status = excluded.mapping_status,
  modifier_group_ids = excluded.modifier_group_ids,
  pos_ref = excluded.pos_ref;

insert into pos_menu_mappings (id, restaurant_id, canonical_type, canonical_id, provider, provider_reference, status) values
  ('map_item_ribeye', 'rest_lb_steakhouse', 'item', 'item_ribeye', 'toast', 'toast_item_ribeye', 'mapped'),
  ('map_item_filet', 'rest_lb_steakhouse', 'item', 'item_filet', 'toast', 'toast_item_filet', 'mapped'),
  ('map_item_caesar', 'rest_lb_steakhouse', 'item', 'item_caesar', 'toast', 'toast_item_caesar', 'mapped'),
  ('map_item_butter_cake', 'rest_lb_steakhouse', 'item', 'item_butter_cake', 'toast', 'toast_item_butter_cake', 'needs_review'),
  ('map_group_temp', 'rest_lb_steakhouse', 'modifier_group', 'mg_temp', 'toast', 'toast_mg_temp', 'mapped'),
  ('map_group_side', 'rest_lb_steakhouse', 'modifier_group', 'mg_side', 'toast', 'toast_mg_side', 'mapped'),
  ('map_group_addons', 'rest_lb_steakhouse', 'modifier_group', 'mg_addons', 'toast', 'toast_mg_addons', 'mapped'),
  ('map_mod_rare', 'rest_lb_steakhouse', 'modifier', 'mod_rare', 'toast', 'toast_mod_rare', 'mapped'),
  ('map_mod_medium_rare', 'rest_lb_steakhouse', 'modifier', 'mod_medium_rare', 'toast', 'toast_mod_medium_rare', 'mapped'),
  ('map_mod_medium', 'rest_lb_steakhouse', 'modifier', 'mod_medium', 'toast', 'toast_mod_medium', 'mapped'),
  ('map_mod_truffle_fries', 'rest_lb_steakhouse', 'modifier', 'mod_truffle_fries', 'toast', 'toast_mod_truffle_fries', 'mapped'),
  ('map_mod_mashed', 'rest_lb_steakhouse', 'modifier', 'mod_mashed', 'toast', 'toast_mod_mashed', 'mapped'),
  ('map_mod_asparagus', 'rest_lb_steakhouse', 'modifier', 'mod_asparagus', 'toast', 'toast_mod_asparagus', 'mapped'),
  ('map_mod_sauce', 'rest_lb_steakhouse', 'modifier', 'mod_sauce', 'toast', 'toast_mod_sauce', 'mapped'),
  ('map_mod_shrimp', 'rest_lb_steakhouse', 'modifier', 'mod_shrimp', 'toast', 'toast_mod_shrimp', 'mapped')
on conflict (id) do update set
  restaurant_id = excluded.restaurant_id,
  canonical_type = excluded.canonical_type,
  canonical_id = excluded.canonical_id,
  provider = excluded.provider,
  provider_reference = excluded.provider_reference,
  status = excluded.status;

insert into agents (id, name, slug, description, created_at) values
  ('agent_phantom', 'Phantom', 'phantom', 'Default first-party agent integration.', '2026-05-01T18:00:00.000Z')
on conflict (id) do update set
  name = excluded.name,
  slug = excluded.slug,
  description = excluded.description,
  created_at = excluded.created_at;

insert into agent_api_keys (id, agent_id, label, key_prefix, key_hash, last_used_at, created_at) values
  ('key_phantom_demo', 'agent_phantom', 'Local demo key', 'phantom_', 'e1a638a1ff93bb8d06eb538031f608334b92afce24398e81dd8e22f6374ede9c', '2026-05-01T18:00:00.000Z', '2026-05-01T18:00:00.000Z')
on conflict (id) do update set
  agent_id = excluded.agent_id,
  label = excluded.label,
  key_prefix = excluded.key_prefix,
  key_hash = excluded.key_hash,
  last_used_at = excluded.last_used_at,
  created_at = excluded.created_at;

insert into restaurant_agent_permissions (id, restaurant_id, agent_id, status, notes, last_activity_at) values
  ('perm_lb_phantom', 'rest_lb_steakhouse', 'agent_phantom', 'allowed', 'Seeded default allow-list entry.', '2026-05-01T18:00:00.000Z')
on conflict (id) do update set
  restaurant_id = excluded.restaurant_id,
  agent_id = excluded.agent_id,
  status = excluded.status,
  notes = excluded.notes,
  last_activity_at = excluded.last_activity_at;

insert into ordering_rules (
  id, restaurant_id, minimum_lead_time_minutes, max_order_dollar_amount, max_item_quantity,
  max_headcount, auto_accept_enabled, manager_approval_threshold_cents, blackout_windows,
  allowed_fulfillment_types, substitution_policy, payment_policy, allowed_agent_ids
) values (
  'rules_lb_default', 'rest_lb_steakhouse', 90, 2500, 25, 40, false, 80000,
  '[{"id":"blackout_brunch","label":"Sunday Brunch Blackout","startsAt":"2026-05-03T17:00:00.000Z","endsAt":"2026-05-03T21:00:00.000Z"}]'::jsonb,
  array['pickup','delivery','catering']::text[],
  'require_approval', 'required_before_submit',
  array['agent_phantom']::text[]
)
on conflict (id) do update set
  restaurant_id = excluded.restaurant_id,
  minimum_lead_time_minutes = excluded.minimum_lead_time_minutes,
  max_order_dollar_amount = excluded.max_order_dollar_amount,
  max_item_quantity = excluded.max_item_quantity,
  max_headcount = excluded.max_headcount,
  auto_accept_enabled = excluded.auto_accept_enabled,
  manager_approval_threshold_cents = excluded.manager_approval_threshold_cents,
  blackout_windows = excluded.blackout_windows,
  allowed_fulfillment_types = excluded.allowed_fulfillment_types,
  substitution_policy = excluded.substitution_policy,
  payment_policy = excluded.payment_policy,
  allowed_agent_ids = excluded.allowed_agent_ids;

insert into agent_orders (
  id, restaurant_id, agent_id, external_order_reference, customer_name, customer_email, team_name,
  fulfillment_type, requested_fulfillment_time, headcount, status, approval_required,
  total_estimate_cents, order_intent, packaging_instructions, dietary_constraints, created_at, updated_at
) values (
  'order_lb_demo_001', 'rest_lb_steakhouse', 'agent_phantom', 'phantom-team-lunch-1001',
  'Avery Chen', 'avery@phantom.example', 'Design Team', 'catering', '2026-05-02T19:30:00.000Z',
  8, 'needs_approval', true, 29697,
  '{
    "restaurant_id":"rest_lb_steakhouse",
    "agent_id":"agent_phantom",
    "external_order_reference":"phantom-team-lunch-1001",
    "customer":{"name":"Avery Chen","email":"avery@phantom.example","phone":"408-555-0110","teamName":"Design Team"},
    "fulfillment_type":"catering",
    "requested_fulfillment_time":"2026-05-02T19:30:00.000Z",
    "headcount":8,
    "budget_constraints":{"max_total_cents":120000},
    "payment_policy":"required_before_submit",
    "items":[
      {"item_id":"item_ribeye","quantity":4,"modifiers":[
        {"modifier_group_id":"mg_temp","modifier_id":"mod_medium_rare","quantity":1},
        {"modifier_group_id":"mg_side","modifier_id":"mod_truffle_fries","quantity":1}
      ]},
      {"item_id":"item_filet","quantity":2,"modifiers":[
        {"modifier_group_id":"mg_temp","modifier_id":"mod_medium","quantity":1},
        {"modifier_group_id":"mg_side","modifier_id":"mod_mashed","quantity":1},
        {"modifier_group_id":"mg_addons","modifier_id":"mod_sauce","quantity":1}
      ]},
      {"item_id":"item_caesar","quantity":2,"modifiers":[]}
    ],
    "dietary_constraints":["nut_free"],
    "packaging_instructions":"Label each entree with guest name when possible.",
    "substitution_policy":"require_approval",
    "approval_requirements":{"manager_approval_required":true},
    "metadata":{"source":"seed_demo"}
  }'::jsonb,
  'Label each entree with guest name when possible.',
  array['nut_free']::text[],
  '2026-05-01T18:00:00.000Z', '2026-05-01T18:00:00.000Z'
)
on conflict (id) do update set
  restaurant_id = excluded.restaurant_id,
  agent_id = excluded.agent_id,
  external_order_reference = excluded.external_order_reference,
  customer_name = excluded.customer_name,
  customer_email = excluded.customer_email,
  team_name = excluded.team_name,
  fulfillment_type = excluded.fulfillment_type,
  requested_fulfillment_time = excluded.requested_fulfillment_time,
  headcount = excluded.headcount,
  status = excluded.status,
  approval_required = excluded.approval_required,
  total_estimate_cents = excluded.total_estimate_cents,
  order_intent = excluded.order_intent,
  packaging_instructions = excluded.packaging_instructions,
  dietary_constraints = excluded.dietary_constraints,
  updated_at = excluded.updated_at;

insert into agent_order_items (id, order_id, menu_item_id, quantity, notes) values
  ('order_item_1', 'order_lb_demo_001', 'item_ribeye', 4, null),
  ('order_item_2', 'order_lb_demo_001', 'item_filet', 2, null),
  ('order_item_3', 'order_lb_demo_001', 'item_caesar', 2, null)
on conflict (id) do update set
  order_id = excluded.order_id,
  menu_item_id = excluded.menu_item_id,
  quantity = excluded.quantity,
  notes = excluded.notes;

insert into agent_order_modifiers (id, order_item_id, modifier_group_id, modifier_id, quantity) values
  ('order_mod_1', 'order_item_1', 'mg_temp', 'mod_medium_rare', 1),
  ('order_mod_2', 'order_item_1', 'mg_side', 'mod_truffle_fries', 1),
  ('order_mod_3', 'order_item_2', 'mg_temp', 'mod_medium', 1),
  ('order_mod_4', 'order_item_2', 'mg_side', 'mod_mashed', 1),
  ('order_mod_5', 'order_item_2', 'mg_addons', 'mod_sauce', 1)
on conflict (id) do update set
  order_item_id = excluded.order_item_id,
  modifier_group_id = excluded.modifier_group_id,
  modifier_id = excluded.modifier_id,
  quantity = excluded.quantity;

insert into reporting_daily_metrics (
  id, restaurant_id, date, total_orders, revenue_cents, average_order_value_cents,
  approval_rate, success_rate, rejected_orders, average_lead_time_minutes, upcoming_scheduled_order_volume
) values
  ('metric_2026_04_29', 'rest_lb_steakhouse', '2026-04-29', 5, 126400, 25280, 0.4, 1.0, 0, 185, 3),
  ('metric_2026_04_30', 'rest_lb_steakhouse', '2026-04-30', 6, 148800, 24800, 0.5, 0.83, 1, 205, 4),
  ('metric_2026_05_01', 'rest_lb_steakhouse', '2026-05-01', 4, 98700, 24675, 0.75, 1.0, 0, 220, 5)
on conflict (id) do update set
  restaurant_id = excluded.restaurant_id,
  date = excluded.date,
  total_orders = excluded.total_orders,
  revenue_cents = excluded.revenue_cents,
  average_order_value_cents = excluded.average_order_value_cents,
  approval_rate = excluded.approval_rate,
  success_rate = excluded.success_rate,
  rejected_orders = excluded.rejected_orders,
  average_lead_time_minutes = excluded.average_lead_time_minutes,
  upcoming_scheduled_order_volume = excluded.upcoming_scheduled_order_volume;

insert into audit_logs (
  id, restaurant_id, actor_type, actor_id, action, target_type, target_id, summary, created_at
) values
  ('audit_1', 'rest_lb_steakhouse', 'system', 'seed', 'menu.synced', 'pos_connection', 'posconn_lb_toast', 'Seeded Toast sandbox menu sync completed.', '2026-05-01T18:00:00.000Z'),
  ('audit_2', 'rest_lb_steakhouse', 'agent', 'agent_phantom', 'order.received', 'agent_order', 'order_lb_demo_001', 'Phantom submitted a catering request for the Design Team.', '2026-05-01T18:00:00.000Z')
on conflict (id) do update set
  restaurant_id = excluded.restaurant_id,
  actor_type = excluded.actor_type,
  actor_id = excluded.actor_id,
  action = excluded.action,
  target_type = excluded.target_type,
  target_id = excluded.target_id,
  summary = excluded.summary,
  created_at = excluded.created_at;

insert into order_status_events (id, order_id, status, message, created_at) values
  ('evt_1', 'order_lb_demo_001', 'received', 'Order received from Phantom.', '2026-05-01T18:00:00.000Z'),
  ('evt_2', 'order_lb_demo_001', 'needs_approval', 'Order exceeded auto-accept threshold and needs manager review.', '2026-05-01T18:00:00.000Z')
on conflict (id) do update set
  order_id = excluded.order_id,
  status = excluded.status,
  message = excluded.message,
  created_at = excluded.created_at;
