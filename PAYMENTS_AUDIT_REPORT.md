# Payments Audit Report

## Scope

This report covers the current payment flow across:

- `restaurant_platform` (Phantom)
- `mealops_platform` (CoachImHungry / MealOps)

The goal of this pass was to verify what is implemented today, what was tested, what is working, and what still needs to be completed before the payment flow is production-safe.

## What We Verified

### Automated tests

- `restaurant_platform`
  - `npm test`
  - `npm run build`
  - targeted payment-related coverage inside:
    - `tests/mcpTools.test.ts`
    - `tests/platformService.test.ts`
- `mealops_platform`
  - `npm test`
  - `npm run build`
  - targeted payment-related coverage inside:
    - `src/domains/checkout/checkoutOrchestrator.test.js`
    - `src/domains/checkout/startCheckoutPayment.test.js`
    - `src/domains/payments/paymentOrchestrator.test.js`
    - `src/domains/orders/orderExecutionService.executeOrder.test.js`
    - `src/domains/orders/orderPaymentStatusService.test.js`
    - `server/mcp/phantomMapper.test.mjs`

### End-to-end smoke validation

- `mealops_platform`
  - `npm run smoke:phantom`
  - Result: passed after updating the smoke script for location-aware Phantom discovery and fixing provider-order-id status lookup in the local MCP bridge.
- `restaurant_platform`
  - `DEMO_MODE=true PORT=3042 npm run smoke:e2e`
  - Result: passed after updating the smoke script to use a future fulfillment time and to avoid double-submitting after approval.

### Dependency audit

- `restaurant_platform`
  - `npm audit --omit=dev --json`
  - Result: `0` prod vulnerabilities reported.
- `mealops_platform`
  - `npm audit --omit=dev --json`
  - Result: `11` prod vulnerabilities reported, including `critical` and `high` advisories.

## Current Payment Architecture

### What CoachImHungry is doing today

For Phantom-backed restaurants, MealOps now treats Phantom as the payment provider and the order gateway:

1. MealOps persists a local draft order.
2. MealOps starts checkout through `phantomPaymentProvider`.
3. The local MealOps bridge calls Phantom MCP `start_payment`.
4. Phantom returns a hosted redirect URL and payment reference.
5. MealOps stores the payment proof/reference on the local order.
6. MealOps later submits the order through the MCP order adapter.
7. Phantom submits the order to the configured POS/provider.

Key files:

- `mealops_platform/src/domains/payments/providers/phantomPaymentProvider.js`
- `mealops_platform/src/domains/checkout/startCheckoutPayment.js`
- `mealops_platform/src/domains/orders/orderPaymentStatusService.js`
- `mealops_platform/src/domains/orders/orderExecutionService.js`
- `mealops_platform/server/dev-server.mjs`

### What Phantom is doing today

Phantom exposes a hosted payment start path through MCP:

- MCP tool: `start_payment`
- service entry: `PlatformService.startPaymentSession(...)`
- provider implementations:
  - mock hosted payment redirects in Toast/Deliverect mock adapters
  - Deliverect live hosted payment start in `deliverectLive.ts`

On the live Deliverect path, Phantom does one important thing correctly:

- when a payment reference is present on submit, Phantom checks Deliverect payment status before checkout and rejects submission if the payment is not ready/authorized

Key files:

- `restaurant_platform/src/server/mcp/tools.ts`
- `restaurant_platform/src/server/services/platformService.ts`
- `restaurant_platform/src/server/pos/deliverectLive.ts`

## Findings

### 1. Critical: MealOps can execute a Phantom order from the success page without a server-side payment completion check

Affected files:

- `mealops_platform/src/pages/order-success/index.jsx`
- `mealops_platform/src/pages/payments/index.jsx`

Current behavior:

- both pages load `orderId` from router state or query string
- both pages call `orderDbService.executeOrder(orderId)` on page load
- there is no signed callback token, no bridge-side payment completion verification step, and no provider callback validation before submission begins

Why this matters:

- for the real Deliverect live path, Phantom does still re-check payment status before final checkout when a payment reference exists, which reduces the blast radius
- but MealOps still treats the browser redirect itself as a trusted trigger to continue the order lifecycle
- in mock and partial-integration scenarios this is enough to move the order forward without a confirmed payment result

What needs to change:

- replace the direct page-load `executeOrder(...)` trigger with a server-side payment confirmation step
- require a signed/opaque payment return token or a persisted payment session id
- only allow order execution after the bridge confirms payment success with Phantom or the provider

### 2. High: MealOps marks payment state too optimistically for redirect flows

Affected files:

- `mealops_platform/src/domains/orders/orderExecutionService.js`
- `mealops_platform/src/domains/orders/orderPaymentStatusService.js`

Current behavior:

- `redirect_required` is persisted as local `payment_status = pending`, which is fine
- but later submission logic treats the existence of `provider_payment_reference` or any `payment_proof` object as enough to consider payment complete in some paths

Why this matters:

- a payment reference proves that a hosted payment session was created
- it does **not** prove that the payer completed the transaction
- the authoritative signal should be a verified provider status such as `authorized`, `paid`, `captured`, or a provider webhook/confirmation response

What needs to change:

- payment completion should be derived from provider-confirmed state, not proof-object presence
- keep redirect-started payments in `pending`/`processing` until Phantom confirms success
- update order lifecycle sync to mark `completed` only after verified provider success

### 3. High: MealOps ships vulnerable production dependencies in the active app bundle

Affected package:

- `mealops_platform/package.json`

Confirmed by `npm audit --omit=dev --json`.

Important advisories in the active dependency tree include:

- `jspdf` (`critical`)
- `axios` (`high`)
- `vite` (`high`)
- `fast-uri` (`high`)
- `react-router-dom` / `react-router` (`moderate`)
- `dompurify` (`moderate`)

Why this matters:

- these are not theoretical lint issues; they are current package-level advisories in the shipped app stack
- some affect dev server exposure, but others affect runtime libraries used in the app

What needs to change:

- upgrade `jspdf` to a safe major version
- upgrade `axios`
- upgrade `react-router-dom`
- upgrade `vite`
- upgrade `dompurify`
- remove unused vulnerable dependencies if they are no longer needed

### 4. Medium: Phantom still lacks a first-class payment status / reconciliation surface for agents

Affected area:

- `restaurant_platform/src/server/mcp`

Current behavior:

- Phantom can `start_payment`
- Phantom can later use a provider payment reference during submit
- but there is no MCP tool dedicated to `get_payment_status` / `confirm_payment`

Why this matters:

- MealOps has to infer too much from redirect behavior and local persistence
- production-safe hosted payments need a clear confirmation step, not just “we got a redirect back”

What needs to change:

- add a provider-agnostic payment status/confirmation interface in Phantom
- expose it over MCP or a dedicated bridge endpoint
- use that confirmation result before moving the order out of payment-pending state

## What Is Working Today

The following payment pieces are meaningfully implemented and validated:

- Phantom MCP hosted payment session creation
- Phantom mock hosted payment redirects
- Deliverect live payment-start adapter path
- local persistence of payment reference / payment proof in MealOps
- forwarding of stored payment profile back into Phantom submit
- Deliverect live checkout payload reuse of stored provider payment reference
- Deliverect live payment readiness check before checkout submit

This means the current implementation is a real payment **start** flow plus a partially verified **submit** flow, not a pure mock end-to-end fiction.

## What Still Needs To Be Done

### Production-critical

1. Add server-side payment confirmation before order execution continues after redirect.
2. Stop treating payment proof/reference as equivalent to completed payment.
3. Add webhook/reconciliation support for payment completion/failure/refund events.
4. Add a provider-neutral `get_payment_status` / `confirm_payment` flow in Phantom.
5. Add negative-path tests:
   - return URL hit without payment completion
   - stale/forged `orderId` on success route
   - payment reference exists but provider status is still pending
   - payment cancelled after redirect

### Operational / security

1. Upgrade the vulnerable MealOps production dependencies.
2. Separate mock-only payment success behavior from real-provider payment success behavior more explicitly.
3. Add an explicit audit trail for:
   - payment session created
   - payment confirmed
   - payment failed/cancelled
   - order submitted after payment verification

## Bottom Line

The current payment implementation is good enough for local product integration testing and for proving the restaurant-MOR shape of the flow:

- CoachImHungry starts checkout through Phantom
- Phantom owns the restaurant-side hosted payment session
- MealOps can carry that proof forward into order submission

But it is **not yet production-safe** because redirect return and payment completion are still too loosely coupled.

The most important remaining work is:

1. verify payment completion server-side
2. only then continue order execution
3. reconcile final payment state through webhooks or provider status checks
