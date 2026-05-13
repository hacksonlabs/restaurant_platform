# Failure Recovery

## Goal

Phantom should fail safely, preserve context, and allow operators to recover without losing the order trail.

## What is preserved

When operational failures occur, Phantom preserves:

- submitted order details
- validation results
- quotes
- status events
- submission response
- payload snapshot used for POS submission
- retry attempt history
- audit logs

## Failure classes

### Validation failure

- No POS submit is attempted
- Validation result is returned with issues
- Submit flow is blocked

### Quote failure

- Retry attempts are recorded
- Quote result is not persisted as successful
- Order remains safe to retry

### POS submission failure

- Failure status is preserved
- Submission payload snapshot is preserved
- Response payload is preserved
- Operator can replay the order submission

### Status polling failure

- Retry attempts are recorded
- Last known order state is preserved
- Operator can manually refresh status

## Recovery tools

- Order detail page:
  - `Replay Failed`
  - `Refresh Status`
  - timeline
  - diagnostics payload block
- Admin API:
  - `POST /api/restaurants/:restaurantId/orders/:orderId/replay-submit`
  - `POST /api/restaurants/:restaurantId/orders/:orderId/refresh-status`

## Safe retry conditions

Phantom retries only when the error appears transient, such as:

- timeouts
- temporary upstream failures
- `429`
- `5xx`-class behavior

Retries use exponential backoff and bounded attempt counts.

## Duplicate prevention

Submit flow protections include:

- idempotency records
- external order reference uniqueness checks
- quote freshness checks
- approval state checks
