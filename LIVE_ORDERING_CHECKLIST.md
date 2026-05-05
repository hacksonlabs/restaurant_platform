# Live Ordering Checklist

## Before Switching to `POS_MODE=live`

- Confirm Supabase persistence is enabled with `DEMO_MODE=false`.
- Confirm admin auth works and the restaurant console can approve orders.
- Confirm `npm run smoke:e2e` passes in mock mode.
- Confirm `GET /api/restaurants/:restaurantId/pos-diagnostics` passes in mock mode.

## Toast Credentials

- Set `TOAST_BASE_URL`
- Set `TOAST_CLIENT_ID`
- Set `TOAST_CLIENT_SECRET`
- Set `TOAST_RESTAURANT_GUID`
- Set `TOAST_LOCATION_ID` if required by your restaurant setup
- Set `TOAST_MANAGEMENT_GROUP_GUID` if your credentials are scoped at the management group level
- Optionally set `TOAST_ACCESS_TOKEN` for controlled sandbox debugging

## Sandbox Bring-Up

1. Set `POS_MODE=live`.
2. Keep `DEMO_MODE=false`.
3. Restart Phantom.
4. Hit `GET /api/restaurants/rest_lb_steakhouse/pos-diagnostics`.
5. Confirm:
   - config passes
   - auth passes
   - quote readiness passes
   - submit readiness passes

## First Sandbox Order

1. Validate a canonical order through `/api/agent/restaurants/:restaurantId/orders/validate`.
2. Quote it through `/api/agent/restaurants/:restaurantId/orders/quote`.
3. Submit it through `/api/agent/restaurants/:restaurantId/orders/submit`.
4. Approve it through the admin endpoint if needed.
5. Submit it to POS through `/api/restaurants/:restaurantId/orders/:orderId/submit-to-pos`.
6. Poll `/api/agent/orders/:orderId/status`.
7. Inspect admin order detail and reporting endpoints for persistence.

## Rollback

If any live Toast issue appears:

1. Set `POS_MODE=mock`
2. Restart Phantom
3. Re-run `npm run smoke:e2e`

This returns the platform to the local mock ordering flow without changing API contracts or UI behavior.

## Known Toast Limitations in This Phase

- Pricing must go through `/orders/v2/prices` before `/orders/v2/orders`.
- Auth tokens should be reused and not requested aggressively.
- Future/scheduled orders must provide a valid `promisedDate`.
- Manual/unpaid flow is the initial supported payment path.
- Webhook verification and downstream async reconciliation are not implemented yet.
