create extension if not exists pgcrypto;

create table if not exists pos_providers (
  id text primary key,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists restaurants (
  id text primary key,
  name text not null,
  location text not null,
  timezone text not null,
  image_url text,
  cuisine_type text,
  description text,
  rating double precision,
  delivery_fee integer,
  minimum_order integer,
  supports_catering boolean not null default false,
  pos_provider text not null references pos_providers(id),
  agent_ordering_enabled boolean not null default false,
  default_approval_mode text not null check (default_approval_mode in ('auto', 'manual_review', 'threshold_review')),
  contact_email text not null,
  contact_phone text not null,
  fulfillment_types_supported text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table restaurants add column if not exists image_url text;
alter table restaurants add column if not exists cuisine_type text;
alter table restaurants add column if not exists description text;
alter table restaurants add column if not exists rating double precision;
alter table restaurants add column if not exists delivery_fee integer;
alter table restaurants add column if not exists minimum_order integer;
alter table restaurants add column if not exists supports_catering boolean not null default false;

create table if not exists restaurant_locations (
  id text primary key,
  restaurant_id text not null references restaurants(id) on delete cascade,
  name text not null,
  address1 text not null,
  city text not null,
  state text not null,
  postal_code text not null,
  latitude double precision,
  longitude double precision
);

alter table restaurant_locations add column if not exists latitude double precision;
alter table restaurant_locations add column if not exists longitude double precision;

create table if not exists pos_connections (
  id text primary key,
  restaurant_id text not null references restaurants(id) on delete cascade,
  provider text not null references pos_providers(id),
  status text not null check (status in ('not_connected', 'sandbox', 'connected', 'error', 'disabled')),
  mode text not null check (mode in ('mock', 'live')),
  restaurant_guid text,
  location_id text,
  metadata jsonb not null default '{}'::jsonb,
  last_tested_at timestamptz,
  last_synced_at timestamptz
);

create table if not exists canonical_modifier_groups (
  id text primary key,
  restaurant_id text not null references restaurants(id) on delete cascade,
  name text not null,
  selection_type text not null check (selection_type in ('single', 'multi')),
  required boolean not null default false,
  min_selections integer not null default 0,
  max_selections integer
);

create table if not exists canonical_modifiers (
  id text primary key,
  modifier_group_id text not null references canonical_modifier_groups(id) on delete cascade,
  name text not null,
  price_cents integer not null default 0,
  is_available boolean not null default true
);

create table if not exists canonical_menu_items (
  id text primary key,
  restaurant_id text not null references restaurants(id) on delete cascade,
  category text not null,
  name text not null,
  description text not null default '',
  image_url text,
  price_cents integer not null check (price_cents >= 0),
  availability text not null check (availability in ('available', 'unavailable')),
  mapping_status text not null check (mapping_status in ('mapped', 'needs_review')),
  modifier_group_ids text[] not null default '{}'::text[],
  pos_ref jsonb not null default '{}'::jsonb
);

alter table canonical_menu_items add column if not exists image_url text;

create table if not exists pos_menu_mappings (
  id text primary key,
  restaurant_id text not null references restaurants(id) on delete cascade,
  canonical_type text not null check (canonical_type in ('item', 'modifier_group', 'modifier')),
  canonical_id text not null,
  provider text not null references pos_providers(id),
  provider_reference text not null,
  status text not null check (status in ('mapped', 'needs_review'))
);

create table if not exists agents (
  id text primary key,
  name text not null,
  slug text not null unique,
  description text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists agent_api_keys (
  id text primary key,
  agent_id text not null references agents(id) on delete cascade,
  label text not null,
  key_prefix text not null,
  key_hash text not null unique,
  scopes text[] not null default array['restaurants:read','menus:read','orders:validate','orders:quote','orders:submit','orders:status']::text[],
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  rotated_at timestamptz,
  revoked_at timestamptz
);

create table if not exists operator_users (
  id text primary key,
  email text not null unique,
  full_name text not null,
  password_hash text,
  supabase_user_id uuid unique,
  created_at timestamptz not null default now(),
  last_login_at timestamptz
);

create table if not exists operator_memberships (
  id text primary key,
  operator_user_id text not null references operator_users(id) on delete cascade,
  restaurant_id text not null references restaurants(id) on delete cascade,
  location_id text references restaurant_locations(id) on delete set null,
  role text not null check (role in ('owner', 'manager', 'staff', 'viewer')),
  created_at timestamptz not null default now(),
  unique (operator_user_id, restaurant_id, location_id)
);

create table if not exists operator_sessions (
  id text primary key,
  operator_user_id text not null references operator_users(id) on delete cascade,
  session_token_hash text not null unique,
  selected_restaurant_id text not null references restaurants(id) on delete cascade,
  selected_location_id text references restaurant_locations(id) on delete set null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists restaurant_agent_permissions (
  id text primary key,
  restaurant_id text not null references restaurants(id) on delete cascade,
  agent_id text not null references agents(id) on delete cascade,
  status text not null check (status in ('pending', 'allowed', 'blocked', 'revoked')),
  notes text,
  last_activity_at timestamptz,
  unique (restaurant_id, agent_id)
);

create table if not exists ordering_rules (
  id text primary key,
  restaurant_id text not null unique references restaurants(id) on delete cascade,
  minimum_lead_time_minutes integer not null default 0,
  max_order_dollar_amount numeric(12,2) not null,
  max_item_quantity integer not null,
  max_headcount integer not null,
  auto_accept_enabled boolean not null default false,
  manager_approval_threshold_cents integer not null default 0,
  blackout_windows jsonb not null default '[]'::jsonb,
  allowed_fulfillment_types text[] not null default '{}'::text[],
  substitution_policy text not null check (substitution_policy in ('strict', 'allow_equivalent', 'require_approval')),
  payment_policy text not null check (payment_policy in ('required_before_submit', 'invoice_manual', 'stored_payment')),
  allowed_agent_ids text[] not null default '{}'::text[]
);

create table if not exists agent_orders (
  id text primary key,
  restaurant_id text not null references restaurants(id) on delete cascade,
  agent_id text not null references agents(id),
  external_order_reference text not null,
  customer_name text not null,
  customer_email text,
  team_name text,
  fulfillment_type text not null check (fulfillment_type in ('pickup', 'delivery', 'catering')),
  requested_fulfillment_time timestamptz not null,
  headcount integer not null,
  status text not null check (status in ('draft', 'received', 'validating', 'validation_failed', 'needs_approval', 'approved', 'quoting', 'quoted', 'quote_failed', 'submitting_to_pos', 'submitted_to_pos', 'accepted', 'rejected', 'preparing', 'ready', 'completed', 'failed', 'cancelled')),
  approval_required boolean not null default false,
  total_estimate_cents integer not null default 0,
  order_intent jsonb not null,
  packaging_instructions text,
  dietary_constraints text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists agent_order_items (
  id text primary key,
  order_id text not null references agent_orders(id) on delete cascade,
  menu_item_id text not null references canonical_menu_items(id),
  quantity integer not null check (quantity > 0),
  notes text
);

create table if not exists agent_order_modifiers (
  id text primary key,
  order_item_id text not null references agent_order_items(id) on delete cascade,
  modifier_group_id text not null references canonical_modifier_groups(id),
  modifier_id text not null references canonical_modifiers(id),
  quantity integer not null check (quantity > 0)
);

create table if not exists order_validation_results (
  id text primary key,
  order_id text not null references agent_orders(id) on delete cascade,
  valid boolean not null,
  issues jsonb not null default '[]'::jsonb,
  checked_at timestamptz not null default now()
);

create table if not exists order_quotes (
  id text primary key,
  order_id text not null references agent_orders(id) on delete cascade,
  subtotal_cents integer not null,
  tax_cents integer not null,
  fees_cents integer not null,
  total_cents integer not null,
  currency text not null default 'USD',
  quoted_at timestamptz not null default now(),
  idempotency_key text
);

create table if not exists pos_order_submissions (
  id text primary key,
  order_id text not null references agent_orders(id) on delete cascade,
  provider text not null references pos_providers(id),
  status text not null check (status in ('pending', 'submitted', 'accepted', 'failed')),
  external_order_id text,
  response jsonb not null default '{}'::jsonb,
  payload_snapshot jsonb not null default '{}'::jsonb,
  attempt_count integer not null default 1,
  submitted_at timestamptz not null default now()
);

create table if not exists order_status_events (
  id text primary key,
  order_id text not null references agent_orders(id) on delete cascade,
  status text not null,
  message text not null,
  created_at timestamptz not null default now()
);

create table if not exists reporting_daily_metrics (
  id text primary key,
  restaurant_id text not null references restaurants(id) on delete cascade,
  date date not null,
  total_orders integer not null default 0,
  revenue_cents integer not null default 0,
  average_order_value_cents integer not null default 0,
  approval_rate numeric(5,4) not null default 0,
  success_rate numeric(5,4) not null default 0,
  rejected_orders integer not null default 0,
  average_lead_time_minutes integer not null default 0,
  upcoming_scheduled_order_volume integer not null default 0
);

create table if not exists audit_logs (
  id text primary key,
  restaurant_id text not null references restaurants(id) on delete cascade,
  actor_type text not null check (actor_type in ('manager', 'agent', 'system')),
  actor_id text not null,
  action text not null,
  target_type text not null,
  target_id text not null,
  summary text not null,
  created_at timestamptz not null default now()
);

create table if not exists api_idempotency_records (
  id text primary key,
  scope text not null check (scope in ('validate', 'quote', 'submit')),
  restaurant_id text not null references restaurants(id) on delete cascade,
  agent_id text not null references agents(id) on delete cascade,
  idempotency_key text not null,
  request_hash text not null,
  status text not null check (status in ('pending', 'completed', 'failed')),
  order_id text references agent_orders(id) on delete set null,
  response jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (scope, restaurant_id, agent_id, idempotency_key)
);

create table if not exists order_retry_attempts (
  id text primary key,
  order_id text references agent_orders(id) on delete cascade,
  stage text not null check (stage in ('quote', 'pos_submit', 'status_poll')),
  attempt_number integer not null,
  status text not null check (status in ('pending', 'succeeded', 'failed')),
  error_message text,
  payload_snapshot jsonb,
  response_snapshot jsonb,
  created_at timestamptz not null default now()
);

create table if not exists event_ingestion_records (
  id text primary key,
  provider text not null references pos_providers(id),
  event_type text not null,
  external_event_id text,
  order_id text references agent_orders(id) on delete set null,
  status text not null check (status in ('received', 'processed', 'failed', 'ignored')),
  payload jsonb not null,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);
