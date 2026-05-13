# Phantom

Phantom is a production-oriented starter for a multi-tenant restaurant-side ordering gateway. It lets restaurants accept structured agent orders, validate them against restaurant rules, quote them, and route them into a POS adapter layer that now includes Toast and Deliverect seams.

## What is implemented

- React restaurant console with pages for dashboard, settings, POS connection, menu sync, ordering rules, incoming orders, order detail, agent management, and reporting.
- Structured REST API for restaurant admin and agent-facing flows.
- POS-agnostic adapter interface with Toast and Deliverect mock/live adapters plus an adapter registry.
- Structured order intent schema with Zod validation.
- Agent API key authentication with hashed key storage.
- Seeded demo tenant: LB Steakhouse.
- Seeded demo agent: Phantom.
- Seeded menu, mappings, order, audit trail, and reporting metrics.
- Postgres/Supabase-ready normalized schema in [db/schema.sql](/Users/akayla/Desktop/restaurant_platform/db/schema.sql).
- MCP readiness notes in [MCP_READY_ARCHITECTURE.md](/Users/akayla/Desktop/restaurant_platform/MCP_READY_ARCHITECTURE.md).
- Explicit MCP tool contract in [PHANTOM_MCP_TOOLS.md](/Users/akayla/Desktop/restaurant_platform/PHANTOM_MCP_TOOLS.md).

## Reference implementation notes

Before building, this repo was informed by an earlier internal implementation whose patterns were worth keeping:

- Toast environment scoping from `server/toast/config.mjs`
- Separation between Toast provider logic and menu normalization
- MCP-readiness ideas from the migration that added integration metadata

The new repo intentionally does not copy that earlier structure wholesale. It keeps the useful seams while simplifying the architecture around Phantom's restaurant-side gateway use case.

## Stack

- React + Vite + TypeScript
- Express + TypeScript
- Zod for server-side validation
- In-memory demo repository for local runability today
- Postgres/Supabase schema and seed guidance for real persistence next

## Local setup

1. Install dependencies:

```bash
npm install
```

2. Copy envs:

```bash
cp .env.example .env
```

3. Start the app:

```bash
npm run dev
```

4. Open:

- Console: [http://localhost:5173](http://localhost:5173)
- API health: [http://localhost:3030/api/health](http://localhost:3030/api/health)

## Supabase setup

The backend now reads `.env` directly when started through the npm scripts.

To switch from demo mode to your Supabase project:

1. Apply [db/schema.sql](/Users/akayla/Desktop/restaurant_platform/db/schema.sql) in the Supabase SQL editor.
2. Apply [db/seed.sql](/Users/akayla/Desktop/restaurant_platform/db/seed.sql) if you want the seeded Phantom demo dataset.
3. Set `DEMO_MODE=false` in `.env`.
4. Run `npm run db:check` to verify the required tables are available.
5. Start the app with `npm run dev` or `npm start`.

## Demo tenant

- Restaurant: `LB Steakhouse`
- Restaurant ID: `rest_lb_steakhouse`
- Agent: `CoachImHungry`
- Agent ID: `agent_coachimhungry`
- Demo API key: read from `DEMO_PHANTOM_API_KEY` in your local `.env`

## Example agent API flow

Validate:

```bash
curl -X POST http://localhost:3030/api/agent/restaurants/rest_lb_steakhouse/orders/validate \
  -H "Content-Type: application/json" \
  -H "x-agent-api-key: coachimhungry_demo_live_local_key" \
  --data @examples/sample-agent-order.json
```

Quote:

```bash
curl -X POST http://localhost:3030/api/agent/restaurants/rest_lb_steakhouse/orders/quote \
  -H "Content-Type: application/json" \
  -H "x-agent-api-key: coachimhungry_demo_live_local_key" \
  --data @examples/sample-agent-order.json
```

Submit:

```bash
curl -X POST http://localhost:3030/api/agent/restaurants/rest_lb_steakhouse/orders/submit \
  -H "Content-Type: application/json" \
  -H "x-agent-api-key: coachimhungry_demo_live_local_key" \
  --data @examples/sample-agent-order.json
```

Check status:

```bash
curl http://localhost:3030/api/agent/orders/<order-id>/status \
  -H "x-agent-api-key: coachimhungry_demo_live_local_key"
```

Discover restaurants:

```bash
curl http://localhost:3030/api/agent/restaurants \
  -H "x-agent-api-key: coachimhungry_demo_live_local_key"
```

## API surface

Restaurant/admin:

- `GET /api/restaurants`
- `GET /api/restaurants/:restaurantId`
- `PATCH /api/restaurants/:restaurantId`
- `GET /api/restaurants/:restaurantId/dashboard`
- `GET /api/restaurants/:restaurantId/pos-connection`
- `POST /api/restaurants/:restaurantId/pos-connection/test`
- `GET /api/restaurants/:restaurantId/menu`
- `POST /api/restaurants/:restaurantId/menu/sync`
- `GET /api/restaurants/:restaurantId/rules`
- `PATCH /api/restaurants/:restaurantId/rules`
- `GET /api/restaurants/:restaurantId/agents`
- `PATCH /api/restaurants/:restaurantId/agents/:agentId/permission`
- `GET /api/restaurants/:restaurantId/orders`
- `GET /api/restaurants/:restaurantId/orders/:orderId`
- `POST /api/restaurants/:restaurantId/orders/:orderId/approve`
- `POST /api/restaurants/:restaurantId/orders/:orderId/reject`
- `POST /api/restaurants/:restaurantId/orders/:orderId/submit-to-pos`
- `GET /api/restaurants/:restaurantId/reporting`

Agent-facing:

- `GET /api/agent/restaurants`
- `GET /api/agent/restaurants/:restaurantId/menu`
- `POST /api/agent/restaurants/:restaurantId/orders/validate`
- `POST /api/agent/restaurants/:restaurantId/orders/quote`
- `POST /api/agent/restaurants/:restaurantId/orders/submit`
- `GET /api/agent/orders/:orderId/status`

Provider events:

- `POST /api/internal/events/toast`
- `POST /api/internal/events/deliverect`

## Architecture notes

- `src/shared`: shared types and request schemas
- `src/server/pos`: provider-neutral adapter contract plus Toast adapters
- `src/server/pos`: provider-neutral adapter contract plus Toast and Deliverect adapters
- `src/server/services/platformService.ts`: ordering rules, validation, quote, and submission orchestration
- `src/server/repositories`: demo-mode seed data and repository state
- `src/client`: console UI

## Security notes

- Agent API keys are hashed with SHA-256 before storage.
- The frontend never receives raw stored keys.
- Manager actions and order state changes create audit log entries.
- Restaurant flows are scoped by restaurant ID and are structured so a real auth layer can enforce tenant membership cleanly.

## Deliverect and mealops integration

- Deliverect remote MCP server: [https://developers.deliverect.com/mcp](https://developers.deliverect.com/mcp)
- Deliverect Commerce API reference: [https://developers.deliverect.com/reference/commerce-channel-api](https://developers.deliverect.com/reference/commerce-channel-api)
- Phantom now exposes the minimum agent contract that `mealops_platform` / CoachImHungry needs:
  - restaurant discovery
  - full menu retrieval
  - order validation
  - quoting
  - hosted payment session start
  - order submission
  - order status polling
- Phantom's explicit MCP tool list is documented in [PHANTOM_MCP_TOOLS.md](/Users/akayla/Desktop/restaurant_platform/PHANTOM_MCP_TOOLS.md):
  - `search_restaurants`
  - `get_menu`
  - `validate_order`
  - `quote_order`
  - `start_payment`
  - `submit_order`
  - `get_order_status`

## Phantom MCP server

Run the local stdio MCP server with:

```bash
PHANTOM_MCP_AGENT_API_KEY=coachimhungry_demo_live_local_key npm run mcp:stdio
```

Notes:

- `PHANTOM_MCP_AGENT_API_KEY` is required because the MCP server runs as a specific Phantom agent principal.
- In demo mode, `coachimhungry_demo_live_local_key` works with the seeded CoachImHungry agent.
- In non-demo mode, provide a real Phantom agent API key with these scopes:
  - `restaurants:read`
  - `menus:read`
  - `orders:validate`
  - `orders:quote`
  - `orders:submit`
  - `orders:status`
- Deliverect live mode expects environment variables for:
  - `DELIVERECT_BASE_URL`
  - `DELIVERECT_ACCESS_TOKEN` or `DELIVERECT_CLIENT_ID` and `DELIVERECT_CLIENT_SECRET`
  - `DELIVERECT_ACCOUNT_ID`
  - `DELIVERECT_STORE_ID`
  - `DELIVERECT_CHANNEL_LINK_ID`

## Toast live follow-up

`ToastAdapterLive` is intentionally a placeholder-leaning scaffold. The next step is to wire it to real sandbox credentials using the same good seams preserved in Phantom:

- environment-specific config
- auth token acquisition
- menu normalization
- order validation / quote / submit transport

That work should happen without changing the core API or UI contracts.
