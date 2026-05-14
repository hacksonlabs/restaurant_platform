insert into pos_providers (id, name) values
  ('toast', 'Toast'),
  ('square', 'Square'),
  ('deliverect', 'Deliverect'),
  ('olo', 'Olo')
on conflict (id) do update set
  name = excluded.name;

insert into restaurants (
  id, name, location, timezone, image_url, cuisine_type, description, rating, delivery_fee, minimum_order, supports_catering, pos_provider, agent_ordering_enabled,
  default_approval_mode, contact_email, contact_phone, fulfillment_types_supported,
  created_at, updated_at
) values (
  'rest_lb_steakhouse', 'LB Steakhouse', '1533 Ashcroft Way, Sunnyvale, CA 94087', 'America/Los_Angeles', 'https://images.pexels.com/photos/67468/pexels-photo-67468.jpeg', 'Steakhouse', 'Classic steakhouse plates, polished sides, and a strong team-order catering fit.', 4.7, 299, 2500, true, 'toast', true,
  'threshold_review', 'ops@lbsteakhouse.example', '(408) 555-0193',
  array['pickup', 'delivery', 'catering']::text[],
  '2026-05-01T18:00:00.000Z', '2026-05-01T18:00:00.000Z'
)
on conflict (id) do update set
  name = excluded.name,
  location = excluded.location,
  timezone = excluded.timezone,
  image_url = excluded.image_url,
  cuisine_type = excluded.cuisine_type,
  description = excluded.description,
  rating = excluded.rating,
  delivery_fee = excluded.delivery_fee,
  minimum_order = excluded.minimum_order,
  supports_catering = excluded.supports_catering,
  pos_provider = excluded.pos_provider,
  agent_ordering_enabled = excluded.agent_ordering_enabled,
  default_approval_mode = excluded.default_approval_mode,
  contact_email = excluded.contact_email,
  contact_phone = excluded.contact_phone,
  fulfillment_types_supported = excluded.fulfillment_types_supported,
  updated_at = excluded.updated_at;

insert into restaurant_locations (id, restaurant_id, name, address1, city, state, postal_code, latitude, longitude) values
  ('loc_lb_main', 'rest_lb_steakhouse', 'Ashcroft Way Test Kitchen', '1533 Ashcroft Way', 'Sunnyvale', 'CA', '94087', 37.3509, -122.0378)
on conflict (id) do update set
  restaurant_id = excluded.restaurant_id,
  name = excluded.name,
  address1 = excluded.address1,
  city = excluded.city,
  state = excluded.state,
  postal_code = excluded.postal_code,
  latitude = excluded.latitude,
  longitude = excluded.longitude;

insert into pos_connections (
  id, restaurant_id, provider, status, mode, restaurant_guid, location_id, metadata, last_tested_at, last_synced_at
) values (
  'posconn_lb_toast', 'rest_lb_steakhouse', 'toast', 'sandbox', 'mock',
  'toast-rest-guid-lb-steakhouse', 'toast-location-lb-ashcroft', '{"source":"demo"}'::jsonb,
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
  id, restaurant_id, category, name, description, image_url, price_cents, availability, mapping_status, modifier_group_ids, pos_ref
) values
  ('item_ribeye', 'rest_lb_steakhouse', 'Steaks', '16oz Prime Ribeye', 'Dry-aged ribeye with rosemary butter.', 'https://images.pexels.com/photos/675951/pexels-photo-675951.jpeg', 5600, 'available', 'mapped', array['mg_temp','mg_side','mg_addons']::text[], '{"provider":"toast","externalId":"toast_item_ribeye"}'::jsonb),
  ('item_filet', 'rest_lb_steakhouse', 'Steaks', '8oz Center Cut Filet', 'Tender filet with sea salt finish.', 'https://images.pexels.com/photos/361184/asparagus-steak-veal-steak-veal-361184.jpeg', 4900, 'available', 'mapped', array['mg_temp','mg_side','mg_addons']::text[], '{"provider":"toast","externalId":"toast_item_filet"}'::jsonb),
  ('item_caesar', 'rest_lb_steakhouse', 'Starters', 'Tableside Caesar', 'Romaine, parmesan, brioche crumb.', 'https://images.pexels.com/photos/2097090/pexels-photo-2097090.jpeg', 1600, 'available', 'mapped', array[]::text[], '{"provider":"toast","externalId":"toast_item_caesar"}'::jsonb),
  ('item_butter_cake', 'rest_lb_steakhouse', 'Dessert', 'Butter Cake', 'Warm vanilla butter cake with berries.', 'https://images.pexels.com/photos/291528/pexels-photo-291528.jpeg', 1400, 'available', 'needs_review', array[]::text[], '{"provider":"toast","externalId":"toast_item_butter_cake"}'::jsonb)
on conflict (id) do update set
  restaurant_id = excluded.restaurant_id,
  category = excluded.category,
  name = excluded.name,
  description = excluded.description,
  image_url = excluded.image_url,
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

insert into agent_api_keys (id, agent_id, label, key_prefix, key_hash, scopes, last_used_at, created_at, revoked_at) values
  ('key_coachimhungry_demo', 'agent_coachimhungry', 'CoachImHungry local demo key', 'coachimh', 'ec8189130b326472785eae6410197a4d0f89cf806bd430f8b2c933a0668f94ac', array['restaurants:read','menus:read','payments:start','orders:validate','orders:quote','orders:submit','orders:status']::text[], '2026-05-01T18:00:00.000Z', '2026-05-01T18:00:00.000Z', null)
on conflict (id) do update set
  agent_id = excluded.agent_id,
  label = excluded.label,
  key_prefix = excluded.key_prefix,
  key_hash = excluded.key_hash,
  scopes = excluded.scopes,
  last_used_at = excluded.last_used_at,
  created_at = excluded.created_at,
  revoked_at = excluded.revoked_at;

insert into operator_users (id, email, full_name, supabase_user_id, created_at, last_login_at) values
  ('op_dev_rest', 'dev@rest.com', 'Restaurant Dev Operator', null, '2026-05-01T18:00:00.000Z', null)
on conflict (id) do update set
  email = excluded.email,
  full_name = excluded.full_name,
  supabase_user_id = coalesce(operator_users.supabase_user_id, excluded.supabase_user_id),
  created_at = excluded.created_at;

insert into operator_memberships (id, operator_user_id, restaurant_id, location_id, role, created_at) values
  ('membership_lb_owner', 'op_dev_rest', 'rest_lb_steakhouse', 'loc_lb_main', 'owner', '2026-05-01T18:00:00.000Z')
on conflict (id) do update set
  operator_user_id = excluded.operator_user_id,
  restaurant_id = excluded.restaurant_id,
  location_id = excluded.location_id,
  role = excluded.role,
  created_at = excluded.created_at;

insert into restaurant_agent_permissions (id, restaurant_id, agent_id, status, notes, last_activity_at) values
  ('perm_lb_phantom', 'rest_lb_steakhouse', 'agent_phantom', 'allowed', 'Seeded default allow-list entry.', '2026-05-01T18:00:00.000Z'),
  ('perm_lb_coachimhungry', 'rest_lb_steakhouse', 'agent_coachimhungry', 'allowed', 'Seeded CoachImHungry allow-list entry.', '2026-05-01T18:00:00.000Z')
on conflict (restaurant_id, agent_id) do update set
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
  'rules_lb_default', 'rest_lb_steakhouse', 90, 250, 1000, 1000, false, 80000,
  '[{"id":"blackout_brunch","label":"Sunday Brunch Blackout","startsAt":"2026-05-03T17:00:00.000Z","endsAt":"2026-05-03T21:00:00.000Z"}]'::jsonb,
  array['pickup','delivery','catering']::text[],
  'require_approval', 'required_before_submit',
  array['agent_phantom','agent_coachimhungry']::text[]
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

insert into restaurants (
  id, name, location, timezone, image_url, cuisine_type, description, rating, delivery_fee, minimum_order, supports_catering, pos_provider, agent_ordering_enabled,
  default_approval_mode, contact_email, contact_phone, fulfillment_types_supported,
  created_at, updated_at
) values
  (
    'rest_pizza_palace', 'Pizza Palace', '1325 Sunnyvale Saratoga Rd, Sunnyvale, CA 94087', 'America/Los_Angeles', 'https://images.pexels.com/photos/825661/pexels-photo-825661.jpeg', 'Pizza', 'Shareable pies, garlic knots, and easy crowd ordering for pickup or delivery.', 4.5, 199, 1800, true, 'toast', true,
    'threshold_review', 'ops@pizzapalace.example', '(123) 456-7890',
    array['pickup', 'delivery', 'catering']::text[],
    '2026-05-01T18:00:00.000Z', '2026-05-01T18:00:00.000Z'
  ),
  (
    'rest_green_leaf_salads', 'Green Leaf Salads', '650 W El Camino Real, Sunnyvale, CA 94087', 'America/Los_Angeles', 'https://images.pexels.com/photos/1640774/pexels-photo-1640774.jpeg', 'Salads', 'Fresh salads and wraps with lighter delivery-friendly team meal options.', 4.6, 249, 1500, true, 'toast', true,
    'threshold_review', 'ops@greenleafsalads.example', '(408) 555-5505',
    array['pickup', 'delivery', 'catering']::text[],
    '2026-05-01T18:00:00.000Z', '2026-05-01T18:00:00.000Z'
  )
on conflict (id) do update set
  name = excluded.name,
  location = excluded.location,
  timezone = excluded.timezone,
  image_url = excluded.image_url,
  cuisine_type = excluded.cuisine_type,
  description = excluded.description,
  rating = excluded.rating,
  delivery_fee = excluded.delivery_fee,
  minimum_order = excluded.minimum_order,
  supports_catering = excluded.supports_catering,
  pos_provider = excluded.pos_provider,
  agent_ordering_enabled = excluded.agent_ordering_enabled,
  default_approval_mode = excluded.default_approval_mode,
  contact_email = excluded.contact_email,
  contact_phone = excluded.contact_phone,
  fulfillment_types_supported = excluded.fulfillment_types_supported,
  updated_at = excluded.updated_at;

insert into restaurant_locations (id, restaurant_id, name, address1, city, state, postal_code, latitude, longitude) values
  ('loc_pizza_palace_main', 'rest_pizza_palace', 'Sunnyvale Saratoga', '1325 Sunnyvale Saratoga Rd', 'Sunnyvale', 'CA', '94087', 37.3385, -122.0322),
  ('loc_green_leaf_salads_main', 'rest_green_leaf_salads', 'West El Camino', '650 W El Camino Real', 'Sunnyvale', 'CA', '94087', 37.3794, -122.0428)
on conflict (id) do update set
  restaurant_id = excluded.restaurant_id,
  name = excluded.name,
  address1 = excluded.address1,
  city = excluded.city,
  state = excluded.state,
  postal_code = excluded.postal_code,
  latitude = excluded.latitude,
  longitude = excluded.longitude;

insert into pos_connections (
  id, restaurant_id, provider, status, mode, restaurant_guid, location_id, metadata, last_tested_at, last_synced_at
) values
  (
    'posconn_pizza_palace_toast', 'rest_pizza_palace', 'toast', 'sandbox', 'mock',
    'toast-rest-guid-pizza-palace', 'toast-location-pizza-palace-main', '{"source":"demo"}'::jsonb,
    '2026-05-01T18:00:00.000Z', '2026-05-01T18:00:00.000Z'
  ),
  (
    'posconn_green_leaf_salads_toast', 'rest_green_leaf_salads', 'toast', 'sandbox', 'mock',
    'toast-rest-guid-green-leaf-salads', 'toast-location-green-leaf-salads-main', '{"source":"demo"}'::jsonb,
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

insert into canonical_menu_items (
  id, restaurant_id, category, name, description, image_url, price_cents, availability, mapping_status, modifier_group_ids, pos_ref
) values
  ('item_pizza_margherita', 'rest_pizza_palace', 'Pizzas', 'Margherita Pizza', 'Classic tomato, mozzarella, and basil.', 'https://images.pexels.com/photos/315755/pexels-photo-315755.jpeg', 1399, 'available', 'mapped', array[]::text[], '{"provider":"toast","externalId":"toast_item_pizza_margherita"}'::jsonb),
  ('item_pizza_bbq', 'rest_pizza_palace', 'Pizzas', 'BBQ Chicken Pizza', 'BBQ chicken, onions, and cilantro.', 'https://images.pexels.com/photos/1653877/pexels-photo-1653877.jpeg', 1799, 'available', 'mapped', array[]::text[], '{"provider":"toast","externalId":"toast_item_pizza_bbq"}'::jsonb),
  ('item_pizza_knots', 'rest_pizza_palace', 'Sides', 'Garlic Knots', 'Baked knots with roasted garlic butter.', 'https://images.pexels.com/photos/6941037/pexels-photo-6941037.jpeg', 799, 'available', 'mapped', array[]::text[], '{"provider":"toast","externalId":"toast_item_pizza_knots"}'::jsonb),
  ('item_green_cobb', 'rest_green_leaf_salads', 'Salads', 'Cobb Power Salad', 'Chicken, egg, avocado, bacon, and greens.', 'https://images.pexels.com/photos/1213710/pexels-photo-1213710.jpeg', 1499, 'available', 'mapped', array[]::text[], '{"provider":"toast","externalId":"toast_item_green_cobb"}'::jsonb),
  ('item_green_kale', 'rest_green_leaf_salads', 'Salads', 'Kale Caesar', 'Kale, parmesan, and brioche crumb.', 'https://images.pexels.com/photos/257816/pexels-photo-257816.jpeg', 1399, 'available', 'mapped', array[]::text[], '{"provider":"toast","externalId":"toast_item_green_kale"}'::jsonb),
  ('item_green_wrap', 'rest_green_leaf_salads', 'Wraps', 'Mediterranean Chicken Wrap', 'Grilled chicken, cucumber, tomato, and feta.', 'https://images.pexels.com/photos/461198/pexels-photo-461198.jpeg', 1599, 'available', 'mapped', array[]::text[], '{"provider":"toast","externalId":"toast_item_green_wrap"}'::jsonb)
on conflict (id) do update set
  restaurant_id = excluded.restaurant_id,
  category = excluded.category,
  name = excluded.name,
  description = excluded.description,
  image_url = excluded.image_url,
  price_cents = excluded.price_cents,
  availability = excluded.availability,
  mapping_status = excluded.mapping_status,
  modifier_group_ids = excluded.modifier_group_ids,
  pos_ref = excluded.pos_ref;

insert into pos_menu_mappings (id, restaurant_id, canonical_type, canonical_id, provider, provider_reference, status) values
  ('map_item_pizza_margherita', 'rest_pizza_palace', 'item', 'item_pizza_margherita', 'toast', 'toast_item_pizza_margherita', 'mapped'),
  ('map_item_pizza_bbq', 'rest_pizza_palace', 'item', 'item_pizza_bbq', 'toast', 'toast_item_pizza_bbq', 'mapped'),
  ('map_item_pizza_knots', 'rest_pizza_palace', 'item', 'item_pizza_knots', 'toast', 'toast_item_pizza_knots', 'mapped'),
  ('map_item_green_cobb', 'rest_green_leaf_salads', 'item', 'item_green_cobb', 'toast', 'toast_item_green_cobb', 'mapped'),
  ('map_item_green_kale', 'rest_green_leaf_salads', 'item', 'item_green_kale', 'toast', 'toast_item_green_kale', 'mapped'),
  ('map_item_green_wrap', 'rest_green_leaf_salads', 'item', 'item_green_wrap', 'toast', 'toast_item_green_wrap', 'mapped')
on conflict (id) do update set
  restaurant_id = excluded.restaurant_id,
  canonical_type = excluded.canonical_type,
  canonical_id = excluded.canonical_id,
  provider = excluded.provider,
  provider_reference = excluded.provider_reference,
  status = excluded.status;

insert into operator_memberships (id, operator_user_id, restaurant_id, location_id, role, created_at) values
  ('membership_pizza_palace_owner', 'op_dev_rest', 'rest_pizza_palace', 'loc_pizza_palace_main', 'owner', '2026-05-01T18:00:00.000Z'),
  ('membership_green_leaf_salads_owner', 'op_dev_rest', 'rest_green_leaf_salads', 'loc_green_leaf_salads_main', 'owner', '2026-05-01T18:00:00.000Z')
on conflict (id) do update set
  operator_user_id = excluded.operator_user_id,
  restaurant_id = excluded.restaurant_id,
  location_id = excluded.location_id,
  role = excluded.role,
  created_at = excluded.created_at;

insert into restaurant_agent_permissions (id, restaurant_id, agent_id, status, notes, last_activity_at) values
  ('perm_pizza_palace_phantom', 'rest_pizza_palace', 'agent_phantom', 'allowed', 'Seeded default allow-list entry.', '2026-05-01T18:00:00.000Z'),
  ('perm_pizza_palace_coachimhungry', 'rest_pizza_palace', 'agent_coachimhungry', 'allowed', 'Seeded CoachImHungry allow-list entry.', '2026-05-01T18:00:00.000Z'),
  ('perm_green_leaf_salads_phantom', 'rest_green_leaf_salads', 'agent_phantom', 'allowed', 'Seeded default allow-list entry.', '2026-05-01T18:00:00.000Z'),
  ('perm_green_leaf_salads_coachimhungry', 'rest_green_leaf_salads', 'agent_coachimhungry', 'allowed', 'Seeded CoachImHungry allow-list entry.', '2026-05-01T18:00:00.000Z')
on conflict (restaurant_id, agent_id) do update set
  restaurant_id = excluded.restaurant_id,
  agent_id = excluded.agent_id,
  status = excluded.status,
  notes = excluded.notes,
  last_activity_at = excluded.last_activity_at;

insert into ordering_rules (
  id, restaurant_id, minimum_lead_time_minutes, max_order_dollar_amount, max_item_quantity,
  max_headcount, auto_accept_enabled, manager_approval_threshold_cents, blackout_windows,
  allowed_fulfillment_types, substitution_policy, payment_policy, allowed_agent_ids
) values
  (
    'rules_pizza_palace_default', 'rest_pizza_palace', 45, 300, 1000, 1000, false, 5000,
    '[]'::jsonb, array['pickup','delivery','catering']::text[],
    'strict', 'required_before_submit', array['agent_phantom','agent_coachimhungry']::text[]
  ),
  (
    'rules_green_leaf_salads_default', 'rest_green_leaf_salads', 45, 350, 1000, 1000, false, 5000,
    '[]'::jsonb, array['pickup','delivery','catering']::text[],
    'strict', 'required_before_submit', array['agent_phantom','agent_coachimhungry']::text[]
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

insert into restaurants (
  id, name, location, timezone, image_url, cuisine_type, description, rating, delivery_fee, minimum_order, supports_catering, pos_provider, agent_ordering_enabled,
  default_approval_mode, contact_email, contact_phone, fulfillment_types_supported,
  created_at, updated_at
) values
  (
    'rest_lb_steakhouse', 'LB Steakhouse', '1533 Ashcroft Way, Sunnyvale, CA 94087', 'America/Los_Angeles', 'https://images.pexels.com/photos/67468/pexels-photo-67468.jpeg', 'Steakhouse', 'Classic steakhouse plates, polished sides, and a strong team-order catering fit.', 4.7, 299, 2500, true, 'toast', true,
    'threshold_review', 'ops@lbsteakhouse.example', '(408) 555-0193',
    array['pickup', 'delivery', 'catering']::text[],
    '2026-05-01T18:00:00.000Z', '2026-05-01T18:00:00.000Z'
  ),
  (
    'rest_pizza_palace', 'Pizza Palace', '1325 Sunnyvale Saratoga Rd, Sunnyvale, CA 94087', 'America/Los_Angeles', 'https://images.pexels.com/photos/825661/pexels-photo-825661.jpeg', 'Pizza', 'Shareable pies, garlic knots, and easy crowd ordering for pickup or delivery.', 4.5, 199, 1800, true, 'toast', true,
    'threshold_review', 'ops@pizzapalace.example', '(123) 456-7890',
    array['pickup', 'delivery', 'catering']::text[],
    '2026-05-01T18:00:00.000Z', '2026-05-01T18:00:00.000Z'
  ),
  (
    'rest_green_leaf_salads', 'Green Leaf Salads', '650 W El Camino Real, Sunnyvale, CA 94087', 'America/Los_Angeles', 'https://images.pexels.com/photos/1640774/pexels-photo-1640774.jpeg', 'Salads', 'Fresh salads and wraps with lighter delivery-friendly team meal options.', 4.6, 249, 1500, true, 'toast', true,
    'threshold_review', 'ops@greenleafsalads.example', '(408) 555-5505',
    array['pickup', 'delivery', 'catering']::text[],
    '2026-05-01T18:00:00.000Z', '2026-05-01T18:00:00.000Z'
  ),
  (
    'rest_sakura_sushi_house', 'Sakura Sushi House', '895 E El Camino Real, Sunnyvale, CA 94087', 'America/Los_Angeles', 'https://images.pexels.com/photos/8696567/pexels-photo-8696567.jpeg', 'Sushi', 'Bright sushi sets, rice bowls, and polished small plates for high-trust demo ordering.', 4.8, 299, 2200, true, 'toast', true,
    'threshold_review', 'ops@sakurasushi.example', '(408) 555-7331',
    array['pickup', 'delivery', 'catering']::text[],
    '2026-05-01T18:00:00.000Z', '2026-05-01T18:00:00.000Z'
  ),
  (
    'rest_sunrise_taqueria', 'Sunrise Taqueria', '1105 Fair Oaks Ave, Sunnyvale, CA 94089', 'America/Los_Angeles', 'https://images.pexels.com/photos/4958641/pexels-photo-4958641.jpeg?cs=srgb&dl=pexels-los-muertos-crew-4958641.jpg&fm=jpg', 'Mexican', 'Colorful tacos, burritos, and sides that read beautifully on camera and in shared carts.', 4.7, 249, 1600, true, 'toast', true,
    'threshold_review', 'ops@sunrisetaqueria.example', '(408) 555-2408',
    array['pickup', 'delivery', 'catering']::text[],
    '2026-05-01T18:00:00.000Z', '2026-05-01T18:00:00.000Z'
  ),
  (
    'rest_midnight_noodle_bar', 'Midnight Noodle Bar', '301 W Washington Ave, Sunnyvale, CA 94086', 'America/Los_Angeles', 'https://images.pexels.com/photos/15985539/pexels-photo-15985539.jpeg?cs=srgb&dl=pexels-pixabay-45170-15985539.jpg&fm=jpg', 'Asian', 'Late-night noodle bowls and craveable small plates designed to make the menu feel rich and premium.', 4.7, 299, 1800, true, 'toast', true,
    'threshold_review', 'ops@midnightnoodle.example', '(408) 555-9077',
    array['pickup', 'delivery', 'catering']::text[],
    '2026-05-01T18:00:00.000Z', '2026-05-01T18:00:00.000Z'
  ),
  (
    'rest_harbor_sandwich_co', 'Harbor Sandwich Co', '251 N Murphy Ave, Sunnyvale, CA 94085', 'America/Los_Angeles', 'https://images.pexels.com/photos/15153241/pexels-photo-15153241.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=750&w=1260', 'Sandwiches', 'Stacked sandwiches, warm soups, and polished lunch-friendly extras for office ordering.', 4.6, 199, 1400, true, 'toast', true,
    'threshold_review', 'ops@harborsandwich.example', '(408) 555-4412',
    array['pickup', 'delivery', 'catering']::text[],
    '2026-05-01T18:00:00.000Z', '2026-05-01T18:00:00.000Z'
  )
on conflict (id) do update set
  name = excluded.name,
  location = excluded.location,
  timezone = excluded.timezone,
  image_url = excluded.image_url,
  cuisine_type = excluded.cuisine_type,
  description = excluded.description,
  rating = excluded.rating,
  delivery_fee = excluded.delivery_fee,
  minimum_order = excluded.minimum_order,
  supports_catering = excluded.supports_catering,
  pos_provider = excluded.pos_provider,
  agent_ordering_enabled = excluded.agent_ordering_enabled,
  default_approval_mode = excluded.default_approval_mode,
  contact_email = excluded.contact_email,
  contact_phone = excluded.contact_phone,
  fulfillment_types_supported = excluded.fulfillment_types_supported,
  updated_at = excluded.updated_at;

insert into restaurant_locations (id, restaurant_id, name, address1, city, state, postal_code, latitude, longitude) values
  ('loc_sakura_sushi_house_main', 'rest_sakura_sushi_house', 'East El Camino', '895 E El Camino Real', 'Sunnyvale', 'CA', '94087', 37.3619, -122.0249),
  ('loc_sunrise_taqueria_main', 'rest_sunrise_taqueria', 'Fair Oaks', '1105 Fair Oaks Ave', 'Sunnyvale', 'CA', '94089', 37.3852, -122.0082),
  ('loc_midnight_noodle_bar_main', 'rest_midnight_noodle_bar', 'Downtown Sunnyvale', '301 W Washington Ave', 'Sunnyvale', 'CA', '94086', 37.3691, -122.0377),
  ('loc_harbor_sandwich_co_main', 'rest_harbor_sandwich_co', 'Murphy Avenue', '251 N Murphy Ave', 'Sunnyvale', 'CA', '94085', 37.3791, -122.0306)
on conflict (id) do update set
  restaurant_id = excluded.restaurant_id,
  name = excluded.name,
  address1 = excluded.address1,
  city = excluded.city,
  state = excluded.state,
  postal_code = excluded.postal_code,
  latitude = excluded.latitude,
  longitude = excluded.longitude;

insert into pos_connections (
  id, restaurant_id, provider, status, mode, restaurant_guid, location_id, metadata, last_tested_at, last_synced_at
) values
  (
    'posconn_sakura_sushi_house_toast', 'rest_sakura_sushi_house', 'toast', 'sandbox', 'mock',
    'toast-rest-guid-sakura-sushi-house', 'toast-location-sakura-sushi-house-main', '{"source":"demo"}'::jsonb,
    '2026-05-01T18:00:00.000Z', '2026-05-01T18:00:00.000Z'
  ),
  (
    'posconn_sunrise_taqueria_toast', 'rest_sunrise_taqueria', 'toast', 'sandbox', 'mock',
    'toast-rest-guid-sunrise-taqueria', 'toast-location-sunrise-taqueria-main', '{"source":"demo"}'::jsonb,
    '2026-05-01T18:00:00.000Z', '2026-05-01T18:00:00.000Z'
  ),
  (
    'posconn_midnight_noodle_bar_toast', 'rest_midnight_noodle_bar', 'toast', 'sandbox', 'mock',
    'toast-rest-guid-midnight-noodle-bar', 'toast-location-midnight-noodle-bar-main', '{"source":"demo"}'::jsonb,
    '2026-05-01T18:00:00.000Z', '2026-05-01T18:00:00.000Z'
  ),
  (
    'posconn_harbor_sandwich_co_toast', 'rest_harbor_sandwich_co', 'toast', 'sandbox', 'mock',
    'toast-rest-guid-harbor-sandwich-co', 'toast-location-harbor-sandwich-co-main', '{"source":"demo"}'::jsonb,
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
  ('mg_pizza_crust', 'rest_pizza_palace', 'Crust Style', 'single', true, 1, 1),
  ('mg_pizza_cheese', 'rest_pizza_palace', 'Cheese Level', 'single', true, 1, 1),
  ('mg_pizza_toppings', 'rest_pizza_palace', 'Toppings', 'multi', false, 0, 4),
  ('mg_green_protein', 'rest_green_leaf_salads', 'Protein Choice', 'single', false, 0, 1),
  ('mg_green_dressing', 'rest_green_leaf_salads', 'Dressing', 'single', true, 1, 1),
  ('mg_green_extras', 'rest_green_leaf_salads', 'Crunch & Extras', 'multi', false, 0, 3),
  ('mg_sakura_rice', 'rest_sakura_sushi_house', 'Rice Style', 'single', false, 0, 1),
  ('mg_sakura_sauce', 'rest_sakura_sushi_house', 'Sauce Finish', 'single', true, 1, 1),
  ('mg_sakura_addons', 'rest_sakura_sushi_house', 'Add Ons', 'multi', false, 0, 3),
  ('mg_taco_tortilla', 'rest_sunrise_taqueria', 'Tortilla Style', 'single', true, 1, 1),
  ('mg_taco_salsa', 'rest_sunrise_taqueria', 'Salsa Choice', 'single', true, 1, 1),
  ('mg_taco_extras', 'rest_sunrise_taqueria', 'Extras', 'multi', false, 0, 3),
  ('mg_noodle_spice', 'rest_midnight_noodle_bar', 'Spice Level', 'single', true, 1, 1),
  ('mg_noodle_protein', 'rest_midnight_noodle_bar', 'Protein Boost', 'single', false, 0, 1),
  ('mg_noodle_finish', 'rest_midnight_noodle_bar', 'Finishing Touches', 'multi', false, 0, 3),
  ('mg_harbor_bread', 'rest_harbor_sandwich_co', 'Bread Choice', 'single', true, 1, 1),
  ('mg_harbor_side', 'rest_harbor_sandwich_co', 'Side Choice', 'single', false, 0, 1),
  ('mg_harbor_extras', 'rest_harbor_sandwich_co', 'Add Ons', 'multi', false, 0, 3)
on conflict (id) do update set
  restaurant_id = excluded.restaurant_id,
  name = excluded.name,
  selection_type = excluded.selection_type,
  required = excluded.required,
  min_selections = excluded.min_selections,
  max_selections = excluded.max_selections;

insert into canonical_modifiers (id, modifier_group_id, name, price_cents, is_available) values
  ('mod_pizza_classic', 'mg_pizza_crust', 'Classic Crust', 0, true),
  ('mod_pizza_thin', 'mg_pizza_crust', 'Thin Crust', 0, true),
  ('mod_pizza_gluten_free', 'mg_pizza_crust', 'Gluten Free Crust', 300, true),
  ('mod_pizza_light_cheese', 'mg_pizza_cheese', 'Light Cheese', 0, true),
  ('mod_pizza_regular_cheese', 'mg_pizza_cheese', 'Regular Cheese', 0, true),
  ('mod_pizza_extra_cheese', 'mg_pizza_cheese', 'Extra Cheese', 200, true),
  ('mod_pizza_pepperoni', 'mg_pizza_toppings', 'Pepperoni', 250, true),
  ('mod_pizza_mushrooms', 'mg_pizza_toppings', 'Roasted Mushrooms', 150, true),
  ('mod_pizza_burrata', 'mg_pizza_toppings', 'Burrata', 350, false),
  ('mod_green_chicken', 'mg_green_protein', 'Grilled Chicken', 300, true),
  ('mod_green_tofu', 'mg_green_protein', 'Herb Tofu', 200, true),
  ('mod_green_salmon', 'mg_green_protein', 'Salmon', 450, false),
  ('mod_green_tahini', 'mg_green_dressing', 'Lemon Tahini', 0, true),
  ('mod_green_caesar', 'mg_green_dressing', 'Caesar', 0, true),
  ('mod_green_goddess', 'mg_green_dressing', 'Green Goddess', 0, true),
  ('mod_green_avocado', 'mg_green_extras', 'Avocado', 200, true),
  ('mod_green_chickpeas', 'mg_green_extras', 'Crispy Chickpeas', 150, true),
  ('mod_green_feta', 'mg_green_extras', 'Feta', 175, true),
  ('mod_sakura_white_rice', 'mg_sakura_rice', 'White Rice', 0, true),
  ('mod_sakura_brown_rice', 'mg_sakura_rice', 'Brown Rice', 100, true),
  ('mod_sakura_soy', 'mg_sakura_sauce', 'Soy Glaze', 0, true),
  ('mod_sakura_spicy_mayo', 'mg_sakura_sauce', 'Spicy Mayo', 100, true),
  ('mod_sakura_ponzu', 'mg_sakura_sauce', 'Ponzu', 0, true),
  ('mod_sakura_avocado', 'mg_sakura_addons', 'Avocado', 150, true),
  ('mod_sakura_crispy_onion', 'mg_sakura_addons', 'Crispy Onion', 100, true),
  ('mod_sakura_toro', 'mg_sakura_addons', 'Toro Add-On', 400, false),
  ('mod_taco_corn', 'mg_taco_tortilla', 'Corn Tortilla', 0, true),
  ('mod_taco_flour', 'mg_taco_tortilla', 'Flour Tortilla', 0, true),
  ('mod_taco_roja', 'mg_taco_salsa', 'Salsa Roja', 0, true),
  ('mod_taco_verde', 'mg_taco_salsa', 'Salsa Verde', 0, true),
  ('mod_taco_chipotle', 'mg_taco_salsa', 'Smoky Chipotle', 50, true),
  ('mod_taco_pickled_onion', 'mg_taco_extras', 'Pickled Onion', 75, true),
  ('mod_taco_cotija', 'mg_taco_extras', 'Cotija', 100, true),
  ('mod_taco_guac', 'mg_taco_extras', 'Guacamole', 250, false),
  ('mod_noodle_mild', 'mg_noodle_spice', 'Mild', 0, true),
  ('mod_noodle_medium', 'mg_noodle_spice', 'Medium', 0, true),
  ('mod_noodle_hot', 'mg_noodle_spice', 'Hot', 0, true),
  ('mod_noodle_chicken', 'mg_noodle_protein', 'Chicken', 300, true),
  ('mod_noodle_pork', 'mg_noodle_protein', 'Braised Pork', 350, true),
  ('mod_noodle_tofu', 'mg_noodle_protein', 'Tofu', 250, true),
  ('mod_noodle_soft_egg', 'mg_noodle_finish', 'Soft Egg', 150, false),
  ('mod_noodle_chili_oil', 'mg_noodle_finish', 'Chili Oil', 50, true),
  ('mod_noodle_crispy_garlic', 'mg_noodle_finish', 'Crispy Garlic', 100, true),
  ('mod_harbor_sesame', 'mg_harbor_bread', 'Sesame Roll', 0, true),
  ('mod_harbor_wheat', 'mg_harbor_bread', 'Wheat', 0, true),
  ('mod_harbor_sourdough', 'mg_harbor_bread', 'Sourdough', 0, false),
  ('mod_harbor_chips', 'mg_harbor_side', 'Kettle Chips', 0, true),
  ('mod_harbor_salad', 'mg_harbor_side', 'Little Gem Salad', 250, true),
  ('mod_harbor_soup', 'mg_harbor_side', 'Tomato Soup Cup', 300, true),
  ('mod_harbor_avocado', 'mg_harbor_extras', 'Avocado', 200, true),
  ('mod_harbor_pickles', 'mg_harbor_extras', 'Pickles', 75, true),
  ('mod_harbor_bacon', 'mg_harbor_extras', 'Applewood Bacon', 250, true)
on conflict (id) do update set
  modifier_group_id = excluded.modifier_group_id,
  name = excluded.name,
  price_cents = excluded.price_cents,
  is_available = excluded.is_available;

insert into canonical_menu_items (
  id, restaurant_id, category, name, description, image_url, price_cents, availability, mapping_status, modifier_group_ids, pos_ref
) values
  ('item_ribeye', 'rest_lb_steakhouse', 'Steaks', '16oz Prime Ribeye', 'Dry-aged ribeye with rosemary butter.', 'https://images.pexels.com/photos/675951/pexels-photo-675951.jpeg', 5600, 'available', 'mapped', array['mg_temp','mg_side','mg_addons']::text[], '{"provider":"toast","externalId":"toast_item_ribeye"}'::jsonb),
  ('item_filet', 'rest_lb_steakhouse', 'Steaks', '8oz Center Cut Filet', 'Tender filet with sea salt finish.', 'https://images.pexels.com/photos/361184/asparagus-steak-veal-steak-veal-361184.jpeg', 4900, 'available', 'mapped', array['mg_temp','mg_side','mg_addons']::text[], '{"provider":"toast","externalId":"toast_item_filet"}'::jsonb),
  ('item_caesar', 'rest_lb_steakhouse', 'Starters', 'Tableside Caesar', 'Romaine, parmesan, brioche crumb.', 'https://images.pexels.com/photos/2097090/pexels-photo-2097090.jpeg', 1600, 'available', 'mapped', array[]::text[], '{"provider":"toast","externalId":"toast_item_caesar"}'::jsonb),
  ('item_butter_cake', 'rest_lb_steakhouse', 'Dessert', 'Butter Cake', 'Warm vanilla butter cake with berries.', 'https://images.pexels.com/photos/291528/pexels-photo-291528.jpeg', 1400, 'available', 'needs_review', array[]::text[], '{"provider":"toast","externalId":"toast_item_butter_cake"}'::jsonb),
  ('item_pizza_margherita', 'rest_pizza_palace', 'Pizzas', 'Margherita Pizza', 'Classic tomato, mozzarella, and basil.', 'https://images.pexels.com/photos/315755/pexels-photo-315755.jpeg', 1399, 'available', 'mapped', array['mg_pizza_crust','mg_pizza_cheese','mg_pizza_toppings']::text[], '{"provider":"toast","externalId":"toast_item_pizza_margherita"}'::jsonb),
  ('item_pizza_bbq', 'rest_pizza_palace', 'Pizzas', 'BBQ Chicken Pizza', 'BBQ chicken, onions, and cilantro.', 'https://images.pexels.com/photos/1653877/pexels-photo-1653877.jpeg', 1799, 'available', 'mapped', array['mg_pizza_crust','mg_pizza_cheese','mg_pizza_toppings']::text[], '{"provider":"toast","externalId":"toast_item_pizza_bbq"}'::jsonb),
  ('item_pizza_knots', 'rest_pizza_palace', 'Sides', 'Garlic Knots', 'Baked knots with roasted garlic butter.', 'https://images.pexels.com/photos/37047927/pexels-photo-37047927.jpeg', 799, 'available', 'mapped', array['mg_pizza_toppings']::text[], '{"provider":"toast","externalId":"toast_item_pizza_knots"}'::jsonb),
  ('item_green_cobb', 'rest_green_leaf_salads', 'Salads', 'Cobb Power Salad', 'Chicken, egg, avocado, bacon, and greens.', 'https://images.pexels.com/photos/1213710/pexels-photo-1213710.jpeg', 1499, 'available', 'mapped', array['mg_green_protein','mg_green_dressing','mg_green_extras']::text[], '{"provider":"toast","externalId":"toast_item_green_cobb"}'::jsonb),
  ('item_green_kale', 'rest_green_leaf_salads', 'Salads', 'Kale Caesar', 'Kale, parmesan, and brioche crumb.', 'https://images.pexels.com/photos/257816/pexels-photo-257816.jpeg', 1399, 'available', 'mapped', array['mg_green_protein','mg_green_dressing','mg_green_extras']::text[], '{"provider":"toast","externalId":"toast_item_green_kale"}'::jsonb),
  ('item_green_wrap', 'rest_green_leaf_salads', 'Wraps', 'Mediterranean Chicken Wrap', 'Grilled chicken, cucumber, tomato, and feta.', 'https://images.pexels.com/photos/461198/pexels-photo-461198.jpeg', 1599, 'available', 'mapped', array['mg_green_protein','mg_green_dressing','mg_green_extras']::text[], '{"provider":"toast","externalId":"toast_item_green_wrap"}'::jsonb),
  ('item_sakura_salmon_roll', 'rest_sakura_sushi_house', 'Rolls', 'Salmon Crunch Roll', 'Salmon, cucumber, avocado, and tempura crunch.', 'https://images.pexels.com/photos/11661144/pexels-photo-11661144.jpeg', 1699, 'available', 'mapped', array['mg_sakura_sauce','mg_sakura_addons']::text[], '{"provider":"toast","externalId":"toast_item_sakura_salmon_roll"}'::jsonb),
  ('item_sakura_tuna_bowl', 'rest_sakura_sushi_house', 'Bowls', 'Spicy Tuna Bowl', 'Spicy tuna, pickled cucumber, rice, and sesame.', 'https://images.pexels.com/photos/4828250/pexels-photo-4828250.jpeg?cs=srgb&dl=pexels-alleksana-4828250.jpg&fm=jpg', 1799, 'available', 'mapped', array['mg_sakura_rice','mg_sakura_sauce','mg_sakura_addons']::text[], '{"provider":"toast","externalId":"toast_item_sakura_tuna_bowl"}'::jsonb),
  ('item_sakura_edamame', 'rest_sakura_sushi_house', 'Small Plates', 'Sea Salt Edamame', 'Warm edamame with flaky salt and chili flakes.', 'https://images.pexels.com/photos/30358737/pexels-photo-30358737.jpeg?cs=srgb&dl=pexels-cottonbro-30358737.jpg&fm=jpg', 699, 'available', 'mapped', array['mg_sakura_sauce']::text[], '{"provider":"toast","externalId":"toast_item_sakura_edamame"}'::jsonb),
  ('item_taco_al_pastor', 'rest_sunrise_taqueria', 'Tacos', 'Al Pastor Taco Trio', 'Three tacos with pineapple, onion, and cilantro.', 'https://images.pexels.com/photos/4958641/pexels-photo-4958641.jpeg?cs=srgb&dl=pexels-los-muertos-crew-4958641.jpg&fm=jpg', 1599, 'available', 'mapped', array['mg_taco_tortilla','mg_taco_salsa','mg_taco_extras']::text[], '{"provider":"toast","externalId":"toast_item_taco_al_pastor"}'::jsonb),
  ('item_taco_burrito', 'rest_sunrise_taqueria', 'Burritos', 'Carne Asada Burrito', 'Carne asada, rice, beans, pico, and crema.', 'https://images.pexels.com/photos/5848704/pexels-photo-5848704.jpeg', 1699, 'available', 'mapped', array['mg_taco_tortilla','mg_taco_salsa','mg_taco_extras']::text[], '{"provider":"toast","externalId":"toast_item_taco_burrito"}'::jsonb),
  ('item_taco_street_corn', 'rest_sunrise_taqueria', 'Sides', 'Street Corn Cup', 'Roasted corn with cotija, lime, and chile.', 'https://images.pexels.com/photos/3647378/pexels-photo-3647378.jpeg', 799, 'available', 'mapped', array['mg_taco_salsa','mg_taco_extras']::text[], '{"provider":"toast","externalId":"toast_item_taco_street_corn"}'::jsonb),
  ('item_noodle_garlic_chili', 'rest_midnight_noodle_bar', 'Noodles', 'Garlic Chili Noodles', 'Savory noodles with chili crisp and scallion.', 'https://images.pexels.com/photos/15985539/pexels-photo-15985539.jpeg?cs=srgb&dl=pexels-pixabay-45170-15985539.jpg&fm=jpg', 1599, 'available', 'mapped', array['mg_noodle_spice','mg_noodle_protein','mg_noodle_finish']::text[], '{"provider":"toast","externalId":"toast_item_noodle_garlic_chili"}'::jsonb),
  ('item_noodle_miso_udon', 'rest_midnight_noodle_bar', 'Noodles', 'Miso Sesame Udon', 'Silky udon in a nutty miso sesame sauce.', 'https://images.pexels.com/photos/31302048/pexels-photo-31302048.jpeg', 1699, 'available', 'mapped', array['mg_noodle_spice','mg_noodle_protein','mg_noodle_finish']::text[], '{"provider":"toast","externalId":"toast_item_noodle_miso_udon"}'::jsonb),
  ('item_noodle_gyoza', 'rest_midnight_noodle_bar', 'Small Plates', 'Pork Gyoza', 'Pan-seared dumplings with soy dipping sauce.', 'https://images.pexels.com/photos/2098120/pexels-photo-2098120.jpeg?cs=srgb&dl=pexels-jeshoots-com-147458-2098120.jpg&fm=jpg', 899, 'available', 'mapped', array['mg_noodle_finish']::text[], '{"provider":"toast","externalId":"toast_item_noodle_gyoza"}'::jsonb),
  ('item_harbor_turkey_club', 'rest_harbor_sandwich_co', 'Sandwiches', 'Turkey Avocado Club', 'Roasted turkey, avocado, tomato, and bacon aioli.', 'https://images.pexels.com/photos/32318138/pexels-photo-32318138.jpeg', 1599, 'available', 'mapped', array['mg_harbor_bread','mg_harbor_side','mg_harbor_extras']::text[], '{"provider":"toast","externalId":"toast_item_harbor_turkey_club"}'::jsonb),
  ('item_harbor_pastrami_melt', 'rest_harbor_sandwich_co', 'Sandwiches', 'Hot Pastrami Melt', 'Warm pastrami, Swiss, mustard, and caramelized onion.', 'https://images.pexels.com/photos/1633578/pexels-photo-1633578.jpeg?cs=srgb&dl=pexels-engin-akyurt-1435907-1633578.jpg&fm=jpg', 1699, 'available', 'mapped', array['mg_harbor_bread','mg_harbor_side','mg_harbor_extras']::text[], '{"provider":"toast","externalId":"toast_item_harbor_pastrami_melt"}'::jsonb),
  ('item_harbor_tomato_soup', 'rest_harbor_sandwich_co', 'Soups', 'Tomato Soup Cup', 'Slow-simmered tomato soup with basil oil.', 'https://images.pexels.com/photos/27098513/pexels-photo-27098513.jpeg', 699, 'available', 'mapped', array['mg_harbor_extras']::text[], '{"provider":"toast","externalId":"toast_item_harbor_tomato_soup"}'::jsonb)
on conflict (id) do update set
  restaurant_id = excluded.restaurant_id,
  category = excluded.category,
  name = excluded.name,
  description = excluded.description,
  image_url = excluded.image_url,
  price_cents = excluded.price_cents,
  availability = excluded.availability,
  mapping_status = excluded.mapping_status,
  modifier_group_ids = excluded.modifier_group_ids,
  pos_ref = excluded.pos_ref;

insert into pos_menu_mappings (id, restaurant_id, canonical_type, canonical_id, provider, provider_reference, status) values
  ('map_mg_pizza_crust', 'rest_pizza_palace', 'modifier_group', 'mg_pizza_crust', 'toast', 'toast_mg_pizza_crust', 'mapped'),
  ('map_mg_pizza_cheese', 'rest_pizza_palace', 'modifier_group', 'mg_pizza_cheese', 'toast', 'toast_mg_pizza_cheese', 'mapped'),
  ('map_mg_pizza_toppings', 'rest_pizza_palace', 'modifier_group', 'mg_pizza_toppings', 'toast', 'toast_mg_pizza_toppings', 'mapped'),
  ('map_mod_pizza_classic', 'rest_pizza_palace', 'modifier', 'mod_pizza_classic', 'toast', 'toast_mod_pizza_classic', 'mapped'),
  ('map_mod_pizza_thin', 'rest_pizza_palace', 'modifier', 'mod_pizza_thin', 'toast', 'toast_mod_pizza_thin', 'mapped'),
  ('map_mod_pizza_gluten_free', 'rest_pizza_palace', 'modifier', 'mod_pizza_gluten_free', 'toast', 'toast_mod_pizza_gluten_free', 'mapped'),
  ('map_mod_pizza_light_cheese', 'rest_pizza_palace', 'modifier', 'mod_pizza_light_cheese', 'toast', 'toast_mod_pizza_light_cheese', 'mapped'),
  ('map_mod_pizza_regular_cheese', 'rest_pizza_palace', 'modifier', 'mod_pizza_regular_cheese', 'toast', 'toast_mod_pizza_regular_cheese', 'mapped'),
  ('map_mod_pizza_extra_cheese', 'rest_pizza_palace', 'modifier', 'mod_pizza_extra_cheese', 'toast', 'toast_mod_pizza_extra_cheese', 'mapped'),
  ('map_mod_pizza_pepperoni', 'rest_pizza_palace', 'modifier', 'mod_pizza_pepperoni', 'toast', 'toast_mod_pizza_pepperoni', 'mapped'),
  ('map_mod_pizza_mushrooms', 'rest_pizza_palace', 'modifier', 'mod_pizza_mushrooms', 'toast', 'toast_mod_pizza_mushrooms', 'mapped'),
  ('map_mod_pizza_burrata', 'rest_pizza_palace', 'modifier', 'mod_pizza_burrata', 'toast', 'toast_mod_pizza_burrata', 'mapped'),
  ('map_mg_green_protein', 'rest_green_leaf_salads', 'modifier_group', 'mg_green_protein', 'toast', 'toast_mg_green_protein', 'mapped'),
  ('map_mg_green_dressing', 'rest_green_leaf_salads', 'modifier_group', 'mg_green_dressing', 'toast', 'toast_mg_green_dressing', 'mapped'),
  ('map_mg_green_extras', 'rest_green_leaf_salads', 'modifier_group', 'mg_green_extras', 'toast', 'toast_mg_green_extras', 'mapped'),
  ('map_mod_green_chicken', 'rest_green_leaf_salads', 'modifier', 'mod_green_chicken', 'toast', 'toast_mod_green_chicken', 'mapped'),
  ('map_mod_green_tofu', 'rest_green_leaf_salads', 'modifier', 'mod_green_tofu', 'toast', 'toast_mod_green_tofu', 'mapped'),
  ('map_mod_green_salmon', 'rest_green_leaf_salads', 'modifier', 'mod_green_salmon', 'toast', 'toast_mod_green_salmon', 'mapped'),
  ('map_mod_green_tahini', 'rest_green_leaf_salads', 'modifier', 'mod_green_tahini', 'toast', 'toast_mod_green_tahini', 'mapped'),
  ('map_mod_green_caesar', 'rest_green_leaf_salads', 'modifier', 'mod_green_caesar', 'toast', 'toast_mod_green_caesar', 'mapped'),
  ('map_mod_green_goddess', 'rest_green_leaf_salads', 'modifier', 'mod_green_goddess', 'toast', 'toast_mod_green_goddess', 'mapped'),
  ('map_mod_green_avocado', 'rest_green_leaf_salads', 'modifier', 'mod_green_avocado', 'toast', 'toast_mod_green_avocado', 'mapped'),
  ('map_mod_green_chickpeas', 'rest_green_leaf_salads', 'modifier', 'mod_green_chickpeas', 'toast', 'toast_mod_green_chickpeas', 'mapped'),
  ('map_mod_green_feta', 'rest_green_leaf_salads', 'modifier', 'mod_green_feta', 'toast', 'toast_mod_green_feta', 'mapped'),
  ('map_item_sakura_salmon_roll', 'rest_sakura_sushi_house', 'item', 'item_sakura_salmon_roll', 'toast', 'toast_item_sakura_salmon_roll', 'mapped'),
  ('map_item_sakura_tuna_bowl', 'rest_sakura_sushi_house', 'item', 'item_sakura_tuna_bowl', 'toast', 'toast_item_sakura_tuna_bowl', 'mapped'),
  ('map_item_sakura_edamame', 'rest_sakura_sushi_house', 'item', 'item_sakura_edamame', 'toast', 'toast_item_sakura_edamame', 'mapped'),
  ('map_mg_sakura_rice', 'rest_sakura_sushi_house', 'modifier_group', 'mg_sakura_rice', 'toast', 'toast_mg_sakura_rice', 'mapped'),
  ('map_mg_sakura_sauce', 'rest_sakura_sushi_house', 'modifier_group', 'mg_sakura_sauce', 'toast', 'toast_mg_sakura_sauce', 'mapped'),
  ('map_mg_sakura_addons', 'rest_sakura_sushi_house', 'modifier_group', 'mg_sakura_addons', 'toast', 'toast_mg_sakura_addons', 'mapped'),
  ('map_mod_sakura_white_rice', 'rest_sakura_sushi_house', 'modifier', 'mod_sakura_white_rice', 'toast', 'toast_mod_sakura_white_rice', 'mapped'),
  ('map_mod_sakura_brown_rice', 'rest_sakura_sushi_house', 'modifier', 'mod_sakura_brown_rice', 'toast', 'toast_mod_sakura_brown_rice', 'mapped'),
  ('map_mod_sakura_soy', 'rest_sakura_sushi_house', 'modifier', 'mod_sakura_soy', 'toast', 'toast_mod_sakura_soy', 'mapped'),
  ('map_mod_sakura_spicy_mayo', 'rest_sakura_sushi_house', 'modifier', 'mod_sakura_spicy_mayo', 'toast', 'toast_mod_sakura_spicy_mayo', 'mapped'),
  ('map_mod_sakura_ponzu', 'rest_sakura_sushi_house', 'modifier', 'mod_sakura_ponzu', 'toast', 'toast_mod_sakura_ponzu', 'mapped'),
  ('map_mod_sakura_avocado', 'rest_sakura_sushi_house', 'modifier', 'mod_sakura_avocado', 'toast', 'toast_mod_sakura_avocado', 'mapped'),
  ('map_mod_sakura_crispy_onion', 'rest_sakura_sushi_house', 'modifier', 'mod_sakura_crispy_onion', 'toast', 'toast_mod_sakura_crispy_onion', 'mapped'),
  ('map_mod_sakura_toro', 'rest_sakura_sushi_house', 'modifier', 'mod_sakura_toro', 'toast', 'toast_mod_sakura_toro', 'mapped'),
  ('map_item_taco_al_pastor', 'rest_sunrise_taqueria', 'item', 'item_taco_al_pastor', 'toast', 'toast_item_taco_al_pastor', 'mapped'),
  ('map_item_taco_burrito', 'rest_sunrise_taqueria', 'item', 'item_taco_burrito', 'toast', 'toast_item_taco_burrito', 'mapped'),
  ('map_item_taco_street_corn', 'rest_sunrise_taqueria', 'item', 'item_taco_street_corn', 'toast', 'toast_item_taco_street_corn', 'mapped'),
  ('map_mg_taco_tortilla', 'rest_sunrise_taqueria', 'modifier_group', 'mg_taco_tortilla', 'toast', 'toast_mg_taco_tortilla', 'mapped'),
  ('map_mg_taco_salsa', 'rest_sunrise_taqueria', 'modifier_group', 'mg_taco_salsa', 'toast', 'toast_mg_taco_salsa', 'mapped'),
  ('map_mg_taco_extras', 'rest_sunrise_taqueria', 'modifier_group', 'mg_taco_extras', 'toast', 'toast_mg_taco_extras', 'mapped'),
  ('map_mod_taco_corn', 'rest_sunrise_taqueria', 'modifier', 'mod_taco_corn', 'toast', 'toast_mod_taco_corn', 'mapped'),
  ('map_mod_taco_flour', 'rest_sunrise_taqueria', 'modifier', 'mod_taco_flour', 'toast', 'toast_mod_taco_flour', 'mapped'),
  ('map_mod_taco_roja', 'rest_sunrise_taqueria', 'modifier', 'mod_taco_roja', 'toast', 'toast_mod_taco_roja', 'mapped'),
  ('map_mod_taco_verde', 'rest_sunrise_taqueria', 'modifier', 'mod_taco_verde', 'toast', 'toast_mod_taco_verde', 'mapped'),
  ('map_mod_taco_chipotle', 'rest_sunrise_taqueria', 'modifier', 'mod_taco_chipotle', 'toast', 'toast_mod_taco_chipotle', 'mapped'),
  ('map_mod_taco_pickled_onion', 'rest_sunrise_taqueria', 'modifier', 'mod_taco_pickled_onion', 'toast', 'toast_mod_taco_pickled_onion', 'mapped'),
  ('map_mod_taco_cotija', 'rest_sunrise_taqueria', 'modifier', 'mod_taco_cotija', 'toast', 'toast_mod_taco_cotija', 'mapped'),
  ('map_mod_taco_guac', 'rest_sunrise_taqueria', 'modifier', 'mod_taco_guac', 'toast', 'toast_mod_taco_guac', 'mapped'),
  ('map_item_noodle_garlic_chili', 'rest_midnight_noodle_bar', 'item', 'item_noodle_garlic_chili', 'toast', 'toast_item_noodle_garlic_chili', 'mapped'),
  ('map_item_noodle_miso_udon', 'rest_midnight_noodle_bar', 'item', 'item_noodle_miso_udon', 'toast', 'toast_item_noodle_miso_udon', 'mapped'),
  ('map_item_noodle_gyoza', 'rest_midnight_noodle_bar', 'item', 'item_noodle_gyoza', 'toast', 'toast_item_noodle_gyoza', 'mapped'),
  ('map_mg_noodle_spice', 'rest_midnight_noodle_bar', 'modifier_group', 'mg_noodle_spice', 'toast', 'toast_mg_noodle_spice', 'mapped'),
  ('map_mg_noodle_protein', 'rest_midnight_noodle_bar', 'modifier_group', 'mg_noodle_protein', 'toast', 'toast_mg_noodle_protein', 'mapped'),
  ('map_mg_noodle_finish', 'rest_midnight_noodle_bar', 'modifier_group', 'mg_noodle_finish', 'toast', 'toast_mg_noodle_finish', 'mapped'),
  ('map_mod_noodle_mild', 'rest_midnight_noodle_bar', 'modifier', 'mod_noodle_mild', 'toast', 'toast_mod_noodle_mild', 'mapped'),
  ('map_mod_noodle_medium', 'rest_midnight_noodle_bar', 'modifier', 'mod_noodle_medium', 'toast', 'toast_mod_noodle_medium', 'mapped'),
  ('map_mod_noodle_hot', 'rest_midnight_noodle_bar', 'modifier', 'mod_noodle_hot', 'toast', 'toast_mod_noodle_hot', 'mapped'),
  ('map_mod_noodle_chicken', 'rest_midnight_noodle_bar', 'modifier', 'mod_noodle_chicken', 'toast', 'toast_mod_noodle_chicken', 'mapped'),
  ('map_mod_noodle_pork', 'rest_midnight_noodle_bar', 'modifier', 'mod_noodle_pork', 'toast', 'toast_mod_noodle_pork', 'mapped'),
  ('map_mod_noodle_tofu', 'rest_midnight_noodle_bar', 'modifier', 'mod_noodle_tofu', 'toast', 'toast_mod_noodle_tofu', 'mapped'),
  ('map_mod_noodle_soft_egg', 'rest_midnight_noodle_bar', 'modifier', 'mod_noodle_soft_egg', 'toast', 'toast_mod_noodle_soft_egg', 'mapped'),
  ('map_mod_noodle_chili_oil', 'rest_midnight_noodle_bar', 'modifier', 'mod_noodle_chili_oil', 'toast', 'toast_mod_noodle_chili_oil', 'mapped'),
  ('map_mod_noodle_crispy_garlic', 'rest_midnight_noodle_bar', 'modifier', 'mod_noodle_crispy_garlic', 'toast', 'toast_mod_noodle_crispy_garlic', 'mapped'),
  ('map_item_harbor_turkey_club', 'rest_harbor_sandwich_co', 'item', 'item_harbor_turkey_club', 'toast', 'toast_item_harbor_turkey_club', 'mapped'),
  ('map_item_harbor_pastrami_melt', 'rest_harbor_sandwich_co', 'item', 'item_harbor_pastrami_melt', 'toast', 'toast_item_harbor_pastrami_melt', 'mapped'),
  ('map_item_harbor_tomato_soup', 'rest_harbor_sandwich_co', 'item', 'item_harbor_tomato_soup', 'toast', 'toast_item_harbor_tomato_soup', 'mapped'),
  ('map_mg_harbor_bread', 'rest_harbor_sandwich_co', 'modifier_group', 'mg_harbor_bread', 'toast', 'toast_mg_harbor_bread', 'mapped'),
  ('map_mg_harbor_side', 'rest_harbor_sandwich_co', 'modifier_group', 'mg_harbor_side', 'toast', 'toast_mg_harbor_side', 'mapped'),
  ('map_mg_harbor_extras', 'rest_harbor_sandwich_co', 'modifier_group', 'mg_harbor_extras', 'toast', 'toast_mg_harbor_extras', 'mapped'),
  ('map_mod_harbor_sesame', 'rest_harbor_sandwich_co', 'modifier', 'mod_harbor_sesame', 'toast', 'toast_mod_harbor_sesame', 'mapped'),
  ('map_mod_harbor_wheat', 'rest_harbor_sandwich_co', 'modifier', 'mod_harbor_wheat', 'toast', 'toast_mod_harbor_wheat', 'mapped'),
  ('map_mod_harbor_sourdough', 'rest_harbor_sandwich_co', 'modifier', 'mod_harbor_sourdough', 'toast', 'toast_mod_harbor_sourdough', 'mapped'),
  ('map_mod_harbor_chips', 'rest_harbor_sandwich_co', 'modifier', 'mod_harbor_chips', 'toast', 'toast_mod_harbor_chips', 'mapped'),
  ('map_mod_harbor_salad', 'rest_harbor_sandwich_co', 'modifier', 'mod_harbor_salad', 'toast', 'toast_mod_harbor_salad', 'mapped'),
  ('map_mod_harbor_soup', 'rest_harbor_sandwich_co', 'modifier', 'mod_harbor_soup', 'toast', 'toast_mod_harbor_soup', 'mapped'),
  ('map_mod_harbor_avocado', 'rest_harbor_sandwich_co', 'modifier', 'mod_harbor_avocado', 'toast', 'toast_mod_harbor_avocado', 'mapped'),
  ('map_mod_harbor_pickles', 'rest_harbor_sandwich_co', 'modifier', 'mod_harbor_pickles', 'toast', 'toast_mod_harbor_pickles', 'mapped'),
  ('map_mod_harbor_bacon', 'rest_harbor_sandwich_co', 'modifier', 'mod_harbor_bacon', 'toast', 'toast_mod_harbor_bacon', 'mapped')
on conflict (id) do update set
  restaurant_id = excluded.restaurant_id,
  canonical_type = excluded.canonical_type,
  canonical_id = excluded.canonical_id,
  provider = excluded.provider,
  provider_reference = excluded.provider_reference,
  status = excluded.status;

insert into operator_memberships (id, operator_user_id, restaurant_id, location_id, role, created_at) values
  ('membership_sakura_sushi_house_owner', 'op_dev_rest', 'rest_sakura_sushi_house', 'loc_sakura_sushi_house_main', 'owner', '2026-05-01T18:00:00.000Z'),
  ('membership_sunrise_taqueria_owner', 'op_dev_rest', 'rest_sunrise_taqueria', 'loc_sunrise_taqueria_main', 'owner', '2026-05-01T18:00:00.000Z'),
  ('membership_midnight_noodle_bar_owner', 'op_dev_rest', 'rest_midnight_noodle_bar', 'loc_midnight_noodle_bar_main', 'owner', '2026-05-01T18:00:00.000Z'),
  ('membership_harbor_sandwich_co_owner', 'op_dev_rest', 'rest_harbor_sandwich_co', 'loc_harbor_sandwich_co_main', 'owner', '2026-05-01T18:00:00.000Z')
on conflict (id) do update set
  operator_user_id = excluded.operator_user_id,
  restaurant_id = excluded.restaurant_id,
  location_id = excluded.location_id,
  role = excluded.role,
  created_at = excluded.created_at;

insert into restaurant_agent_permissions (id, restaurant_id, agent_id, status, notes, last_activity_at) values
  ('perm_sakura_sushi_house_phantom', 'rest_sakura_sushi_house', 'agent_phantom', 'allowed', 'Seeded default allow-list entry.', '2026-05-01T18:00:00.000Z'),
  ('perm_sakura_sushi_house_coachimhungry', 'rest_sakura_sushi_house', 'agent_coachimhungry', 'allowed', 'Seeded CoachImHungry allow-list entry.', '2026-05-01T18:00:00.000Z'),
  ('perm_sunrise_taqueria_phantom', 'rest_sunrise_taqueria', 'agent_phantom', 'allowed', 'Seeded default allow-list entry.', '2026-05-01T18:00:00.000Z'),
  ('perm_sunrise_taqueria_coachimhungry', 'rest_sunrise_taqueria', 'agent_coachimhungry', 'allowed', 'Seeded CoachImHungry allow-list entry.', '2026-05-01T18:00:00.000Z'),
  ('perm_midnight_noodle_bar_phantom', 'rest_midnight_noodle_bar', 'agent_phantom', 'allowed', 'Seeded default allow-list entry.', '2026-05-01T18:00:00.000Z'),
  ('perm_midnight_noodle_bar_coachimhungry', 'rest_midnight_noodle_bar', 'agent_coachimhungry', 'allowed', 'Seeded CoachImHungry allow-list entry.', '2026-05-01T18:00:00.000Z'),
  ('perm_harbor_sandwich_co_phantom', 'rest_harbor_sandwich_co', 'agent_phantom', 'allowed', 'Seeded default allow-list entry.', '2026-05-01T18:00:00.000Z'),
  ('perm_harbor_sandwich_co_coachimhungry', 'rest_harbor_sandwich_co', 'agent_coachimhungry', 'allowed', 'Seeded CoachImHungry allow-list entry.', '2026-05-01T18:00:00.000Z')
on conflict (restaurant_id, agent_id) do update set
  restaurant_id = excluded.restaurant_id,
  agent_id = excluded.agent_id,
  status = excluded.status,
  notes = excluded.notes,
  last_activity_at = excluded.last_activity_at;

insert into ordering_rules (
  id, restaurant_id, minimum_lead_time_minutes, max_order_dollar_amount, max_item_quantity,
  max_headcount, auto_accept_enabled, manager_approval_threshold_cents, blackout_windows,
  allowed_fulfillment_types, substitution_policy, payment_policy, allowed_agent_ids
) values
  (
    'rules_sakura_sushi_house_default', 'rest_sakura_sushi_house', 45, 325, 1000, 1000, false, 5000,
    '[]'::jsonb, array['pickup','delivery','catering']::text[],
    'strict', 'required_before_submit', array['agent_phantom','agent_coachimhungry']::text[]
  ),
  (
    'rules_sunrise_taqueria_default', 'rest_sunrise_taqueria', 45, 285, 1000, 1000, false, 5000,
    '[]'::jsonb, array['pickup','delivery','catering']::text[],
    'strict', 'required_before_submit', array['agent_phantom','agent_coachimhungry']::text[]
  ),
  (
    'rules_midnight_noodle_bar_default', 'rest_midnight_noodle_bar', 45, 340, 1000, 1000, false, 5000,
    '[]'::jsonb, array['pickup','delivery','catering']::text[],
    'strict', 'required_before_submit', array['agent_phantom','agent_coachimhungry']::text[]
  ),
  (
    'rules_harbor_sandwich_co_default', 'rest_harbor_sandwich_co', 45, 260, 1000, 1000, false, 5000,
    '[]'::jsonb, array['pickup','delivery','catering']::text[],
    'strict', 'required_before_submit', array['agent_phantom','agent_coachimhungry']::text[]
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
