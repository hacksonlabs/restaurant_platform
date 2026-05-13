# Auth And Tenancy

Phantom now uses server-side operator sessions backed by the platform repository instead of assuming a single restaurant console. In production mode, Supabase Auth is the identity provider and Phantom’s own tables remain the source of tenant membership and role authorization.

## Operator auth

- Operators sign in through `POST /api/auth/login`.
- When `DEMO_MODE=false` and Supabase Auth keys are configured, the login route authenticates the email/password against Supabase Auth first.
- The server stores an opaque session token in the `phantom_restaurant_session` HTTP-only cookie.
- Session state persists in `operator_sessions`.
- Operator profiles persist in `operator_users`.
- Restaurant and location membership persist in `operator_memberships`.

### Supabase Auth mapping

- `operator_users.supabase_user_id` links a Phantom operator record to `auth.users.id`.
- `operator_users` is now an application profile and tenancy table, not a live password store.
- Live sessions are checked against the linked Supabase Auth user when Phantom resolves `GET /api/auth/me` and other authenticated requests.
- Phantom never uses editable `user_metadata` for authorization; restaurant access still comes only from `operator_memberships`.
- If a Supabase Auth user can sign in but has no matching Phantom membership, Phantom rejects access.

## Tenant isolation

- Every `/api/restaurants/:restaurantId/...` route now requires a valid operator session.
- The backend checks the logged-in operator membership against the `restaurantId` route param on every request.
- Changing the restaurant ID in the URL does not bypass access because authorization happens server-side before the handler runs.
- The selected restaurant and optional location are persisted in the operator session and returned from `GET /api/auth/me`.

## Roles

- `owner`: full restaurant access
- `manager`: orders, rules, agents, reporting, diagnostics
- `staff`: order operations only
- `viewer`: read-only dashboard, menu, reporting, and configuration reads

Role enforcement is applied in the API router with `requireRestaurantRole(...)` and backed by `PlatformService.assertOperatorAccess(...)`.

## UI behavior

- The console now requires login before loading restaurant pages.
- If an operator belongs to multiple restaurants, the console shows a tenant selector in the shell.
- The selected tenant is persisted with `POST /api/auth/select-tenant`.
- Read-only or limited roles see disabled controls instead of optimistic client-only access.

## Audit trail

The backend now persists audit log entries for:

- operator login
- operator logout
- rules changes
- agent permission changes
- API key creation, rotation, and revocation
- POS connection tests
- menu sync start and completion
- order approval, rejection, submission, and status transitions

## Tables involved

- `operator_users`
- `operator_memberships`
- `operator_sessions`
- `audit_logs`

## Operational notes

- `DEMO_MODE=true` still uses the in-memory repository for local demos.
- `DEMO_MODE=false` uses the Supabase/Postgres repository, including operator auth, memberships, and session persistence.
- To enable live operator auth, set `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`.
- The seeded operator profile remains `dev@rest.com`, but a real Supabase Auth user must also exist for production-style login.
