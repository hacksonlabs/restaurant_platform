# Phantom MCP Tools

This document makes Phantom's MCP tool surface explicit for external agent teams such as CoachImHungry.

It is intentionally a thin wrapper over Phantom's existing REST API. MCP should not introduce separate ordering logic.

## Authentication

- Every tool call must resolve to a Phantom agent identity.
- The simplest mapping is one Phantom agent API key per MCP principal.
- Required scopes stay the same as the REST API.

## Tool list

### `search_restaurants`

Purpose:
Return restaurants the calling agent is allowed to discover and order from.

Maps to:
`GET /api/agent/restaurants`

Required scope:
`restaurants:read`

Input:

```json
{
  "query": "optional free-text restaurant or location search",
  "fulfillment_type": "pickup | delivery | catering",
  "limit": 20
}
```

Notes:

- `query` and `limit` are optional MCP-layer filters.
- The underlying REST endpoint already enforces restaurant permission and agent-ordering enablement.

Output:

```json
{
  "restaurants": [
    {
      "id": "rest_lb_steakhouse",
      "name": "LB Steakhouse",
      "location": "Redwood City, CA",
      "timezone": "America/Los_Angeles",
      "posProvider": "toast",
      "fulfillmentTypesSupported": ["pickup", "catering"],
      "defaultApprovalMode": "threshold_review",
      "agentOrderingEnabled": true,
      "posConnectionStatus": "sandbox",
      "permissionStatus": "allowed",
      "agent": {
        "id": "agent_phantom",
        "slug": "phantom",
        "name": "Phantom"
      }
    }
  ]
}
```

### `get_menu`

Purpose:
Return the full canonical restaurant menu, including items, modifier groups, modifiers, and provider mappings.

Maps to:
`GET /api/agent/restaurants/:restaurantId/menu`

Required scope:
`menus:read`

Input:

```json
{
  "restaurant_id": "rest_lb_steakhouse"
}
```

Output:

```json
{
  "items": [],
  "modifierGroups": [],
  "modifiers": [],
  "mappings": []
}
```

### `validate_order`

Purpose:
Run Phantom rule validation before quote or submit.

Maps to:
`POST /api/agent/restaurants/:restaurantId/orders/validate`

Required scope:
`orders:validate`

Input:

```json
{
  "restaurant_id": "rest_lb_steakhouse",
  "order": {
    "restaurant_id": "rest_lb_steakhouse",
    "agent_id": "agent_phantom",
    "external_order_reference": "coachimhungry-order-1001",
    "customer": {
      "name": "Avery",
      "email": "avery@example.com"
    },
    "fulfillment_type": "pickup",
    "requested_fulfillment_time": "2026-05-11T19:00:00.000Z",
    "headcount": 2,
    "payment_policy": "required_before_submit",
    "items": [
      {
        "item_id": "item_filet",
        "quantity": 1,
        "modifiers": []
      }
    ],
    "dietary_constraints": [],
    "substitution_policy": "strict",
    "metadata": {}
  }
}
```

Output:

```json
{
  "id": "ovr_123",
  "orderId": "order_123",
  "valid": true,
  "issues": [],
  "checkedAt": "2026-05-10T21:00:00.000Z"
}
```

### `quote_order`

Purpose:
Return pricing for a valid order using Phantom's configured provider adapter.

Maps to:
`POST /api/agent/restaurants/:restaurantId/orders/quote`

Required scope:
`orders:quote`

Input:

```json
{
  "restaurant_id": "rest_lb_steakhouse",
  "order": {}
}
```

Output:

```json
{
  "id": "quote_123",
  "orderId": "order_123",
  "subtotalCents": 2500,
  "taxCents": 225,
  "feesCents": 0,
  "totalCents": 2725,
  "currency": "USD",
  "quotedAt": "2026-05-10T21:00:00.000Z"
}
```

### `start_payment`

Purpose:
Start a restaurant-owned hosted payment session before the final order submit.

Maps to:
MCP-only flow backed by Phantom's provider adapter. For Deliverect-backed restaurants, this is intended to use the restaurant's configured Deliverect Pay gateway so the restaurant can remain merchant of record.

Required scope:
`payments:start`

Input:

```json
{
  "restaurant_id": "rest_lb_steakhouse",
  "order": {},
  "success_url": "https://coachimhungry.example/order/success?orderId=abc123",
  "cancel_url": "https://coachimhungry.example/shopping-cart-checkout?cartId=cart_123"
}
```

Output:

```json
{
  "ok": true,
  "status": "redirect_required",
  "redirectUrl": "https://payments.example/session/abc123",
  "paymentReference": "pay_123",
  "totalCents": 2725,
  "currency": "USD",
  "message": "Hosted payment session created.",
  "raw": {}
}
```

### `submit_order`

Purpose:
Create the order in Phantom and enter the normal approval and provider-submission lifecycle.

Maps to:
`POST /api/agent/restaurants/:restaurantId/orders/submit`

Required scope:
`orders:submit`

Input:

```json
{
  "restaurant_id": "rest_lb_steakhouse",
  "order": {}
}
```

Output:

```json
{
  "id": "order_123",
  "restaurantId": "rest_lb_steakhouse",
  "agentId": "agent_phantom",
  "externalOrderReference": "coachimhungry-order-1001",
  "status": "needs_approval",
  "approvalRequired": true,
  "totalEstimateCents": 2725,
  "createdAt": "2026-05-10T21:00:00.000Z",
  "updatedAt": "2026-05-10T21:00:00.000Z"
}
```

### `get_order_status`

Purpose:
Return Phantom's last known order state and latest provider order identifier.

Maps to:
`GET /api/agent/orders/:orderId/status`

Required scope:
`orders:status`

Input:

```json
{
  "order_id": "order_123"
}
```

Output:

```json
{
  "orderId": "order_123",
  "status": "accepted",
  "totalEstimateCents": 2725,
  "externalOrderId": "toast_mock_coachimhungry-order-1001",
  "updatedAt": "2026-05-10T21:05:00.000Z"
}
```

## Canonical behavior rules

- MCP responses should mirror the REST payloads as closely as possible.
- Tool-level filtering is acceptable for convenience, but authorization must stay server-side.
- `start_payment` should be used after quote and before submit when the restaurant requires prepaid checkout.
- `submit_order` must not bypass Phantom approval rules.
- `get_order_status` should expose Phantom's order lifecycle, not raw provider-only state.
- Deliverect, Toast, and future providers should stay behind the same tool contract.

## Recommended first implementation

Stand up a Phantom MCP server that exposes exactly these seven tools:

1. `search_restaurants`
2. `get_menu`
3. `validate_order`
4. `quote_order`
5. `start_payment`
6. `submit_order`
7. `get_order_status`

Each tool should call the existing REST endpoint internally and translate auth/context into a Phantom agent API key.
