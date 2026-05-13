# Toast Submission Flow

## Current model

Phantom keeps the Toast integration behind the POS adapter seam.

Relevant files:

- [src/server/pos/base.ts](/Users/akayla/Desktop/restaurant_platform/src/server/pos/base.ts)
- [src/server/pos/toastMock.ts](/Users/akayla/Desktop/restaurant_platform/src/server/pos/toastMock.ts)
- [src/server/pos/toastLive.ts](/Users/akayla/Desktop/restaurant_platform/src/server/pos/toastLive.ts)

## Mock mode

`POS_MODE=mock`

- deterministic validation and pricing
- deterministic accept response
- safe for local development

## Live mode

`POS_MODE=live`

Expected sequence:

1. Phantom validates the submitted order
2. Phantom checks mappings and readiness
3. Phantom calls Toast pricing endpoint
4. Phantom stores quote
5. Phantom submits to Toast orders endpoint
6. Phantom stores response and payload snapshot
7. Phantom can poll Toast order status

## Preconditions before live submit

- order approved
- quote exists
- quote is fresh
- restaurant ordering enabled
- agent permission still allowed
- menu mappings complete
- unique external order reference
- future requested fulfillment time

## Payload debugging

Phantom preserves:

- submitted order details
- quote snapshot
- POS payload snapshot
- Toast response payload

These are surfaced in order diagnostics and timeline data for recovery.

## Retry model

- quote retries: enabled for transient failures
- submit retries: enabled for transient failures
- status polling retries: enabled for transient failures

Retries are bounded and recorded in `order_retry_attempts`.

## Future webhook readiness

Event ingestion scaffolding exists for future Toast webhooks:

- `event_ingestion_records`
- event handler registry in `src/server/events`

This is intentionally scaffolded, not fully wired into order mutation yet.
