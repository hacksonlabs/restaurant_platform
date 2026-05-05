# MCP Ready Architecture

This platform deliberately keeps the restaurant ordering gateway behind a canonical REST API so future MCP tooling can wrap it without changing restaurant-side business logic.

## Design principles

- MCP should be a thin protocol wrapper around the canonical API, not a second order-processing engine.
- Agent authentication, permission checks, rule validation, quoting, and POS submission should continue to live in the core platform.
- MCP tool responses should mirror existing REST responses closely to avoid divergent behavior.
- The canonical order intent schema is already structured enough to map directly into MCP inputs.

## Future MCP tools

### `search_restaurants`

- Wrap `GET /api/restaurants`
- Filter or scope restaurants based on manager-approved exposure rules later if public discovery is required.

### `get_menu`

- Wrap `GET /api/agent/restaurants/:restaurantId/menu`
- Reuse existing API key authentication or map MCP principal identity to a platform agent identity.

### `validate_order`

- Wrap `POST /api/agent/restaurants/:restaurantId/orders/validate`
- Return structured validation issues exactly as the canonical API produces them.

### `quote_order`

- Wrap `POST /api/agent/restaurants/:restaurantId/orders/quote`
- Preserve canonical quote totals and warnings so agent behavior stays deterministic across REST and MCP.

### `submit_order`

- Wrap `POST /api/agent/restaurants/:restaurantId/orders/submit`
- Keep approval routing, audit logging, and order status transitions inside the platform service.

### `get_order_status`

- Wrap `GET /api/agent/orders/:orderId/status`
- MCP callers should poll the same order status lifecycle as direct REST clients.

## Implementation notes

- Introduce an MCP adapter/controller layer later that translates MCP tool calls into authenticated internal REST or direct service calls.
- Keep tenant scoping explicit in tool inputs and server-side enforcement.
- Reuse the shared TypeScript schemas for request validation to avoid tool/API drift.
- If MCP introduces session state later, store it separately from canonical order state.
