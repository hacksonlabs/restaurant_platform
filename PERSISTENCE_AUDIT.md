# Persistence Audit

Date: 2026-05-05

## Summary

Phantom now routes persistent restaurant/admin and agent ordering flows through `SupabasePlatformRepository` when `DEMO_MODE=false`.

Verified:

- `src/server/index.ts` selects `SupabasePlatformRepository` when `DEMO_MODE=false`.
- `PlatformService` depends on the `PlatformRepository` interface and no longer reads `repository.state` directly.
- Remaining `InMemoryPlatformRepository` references are limited to:
  - `src/server/index.ts` demo-mode selection
  - `src/server/repositories/platformRepository.ts` in-memory implementation
  - `tests/platformService.test.ts` test fixture

## Runtime Audit

Repository-backed runtime paths verified:

- restaurants
- POS connection reads and updates
- menu, modifier groups, modifiers, and POS mappings
- ordering rules
- agent permissions and API key auth
- order creation and lifecycle reads
- order detail joins for items, modifiers, quotes, validation results, submissions, and status events
- audit logs
- reporting snapshots

## Persistence Findings

### Confirmed persistent flows

- `submitAgentOrder` persists:
  - `agent_orders`
  - `agent_order_items`
  - `agent_order_modifiers`
  - `order_validation_results`
  - `order_quotes`
  - `order_status_events`
  - `audit_logs`

- `submitOrderToPOS` persists:
  - `pos_order_submissions`
  - follow-up `order_status_events`
  - order status transitions on `agent_orders`

- Reporting metrics are now refreshed from live order data and stored back into `reporting_daily_metrics`.

### Deliberate behavior

- Standalone `/validate` and `/quote` requests remain pre-submit checks against canonical order payloads.
- Persistent validation/quote lifecycle storage is guaranteed on the order submission path, which is the canonical order creation flow.

## Smoke Verification

Executed `npm run smoke:e2e` against a temporary Supabase-backed local server.

Verified sequence:

1. Restaurant admin session login succeeds.
2. LB Steakhouse loads through the admin API.
3. Menu and POS mappings load from persisted data.
4. Agent `/validate` succeeds.
5. Agent `/quote` succeeds.
6. Agent `/submit` creates a persistent order.
7. Admin `/approve` transitions approval-required orders.
8. Admin `/submit-to-pos` records a POS submission.
9. Agent `/status` returns persisted lifecycle state and external order id.
10. Admin `/reporting` reflects the new order activity.

Observed smoke result:

- final status: `accepted`
- external order id: `toast_mock_smoke-...`
- reporting snapshot count increased with the new persisted order date

## Residual Risks

- `ToastLiveAdapter` is scaffolded and diagnostics-backed, but still awaits real sandbox credentials, location metadata, and production mapping validation.
- Reporting is derived from orders and persisted into `reporting_daily_metrics`; if historical backfills are needed later, a dedicated refresh job may still be useful.
- Quote expiry is enforced before POS submission with a 15 minute freshness window.
