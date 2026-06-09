# Deliverect Channel Staging Handoff

Phantom treats Deliverect as a push-based Channel provider. Deliverect location/menu discovery, Commerce baskets, and Commerce cart APIs are intentionally outside the MVP flow.

## Staging Hosts

- Railway API/backend: `https://staging-phantom.up.railway.app`
- Netlify frontend: `https://staging.phantom.mealops.ai`
- Deliverect webhooks must target the Railway API host, not the Netlify frontend.

## Webhook URLs For Deliverect

Give Deliverect these staging URLs:

```text
Channel registration:
POST https://staging-phantom.up.railway.app/api/webhooks/deliverect/channel/register

Menu push:
POST https://staging-phantom.up.railway.app/api/webhooks/deliverect/channel/menu

Snooze/unsnooze:
POST https://staging-phantom.up.railway.app/api/webhooks/deliverect/channel/snooze

Busy mode:
POST https://staging-phantom.up.railway.app/api/webhooks/deliverect/channel/busy-mode

Order status updates:
POST https://staging-phantom.up.railway.app/api/webhooks/deliverect/channel/order-status

Prep time updates:
POST https://staging-phantom.up.railway.app/api/webhooks/deliverect/channel/prep-time

Courier/guest status:
POST https://staging-phantom.up.railway.app/api/webhooks/deliverect/channel/courier

Payment updates, if Deliverect sends them:
POST https://staging-phantom.up.railway.app/api/webhooks/deliverect/channel/payment
```

`GET https://staging-phantom.up.railway.app/api/webhooks/deliverect/channel` returns the callback URL map Phantom sends during Channel registration.

## Webhook Responses

- Channel registration returns HTTP 200 with Deliverect callback URLs: `statusUpdateURL`, `menuUpdateURL`, `snoozeUnsnoozeURL`, `busyModeURL`, `updatePrepTimeURL`, `courierUpdateURL`, and `paymentUpdateURL`.
- Registration is idempotent by Deliverect event ID when present, otherwise payload hash. Replays update/link the same provider location and return the same URL shape.
- Menu push stores a raw `provider_menu_snapshots` row before normalization. Successful processing returns HTTP 200 with `ok`, `snapshotId`, `menuVersionId`, `channelLinkId`, `providerLocationId`, `restaurantId`, item/modifier counts, and mapping review count.
- Duplicate menu pushes return HTTP 200 with `duplicate: true`, the new ignored `snapshotId`, and `previousSnapshotId`.
- Failed menu normalization marks the raw snapshot and provider event as `failed`, does not publish a canonical menu version, and returns HTTP 400 through the API error handler.
- Order status, prep-time, courier, and payment webhooks return HTTP 200 with an ingestion record summary. Unknown provider statuses are stored for inspection and do not mutate Phantom order state.
- Snooze/unsnooze and busy-mode webhooks return HTTP 200 with provider location context and changed item/status counts.

Webhook verification supports Deliverect HMAC headers (`X-Server-Authorization-HMAC-SHA256`, `x-deliverect-hmac-sha256`, or `x-deliverect-signature`) using `DELIVERECT_WEBHOOK_SECRET` or the payload `channelLinkId` as a candidate secret. If Deliverect sends the shared-secret header flow, Phantom checks `x-deliverect-webhook-secret` or `x-provider-webhook-secret`.

## Required Staging Environment Variables

Set these on Railway staging only:

```bash
DEMO_MODE=false
POS_MODE=live
PORT=<Railway-provided>
VITE_APP_URL=https://staging.phantom.mealops.ai
DELIVERECT_WEBHOOK_BASE_URL=https://staging-phantom.up.railway.app
PUBLIC_BASE_URL=https://staging-phantom.up.railway.app

DATABASE_URL=<staging pooled Postgres URL>
SUPABASE_URL=<staging Supabase project URL>
SUPABASE_ANON_KEY=<staging anon key>
SUPABASE_SERVICE_ROLE_KEY=<staging service role key>

DELIVERECT_SCOPE=mealops
DELIVERECT_BASE_URL=<Deliverect staging/sandbox API base URL>
DELIVERECT_ACCESS_TOKEN=<optional staging access token>
DELIVERECT_CLIENT_ID=<optional staging OAuth client id>
DELIVERECT_CLIENT_SECRET=<optional staging OAuth client secret>
DELIVERECT_AUDIENCE=<optional Deliverect OAuth audience>
DELIVERECT_GRANT_TYPE=token
DELIVERECT_WEBHOOK_SECRET=<optional Deliverect webhook/signature secret>

DELIVERECT_REQUEST_TIMEOUT_MS=10000
POS_RETRY_BASE_DELAY_MS=75
POSTGRES_POOL_MAX=3
POSTGRES_POOL_IDLE_TIMEOUT_MS=10000
POSTGRES_POOL_CONNECTION_TIMEOUT_MS=5000
POSTGRES_POOL_MAX_LIFETIME_SECONDS=60
MCP_ALLOWED_HOSTS=https://staging.phantom.mealops.ai
```

`DELIVERECT_ACCOUNT_ID`, `DELIVERECT_STORE_ID`, and `DELIVERECT_CHANNEL_LINK_ID` are optional fallback/manual debugging values. The Channel MVP should normally resolve provider account/location/channel-link data from registration webhooks and mapped provider locations.

## Database Readiness

`db/schema.sql` is the migration source for this repo. It includes:

- `provider_accounts` and `provider_locations` with `channel_link_id` and provider IDs.
- `provider_menu_snapshots` for every raw Deliverect menu payload, hash, event ID, status, error, received time, and processed time.
- `canonical_menu_versions` with draft/published/retired status.
- `menu_version_id`, `sort_order`, and tax metadata on canonical menu records.
- `payload_hash` on `event_ingestion_records`.
- provider/source metadata on `order_status_events`.
- retry, submission, event, provider-location, menu-snapshot, and menu-version indexes for staging debugging.

Startup readiness checks now assert the Channel tables and columns when `DEMO_MODE=false`. Existing staging data is preserved because schema changes use `create table if not exists`, `alter table add column if not exists`, and additive indexes.

## End-To-End Channel Flow

```text
Deliverect Channel registration webhook
  -> Phantom upserts provider account/location/channelLinkId
  -> Phantom returns Railway webhook URLs
  -> Deliverect sends menu push
  -> Phantom stores raw menu snapshot
  -> Phantom normalizes into canonical menu records and Deliverect mappings
  -> Phantom publishes a new canonical menu version
  -> CoachImHungry reads Phantom canonical restaurant/menu/rules data
  -> Phantom validates cart against latest published menu version
  -> Phantom transforms the canonical order into a Deliverect Channel order payload
  -> Phantom submits to Deliverect with channelName + channelLinkId
  -> Deliverect sends status/availability webhooks
  -> Phantom appends provider event and order status/audit history
```

## Order Submission Safety

- `channelLinkId` is copied from the linked provider location into POS connection metadata and included in the Deliverect Channel order payload.
- `channelName` comes from the provider location, connection metadata, or `DELIVERECT_SCOPE`.
- Duplicate Phantom POS submissions reuse a prior non-failed provider submission with an external Deliverect order ID.
- Transient Deliverect create-order responses (`408`, `429`, `5xx`, and timeout errors) are retried with recorded `order_retry_attempts`.
- Permanent create-order failures are stored as failed `pos_order_submissions` with safe request/response snapshots.
- Unknown Deliverect status webhooks are stored as provider events and do not corrupt Phantom order state.

## Menu And Cart Safety

- Raw menu payloads are stored before normalization.
- Failed menu normalization does not replace the current published menu.
- New canonical menu versions force stale carts to revalidate using `metadata.menu_version_id`, `metadata.menuVersionId`, or `metadata.canonical_menu_version_id`.
- Item availability, modifier availability, required modifiers, and min/max modifier rules are enforced for versioned Deliverect menus.
- Provider mappings preserve Deliverect item/modifier-group/modifier PLUs or external refs for Channel order payload transformation.

## Admin Debug Surfaces

- `GET /api/admin/provider-accounts`
- `GET /api/admin/provider-locations`
- `POST /api/admin/provider-locations/:providerLocationId/map`
- `POST /api/admin/provider-locations/:providerLocationId/provision`
- `GET /api/admin/provider-events`
- `GET /api/admin/provider-events/:eventId`
- `GET /api/admin/provider-menu-snapshots`
- `GET /api/admin/provider-menu-snapshots/:snapshotId`
- `GET /api/admin/canonical-menu-versions`
- `GET /api/restaurants/:restaurantId/operations/diagnostics`
- `GET /api/restaurants/:restaurantId/orders/:orderId`

## Confirmed By Automated Tests

- Duplicate Channel registration webhook.
- Duplicate menu push webhook.
- Failed menu normalization.
- Menu version drift/stale cart.
- Unavailable item validation.
- Required and max modifier validation.
- Duplicate order submission reuse.
- Deliverect create-order transient failure then retry success.
- Deliverect create-order permanent failure.
- Order status webhook replay.
- Unknown provider status handling.
- Busy mode update.
- Snooze and unsnooze update.

## Still Requires Deliverect Sandbox Testing

- Confirm exact Deliverect Channel registration payload field names in the sandbox.
- Confirm the final Deliverect create-order endpoint path for the assigned `DELIVERECT_SCOPE`.
- Confirm whether Deliverect will sign webhooks with HMAC, shared secret, `channelLinkId`, or another staging secret.
- Confirm order type numbers, payment fields, tax/fee fields, and courier/prep-time payload shapes against the assigned sandbox account.
- Send one real menu push and one real sandbox order through Deliverect before enabling restaurant-facing staging demos.
