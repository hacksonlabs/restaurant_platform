# Order Lifecycle

## Core flow

1. Agent calls `validate`
2. Agent calls `quote`
3. Agent calls `submit`
4. Phantom persists the order graph
5. Restaurant approves or rejects if needed
6. Phantom submits to POS
7. Phantom tracks status and audit trail

## Persisted lifecycle records

- `agent_orders`
- `agent_order_items`
- `agent_order_modifiers`
- `order_validation_results`
- `order_quotes`
- `pos_order_submissions`
- `order_status_events`
- `audit_logs`
- `api_idempotency_records`
- `order_retry_attempts`

## Order states

- `received`
- `needs_approval`
- `approved`
- `submitting_to_pos`
- `submitted_to_pos`
- `accepted`
- `rejected`
- `failed`

## Idempotency

Agent validate, quote, and submit flows are idempotent.

Default idempotency key behavior:

- validate: `validate:<external_order_reference>`
- quote: `quote:<external_order_reference>`
- submit: `submit:<external_order_reference>`

If `metadata.idempotency_key` is supplied, Phantom uses that instead.

## Timeline view

Order detail now aggregates:

- status changes
- validation records
- quote records
- submission attempts
- retry attempts
- audit logs

This is intended to support operator debugging without switching tools.
