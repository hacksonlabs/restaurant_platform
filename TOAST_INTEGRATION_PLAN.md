# Toast Integration Plan

## Goal

Prepare Phantom to switch from `POS_MODE=mock` to `POS_MODE=live` without changing the canonical API or frontend flows.

## Current State

- `ToastAdapterMock` remains the default development path.
- `ToastAdapterLive` now has:
  - config validation
  - optional access-token reuse
  - client-credential auth scaffolding
  - canonical order → Toast order mapping scaffold
  - `/orders/v2/prices` before `/orders/v2/orders`
  - `/orders/v2/orders/{guid}` status lookup
  - adapter diagnostics

## Required Environment

Add these to `.env`:

- `POS_MODE=mock|live`
- `TOAST_BASE_URL`
- `TOAST_CLIENT_ID`
- `TOAST_CLIENT_SECRET`
- `TOAST_RESTAURANT_GUID`
- `TOAST_LOCATION_ID`
- `TOAST_MANAGEMENT_GROUP_GUID`
- `TOAST_ACCESS_TOKEN` optional
- `TOAST_WEBHOOK_SECRET` optional

Reference template: [.env.example](/Users/akayla/Desktop/restaurant_platform/.env.example)

## Flow

1. Authenticate to Toast.
2. Build a Toast `Order` payload from `CanonicalOrderIntent`.
3. Call `POST /orders/v2/prices`.
4. Persist Phantom quote data.
5. Call `POST /orders/v2/orders`.
6. Persist Toast order GUID into `pos_order_submissions.external_order_id`.
7. Read status via `GET /orders/v2/orders/{guid}`.

## Readiness Gates

Before live submission Phantom now checks:

- restaurant permission is still allowed
- order status is `approved`
- quote exists
- quote is fresh
- external order reference is unique
- requested fulfillment time is valid and in the future
- item, modifier group, and modifier mappings are present and marked `mapped`

## Diagnostics

Admin diagnostics endpoint:

- `GET /api/restaurants/:restaurantId/pos-diagnostics`

Current checks:

- config presence
- restaurant GUID presence
- menu sync readiness
- quote readiness
- submit readiness
- live auth readiness when live credentials are present

## Known Gaps Before First Real Sandbox Order

- Dining option, revenue center, and any location-specific Toast metadata may still need to be added to `pos_connections.metadata`.
- Modifier group and modifier payload mapping currently uses the canonical seam and will need sandbox confirmation against real Toast configuration data.
- Toast payment handling is intentionally limited to unpaid/manual-open style flows first.
- Webhook processing is not implemented yet.

## Official Toast References

- Toast orders API overview: [Orders API overview](https://doc.toasttab.com/openapi/orders/overview/)
- Pricing before order creation: [Order prices developer guide](https://doc.toasttab.com/doc/devguide/apiOrderPrices.html)
- First order sequence and required headers: [Submitting your first order](https://doc.toasttab.com/doc/devguide/apiOrdersFirstOrder.html)
- Auth endpoint and machine client body: [Get an authentication token](https://doc.toasttab.com/openapi/authentication/operation/authenticationLoginPost/)
- Order timestamps and `promisedDate`: [Order object summary](https://doc.toasttab.com/doc/devguide/apiOrdersOrderObjectSummary.html)
- Scope requirements: [Toast API scopes](https://doc.toasttab.com/doc/devguide/apiScopes.html)
