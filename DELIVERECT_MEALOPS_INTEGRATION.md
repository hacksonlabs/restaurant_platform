# Deliverect + MealOps Integration Contract

This document defines the practical contract Phantom now exposes between:

- restaurant-side integrations such as Deliverect
- customer-side agents such as `mealops_platform` / CoachImHungry

## Goal

Keep Phantom as the single restaurant-ordering gateway while letting:

- Deliverect provide restaurant/store/menu/checkout connectivity
- CoachImHungry discover restaurants, retrieve full menus, and place orders on behalf of customers

## External contract for CoachImHungry

All agent calls use `x-agent-api-key`.

### Discover restaurants

`GET /api/agent/restaurants`

Returns only restaurants where:

- agent ordering is enabled
- the agent has an `allowed` permission

Each result includes enough metadata to support discovery and routing:

- `id`
- `name`
- `location`
- `timezone`
- `posProvider`
- `fulfillmentTypesSupported`
- `defaultApprovalMode`
- `posConnectionStatus`

### Get full menu

`GET /api/agent/restaurants/:restaurantId/menu`

Returns the restaurant's canonical menu:

- items
- modifier groups
- modifiers
- provider mappings

### Validate order

`POST /api/agent/restaurants/:restaurantId/orders/validate`

Runs Phantom's restaurant rules and returns structured issues before quoting or submission.

### Quote order

`POST /api/agent/restaurants/:restaurantId/orders/quote`

Returns subtotal, tax, fees, and total using the configured provider adapter.

### Submit order

`POST /api/agent/restaurants/:restaurantId/orders/submit`

Creates the order inside Phantom, persists validation and quote state, and enters the restaurant approval / POS submission lifecycle.

### Poll order status

`GET /api/agent/orders/:orderId/status`

Returns Phantom's last known order state and latest provider order ID if available.

## Deliverect integration seam

Phantom now includes Deliverect adapters in `src/server/pos`:

- `DeliverectAdapterMock`
- `DeliverectAdapterLive`

The live adapter is shaped around Deliverect's current Commerce API flow:

1. Get stores
2. Get store menus
3. Create basket
4. Checkout basket
5. Receive asynchronous checkout updates

## Deliverect provider metadata

For a Deliverect-backed restaurant, `POSConnection.metadata` should carry:

- `deliverectAccountId`
- `deliverectStoreId`
- `deliverectChannelLinkId`

Environment fallbacks are also supported:

- `DELIVERECT_ACCOUNT_ID`
- `DELIVERECT_STORE_ID`
- `DELIVERECT_CHANNEL_LINK_ID`

## Inbound events

Phantom accepts provider event ingestion at:

- `POST /api/internal/events/toast`
- `POST /api/internal/events/deliverect`

That keeps webhook/event intake provider-specific without changing the core order service.

## Recommended next step

The remaining production step is to finish Deliverect payload normalization for:

- published menu ingestion into Phantom's canonical menu tables
- basket payload mapping from canonical items/modifiers to Deliverect PLUs
- checkout status webhook processing back into Phantom order timeline/status events
