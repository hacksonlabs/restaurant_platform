# Operations Runbook

## Purpose

This runbook covers the day-to-day operating model for Phantom during restaurant pilot usage.

## Core services

- Frontend console: Vite client on `5174` in local development
- Backend API: Express service on `3031` in local development
- Persistence: Supabase Postgres when `DEMO_MODE=false`
- Operator auth: Supabase Auth
- POS adapter: `toast` in `mock` or `live` mode

## Startup checks

1. Confirm `.env` contains valid:
   - `DEMO_MODE`
   - `DATABASE_URL`
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - Toast variables if using live mode
2. Verify schema readiness:
   - `npm run db:check`
3. Start backend:
   - `npm start`
4. Start frontend:
   - `npm run dev:client`

## Key operational endpoints

- Health: `GET /api/health`
- POS diagnostics: `GET /api/restaurants/:restaurantId/pos-diagnostics`
- Operations diagnostics: `GET /api/restaurants/:restaurantId/operations/diagnostics`
- Replay failed submit: `POST /api/restaurants/:restaurantId/orders/:orderId/replay-submit`
- Refresh order status: `POST /api/restaurants/:restaurantId/orders/:orderId/refresh-status`
- Event ingestion scaffold: `POST /api/internal/events/:provider`

## Common failures

### Login fails

Check:

- Supabase Auth user exists and is confirmed
- Phantom `operator_users` and `operator_memberships` are present
- `SUPABASE_ANON_KEY` is configured for backend use

### Quote fails

Check:

- restaurant ordering enabled
- agent permission status is `allowed`
- item/modifier validity
- Toast live credentials if `POS_MODE=live`
- retry attempts in the order detail diagnostics

### POS submit fails

Check:

- order is `approved`
- stored quote exists and is fresh
- external order reference is unique
- menu mappings are complete
- agent and restaurant are still eligible for ordering
- payload snapshot in order diagnostics

### Stuck orders

Review:

- `/operations/diagnostics`
- order timeline on order detail page
- `order_status_events`
- `order_retry_attempts`

## Recovery actions

- Use `Replay Failed` from the order detail screen to retry POS submission
- Use `Refresh Status` to force a POS status poll
- Inspect the raw order details and mapped payload snapshot on the order detail page

## Logging model

Phantom emits structured JSON logs for:

- `http_request`
- `order_validation`
- `order_quote`
- `order_submit`
- `pos_submission`
- `order_approved`
- `order_rejected`
- auth failures

Each log line includes enough context to follow an order by `orderId` or `correlationId`.
