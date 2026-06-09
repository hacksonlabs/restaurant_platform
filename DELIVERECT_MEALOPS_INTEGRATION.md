# Deliverect Channel Integration Contract

Phantom treats Deliverect as a push-based Channel provider.

## Core Flow

```text
Deliverect Channel registration/menu webhooks
  -> Phantom provider account/location + raw menu snapshot
  -> Phantom canonical menu version
  -> CoachImHungry cart
  -> Phantom validation/quote/order
  -> Deliverect Channel order submission
  -> Deliverect status/availability webhooks
```

Phantom owns restaurant, menu, cart, validation, order, and status abstractions. Agents never call Deliverect and never receive raw Deliverect account/location objects.

## Deliverect Webhook Endpoints

Configure Deliverect to call:

```text
POST /api/internal/deliverect/channel/register
POST /api/internal/deliverect/channel/menu
POST /api/internal/deliverect/channel/order-status
POST /api/internal/deliverect/channel/snooze
POST /api/internal/deliverect/channel/busy-mode
POST /api/internal/deliverect/channel/prep-time
POST /api/internal/deliverect/channel/courier
POST /api/internal/deliverect/channel/payment
```

`GET /api/internal/deliverect/channel/webhooks` returns the URL map Phantom sends back during Channel registration.

## Persistence

- `provider_accounts`: Deliverect account-level identity.
- `provider_locations`: Deliverect Channel location/link identity, including `channel_link_id`.
- `provider_menu_snapshots`: every incoming raw menu payload, hash, event ID, status, and processing error.
- `canonical_menu_versions`: published Phantom menu versions derived from snapshots.
- `canonical_menu_items`, `canonical_modifier_groups`, `canonical_modifiers`, `pos_menu_mappings`: Phantom canonical menu and Deliverect PLU/ref mappings.
- `event_ingestion_records`: idempotent webhook audit trail.
- `order_status_events`: canonical status history with provider event metadata.

## Agent API

All agent calls use `x-agent-api-key`.

- `GET /api/agent/restaurants`
- `GET /api/agent/restaurants/:restaurantId`
- `GET /api/agent/restaurants/:restaurantId/menu`
- `POST /api/agent/restaurants/:restaurantId/orders/validate`
- `POST /api/agent/restaurants/:restaurantId/orders/quote`
- `POST /api/agent/restaurants/:restaurantId/orders/submit`
- `GET /api/agent/orders/:orderId/status`

The detail and menu endpoints return Phantom canonical data and menu version metadata.

## Admin Debug API

- `GET /api/admin/provider-accounts`
- `GET /api/admin/provider-locations`
- `POST /api/admin/provider-locations/:providerLocationId/map`
- `GET /api/admin/provider-events`
- `GET /api/admin/provider-events/:eventId`
- `GET /api/admin/provider-menu-snapshots`
- `GET /api/admin/provider-menu-snapshots/:snapshotId`
- `GET /api/admin/canonical-menu-versions`
- `GET /api/restaurants/:restaurantId/operations/diagnostics`
- `GET /api/restaurants/:restaurantId/orders/:orderId`

## Notes

- Deliverect location/menu discovery is intentionally not part of the MVP core flow.
- Deliverect order submission uses Channel order creation with `channelName` and `channelLinkId` from the mapped provider location.
- Webhook idempotency uses provider event ID when present, otherwise a stable payload hash.
- Cart validation is always performed against the latest published Phantom canonical menu version and restaurant rules.
