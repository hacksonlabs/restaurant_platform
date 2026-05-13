# MCP Ready Architecture

This platform deliberately keeps the restaurant ordering gateway behind a structured REST API so future MCP tooling can wrap it without changing restaurant-side business logic.

## Design principles

- MCP should be a thin protocol wrapper around the core API, not a second order-processing engine.
- Agent authentication, permission checks, rule validation, quoting, and POS submission should continue to live in the core platform.
- MCP tool responses should mirror existing REST responses closely to avoid divergent behavior.
- The shared order intent schema is already structured enough to map directly into MCP inputs.

## Explicit MCP tool contract

The concrete tool contract now lives in [PHANTOM_MCP_TOOLS.md](/Users/akayla/Desktop/restaurant_platform/PHANTOM_MCP_TOOLS.md).

## Future MCP tools

### `search_restaurants`

- Wrap `GET /api/agent/restaurants`
- Filter or scope restaurants based on manager-approved exposure rules later if public discovery is required.

### `get_menu`

- Wrap `GET /api/agent/restaurants/:restaurantId/menu`
- Reuse existing API key authentication or map MCP principal identity to a platform agent identity.

### `validate_order`

- Wrap `POST /api/agent/restaurants/:restaurantId/orders/validate`
- Return structured validation issues exactly as the core API produces them.

### `quote_order`

- Wrap `POST /api/agent/restaurants/:restaurantId/orders/quote`
- Preserve quote totals and warnings so agent behavior stays deterministic across REST and MCP.

### `start_payment`

- Back a hosted payment start with the same Phantom service layer and provider adapters.
- For restaurant-MOR providers such as Deliverect Pay, keep the restaurant gateway in control and return a redirect URL plus payment reference.

### `submit_order`

- Wrap `POST /api/agent/restaurants/:restaurantId/orders/submit`
- Keep approval routing, audit logging, and order status transitions inside the platform service.

### `get_order_status`

- Wrap `GET /api/agent/orders/:orderId/status`
- MCP callers should poll the same order status lifecycle as direct REST clients.

## Recommended v1 tool set

- `search_restaurants`
- `get_menu`
- `validate_order`
- `quote_order`
- `start_payment`
- `submit_order`
- `get_order_status`

## Implementation notes

- Introduce an MCP adapter/controller layer later that translates MCP tool calls into authenticated internal REST or direct service calls.
- Keep tenant scoping explicit in tool inputs and server-side enforcement.
- Reuse the shared TypeScript schemas for request validation to avoid tool/API drift.
- If MCP introduces session state later, store it separately from order state.
