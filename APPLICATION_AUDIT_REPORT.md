# Application Audit Report

## Scope

This report covers the current integrated state of:

- `restaurant_platform` (Phantom)
- `mealops_platform` (CoachImHungry / MealOps)

It focuses on:

- application correctness
- integration health
- security / vulnerability posture
- operational readiness

## What We Verified

### Full repo checks

- `restaurant_platform`
  - `npm test` -> passed (`34/34`)
  - `npm run build` -> passed
- `mealops_platform`
  - `npm test` -> passed (`146/146`)
  - `npm run build` -> passed

### End-to-end smoke coverage

- `mealops_platform`
  - `npm run smoke:phantom`
  - validated:
    - location-aware restaurant discovery
    - menu retrieval
    - validate
    - quote
    - submit
    - status
    - approval follow-up path
- `restaurant_platform`
  - `DEMO_MODE=true PORT=3042 npm run smoke:e2e`
  - validated:
    - operator login
    - restaurant listing
    - menu load
    - agent validate / quote / submit
    - approval / POS submission
    - reporting snapshot update

### Static security inspection

I explicitly checked for common client-side/code-execution hazards in the active source trees:

- `dangerouslySetInnerHTML`
- `innerHTML =`
- `eval(...)`
- `new Function(...)`

Result:

- no active matches were found in the main `src` trees

### Secrets / repo hygiene

I checked whether `.env` files are tracked in git with `git ls-files .env`.

Result:

- no tracked `.env` file was reported in either repo during this pass

That is good. It means local secrets appear to be kept out of the tracked repo state.

## Findings

### 1. High: MealOps still has vulnerable production dependencies in the active application

Affected package:

- `mealops_platform/package.json`

Confirmed by `npm audit --omit=dev --json`.

Key results:

- `1 critical`
- `4 high`
- `6 moderate`

Most important advisories:

- `jspdf`
- `axios`
- `vite`
- `fast-uri`
- `react-router-dom`
- `dompurify`

Why this matters:

- these are real supply-chain issues in the active app stack
- some are dev-server only, but some are not
- `jspdf` is especially important because it is used in the app’s receipt/export path

What needs to happen:

- upgrade or remove vulnerable production packages
- re-run `npm audit --omit=dev`
- confirm the receipt/export path still works after `jspdf` upgrade

### 2. Medium: Phantom’s live Supabase/Postgres mode can hit connection limits during local smoke validation

Affected file:

- `restaurant_platform/src/server/db/postgres.ts`

Observed behavior:

- live local smoke attempts can fail with `EMAXCONNSESSION`
- the current pool creation uses default `pg` pool behavior with no explicit max/session tuning

Why this matters:

- local reliability suffers when multiple processes are open:
  - Phantom dev server
  - MealOps bridge
  - MCP stdio sessions
  - ad hoc scripts
- the operational story is weaker than the application logic itself

What needs to happen:

- set explicit pool sizing/timeouts for the Supabase/Postgres connection
- consider pgbouncer/session-mode guidance for local + staging
- add a “close pool / shutdown cleanly” story for long-running scripts if needed

### 3. Medium: Smoke scripts had drifted behind the current integration contract

Affected files:

- `mealops_platform/server/scripts/smoke-phantom-mcp.mjs`
- `restaurant_platform/src/server/scripts/smokeOrderFlow.ts`

Observed behavior before patching:

- MealOps smoke used broad query-only discovery even though Phantom now requires location context
- Phantom smoke used a stale fulfillment timestamp and assumed approval still required a second explicit POS-submit call

Why this matters:

- this is exactly the kind of silent drift that hides regressions until someone manually tests the UI
- smoke tests should reflect the current contract, especially for cross-repo integration work

What was done in this pass:

- updated the MealOps smoke script for location-aware discovery
- updated the Phantom smoke script for future fulfillment time and the current approval behavior

### 4. Medium: There are duplicate or legacy surfaces in MealOps that still increase maintenance risk

Examples:

- `src/pages/payments/index.jsx` is still present while `/order/success` routes to `src/pages/order-success/index.jsx`
- there is still significant historical compatibility code for non-MCP providers across the app

Why this matters:

- even when the active Phantom path is correct, duplicate legacy surfaces are where regressions tend to reappear
- the inactive success/payment page especially increases the odds of subtle drift

What needs to happen:

- remove or clearly quarantine unused pages/components
- keep MCP/Phantom-active surfaces narrow and explicit

## What Is Working Well

### Phantom / restaurant_platform

The core Phantom platform is in good shape for local development:

- operator auth works
- multi-restaurant tenancy works
- MCP tools exist and are functional
- agent restaurant discovery is address-aware
- menu retrieval works
- validation / quote / submit / status work
- approval and rejection lifecycle works
- reporting updates when orders are persisted

The demo-mode smoke pass confirms that the main application lifecycle is coherent end to end.

### CoachImHungry / mealops_platform

The Phantom-first integration path is also in solid shape now:

- discovery is location-aware and Phantom-backed
- restaurant detail pages use Phantom snapshots + live menus
- shared carts and saved carts use lightweight snapshot strategy
- checkout pulls live quote data from Phantom
- order submission routes through Phantom
- approval / rejection status sync works back into MealOps
- template/reorder/shared-cart paths are much more aligned than they were earlier in the integration

The updated smoke run confirms the direct MCP bridge path works across:

- discovery
- menu
- validation
- quote
- submit
- status

## Areas That Still Need Work

### 1. Payment completion and reconciliation

See the separate payments report. This is still the biggest correctness gap remaining.

### 2. Dependency upgrades in MealOps

This is the most obvious security debt still open after the application logic work.

### 3. Live Deliverect production hardening

The adapter shape is present, but full production readiness still needs:

- final payload normalization review
- webhook/status reconciliation
- payment reconciliation
- staging validation with real Deliverect credentials

### 4. Local operational robustness

The live local environment is still easier to overload than it should be because of connection/session pressure and multiple cooperating processes.

### 5. Legacy surface reduction

The integration is now much cleaner, but the overall codebase still carries a lot of old provider-era compatibility logic. That is understandable, but it remains a future maintenance risk.

## Changes Made During This Validation Pass

### MealOps

- updated `server/scripts/smoke-phantom-mcp.mjs` for address-aware discovery
- fixed `server/dev-server.mjs` so `/api/orders/:id/mcp/status` handles Phantom provider ids without trying to parse them as UUIDs first

### Phantom

- updated `src/server/scripts/smokeOrderFlow.ts` so the smoke sample uses a future fulfillment time
- updated the same smoke script so approval does not double-call `submit-to-pos`

## Bottom Line

The integrated Phantom + CoachImHungry application is in a much healthier state than it was before this pass:

- both repos build
- both repos pass their full test suites
- both repos now have working smoke paths
- the main discovery/menu/order lifecycle is real and validated

The biggest remaining issues are no longer “does the integration basically work?”

They are now:

1. hardening the payment completion model
2. cleaning up vulnerable MealOps dependencies
3. finishing production-grade provider reconciliation and operational tuning
