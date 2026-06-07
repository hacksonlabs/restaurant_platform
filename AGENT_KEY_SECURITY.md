# Agent Key Security

Phantom now treats agent API keys as persistent security credentials instead of demo-only values.

## Partner identity

- `partners` represent the company or platform relationship, such as CoachImHungry or a future OpenAI integration.
- `agents` represent a specific ordering integration or app surface and may belong to a partner through `agents.partner_id`.
- Restaurant access remains separate in `restaurant_agent_permissions`, so approving a partner-owned agent for one restaurant does not automatically approve it for every restaurant.
- `partner_credentials` are the forward-looking credential model for partner-owned agents. They are tied to both a partner and an agent, carry scoped access, and support test/live environments.
- Existing `agent_api_keys` still authenticate as a compatibility path, so current demos and integrations keep working while partner credential onboarding is added.

## Storage model

- Raw agent keys are generated once and returned once.
- The database stores only:
  - `key_prefix`
  - `key_hash`
  - `scopes`
  - `created_at`
  - `rotated_at`
  - `last_used_at`
  - `revoked_at`
- Raw keys are never re-read from storage.

## Lifecycle

Partner credentials are created, rotated, and revoked by service-layer methods today. They use the same one-time raw key return pattern as legacy agent keys, store only hashes and prefixes, and write audit log entries for each lifecycle action.

### Create

- `POST /api/restaurants/:restaurantId/agents/:agentId/keys`
- Returns the raw key once plus the persisted key metadata
- Creates an `audit_logs` entry

### Rotate

- `POST /api/restaurants/:restaurantId/agents/:agentId/keys/:keyId/rotate`
- Replaces the stored hash and prefix
- Updates scopes and `rotated_at`
- Returns the new raw key once
- Creates an `audit_logs` entry

### Revoke

- `POST /api/restaurants/:restaurantId/agents/:agentId/keys/:keyId/revoke`
- Sets `revoked_at`
- Revoked keys can no longer authenticate
- Creates an `audit_logs` entry

## Scopes

Supported scopes:

- `restaurants:read`
- `menus:read`
- `orders:validate`
- `orders:quote`
- `orders:submit`
- `orders:status`

Each agent endpoint now enforces both restaurant permission and required scope before the request reaches business logic.

## Enforcement chain

For agent-facing endpoints, Phantom now checks:

1. API key exists and is not revoked
2. API key scope allows the requested action
3. Restaurant agent ordering is enabled
4. Restaurant-agent permission state is `allowed`

If any check fails, the request is rejected before order or menu operations run.

## Usage tracking

- Successful key authentication updates `last_used_at`
- The operator console shows prefix, last used, rotated at, and revoked state
- The console only reveals the raw key at create/rotate time

## Operational guidance

- Prefer one key per integration surface rather than sharing one key across multiple systems
- Grant the narrowest scopes needed
- Rotate keys when restaurant operators or integration owners change
- Revoke immediately if a key is exposed, copied into logs, or no longer needed
