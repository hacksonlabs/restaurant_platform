import type { Pool } from "pg";
import type {
  Agent,
  AgentApiScope,
  AgentApiKey,
  AuthenticatedAgentCredential,
  AuthenticatedOperator,
  AuthenticatedPlatformAdmin,
  AgentOrderRecord,
  AuditLog,
  CanonicalMenuItem,
  CanonicalModifier,
  CanonicalModifierGroup,
  EventIngestionRecord,
  IdempotencyRecord,
  OnboardingRequestRecord,
  OperationalDiagnosticsSnapshot,
  OrderQuote,
  OrderTimelineEvent,
  OrderValidationResult,
  OrderingRule,
  Partner,
  PartnerCredential,
  POSConnection,
  POSMenuMapping,
  POSOrderSubmission,
  ReportingDailyMetric,
  ReportingDateRange,
  Restaurant,
  RestaurantAgentPermission,
  RestaurantLocation,
  RetryAttempt,
  StatusEvent,
  OperatorMembership,
  RestaurantSignupInput,
  OperatorUser,
  OrderDiagnostics,
  OnboardingActivateInput,
  OnboardingDiscoveredLocation,
  CreateTeamMemberInput,
  TeamMemberRecord,
  UpdateTeamMemberInput,
} from "../../shared/types";
import type { OperatorIdentity } from "../auth/supabaseAuth";
import type {
  AgentListEntry,
  DashboardStats,
  OrderDetailRecord,
  OrderGraphInput,
  PlatformRepository,
  ReconcileOperatorOptions,
  ReportingSnapshotRecord,
} from "./platformRepository";
import { createId } from "../utils/ids";
import { appNow, endOfDay, startOfDay } from "../utils/time";

function required<T>(value: T | null, message: string): T {
  if (!value) throw new Error(message);
  return value;
}

function isoTimestamp(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function mapRestaurant(row: any): Restaurant {
  return {
    id: row.id,
    name: row.name,
    location: row.location,
    timezone: row.timezone,
    imageUrl: row.image_url ?? undefined,
    cuisineType: row.cuisine_type ?? undefined,
    description: row.description ?? undefined,
    rating: typeof row.rating === "number" ? row.rating : row.rating != null ? Number(row.rating) : undefined,
    deliveryFee: row.delivery_fee ?? undefined,
    minimumOrder: row.minimum_order ?? undefined,
    supportsCatering: row.supports_catering ?? undefined,
    posProvider: row.pos_provider,
    agentOrderingEnabled: row.agent_ordering_enabled,
    defaultApprovalMode: row.default_approval_mode,
    contactEmail: row.contact_email,
    contactPhone: row.contact_phone,
    fulfillmentTypesSupported: row.fulfillment_types_supported ?? [],
    createdAt: isoTimestamp(row.created_at),
    updatedAt: isoTimestamp(row.updated_at),
  };
}

function posProviderForOnboarding(provider: OnboardingActivateInput["provider"]): Restaurant["posProvider"] {
  if (provider === "deliverect" || provider === "olo") {
    return provider;
  }
  return "toast";
}

function templateRestaurantNameForLocation(locationName: string) {
  return locationName.split(" - ")[0]?.trim() || locationName.trim();
}

function onboardingLocationArea(locationName: string) {
  const [, ...rest] = locationName.split(" - ");
  const area = rest.join(" - ").trim();
  return area ? area.toLowerCase() : null;
}

function templateRestaurantIdFromMetadata(metadata: Record<string, unknown> | undefined) {
  const templateRestaurantId = metadata?.templateRestaurantId;
  return typeof templateRestaurantId === "string" && templateRestaurantId ? templateRestaurantId : null;
}

function isUuidLike(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function findExistingOnboardingRestaurantMatch(pool: Pool, locationSeed: OnboardingDiscoveredLocation) {
  const templateRestaurantName = templateRestaurantNameForLocation(locationSeed.name);
  const area = onboardingLocationArea(locationSeed.name);
  if (!area) return null;
  const result = await pool.query(
    `select r.id as restaurant_id, l.id as location_id
     from restaurants r
     join restaurant_locations l on l.restaurant_id = r.id
     where lower(r.name) = lower($1)
       and lower(concat_ws(' ', r.location, l.name, l.city)) like $2
     limit 1`,
    [templateRestaurantName, `%${area}%`],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    restaurantId: row.restaurant_id as string,
    locationId: row.location_id as string,
  };
}

async function inferTemplateRestaurantIdForRestaurant(pool: Pool, restaurantId: string) {
  const restaurantResult = await pool.query("select id, name from restaurants where id = $1 limit 1", [restaurantId]);
  const restaurant = restaurantResult.rows[0];
  if (!restaurant?.name) {
    return null;
  }
  const templateName = templateRestaurantNameForLocation(restaurant.name);
  if (templateName === restaurant.name) {
    return null;
  }
  const templateResult = await pool.query(
    "select id from restaurants where id <> $1 and lower(name) = lower($2) limit 1",
    [restaurantId, templateName],
  );
  return (templateResult.rows[0]?.id as string | undefined) ?? null;
}

function mapLocation(row: any): RestaurantLocation {
  return {
    id: row.id,
    restaurantId: row.restaurant_id,
    name: row.name,
    address1: row.address1,
    city: row.city,
    state: row.state,
    postalCode: row.postal_code,
    latitude: row.latitude != null ? Number(row.latitude) : null,
    longitude: row.longitude != null ? Number(row.longitude) : null,
  };
}

function mapPOSConnection(row: any): POSConnection {
  return {
    id: row.id,
    restaurantId: row.restaurant_id,
    provider: row.provider,
    status: row.status,
    mode: row.mode,
    restaurantGuid: row.restaurant_guid ?? undefined,
    locationId: row.location_id ?? undefined,
    metadata: row.metadata ?? {},
    lastTestedAt: row.last_tested_at ?? undefined,
    lastSyncedAt: row.last_synced_at ?? undefined,
  };
}

function mapModifierGroup(row: any): CanonicalModifierGroup {
  return {
    id: row.id,
    restaurantId: row.restaurant_id,
    name: row.name,
    selectionType: row.selection_type,
    required: row.required,
    minSelections: row.min_selections,
    maxSelections: row.max_selections,
  };
}

function mapModifier(row: any): CanonicalModifier {
  return {
    id: row.id,
    modifierGroupId: row.modifier_group_id,
    name: row.name,
    priceCents: row.price_cents,
    isAvailable: row.is_available,
  };
}

function mapMenuItem(row: any): CanonicalMenuItem {
  return {
    id: row.id,
    restaurantId: row.restaurant_id,
    category: row.category,
    name: row.name,
    description: row.description,
    imageUrl: row.image_url ?? undefined,
    priceCents: row.price_cents,
    availability: row.availability,
    mappingStatus: row.mapping_status,
    modifierGroupIds: row.modifier_group_ids ?? [],
    posRef: row.pos_ref ?? {},
  };
}

function mapMapping(row: any): POSMenuMapping {
  return {
    id: row.id,
    restaurantId: row.restaurant_id,
    canonicalType: row.canonical_type,
    canonicalId: row.canonical_id,
    provider: row.provider,
    providerReference: row.provider_reference,
    status: row.status,
  };
}

function mapAgent(row: any) {
  return {
    id: row.id,
    partnerId: row.partner_id ?? undefined,
    name: row.name,
    slug: row.slug,
    description: row.description,
    createdAt: row.created_at,
  };
}

function mapPartner(row: any): Partner {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    status: row.status,
    contactEmail: row.contact_email ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapKey(row: any): AgentApiKey {
  return {
    id: row.id,
    agentId: row.agent_id,
    label: row.label,
    keyPrefix: row.key_prefix,
    keyHash: row.key_hash,
    scopes: row.scopes ?? [],
    lastUsedAt: row.last_used_at ?? undefined,
    createdAt: row.created_at,
    rotatedAt: row.rotated_at ?? undefined,
    revokedAt: row.revoked_at ?? undefined,
  };
}

function mapPartnerCredential(row: any): PartnerCredential {
  return {
    id: row.id,
    partnerId: row.partner_id,
    agentId: row.agent_id,
    label: row.label,
    keyPrefix: row.key_prefix,
    keyHash: row.key_hash,
    scopes: row.scopes ?? [],
    environment: row.environment,
    lastUsedAt: row.last_used_at ?? undefined,
    createdAt: row.created_at,
    rotatedAt: row.rotated_at ?? undefined,
    revokedAt: row.revoked_at ?? undefined,
  };
}

function mapOperatorUser(row: any): OperatorUser {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    supabaseUserId: row.supabase_user_id ?? undefined,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at ?? undefined,
  };
}

function mapOperatorMembership(row: any): OperatorMembership {
  return {
    id: row.id,
    operatorUserId: row.operator_user_id,
    restaurantId: row.restaurant_id,
    locationId: row.location_id ?? undefined,
    role: row.role,
    createdAt: row.created_at,
  };
}

function mapPlatformAdmin(row: any): AuthenticatedPlatformAdmin["user"] {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    status: row.status,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at ?? undefined,
  };
}

function mapPermission(row: any): RestaurantAgentPermission {
  return {
    id: row.id,
    restaurantId: row.restaurant_id,
    agentId: row.agent_id,
    status: row.status,
    notes: row.notes ?? undefined,
    lastActivityAt: row.last_activity_at ?? undefined,
  };
}

function mapRules(row: any): OrderingRule {
  return {
    id: row.id,
    restaurantId: row.restaurant_id,
    minimumLeadTimeMinutes: row.minimum_lead_time_minutes,
    maxOrderDollarAmount: Number(row.max_order_dollar_amount),
    maxItemQuantity: row.max_item_quantity,
    maxHeadcount: row.max_headcount,
    autoAcceptEnabled: row.auto_accept_enabled,
    managerApprovalThresholdCents: row.manager_approval_threshold_cents,
    blackoutWindows: row.blackout_windows ?? [],
    allowedFulfillmentTypes: row.allowed_fulfillment_types ?? [],
    substitutionPolicy: row.substitution_policy,
    paymentPolicy: row.payment_policy,
    allowedAgentIds: row.allowed_agent_ids ?? [],
  };
}

function mapOrder(row: any): AgentOrderRecord {
  const metadata =
    row.order_intent && typeof row.order_intent === "object" && row.order_intent.metadata && typeof row.order_intent.metadata === "object"
      ? row.order_intent.metadata
      : {};
  return {
    id: row.id,
    restaurantId: row.restaurant_id,
    agentId: row.agent_id,
    agentName: row.agent_name ?? undefined,
    externalOrderReference: row.external_order_reference,
    customerName: row.customer_name,
    customerEmail: row.customer_email ?? undefined,
    teamName: row.team_name ?? undefined,
    fulfillmentType: row.fulfillment_type,
    requestedFulfillmentTime: isoTimestamp(row.requested_fulfillment_time),
    headcount: row.headcount,
    status: row.status,
    approvalRequired: row.approval_required,
    totalEstimateCents: row.total_estimate_cents,
    createdAt: isoTimestamp(row.created_at),
    updatedAt: isoTimestamp(row.updated_at),
    packagingInstructions: row.packaging_instructions ?? undefined,
    dietaryConstraints: row.dietary_constraints ?? [],
    orderIntent: row.order_intent,
    splitGroupId: typeof metadata.split_group_id === "string" ? metadata.split_group_id : undefined,
    splitGroupIndex:
      Number.isFinite(Number(metadata.split_group_index)) ? Math.round(Number(metadata.split_group_index)) : undefined,
    splitGroupSize:
      Number.isFinite(Number(metadata.split_group_size)) ? Math.round(Number(metadata.split_group_size)) : undefined,
  };
}

function mapValidation(row: any): OrderValidationResult {
  return {
    id: row.id,
    orderId: row.order_id,
    valid: row.valid,
    issues: row.issues ?? [],
    checkedAt: isoTimestamp(row.checked_at),
    idempotencyKey: row.idempotency_key ?? undefined,
  };
}

function mapQuote(row: any): OrderQuote {
  return {
    id: row.id,
    orderId: row.order_id,
    subtotalCents: row.subtotal_cents,
    taxCents: row.tax_cents,
    feesCents: row.fees_cents,
    tipCents: row.tip_cents ?? 0,
    totalCents: row.total_cents,
    currency: row.currency,
    quotedAt: isoTimestamp(row.quoted_at),
    idempotencyKey: row.idempotency_key ?? undefined,
  };
}

function mapSubmission(row: any): POSOrderSubmission {
  return {
    id: row.id,
    orderId: row.order_id,
    provider: row.provider,
    status: row.status,
    externalOrderId: row.external_order_id ?? undefined,
    response: row.response ?? {},
    payloadSnapshot: row.payload_snapshot ?? undefined,
    attemptCount: row.attempt_count ?? undefined,
    submittedAt: isoTimestamp(row.submitted_at),
  };
}

function mapStatusEvent(row: any): StatusEvent {
  return {
    id: row.id,
    orderId: row.order_id,
    status: row.status,
    message: row.message,
    createdAt: row.created_at,
  };
}

function mapMetric(row: any): ReportingDailyMetric {
  return {
    id: row.id,
    restaurantId: row.restaurant_id,
    date: row.date,
    totalOrders: row.total_orders,
    revenueCents: row.revenue_cents,
    averageOrderValueCents: row.average_order_value_cents,
    approvalRate: Number(row.approval_rate),
    successRate: Number(row.success_rate),
    rejectedOrders: row.rejected_orders,
    averageLeadTimeMinutes: row.average_lead_time_minutes,
    upcomingScheduledOrderVolume: row.upcoming_scheduled_order_volume,
  };
}

function mapAudit(row: any): AuditLog {
  return {
    id: row.id,
    restaurantId: row.restaurant_id,
    actorType: row.actor_type,
    actorId: row.actor_id,
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id,
    summary: row.summary,
    createdAt: row.created_at,
  };
}

function mapIdempotency(row: any): IdempotencyRecord {
  return {
    id: row.id,
    scope: row.scope,
    restaurantId: row.restaurant_id,
    agentId: row.agent_id,
    idempotencyKey: row.idempotency_key,
    requestHash: row.request_hash,
    status: row.status,
    orderId: row.order_id ?? undefined,
    response: row.response ?? undefined,
    error: row.error ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapRetry(row: any): RetryAttempt {
  return {
    id: row.id,
    orderId: row.order_id ?? undefined,
    stage: row.stage,
    attemptNumber: row.attempt_number,
    status: row.status,
    errorMessage: row.error_message ?? undefined,
    payloadSnapshot: row.payload_snapshot ?? undefined,
    responseSnapshot: row.response_snapshot ?? undefined,
    createdAt: row.created_at,
  };
}

function mapEventIngestion(row: any): EventIngestionRecord {
  return {
    id: row.id,
    provider: row.provider,
    eventType: row.event_type,
    externalEventId: row.external_event_id ?? undefined,
    orderId: row.order_id ?? undefined,
    status: row.status,
    payload: row.payload ?? {},
    createdAt: row.created_at,
    processedAt: row.processed_at ?? undefined,
  };
}

function buildTimeline(detail: {
  validationResults: OrderValidationResult[];
  quotes: OrderQuote[];
  submissions: POSOrderSubmission[];
  statusEvents: StatusEvent[];
  retries: RetryAttempt[];
  auditLogs: AuditLog[];
}): OrderTimelineEvent[] {
  return [
    ...detail.statusEvents.map((event) => ({
      id: event.id,
      kind: "status" as const,
      title: event.status,
      message: event.message,
      createdAt: event.createdAt,
      status: event.status,
    })),
    ...detail.validationResults.map((result) => ({
      id: result.id,
      kind: "validation" as const,
      title: result.valid ? "Validation passed" : "Validation failed",
      message: `${result.issues.length} issues recorded.`,
      createdAt: result.checkedAt,
      status: result.valid ? "valid" : "invalid",
      details: { issues: result.issues, idempotencyKey: result.idempotencyKey },
    })),
    ...detail.quotes.map((quote) => ({
      id: quote.id,
      kind: "quote" as const,
      title: "Quote generated",
      message: `Quoted total ${quote.totalCents} ${quote.currency}.`,
      createdAt: quote.quotedAt,
      details: { idempotencyKey: quote.idempotencyKey, totalCents: quote.totalCents },
    })),
    ...detail.submissions.map((submission) => ({
      id: submission.id,
      kind: "submission" as const,
      title: `POS submit ${submission.status}`,
      message: submission.externalOrderId ?? "Submission recorded.",
      createdAt: submission.submittedAt,
      status: submission.status,
      details: {
        externalOrderId: submission.externalOrderId,
        attemptCount: submission.attemptCount,
        payloadSnapshot: submission.payloadSnapshot,
        response: submission.response,
      },
    })),
    ...detail.retries.map((attempt) => ({
      id: attempt.id,
      kind: "retry" as const,
      title: `${attempt.stage} retry ${attempt.status}`,
      message: attempt.errorMessage ?? "Retry attempt recorded.",
      createdAt: attempt.createdAt,
      status: attempt.status,
      details: {
        attemptNumber: attempt.attemptNumber,
        payloadSnapshot: attempt.payloadSnapshot,
        responseSnapshot: attempt.responseSnapshot,
      },
    })),
    ...detail.auditLogs.map((log) => ({
      id: log.id,
      kind: "audit" as const,
      title: log.action,
      message: log.summary,
      createdAt: log.createdAt,
      details: { actorType: log.actorType, actorId: log.actorId },
    })),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export class SupabasePlatformRepository implements PlatformRepository {
  private onboardingRequests = new Map<string, OnboardingRequestRecord>();

  constructor(private pool: Pool) {}

  async authenticatePlatformAdmin(email: string, passwordHash: string): Promise<AuthenticatedPlatformAdmin | null> {
    const result = await this.pool.query(
      `update platform_admin_users
       set last_login_at = now()
       where lower(email) = lower($1)
         and password_hash = $2
         and status = 'active'
       returning *`,
      [email, passwordHash],
    );
    return result.rows[0] ? { user: mapPlatformAdmin(result.rows[0]) } : null;
  }

  async createPlatformAdminSession(args: {
    adminUserId: string;
    sessionTokenHash: string;
    expiresAt: string;
  }) {
    await this.pool.query(
      `insert into platform_admin_sessions
       (id, admin_user_id, session_token_hash, expires_at, created_at)
       values ($1, $2, $3, $4, now())`,
      [createId("pa_sess"), args.adminUserId, args.sessionTokenHash, args.expiresAt],
    );
  }

  async getAuthenticatedPlatformAdminBySessionToken(sessionTokenHash: string): Promise<AuthenticatedPlatformAdmin | null> {
    const result = await this.pool.query(
      `select u.*
       from platform_admin_sessions s
       join platform_admin_users u on u.id = s.admin_user_id
       where s.session_token_hash = $1
         and s.expires_at > now()
         and u.status = 'active'
       limit 1`,
      [sessionTokenHash],
    );
    return result.rows[0] ? { user: mapPlatformAdmin(result.rows[0]) } : null;
  }

  async deletePlatformAdminSession(sessionTokenHash: string) {
    await this.pool.query("delete from platform_admin_sessions where session_token_hash = $1", [sessionTokenHash]);
  }

  async authenticateOperator(email: string, password: string): Promise<AuthenticatedOperator | null> {
    void email;
    void password;
    return null;
  }

  async createOnboardingRequest(
    input: Omit<OnboardingRequestRecord, "id" | "createdAt" | "updatedAt" | "status">,
  ) {
    const now = new Date().toISOString();
    const record: OnboardingRequestRecord = {
      id: createId("onboarding"),
      provider: input.provider,
      providerAccountId: input.providerAccountId,
      providerLocationIds: input.providerLocationIds,
      accountName: input.accountName,
      email: input.email,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    };
    this.onboardingRequests.set(record.id, record);
    return record;
  }

  async getOnboardingRequest(requestId: string) {
    return this.onboardingRequests.get(requestId) ?? null;
  }

  async createRestaurantAccount(input: RestaurantSignupInput & { supabaseUserId?: string }) {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const existingUser = await client.query(
        "select id from operator_users where lower(email) = lower($1) limit 1",
        [input.ownerEmail],
      );
      if (existingUser.rows[0]) {
        throw new Error("An operator account with that email already exists.");
      }

      const now = new Date().toISOString();
      const restaurantId = createId("rest");
      const locationId = createId("loc");
      const operatorUserId = createId("op");
      const membershipId = createId("membership");
      const rulesId = createId("rules");
      const posConnectionId = createId("posconn");
      const permissionId = createId("perm");
      const locationLabel = [input.address1, `${input.city}, ${input.state} ${input.postalCode}`]
        .filter(Boolean)
        .join(", ");
      const coachAgent = await client.query(
        "select id from agents where slug = 'coachimhungry' limit 1",
      );
      const coachAgentId = coachAgent.rows[0]?.id as string | undefined;

      const userResult = await client.query(
        `insert into operator_users
         (id, email, full_name, password_hash, supabase_user_id, created_at, last_login_at)
         values ($1, $2, $3, null, $4::uuid, $5, $5)
         returning *`,
        [operatorUserId, input.ownerEmail, input.ownerFullName, input.supabaseUserId ?? null, now],
      );

      await client.query(
        `insert into restaurants
         (id, name, location, timezone, pos_provider, agent_ordering_enabled, default_approval_mode, contact_email, contact_phone, fulfillment_types_supported, created_at, updated_at)
         values ($1, $2, $3, $4, 'deliverect', true, 'auto', $5, $6, $7::text[], $8, $8)`,
        [
          restaurantId,
          input.restaurantName,
          locationLabel,
          input.timezone,
          input.ownerEmail,
          input.contactPhone,
          ["pickup", "delivery", "catering"],
          now,
        ],
      );

      await client.query(
        `insert into restaurant_locations
         (id, restaurant_id, name, address1, city, state, postal_code)
         values ($1, $2, $3, $4, $5, $6, $7)`,
        [locationId, restaurantId, `${input.restaurantName} Main Location`, input.address1, input.city, input.state, input.postalCode],
      );

      await client.query(
        `insert into pos_connections
         (id, restaurant_id, provider, status, mode, metadata)
         values ($1, $2, 'deliverect', 'not_connected', 'mock', $3::jsonb)`,
        [posConnectionId, restaurantId, JSON.stringify({ source: "onboarding" })],
      );

      await client.query(
        `insert into ordering_rules
         (id, restaurant_id, minimum_lead_time_minutes, max_order_dollar_amount, max_item_quantity, max_headcount, auto_accept_enabled, manager_approval_threshold_cents, blackout_windows, allowed_fulfillment_types, substitution_policy, payment_policy, allowed_agent_ids)
         values ($1, $2, 45, 300, 1000, 1000, true, 2147483647, '[]'::jsonb, $3::text[], 'require_approval', 'required_before_submit', $4::text[])`,
        [rulesId, restaurantId, ["pickup", "delivery", "catering"], coachAgentId ? [coachAgentId] : []],
      );

      await client.query(
        `insert into operator_memberships
         (id, operator_user_id, restaurant_id, location_id, role, created_at)
         values ($1, $2, $3, $4, 'owner', $5)`,
        [membershipId, operatorUserId, restaurantId, locationId, now],
      );

      if (coachAgentId) {
        await client.query(
          `insert into restaurant_agent_permissions
           (id, restaurant_id, agent_id, status, notes, last_activity_at)
           values ($1, $2, $3, 'allowed', $4, $5)`,
          [permissionId, restaurantId, coachAgentId, "Enabled during restaurant onboarding.", now],
        );
      }

      await client.query("commit");
      const user = mapOperatorUser(userResult.rows[0]);
      const memberships = await this.getOperatorMemberships(user.id);
      return { user, memberships, selectedMembership: memberships[0] };
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async createOnboardingOperatorAccount(input: {
    activation: OnboardingActivateInput & { supabaseUserId?: string };
    accountName: string;
    locations: OnboardingDiscoveredLocation[];
  }) {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const existingUser = await client.query(
        "select id from operator_users where lower(email) = lower($1) limit 1",
        [input.activation.email],
      );
      if (existingUser.rows[0]) {
        throw new Error("An operator account with that email already exists.");
      }

      const now = new Date().toISOString();
      const operatorUserId = createId("op");
      const posProvider = posProviderForOnboarding(input.activation.provider);
      const coachAgent = await client.query("select id from agents where slug = 'coachimhungry' limit 1");
      const coachAgentId = coachAgent.rows[0]?.id as string | undefined;

      const userResult = await client.query(
        `insert into operator_users
         (id, email, full_name, password_hash, supabase_user_id, created_at, last_login_at)
         values ($1, $2, $3, null, $4::uuid, $5, $5)
         returning *`,
        [operatorUserId, input.activation.email, input.activation.fullName, input.activation.supabaseUserId ?? null, now],
      );

      for (const locationSeed of input.locations) {
        const templateRestaurantName = templateRestaurantNameForLocation(locationSeed.name);
        const templateRestaurant = await client.query(
          "select id from restaurants where lower(name) = lower($1) limit 1",
          [templateRestaurantName],
        );
        const templateRestaurantId = templateRestaurant.rows[0]?.id as string | undefined;
        const templateConnection = templateRestaurantId
          ? await client.query("select * from pos_connections where restaurant_id = $1 limit 1", [templateRestaurantId])
          : { rows: [] };
        const templatePOSConnection = templateConnection.rows[0] ? mapPOSConnection(templateConnection.rows[0]) : null;
        const restaurantId = createId("rest");
        const locationId = createId("loc");
        const membershipId = createId("membership");
        const rulesId = createId("rules");
        const posConnectionId = createId("posconn");
        const permissionId = createId("perm");

        await client.query(
          `insert into restaurants
           (id, name, location, timezone, pos_provider, agent_ordering_enabled, default_approval_mode, contact_email, contact_phone, fulfillment_types_supported, created_at, updated_at)
           values ($1, $2, $3, $4, $5, true, 'auto', $6, $7, $8::text[], $9, $9)`,
          [
            restaurantId,
            locationSeed.name,
            locationSeed.address,
            locationSeed.timezone,
            posProvider,
            input.activation.email,
            "(000) 000-0000",
            ["pickup", "delivery", "catering"],
            now,
          ],
        );

        await client.query(
          `insert into restaurant_locations
           (id, restaurant_id, name, address1, city, state, postal_code)
           values ($1, $2, $3, $4, '', '', '')`,
          [locationId, restaurantId, locationSeed.name, locationSeed.address],
        );

        await client.query(
          `insert into pos_connections
           (id, restaurant_id, provider, status, mode, restaurant_guid, location_id, metadata, last_tested_at, last_synced_at)
           values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10)`,
          [
            posConnectionId,
            restaurantId,
            posProvider,
            templatePOSConnection?.status ?? "sandbox",
            "mock",
            null,
            locationSeed.id,
            JSON.stringify({
              ...(templatePOSConnection?.metadata ?? {}),
              source: "onboarding",
              accountName: input.accountName,
              providerLocationId: locationSeed.id,
              templateRestaurantId: templateRestaurantId ?? null,
            }),
            templatePOSConnection?.lastTestedAt ?? now,
            now,
          ],
        );

        await client.query(
          `insert into ordering_rules
           (id, restaurant_id, minimum_lead_time_minutes, max_order_dollar_amount, max_item_quantity, max_headcount, auto_accept_enabled, manager_approval_threshold_cents, blackout_windows, allowed_fulfillment_types, substitution_policy, payment_policy, allowed_agent_ids)
           values ($1, $2, 45, 300, 1000, 1000, true, 2147483647, '[]'::jsonb, $3::text[], 'require_approval', 'required_before_submit', $4::text[])`,
          [rulesId, restaurantId, ["pickup", "delivery", "catering"], coachAgentId ? [coachAgentId] : []],
        );

        await client.query(
          `insert into operator_memberships
           (id, operator_user_id, restaurant_id, location_id, role, created_at)
           values ($1, $2, $3, $4, 'owner', $5)`,
          [membershipId, operatorUserId, restaurantId, locationId, now],
        );

        if (coachAgentId) {
          await client.query(
            `insert into restaurant_agent_permissions
             (id, restaurant_id, agent_id, status, notes, last_activity_at)
             values ($1, $2, $3, 'allowed', $4, $5)`,
            [permissionId, restaurantId, coachAgentId, `Enabled during ${input.activation.provider} onboarding.`, now],
          );
        }
      }

      await client.query("commit");
      const user = mapOperatorUser(userResult.rows[0]);
      const memberships = await this.getOperatorMemberships(user.id);
      return { user, memberships, selectedMembership: memberships[0] };
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async reconcileOperatorIdentity(
    identity: OperatorIdentity,
    options?: ReconcileOperatorOptions,
  ) {
    const identityUuid = isUuidLike(identity.id) ? identity.id : null;
    const existingResult = options?.linkIdentity === false
      ? await this.pool.query(
        `select *
         from operator_users
         where lower(email) = lower($1)
         limit 1`,
        [identity.email],
      )
      : await this.pool.query(
        `select *
         from operator_users
         where ($1::uuid is not null and supabase_user_id = $1::uuid)
            or lower(email) = lower($2)
         order by case when $1::uuid is not null and supabase_user_id = $1::uuid then 0 else 1 end
         limit 1`,
        [identityUuid, identity.email],
      );
    let operatorUserId = existingResult.rows[0]?.id as string | undefined;

    if (!operatorUserId && options?.allowSeededDevBootstrap && identity.email.toLowerCase() === "dev@rest.com") {
      const createdUser = await this.pool.query(
        `insert into operator_users
         (id, email, full_name, supabase_user_id, created_at, last_login_at)
         values ($1, $2, $3, $4, now(), $5)
         on conflict (id) do update
         set email = excluded.email,
             full_name = excluded.full_name,
             supabase_user_id = excluded.supabase_user_id,
             last_login_at = excluded.last_login_at
         returning *`,
        [
          "op_dev_rest",
          identity.email,
          identity.fullName ?? "Restaurant Dev Operator",
          identityUuid,
          options?.updateLastLoginAt ? new Date().toISOString() : null,
        ],
      );
      operatorUserId = createdUser.rows[0].id;
      const seededMemberships = [
        ["membership_lb_owner", "rest_lb_steakhouse", "loc_lb_main"],
        ["membership_pizza_palace_owner", "rest_pizza_palace", "loc_pizza_palace_main"],
        ["membership_green_leaf_salads_owner", "rest_green_leaf_salads", "loc_green_leaf_salads_main"],
        ["membership_sakura_sushi_house_owner", "rest_sakura_sushi_house", "loc_sakura_sushi_house_main"],
        ["membership_sunrise_taqueria_owner", "rest_sunrise_taqueria", "loc_sunrise_taqueria_main"],
        ["membership_midnight_noodle_bar_owner", "rest_midnight_noodle_bar", "loc_midnight_noodle_bar_main"],
        ["membership_harbor_sandwich_co_owner", "rest_harbor_sandwich_co", "loc_harbor_sandwich_co_main"],
      ] as const;
      for (const [membershipId, restaurantId, fallbackLocationId] of seededMemberships) {
        const restaurant = await this.getRestaurant(restaurantId);
        if (!restaurant) continue;
        const location = await this.getLocation(restaurantId);
        await this.pool.query(
          `insert into operator_memberships
           (id, operator_user_id, restaurant_id, location_id, role, created_at)
           values ($1, $2, $3, $4, 'owner', now())
           on conflict (id) do nothing`,
          [membershipId, operatorUserId, restaurantId, location?.id ?? fallbackLocationId],
        );
      }
    }

    if (!operatorUserId) {
      return null;
    }

    const existingLinkedId = existingResult.rows[0]?.supabase_user_id as string | undefined;
    if (options?.linkIdentity !== false && existingLinkedId && existingLinkedId !== identity.id) {
      throw new Error("Operator account is already linked to a different user.");
    }

    const updatedResult = await this.pool.query(
      `update operator_users
       set email = $2,
           full_name = $3,
           supabase_user_id = case when $6 then $4::uuid else supabase_user_id end,
           last_login_at = case when $5 then now() else last_login_at end
       where id = $1
       returning *`,
      [
        operatorUserId,
        identity.email,
        identity.fullName ?? "Restaurant Operator",
        identityUuid,
        options?.updateLastLoginAt === true,
        options?.linkIdentity !== false,
      ],
    );
    const user = mapOperatorUser(updatedResult.rows[0]);
    const memberships = await this.getOperatorMemberships(user.id);
    if (memberships.length === 0) return null;
    return { user, memberships, selectedMembership: memberships[0] };
  }

  async getAuthenticatedOperatorBySessionToken(sessionTokenHash: string): Promise<AuthenticatedOperator | null> {
    const sessionResult = await this.pool.query(
      `select
         s.selected_restaurant_id,
         s.selected_location_id,
         u.id,
         u.email,
         u.full_name,
         u.supabase_user_id,
         u.created_at,
         u.last_login_at
       from operator_sessions s
       join operator_users u on u.id = s.operator_user_id
       where s.session_token_hash = $1
         and s.expires_at > now()
       limit 1`,
      [sessionTokenHash],
    );
    if (!sessionResult.rows[0]) return null;
    const session = sessionResult.rows[0];
    const user = mapOperatorUser(session);
    const memberships = await this.getOperatorMemberships(user.id);
    const selectedMembership =
      memberships.find(
        (entry) => entry.restaurantId === session.selected_restaurant_id && entry.locationId === (session.selected_location_id ?? undefined),
      ) ??
      memberships.find((entry) => entry.restaurantId === session.selected_restaurant_id) ??
      memberships[0];
    if (!selectedMembership) return null;
    return { user, memberships, selectedMembership };
  }

  async createOperatorSession(args: {
    operatorUserId: string;
    selectedRestaurantId: string;
    selectedLocationId?: string;
    sessionTokenHash: string;
    expiresAt: string;
  }) {
    await this.pool.query(
      `insert into operator_sessions
       (id, operator_user_id, session_token_hash, selected_restaurant_id, selected_location_id, expires_at, created_at)
       values ($1, $2, $3, $4, $5, $6, now())`,
      [createId("sess"), args.operatorUserId, args.sessionTokenHash, args.selectedRestaurantId, args.selectedLocationId ?? null, args.expiresAt],
    );
  }

  async updateOperatorSessionSelection(sessionTokenHash: string, restaurantId: string, locationId?: string) {
    await this.pool.query(
      `update operator_sessions
       set selected_restaurant_id = $2,
           selected_location_id = $3
       where session_token_hash = $1`,
      [sessionTokenHash, restaurantId, locationId ?? null],
    );
  }

  async deleteOperatorSession(sessionTokenHash: string) {
    await this.pool.query("delete from operator_sessions where session_token_hash = $1", [sessionTokenHash]);
  }

  async listAccessibleRestaurants(operatorUserId: string) {
    const memberships = await this.getOperatorMemberships(operatorUserId);
    const restaurantIds = [...new Set(memberships.map((entry) => entry.restaurantId))];
    if (restaurantIds.length === 0) return [];
    const result = await this.pool.query("select * from restaurants where id = any($1::text[]) order by name asc", [restaurantIds]);
    return result.rows.map((row) => ({
      ...mapRestaurant(row),
      memberships: memberships.filter((membership) => membership.restaurantId === row.id),
    }));
  }

  async listTeamMembers(restaurantIds: string[]) {
    if (restaurantIds.length === 0) {
      return [];
    }
    const result = await this.pool.query(
      `select
         u.*,
         m.id as membership_id,
         m.restaurant_id,
         m.location_id,
         m.role,
         m.created_at as membership_created_at,
         r.name as restaurant_name
       from operator_memberships m
       join operator_users u on u.id = m.operator_user_id
       join restaurants r on r.id = m.restaurant_id
       where m.restaurant_id = any($1::text[])
       order by u.full_name asc, r.name asc`,
      [restaurantIds],
    );

    const byUser = new Map<string, TeamMemberRecord>();
    for (const row of result.rows) {
      const existing = byUser.get(row.id as string);
      if (!existing) {
        byUser.set(row.id as string, {
          user: mapOperatorUser(row),
          assignments: [],
        });
      }
      byUser.get(row.id as string)!.assignments.push({
        membershipId: row.membership_id,
        restaurantId: row.restaurant_id,
        restaurantName: row.restaurant_name,
        locationId: row.location_id ?? undefined,
        role: row.role,
      });
    }
    return [...byUser.values()];
  }

  async getTeamMemberRecord(operatorUserId: string) {
    const result = await this.pool.query(
      `select
         u.*,
         m.id as membership_id,
         m.restaurant_id,
         m.location_id,
         m.role,
         r.name as restaurant_name
       from operator_users u
       left join operator_memberships m on m.operator_user_id = u.id
       left join restaurants r on r.id = m.restaurant_id
       where u.id = $1
       order by r.name asc nulls last`,
      [operatorUserId],
    );

    const row = result.rows[0];
    if (!row) {
      return null;
    }

    return {
      user: mapOperatorUser(row),
      assignments: result.rows
        .filter((entry) => entry.membership_id)
        .map((entry) => ({
          membershipId: entry.membership_id,
          restaurantId: entry.restaurant_id,
          restaurantName: entry.restaurant_name ?? entry.restaurant_id,
          locationId: entry.location_id ?? undefined,
          role: entry.role,
        })),
    };
  }

  async createTeamMember(input: {
    creatorUserId: string;
    teamMember: CreateTeamMemberInput & { supabaseUserId?: string };
    restaurantIds: string[];
  }) {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const existingUser = await client.query(
        "select id from operator_users where lower(email) = lower($1) limit 1",
        [input.teamMember.email],
      );
      if (existingUser.rows[0]) {
        throw new Error("An operator account with that email already exists.");
      }

      const now = new Date().toISOString();
      const userId = createId("op");
      const userResult = await client.query(
        `insert into operator_users
         (id, email, full_name, password_hash, supabase_user_id, created_at, last_login_at)
         values ($1, $2, $3, null, $4::uuid, $5, null)
         returning *`,
        [userId, input.teamMember.email, input.teamMember.fullName, input.teamMember.supabaseUserId ?? null, now],
      );

      const assignments: TeamMemberRecord["assignments"] = [];
      for (const restaurantId of input.restaurantIds) {
        const membershipId = createId("membership");
        const locationResult = await client.query(
          "select id from restaurant_locations where restaurant_id = $1 order by id asc limit 1",
          [restaurantId],
        );
        const restaurantResult = await client.query("select name from restaurants where id = $1 limit 1", [restaurantId]);
        await client.query(
          `insert into operator_memberships
           (id, operator_user_id, restaurant_id, location_id, role, created_at)
           values ($1, $2, $3, $4, $5, $6)`,
          [membershipId, userId, restaurantId, locationResult.rows[0]?.id ?? null, input.teamMember.role, now],
        );
        assignments.push({
          membershipId,
          restaurantId,
          restaurantName: restaurantResult.rows[0]?.name ?? restaurantId,
          locationId: locationResult.rows[0]?.id ?? undefined,
          role: input.teamMember.role,
        });
      }

      await client.query("commit");
      return {
        user: mapOperatorUser(userResult.rows[0]),
        assignments,
      };
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async updateTeamMember(input: {
    operatorUserId: string;
    teamMember: UpdateTeamMemberInput;
    restaurantIds: string[];
    managedRestaurantIds: string[];
  }) {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const userResult = await client.query("select * from operator_users where id = $1 limit 1", [input.operatorUserId]);
      if (!userResult.rows[0]) {
        throw new Error("Team member not found.");
      }
      const duplicate = await client.query(
        "select id from operator_users where id <> $1 and lower(email) = lower($2) limit 1",
        [input.operatorUserId, input.teamMember.email],
      );
      if (duplicate.rows[0]) {
        throw new Error("An operator account with that email already exists.");
      }

      await client.query(
        `update operator_users
         set email = $2,
             full_name = $3
         where id = $1`,
        [input.operatorUserId, input.teamMember.email, input.teamMember.fullName],
      );

      await client.query(
        `delete from operator_memberships
         where operator_user_id = $1
           and restaurant_id = any($2::text[])
           and not (restaurant_id = any($3::text[]))`,
        [input.operatorUserId, input.managedRestaurantIds, input.restaurantIds],
      );

      const now = new Date().toISOString();
      for (const restaurantId of input.restaurantIds) {
        const locationResult = await client.query(
          "select id from restaurant_locations where restaurant_id = $1 order by id asc limit 1",
          [restaurantId],
        );
        const existingMembership = await client.query(
          "select id from operator_memberships where operator_user_id = $1 and restaurant_id = $2 limit 1",
          [input.operatorUserId, restaurantId],
        );
        if (existingMembership.rows[0]) {
          await client.query(
            `update operator_memberships
             set role = $2,
                 location_id = $3
             where id = $1`,
            [existingMembership.rows[0].id, input.teamMember.role, locationResult.rows[0]?.id ?? null],
          );
        } else {
          await client.query(
            `insert into operator_memberships
             (id, operator_user_id, restaurant_id, location_id, role, created_at)
             values ($1, $2, $3, $4, $5, $6)`,
            [createId("membership"), input.operatorUserId, restaurantId, locationResult.rows[0]?.id ?? null, input.teamMember.role, now],
          );
        }
      }

      await client.query("commit");
      const [updatedUser, assignments] = await Promise.all([
        this.pool.query("select * from operator_users where id = $1 limit 1", [input.operatorUserId]),
        this.listTeamMembers(input.restaurantIds),
      ]);
      const record = assignments.find((entry) => entry.user.id === input.operatorUserId);
      return record ?? { user: mapOperatorUser(updatedUser.rows[0]), assignments: [] };
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async deleteTeamMember(operatorUserId: string, managedRestaurantIds: string[]) {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query(
        "delete from operator_memberships where operator_user_id = $1 and restaurant_id = any($2::text[])",
        [operatorUserId, managedRestaurantIds],
      );
      const remainingMemberships = await client.query(
        "select 1 from operator_memberships where operator_user_id = $1 limit 1",
        [operatorUserId],
      );
      if (!remainingMemberships.rows[0]) {
        await client.query("delete from operator_users where id = $1", [operatorUserId]);
      }
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async listRestaurants() {
    const result = await this.pool.query("select * from restaurants order by created_at asc");
    return result.rows.map(mapRestaurant);
  }

  async getRestaurant(restaurantId: string) {
    const result = await this.pool.query("select * from restaurants where id = $1 limit 1", [restaurantId]);
    return result.rows[0] ? mapRestaurant(result.rows[0]) : null;
  }

  async updateRestaurant(restaurantId: string, patch: Partial<Restaurant>) {
    const current = required(await this.getRestaurant(restaurantId), `Restaurant ${restaurantId} not found.`);
    const updated = {
      ...current,
      ...patch,
    };
    const result = await this.pool.query(
      `update restaurants
       set name = $2,
           location = $3,
           timezone = $4,
           pos_provider = $5,
           agent_ordering_enabled = $6,
           default_approval_mode = $7,
           contact_email = $8,
           contact_phone = $9,
           fulfillment_types_supported = $10,
           updated_at = $11
       where id = $1
       returning *`,
      [
        restaurantId,
        updated.name,
        updated.location,
        updated.timezone,
        updated.posProvider,
        updated.agentOrderingEnabled,
        updated.defaultApprovalMode,
        updated.contactEmail,
        updated.contactPhone,
        updated.fulfillmentTypesSupported,
        updated.updatedAt,
      ],
    );
    return mapRestaurant(result.rows[0]);
  }

  async getPOSConnection(restaurantId: string) {
    const result = await this.pool.query("select * from pos_connections where restaurant_id = $1 limit 1", [restaurantId]);
    const connection = result.rows[0] ? mapPOSConnection(result.rows[0]) : null;
    if (!connection) {
      return null;
    }

    const templateRestaurantId =
      templateRestaurantIdFromMetadata(connection.metadata) ?? (await inferTemplateRestaurantIdForRestaurant(this.pool, restaurantId));
    if (!templateRestaurantId || templateRestaurantId === restaurantId) {
      return connection;
    }

    const templateResult = await this.pool.query("select * from pos_connections where restaurant_id = $1 limit 1", [
      templateRestaurantId,
    ]);
    const templateConnection = templateResult.rows[0] ? mapPOSConnection(templateResult.rows[0]) : null;
    if (!templateConnection) {
      return connection;
    }

    return {
      ...connection,
      lastTestedAt: connection.lastTestedAt ?? templateConnection.lastTestedAt,
      lastSyncedAt: connection.lastSyncedAt ?? templateConnection.lastSyncedAt,
      metadata: {
        ...templateConnection.metadata,
        ...connection.metadata,
      },
    };
  }

  async updatePOSConnection(connectionId: string, patch: Partial<POSConnection>) {
    const currentResult = await this.pool.query("select * from pos_connections where id = $1 limit 1", [connectionId]);
    const current = required(currentResult.rows[0], `POS connection ${connectionId} not found.`);
    const updated = mapPOSConnection(current);
    Object.assign(updated, patch);
    const result = await this.pool.query(
      `update pos_connections
       set provider = $2,
           status = $3,
           mode = $4,
           restaurant_guid = $5,
           location_id = $6,
           metadata = $7::jsonb,
           last_tested_at = $8,
           last_synced_at = $9
       where id = $1
       returning *`,
      [
        connectionId,
        updated.provider,
        updated.status,
        updated.mode,
        updated.restaurantGuid ?? null,
        updated.locationId ?? null,
        JSON.stringify(updated.metadata ?? {}),
        updated.lastTestedAt ?? null,
        updated.lastSyncedAt ?? null,
      ],
    );
    return mapPOSConnection(result.rows[0]);
  }

  async getLocation(restaurantId: string) {
    const result = await this.pool.query("select * from restaurant_locations where restaurant_id = $1 limit 1", [restaurantId]);
    return result.rows[0] ? mapLocation(result.rows[0]) : null;
  }

  async getMenu(restaurantId: string) {
    const connection = await this.getPOSConnection(restaurantId);
    const itemCountResult = await this.pool.query("select count(*)::int as count from canonical_menu_items where restaurant_id = $1", [
      restaurantId,
    ]);
    const templateRestaurantId =
      templateRestaurantIdFromMetadata(connection?.metadata) ?? (await inferTemplateRestaurantIdForRestaurant(this.pool, restaurantId));
    const sourceRestaurantId =
      itemCountResult.rows[0]?.count > 0 || !templateRestaurantId ? restaurantId : templateRestaurantId;

    const [items, groups, modifiers, mappings] = await Promise.all([
      this.pool.query("select * from canonical_menu_items where restaurant_id = $1 order by category, name", [sourceRestaurantId]),
      this.pool.query("select * from canonical_modifier_groups where restaurant_id = $1 order by name", [sourceRestaurantId]),
      this.pool.query(
        `select m.*
         from canonical_modifiers m
         join canonical_modifier_groups g on g.id = m.modifier_group_id
         where g.restaurant_id = $1
         order by m.name`,
        [sourceRestaurantId],
      ),
      this.pool.query("select * from pos_menu_mappings where restaurant_id = $1 order by canonical_type, canonical_id", [
        sourceRestaurantId,
      ]),
    ]);
    return {
      items: items.rows.map((row) => ({ ...mapMenuItem(row), restaurantId })),
      modifierGroups: groups.rows.map((row) => ({ ...mapModifierGroup(row), restaurantId })),
      modifiers: modifiers.rows.map(mapModifier),
      mappings: mappings.rows.map((row) => ({ ...mapMapping(row), restaurantId })),
    };
  }

  async getRules(restaurantId: string) {
    const result = await this.pool.query("select * from ordering_rules where restaurant_id = $1 limit 1", [restaurantId]);
    return result.rows[0] ? mapRules(result.rows[0]) : null;
  }

  async updateRules(restaurantId: string, patch: Partial<OrderingRule>) {
    const current = required(await this.getRules(restaurantId), `Rules missing for restaurant ${restaurantId}.`);
    const updated = { ...current, ...patch };
    const result = await this.pool.query(
      `update ordering_rules
       set minimum_lead_time_minutes = $2,
           max_order_dollar_amount = $3,
           max_item_quantity = $4,
           max_headcount = $5,
           auto_accept_enabled = $6,
           manager_approval_threshold_cents = $7,
           blackout_windows = $8::jsonb,
           allowed_fulfillment_types = $9,
           substitution_policy = $10,
           payment_policy = $11,
           allowed_agent_ids = $12
       where restaurant_id = $1
       returning *`,
      [
        restaurantId,
        updated.minimumLeadTimeMinutes,
        updated.maxOrderDollarAmount,
        updated.maxItemQuantity,
        updated.maxHeadcount,
        updated.autoAcceptEnabled,
        updated.managerApprovalThresholdCents,
        JSON.stringify(updated.blackoutWindows),
        updated.allowedFulfillmentTypes,
        updated.substitutionPolicy,
        updated.paymentPolicy,
        updated.allowedAgentIds,
      ],
    );
    return mapRules(result.rows[0]);
  }

  async listAgents(restaurantId: string): Promise<AgentListEntry[]> {
    const result = await this.pool.query(
      `select
         p.id as permission_id,
         p.restaurant_id,
         p.status,
         p.notes,
         p.last_activity_at,
         a.id as agent_id,
         a.partner_id,
         a.name as agent_name,
         a.slug as agent_slug,
         a.description as agent_description,
         a.created_at as agent_created_at,
         partner.name as partner_name,
         partner.slug as partner_slug,
         partner.status as partner_status,
         partner.contact_email as partner_contact_email,
         partner.created_at as partner_created_at,
         partner.updated_at as partner_updated_at,
         k.id as key_id,
         k.label as key_label,
         k.key_prefix,
         k.scopes,
         k.last_used_at,
         k.created_at as key_created_at,
         k.rotated_at,
         k.revoked_at
       from agents a
       left join restaurant_agent_permissions p on p.agent_id = a.id and p.restaurant_id = $1
       left join partners partner on partner.id = a.partner_id
       left join agent_api_keys k on k.agent_id = a.id and k.rotated_at is null
       where p.id is not null
          or exists (
            select 1
            from partner_credentials pc
            join partners credential_partner on credential_partner.id = pc.partner_id
            where pc.agent_id = a.id
              and pc.environment = 'live'
              and pc.revoked_at is null
              and credential_partner.status = 'approved'
          )
       order by a.name asc`,
      [restaurantId],
    );
    return result.rows.map((row) => ({
      permissionId: row.permission_id ?? `pending:${restaurantId}:${row.agent_id}`,
      agent: {
        id: row.agent_id,
        partnerId: row.partner_id ?? undefined,
        partner: row.partner_id
          ? {
              id: row.partner_id,
              name: row.partner_name,
              slug: row.partner_slug,
              status: row.partner_status,
              contactEmail: row.partner_contact_email ?? undefined,
              createdAt: row.partner_created_at,
              updatedAt: row.partner_updated_at,
            }
          : undefined,
        name: row.agent_name,
        slug: row.agent_slug,
        description: row.agent_description,
        createdAt: row.agent_created_at,
      },
      permission: row.permission_id
        ? {
            id: row.permission_id,
            restaurantId: row.restaurant_id,
            agentId: row.agent_id,
            status: row.status,
            notes: row.notes ?? undefined,
            lastActivityAt: row.last_activity_at ?? undefined,
          }
        : {
            id: `pending:${restaurantId}:${row.agent_id}`,
            restaurantId,
            agentId: row.agent_id,
            status: "pending",
          },
      apiKey: row.key_id
        ? {
            id: row.key_id,
            label: row.key_label,
            keyPrefix: row.key_prefix,
            scopes: row.scopes ?? [],
            lastUsedAt: row.last_used_at ?? undefined,
            createdAt: row.key_created_at,
            rotatedAt: row.rotated_at ?? undefined,
            revokedAt: row.revoked_at ?? undefined,
          }
        : null,
    }));
  }

  async getAgent(agentId: string) {
    const result = await this.pool.query(
      `select
         a.*,
         p.name as partner_name,
         p.slug as partner_slug,
         p.status as partner_status,
         p.contact_email as partner_contact_email,
         p.created_at as partner_created_at,
         p.updated_at as partner_updated_at
       from agents a
       left join partners p on p.id = a.partner_id
       where a.id = $1
       limit 1`,
      [agentId],
    );
    if (!result.rows[0]) return null;
    const agent = mapAgent(result.rows[0]);
    if (!result.rows[0].partner_id) return agent;
    return {
      ...agent,
      partner: {
        id: result.rows[0].partner_id,
        name: result.rows[0].partner_name,
        slug: result.rows[0].partner_slug,
        status: result.rows[0].partner_status,
        contactEmail: result.rows[0].partner_contact_email ?? undefined,
        createdAt: result.rows[0].partner_created_at,
        updatedAt: result.rows[0].partner_updated_at,
      },
    };
  }

  async listPartners() {
    const result = await this.pool.query("select * from partners order by name asc");
    return result.rows.map(mapPartner);
  }

  async createPartner(args: { name: string; slug: string; status: Partner["status"]; contactEmail?: string }): Promise<Partner> {
    const result = await this.pool.query(
      `insert into partners (id, name, slug, status, contact_email, created_at, updated_at)
       values ($1, $2, $3, $4, $5, now(), now())
       returning *`,
      [createId("partner"), args.name, args.slug, args.status, args.contactEmail ?? null],
    );
    return mapPartner(result.rows[0]);
  }

  async updatePartner(
    partnerId: string,
    patch: Partial<Pick<Partner, "name" | "slug" | "status" | "contactEmail">>,
  ): Promise<Partner> {
    const currentResult = await this.pool.query("select * from partners where id = $1 limit 1", [partnerId]);
    const current = required(currentResult.rows[0], `Partner ${partnerId} not found.`);
    const mapped = { ...mapPartner(current), ...patch };
    const result = await this.pool.query(
      `update partners
       set name = $2,
           slug = $3,
           status = $4,
           contact_email = $5,
           updated_at = now()
       where id = $1
       returning *`,
      [partnerId, mapped.name, mapped.slug, mapped.status, mapped.contactEmail ?? null],
    );
    return mapPartner(result.rows[0]);
  }

  async deletePartner(partnerId: string) {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const existing = await client.query("select id from partners where id = $1 limit 1", [partnerId]);
      required(existing.rows[0], `Partner ${partnerId} not found.`);
      await client.query("delete from partner_credentials where partner_id = $1", [partnerId]);
      await client.query(
        `update agents
         set partner_id = null,
             slug = slug || '-removed-' || right(regexp_replace(id, '[^a-zA-Z0-9]', '', 'g'), 6)
         where partner_id = $1`,
        [partnerId],
      );
      await client.query("delete from partners where id = $1", [partnerId]);
      await client.query("commit");
    } catch (error) {
      await client.query("rollback").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  async listPartnerAgents(partnerId: string) {
    const result = await this.pool.query(
      `select
         a.*,
         p.name as partner_name,
         p.slug as partner_slug,
         p.status as partner_status,
         p.contact_email as partner_contact_email,
         p.created_at as partner_created_at,
         p.updated_at as partner_updated_at
       from agents a
       left join partners p on p.id = a.partner_id
       where a.partner_id = $1
       order by a.name asc`,
      [partnerId],
    );
    return result.rows.map((row) => {
      const agent = mapAgent(row);
      return {
        ...agent,
        partner: {
          id: row.partner_id,
          name: row.partner_name,
          slug: row.partner_slug,
          status: row.partner_status,
          contactEmail: row.partner_contact_email ?? undefined,
          createdAt: row.partner_created_at,
          updatedAt: row.partner_updated_at,
        },
      };
    });
  }

  async createPartnerAgent(args: { partnerId: string; name: string; slug: string; description?: string }): Promise<Agent> {
    const result = await this.pool.query(
      `insert into agents (id, partner_id, name, slug, description, created_at)
       values ($1, $2, $3, $4, $5, now())
       returning *`,
      [createId("agent"), args.partnerId, args.name, args.slug, args.description ?? ""],
    );
    return mapAgent(result.rows[0]);
  }

  async updatePartnerAgent(
    partnerId: string,
    agentId: string,
    patch: Partial<Pick<Agent, "name" | "slug" | "description">>,
  ): Promise<Agent> {
    const currentResult = await this.pool.query("select * from agents where id = $1 and partner_id = $2 limit 1", [
      agentId,
      partnerId,
    ]);
    const current = required(currentResult.rows[0], `Partner agent ${agentId} not found.`);
    const mapped = { ...mapAgent(current), ...patch };
    const result = await this.pool.query(
      `update agents
       set name = $3,
           slug = $4,
           description = $5
       where id = $1 and partner_id = $2
       returning *`,
      [agentId, partnerId, mapped.name, mapped.slug, mapped.description],
    );
    return mapAgent(result.rows[0]);
  }

  async removePartnerAgent(partnerId: string, agentId: string) {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const existing = await client.query("select id from agents where id = $1 and partner_id = $2 limit 1", [
        agentId,
        partnerId,
      ]);
      required(existing.rows[0], `Partner agent ${agentId} not found.`);
      await client.query("delete from partner_credentials where partner_id = $1 and agent_id = $2", [partnerId, agentId]);
      await client.query(
        `update agents
         set partner_id = null,
             slug = slug || '-removed-' || right(regexp_replace(id, '[^a-zA-Z0-9]', '', 'g'), 6)
         where id = $1 and partner_id = $2`,
        [agentId, partnerId],
      );
      await client.query("commit");
    } catch (error) {
      await client.query("rollback").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  async getPermission(restaurantId: string, agentId: string) {
    const result = await this.pool.query(
      "select * from restaurant_agent_permissions where restaurant_id = $1 and agent_id = $2 limit 1",
      [restaurantId, agentId],
    );
    return result.rows[0] ? mapPermission(result.rows[0]) : null;
  }

  async updatePermission(permissionId: string, patch: Partial<RestaurantAgentPermission>) {
    const currentResult = await this.pool.query("select * from restaurant_agent_permissions where id = $1 limit 1", [permissionId]);
    const current = required(currentResult.rows[0], `Permission ${permissionId} not found.`);
    const mapped = { ...mapPermission(current), ...patch };
    const result = await this.pool.query(
      `update restaurant_agent_permissions
       set status = $2,
           notes = $3,
           last_activity_at = $4
       where id = $1
       returning *`,
      [permissionId, mapped.status, mapped.notes ?? null, mapped.lastActivityAt ?? null],
    );
    return mapPermission(result.rows[0]);
  }

  async createPermission(args: {
    restaurantId: string;
    agentId: string;
    status: RestaurantAgentPermission["status"];
    notes?: string;
    lastActivityAt?: string;
  }) {
    const result = await this.pool.query(
      `insert into restaurant_agent_permissions
       (id, restaurant_id, agent_id, status, notes, last_activity_at)
       values ($1, $2, $3, $4, $5, $6)
       on conflict (restaurant_id, agent_id)
       do update set
         status = excluded.status,
         notes = excluded.notes,
         last_activity_at = excluded.last_activity_at
       returning *`,
      [
        createId("perm"),
        args.restaurantId,
        args.agentId,
        args.status,
        args.notes ?? null,
        args.lastActivityAt ?? null,
      ],
    );
    return mapPermission(result.rows[0]);
  }

  async createAgentApiKey(args: {
    agentId: string;
    label: string;
    keyPrefix: string;
    keyHash: string;
    scopes: AgentApiScope[];
  }) {
    const result = await this.pool.query(
      `insert into agent_api_keys
       (id, agent_id, label, key_prefix, key_hash, scopes, created_at)
       values ($1, $2, $3, $4, $5, $6, now())
       returning *`,
      [createId("key"), args.agentId, args.label, args.keyPrefix, args.keyHash, args.scopes],
    );
    return mapKey(result.rows[0]);
  }

  async updateAgentApiKey(
    keyId: string,
    patch: Partial<Pick<AgentApiKey, "label" | "keyHash" | "keyPrefix" | "scopes" | "rotatedAt" | "revokedAt" | "lastUsedAt">>,
  ) {
    const currentResult = await this.pool.query("select * from agent_api_keys where id = $1 limit 1", [keyId]);
    const current = required(currentResult.rows[0], `Agent API key ${keyId} not found.`);
    const mapped = { ...mapKey(current), ...patch };
    const result = await this.pool.query(
      `update agent_api_keys
       set label = $2,
           key_prefix = $3,
           key_hash = $4,
           scopes = $5,
           rotated_at = $6,
           revoked_at = $7,
           last_used_at = $8
       where id = $1
       returning *`,
      [keyId, mapped.label, mapped.keyPrefix, mapped.keyHash, mapped.scopes, mapped.rotatedAt ?? null, mapped.revokedAt ?? null, mapped.lastUsedAt ?? null],
    );
    return mapKey(result.rows[0]);
  }

  async listAgentApiKeys(agentId: string) {
    const result = await this.pool.query("select * from agent_api_keys where agent_id = $1 order by created_at desc", [agentId]);
    return result.rows.map(mapKey);
  }

  async createPartnerCredential(args: {
    partnerId: string;
    agentId: string;
    label: string;
    keyPrefix: string;
    keyHash: string;
    scopes: AgentApiScope[];
    environment: PartnerCredential["environment"];
  }) {
    const result = await this.pool.query(
      `insert into partner_credentials
       (id, partner_id, agent_id, label, key_prefix, key_hash, scopes, environment, created_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, now())
       returning *`,
      [createId("pcred"), args.partnerId, args.agentId, args.label, args.keyPrefix, args.keyHash, args.scopes, args.environment],
    );
    return mapPartnerCredential(result.rows[0]);
  }

  async updatePartnerCredential(
    credentialId: string,
    patch: Partial<Pick<PartnerCredential, "label" | "keyHash" | "keyPrefix" | "scopes" | "environment" | "rotatedAt" | "revokedAt" | "lastUsedAt">>,
  ) {
    const currentResult = await this.pool.query("select * from partner_credentials where id = $1 limit 1", [credentialId]);
    const current = required(currentResult.rows[0], `Partner credential ${credentialId} not found.`);
    const mapped = { ...mapPartnerCredential(current), ...patch };
    const result = await this.pool.query(
      `update partner_credentials
       set label = $2,
           key_prefix = $3,
           key_hash = $4,
           scopes = $5,
           environment = $6,
           rotated_at = $7,
           revoked_at = $8,
           last_used_at = $9
       where id = $1
       returning *`,
      [
        credentialId,
        mapped.label,
        mapped.keyPrefix,
        mapped.keyHash,
        mapped.scopes,
        mapped.environment,
        mapped.rotatedAt ?? null,
        mapped.revokedAt ?? null,
        mapped.lastUsedAt ?? null,
      ],
    );
    return mapPartnerCredential(result.rows[0]);
  }

  async deletePartnerCredential(partnerId: string, credentialId: string) {
    const result = await this.pool.query("delete from partner_credentials where partner_id = $1 and id = $2", [
      partnerId,
      credentialId,
    ]);
    if (result.rowCount === 0) {
      throw new Error(`Partner credential ${credentialId} not found.`);
    }
  }

  async listPartnerCredentials(partnerId: string) {
    const result = await this.pool.query("select * from partner_credentials where partner_id = $1 order by created_at desc", [partnerId]);
    return result.rows.map(mapPartnerCredential);
  }

  async listOrders(restaurantId: string) {
    const cutoffTime = new Date(appNow().getTime() - 2 * 60 * 60 * 1000).toISOString();
    const result = await this.pool.query(
      `select ao.*, a.name as agent_name
       from agent_orders ao
       left join agents a on a.id = ao.agent_id
       where ao.restaurant_id = $1
         and ao.status not in ('completed', 'rejected', 'failed', 'cancelled')
         and ao.requested_fulfillment_time >= $2::timestamptz
       order by ao.requested_fulfillment_time asc, ao.created_at asc`,
      [restaurantId, cutoffTime],
    );
    return result.rows.map(mapOrder);
  }

  async getOrderDetail(restaurantId: string, orderId: string): Promise<OrderDetailRecord | null> {
    const orderResult = await this.pool.query(
      `select ao.*, a.name as agent_name
       from agent_orders ao
       left join agents a on a.id = ao.agent_id
       where ao.restaurant_id = $1 and ao.id = $2
       limit 1`,
      [restaurantId, orderId],
    );
    if (!orderResult.rows[0]) return null;
    const order = mapOrder(orderResult.rows[0]);
    const [itemsResult, modifiersResult, validationsResult, quotesResult, submissionsResult, statusResult, auditResult, retryResult] = await Promise.all([
      this.pool.query(
        `select i.*, row_to_json(m.*) as menu_item
         from agent_order_items i
         join canonical_menu_items m on m.id = i.menu_item_id
         where i.order_id = $1
         order by i.id asc`,
        [orderId],
      ),
      this.pool.query(
        `select om.*, row_to_json(m.*) as modifier
         from agent_order_modifiers om
         join canonical_modifiers m on m.id = om.modifier_id
         join agent_order_items oi on oi.id = om.order_item_id
         where oi.order_id = $1
         order by om.id asc`,
        [orderId],
      ),
      this.pool.query("select * from order_validation_results where order_id = $1 order by checked_at desc", [orderId]),
      this.pool.query("select * from order_quotes where order_id = $1 order by quoted_at desc", [orderId]),
      this.pool.query("select * from pos_order_submissions where order_id = $1 order by submitted_at desc", [orderId]),
      this.pool.query("select * from order_status_events where order_id = $1 order by created_at desc", [orderId]),
      this.pool.query("select * from audit_logs where target_id = $1 order by created_at desc", [orderId]),
      this.pool.query("select * from order_retry_attempts where order_id = $1 order by created_at desc", [orderId]),
    ]);

    const modifiersByItemId = new Map<string, Array<any>>();
    modifiersResult.rows.forEach((row) => {
      const list = modifiersByItemId.get(row.order_item_id) ?? [];
      list.push({
        id: row.id,
        orderItemId: row.order_item_id,
        modifierGroupId: row.modifier_group_id,
        modifierId: row.modifier_id,
        quantity: row.quantity,
        modifier: row.modifier ? mapModifier(row.modifier) : undefined,
      });
      modifiersByItemId.set(row.order_item_id, list);
    });

    const detail: OrderDetailRecord = {
      order,
      items: itemsResult.rows.map((row) => ({
        id: row.id,
        orderId: row.order_id,
        menuItemId: row.menu_item_id,
        quantity: row.quantity,
        notes: row.notes ?? undefined,
        menuItem: row.menu_item ? mapMenuItem(row.menu_item) : undefined,
        modifiers: modifiersByItemId.get(row.id) ?? [],
      })),
      validationResults: validationsResult.rows.map(mapValidation),
      quotes: quotesResult.rows.map(mapQuote),
      submissions: submissionsResult.rows.map(mapSubmission),
      statusEvents: statusResult.rows.map(mapStatusEvent),
      auditLogs: auditResult.rows.map(mapAudit),
      retries: retryResult.rows.map(mapRetry),
    };
    detail.timeline = buildTimeline(detail as Required<Pick<OrderDetailRecord, "validationResults" | "quotes" | "submissions" | "statusEvents" | "auditLogs" | "retries">>);
    detail.diagnostics = {
      rawOrderIntent: order.orderIntent,
      latestValidation: detail.validationResults[0],
      latestQuote: detail.quotes[0],
      latestSubmission: detail.submissions[0],
      mappedPayload: detail.submissions[0]?.payloadSnapshot,
      retries: detail.retries ?? [],
    };
    return detail;
  }

  async getOrderById(orderId: string) {
    const result = await this.pool.query(
      `select ao.*, a.name as agent_name
       from agent_orders ao
       left join agents a on a.id = ao.agent_id
       where ao.id = $1
       limit 1`,
      [orderId],
    );
    return result.rows[0] ? mapOrder(result.rows[0]) : null;
  }

  async findOrderIdByReference(reference: string) {
    const result = await this.pool.query(
      "select id from agent_orders where external_order_reference = $1 order by created_at desc limit 1",
      [reference],
    );
    return result.rows[0]?.id ?? null;
  }

  async createOrderGraph(input: OrderGraphInput) {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query(
        `insert into agent_orders (
           id, restaurant_id, agent_id, external_order_reference, customer_name, customer_email, team_name,
           fulfillment_type, requested_fulfillment_time, headcount, status, approval_required,
           total_estimate_cents, order_intent, packaging_instructions, dietary_constraints, created_at, updated_at
         ) values (
           $1, $2, $3, $4, $5, $6, $7,
           $8, $9, $10, $11, $12,
           $13, $14::jsonb, $15, $16, $17, $18
         )`,
        [
          input.order.id,
          input.order.restaurantId,
          input.order.agentId,
          input.order.externalOrderReference,
          input.order.customerName,
          input.order.customerEmail ?? null,
          input.order.teamName ?? null,
          input.order.fulfillmentType,
          input.order.requestedFulfillmentTime,
          input.order.headcount,
          input.order.status,
          input.order.approvalRequired,
          input.order.totalEstimateCents,
          JSON.stringify(input.order.orderIntent),
          input.order.packagingInstructions ?? null,
          input.order.dietaryConstraints,
          input.order.createdAt,
          input.order.updatedAt,
        ],
      );
      for (const item of input.items) {
        await client.query(
          "insert into agent_order_items (id, order_id, menu_item_id, quantity, notes) values ($1, $2, $3, $4, $5)",
          [item.id, item.orderId, item.menuItemId, item.quantity, item.notes ?? null],
        );
      }
      for (const modifier of input.modifiers) {
        await client.query(
          `insert into agent_order_modifiers (id, order_item_id, modifier_group_id, modifier_id, quantity)
           values ($1, $2, $3, $4, $5)`,
          [modifier.id, modifier.orderItemId, modifier.modifierGroupId, modifier.modifierId, modifier.quantity],
        );
      }
      await client.query(
        "insert into order_validation_results (id, order_id, valid, issues, checked_at) values ($1, $2, $3, $4::jsonb, $5)",
        [
          input.validationResult.id,
          input.validationResult.orderId,
          input.validationResult.valid,
          JSON.stringify(input.validationResult.issues),
          input.validationResult.checkedAt,
        ],
      );
      await client.query(
        `insert into order_quotes
         (id, order_id, subtotal_cents, tax_cents, fees_cents, tip_cents, total_cents, currency, quoted_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          input.quote.id,
          input.quote.orderId,
          input.quote.subtotalCents,
          input.quote.taxCents,
          input.quote.feesCents,
          input.quote.tipCents,
          input.quote.totalCents,
          input.quote.currency,
          input.quote.quotedAt,
        ],
      );
      for (const event of input.statusEvents) {
        await client.query(
          "insert into order_status_events (id, order_id, status, message, created_at) values ($1, $2, $3, $4, $5)",
          [createId("evt"), event.orderId, event.status, event.message, new Date().toISOString()],
        );
      }
      await client.query(
        `insert into audit_logs
         (id, restaurant_id, actor_type, actor_id, action, target_type, target_id, summary, created_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          createId("audit"),
          input.auditLog.restaurantId,
          input.auditLog.actorType,
          input.auditLog.actorId,
          input.auditLog.action,
          input.auditLog.targetType,
          input.auditLog.targetId,
          input.auditLog.summary,
          new Date().toISOString(),
        ],
      );
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async updateOrder(orderId: string, patch: Partial<AgentOrderRecord>) {
    const current = required(await this.getOrderById(orderId), `Order ${orderId} not found.`);
    const updated = { ...current, ...patch };
    const result = await this.pool.query(
      `update agent_orders
       set status = $2,
           total_estimate_cents = $3,
           updated_at = $4,
           approval_required = $5,
           packaging_instructions = $6,
           dietary_constraints = $7
       where id = $1
       returning *`,
      [
        orderId,
        updated.status,
        updated.totalEstimateCents,
        updated.updatedAt,
        updated.approvalRequired,
        updated.packagingInstructions ?? null,
        updated.dietaryConstraints,
      ],
    );
    return mapOrder(result.rows[0]);
  }

  async saveValidationResult(result: OrderValidationResult) {
    await this.pool.query(
      "insert into order_validation_results (id, order_id, valid, issues, checked_at, idempotency_key) values ($1, $2, $3, $4::jsonb, $5, $6)",
      [result.id, result.orderId, result.valid, JSON.stringify(result.issues), result.checkedAt, result.idempotencyKey ?? null],
    );
  }

  async saveQuote(quote: OrderQuote) {
    await this.pool.query(
      `insert into order_quotes
       (id, order_id, subtotal_cents, tax_cents, fees_cents, tip_cents, total_cents, currency, quoted_at, idempotency_key)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [quote.id, quote.orderId, quote.subtotalCents, quote.taxCents, quote.feesCents, quote.tipCents, quote.totalCents, quote.currency, quote.quotedAt, quote.idempotencyKey ?? null],
    );
  }

  async getLatestQuote(orderId: string) {
    const result = await this.pool.query(
      "select * from order_quotes where order_id = $1 order by quoted_at desc limit 1",
      [orderId],
    );
    return result.rows[0] ? mapQuote(result.rows[0]) : null;
  }

  async saveSubmission(submission: POSOrderSubmission) {
    await this.pool.query(
      `insert into pos_order_submissions
       (id, order_id, provider, status, external_order_id, response, payload_snapshot, attempt_count, submitted_at)
       values ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9)`,
      [
        submission.id,
        submission.orderId,
        submission.provider,
        submission.status,
        submission.externalOrderId ?? null,
        JSON.stringify(submission.response),
        JSON.stringify(submission.payloadSnapshot ?? {}),
        submission.attemptCount ?? 1,
        submission.submittedAt,
      ],
    );
  }

  async getLatestSubmission(orderId: string) {
    const result = await this.pool.query(
      "select * from pos_order_submissions where order_id = $1 order by submitted_at desc limit 1",
      [orderId],
    );
    return result.rows[0] ? mapSubmission(result.rows[0]) : null;
  }

  async appendStatusEvent(event: Omit<StatusEvent, "id" | "createdAt">) {
    const id = createId("evt");
    const createdAt = new Date().toISOString();
    const result = await this.pool.query(
      "insert into order_status_events (id, order_id, status, message, created_at) values ($1, $2, $3, $4, $5) returning *",
      [id, event.orderId, event.status, event.message, createdAt],
    );
    return mapStatusEvent(result.rows[0]);
  }

  async appendAuditLog(log: Omit<AuditLog, "id" | "createdAt">) {
    const id = createId("audit");
    const createdAt = new Date().toISOString();
    const result = await this.pool.query(
      `insert into audit_logs
       (id, restaurant_id, actor_type, actor_id, action, target_type, target_id, summary, created_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       returning *`,
      [id, log.restaurantId, log.actorType, log.actorId, log.action, log.targetType, log.targetId, log.summary, createdAt],
    );
    return mapAudit(result.rows[0]);
  }

  async getIdempotencyRecord(scope: "validate" | "quote" | "submit", restaurantId: string, agentId: string, idempotencyKey: string) {
    const result = await this.pool.query(
      `select * from api_idempotency_records
       where scope = $1 and restaurant_id = $2 and agent_id = $3 and idempotency_key = $4
       limit 1`,
      [scope, restaurantId, agentId, idempotencyKey],
    );
    return result.rows[0] ? mapIdempotency(result.rows[0]) : null;
  }

  async createIdempotencyRecord(input: Omit<IdempotencyRecord, "id" | "createdAt" | "updatedAt">) {
    const result = await this.pool.query(
      `insert into api_idempotency_records
       (id, scope, restaurant_id, agent_id, idempotency_key, request_hash, status, order_id, response, error, created_at, updated_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, now(), now())
       returning *`,
      [createId("idem"), input.scope, input.restaurantId, input.agentId, input.idempotencyKey, input.requestHash, input.status, input.orderId ?? null, input.response ? JSON.stringify(input.response) : null, input.error ?? null],
    );
    return mapIdempotency(result.rows[0]);
  }

  async updateIdempotencyRecord(recordId: string, patch: Partial<Pick<IdempotencyRecord, "status" | "response" | "error" | "orderId">>) {
    const current = required(
      (await this.pool.query("select * from api_idempotency_records where id = $1 limit 1", [recordId])).rows[0],
      `Idempotency record ${recordId} not found.`,
    );
    const merged = { ...mapIdempotency(current), ...patch };
    const result = await this.pool.query(
      `update api_idempotency_records
       set status = $2,
           response = $3::jsonb,
           error = $4,
           order_id = $5,
           updated_at = now()
       where id = $1
       returning *`,
      [recordId, merged.status, merged.response ? JSON.stringify(merged.response) : null, merged.error ?? null, merged.orderId ?? null],
    );
    return mapIdempotency(result.rows[0]);
  }

  async saveRetryAttempt(attempt: Omit<RetryAttempt, "id" | "createdAt">) {
    const result = await this.pool.query(
      `insert into order_retry_attempts
       (id, order_id, stage, attempt_number, status, error_message, payload_snapshot, response_snapshot, created_at)
       values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, now())
       returning *`,
      [createId("retry"), attempt.orderId ?? null, attempt.stage, attempt.attemptNumber, attempt.status, attempt.errorMessage ?? null, attempt.payloadSnapshot ? JSON.stringify(attempt.payloadSnapshot) : null, attempt.responseSnapshot ? JSON.stringify(attempt.responseSnapshot) : null],
    );
    return mapRetry(result.rows[0]);
  }

  async listRetryAttempts(orderId: string) {
    const result = await this.pool.query("select * from order_retry_attempts where order_id = $1 order by created_at desc", [orderId]);
    return result.rows.map(mapRetry);
  }

  async getOperationalDiagnostics(restaurantId: string): Promise<OperationalDiagnosticsSnapshot> {
    const [failedOrders, stuckOrders, quoteFailures, posFailures, retryQueue, mappingIssues] = await Promise.all([
      this.pool.query("select id as order_id, status, updated_at from agent_orders where restaurant_id = $1 and status in ('failed','rejected') order by updated_at desc", [restaurantId]),
      this.pool.query("select id as order_id, status, updated_at from agent_orders where restaurant_id = $1 and status in ('needs_approval','submitting_to_pos') order by updated_at desc", [restaurantId]),
      this.pool.query("select order_id, count(*)::int as count, max(error_message) as last_error from order_retry_attempts where stage = 'quote' and status = 'failed' group by order_id order by max(created_at) desc", []),
      this.pool.query("select order_id, count(*)::int as count, max(error_message) as last_error from order_retry_attempts where stage = 'pos_submit' and status = 'failed' group by order_id order by max(created_at) desc", []),
      this.pool.query("select * from order_retry_attempts where status = 'pending' order by created_at desc", []),
      this.pool.query("select id as menu_item_id, name, mapping_status from canonical_menu_items where restaurant_id = $1 and mapping_status <> 'mapped' order by name", [restaurantId]),
    ]);
    return {
      failedOrders: failedOrders.rows.map((row) => ({ orderId: row.order_id, status: row.status, updatedAt: row.updated_at })),
      stuckOrders: stuckOrders.rows.map((row) => ({ orderId: row.order_id, status: row.status, updatedAt: row.updated_at })),
      quoteFailures: quoteFailures.rows.map((row) => ({ orderId: row.order_id ?? undefined, count: row.count, lastError: row.last_error ?? undefined })),
      posFailures: posFailures.rows.map((row) => ({ orderId: row.order_id ?? undefined, count: row.count, lastError: row.last_error ?? undefined })),
      retryQueue: retryQueue.rows.map(mapRetry),
      mappingIssues: mappingIssues.rows.map((row) => ({ menuItemId: row.menu_item_id, name: row.name, mappingStatus: row.mapping_status })),
    };
  }

  async saveEventIngestion(record: Omit<EventIngestionRecord, "id" | "createdAt">) {
    const result = await this.pool.query(
      `insert into event_ingestion_records
       (id, provider, event_type, external_event_id, order_id, status, payload, created_at, processed_at)
       values ($1, $2, $3, $4, $5, $6, $7::jsonb, now(), $8)
       returning *`,
      [createId("evt_ingest"), record.provider, record.eventType, record.externalEventId ?? null, record.orderId ?? null, record.status, JSON.stringify(record.payload), record.processedAt ?? null],
    );
    return mapEventIngestion(result.rows[0]);
  }

  async listAuditLogsForOrder(orderId: string) {
    const result = await this.pool.query("select * from audit_logs where target_id = $1 order by created_at desc", [orderId]);
    return result.rows.map(mapAudit);
  }

  async authenticateAgentKey(keyHash: string) {
    const partnerCredentialResult = await this.pool.query(
      "update partner_credentials set last_used_at = now() where key_hash = $1 and revoked_at is null returning *",
      [keyHash],
    );
    if (partnerCredentialResult.rows[0]) {
      const credential = mapPartnerCredential(partnerCredentialResult.rows[0]);
      return {
        id: credential.id,
        agentId: credential.agentId,
        partnerId: credential.partnerId,
        label: credential.label,
        keyPrefix: credential.keyPrefix,
        keyHash: credential.keyHash,
        scopes: credential.scopes,
        lastUsedAt: credential.lastUsedAt,
        createdAt: credential.createdAt,
        rotatedAt: credential.rotatedAt,
        revokedAt: credential.revokedAt,
        credentialType: "partner_credential" as const,
        credentialId: credential.id,
      };
    }

    const result = await this.pool.query(
      "update agent_api_keys set last_used_at = now() where key_hash = $1 and revoked_at is null returning *",
      [keyHash],
    );
    if (!result.rows[0]) return null;
    const key = mapKey(result.rows[0]);
    return {
      ...key,
      credentialType: "agent_api_key" as const,
      credentialId: key.id,
    };
  }

  async getRecentAuditLogs(restaurantId: string, limit: number) {
    const result = await this.pool.query(
      "select * from audit_logs where restaurant_id = $1 order by created_at desc limit $2",
      [restaurantId, limit],
    );
    return result.rows.map(mapAudit);
  }

  async getDashboardStats(restaurantId: string): Promise<DashboardStats> {
    const now = appNow();
    const weekStart = startOfDay(now).toISOString();
    const weekEnd = endOfDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 6)).toISOString();
    const ordersResult = await this.pool.query(
      `select
         count(*) filter (where requested_fulfillment_time >= $2::timestamptz and requested_fulfillment_time <= $3::timestamptz)::int as orders_this_week,
         coalesce(sum(total_estimate_cents) filter (where requested_fulfillment_time >= $2::timestamptz and requested_fulfillment_time <= $3::timestamptz), 0)::int as revenue_from_agent_orders_cents,
         count(*) filter (where status = 'needs_approval')::int as orders_needing_review
       from agent_orders
       where restaurant_id = $1`,
      [restaurantId, weekStart, weekEnd],
    );
    const topItemResult = await this.pool.query(
      `select m.name, sum(oi.quantity)::int as count
       from agent_order_items oi
       join agent_orders o on o.id = oi.order_id
       join canonical_menu_items m on m.id = oi.menu_item_id
       where o.restaurant_id = $1
       group by m.name
       order by count desc, m.name asc
       limit 1`,
      [restaurantId],
    );
    return {
      ordersThisWeek: ordersResult.rows[0]?.orders_this_week ?? 0,
      revenueFromAgentOrdersCents: ordersResult.rows[0]?.revenue_from_agent_orders_cents ?? 0,
      topItem: topItemResult.rows[0]?.name ?? "No orders yet",
      ordersNeedingReview: ordersResult.rows[0]?.orders_needing_review ?? 0,
    };
  }

  async getReporting(restaurantId: string, range?: ReportingDateRange): Promise<ReportingSnapshotRecord> {
    await this.refreshReportingMetrics(restaurantId);
    const startDate = range?.startDate ?? null;
    const endDate = range?.endDate ?? null;
    const [metricsResult, topItemsResult, topModifiersResult, failureReasonsResult] = await Promise.all([
      this.pool.query(
        `select * from reporting_daily_metrics
         where restaurant_id = $1
           and ($2::date is null or date >= $2::date)
           and ($3::date is null or date <= $3::date)
         order by date desc`,
        [restaurantId, startDate, endDate],
      ),
      this.pool.query(
        `select m.name, sum(oi.quantity)::int as count
         from agent_order_items oi
         join agent_orders o on o.id = oi.order_id
         join canonical_menu_items m on m.id = oi.menu_item_id
         where o.restaurant_id = $1
           and ($2::date is null or o.requested_fulfillment_time::date >= $2::date)
           and ($3::date is null or o.requested_fulfillment_time::date <= $3::date)
         group by m.name
         order by count desc, m.name asc
         limit 5`,
        [restaurantId, startDate, endDate],
      ),
      this.pool.query(
        `select m.name, sum(om.quantity)::int as count
         from agent_order_modifiers om
         join agent_order_items oi on oi.id = om.order_item_id
         join agent_orders o on o.id = oi.order_id
         join canonical_modifiers m on m.id = om.modifier_id
         where o.restaurant_id = $1
           and ($2::date is null or o.requested_fulfillment_time::date >= $2::date)
           and ($3::date is null or o.requested_fulfillment_time::date <= $3::date)
         group by m.name
         order by count desc, m.name asc
         limit 5`,
        [restaurantId, startDate, endDate],
      ),
      this.pool.query(
        `with validation_failures as (
           select issue->>'message' as reason
           from order_validation_results vr
           join agent_orders o on o.id = vr.order_id
           cross join lateral jsonb_array_elements(vr.issues) as issue
           where o.restaurant_id = $1
             and ($2::date is null or o.requested_fulfillment_time::date >= $2::date)
             and ($3::date is null or o.requested_fulfillment_time::date <= $3::date)
             and coalesce(issue->>'severity', '') = 'error'
         ),
         submission_failures as (
           select coalesce(response->>'message', response->>'error', 'POS submission failed') as reason
           from pos_order_submissions ps
           join agent_orders o on o.id = ps.order_id
           where o.restaurant_id = $1
             and ($2::date is null or o.requested_fulfillment_time::date >= $2::date)
             and ($3::date is null or o.requested_fulfillment_time::date <= $3::date)
             and ps.status = 'failed'
         )
         select reason, count(*)::int as count
         from (
           select reason from validation_failures
           union all
           select reason from submission_failures
         ) failures
         group by reason
         order by count desc, reason asc
         limit 5`,
        [restaurantId, startDate, endDate],
      ),
    ]);

    return {
      metrics: metricsResult.rows.map(mapMetric),
      topItems: topItemsResult.rows.map((row) => ({ name: row.name, count: row.count })),
      topModifiers: topModifiersResult.rows.map((row) => ({ name: row.name, count: row.count })),
      failureReasons: failureReasonsResult.rows.map((row) => ({ reason: row.reason, count: row.count })),
    };
  }

  async refreshReportingMetrics(restaurantId: string) {
    const client = await this.pool.connect();
    const nowIso = appNow().toISOString();
    try {
      await client.query("begin");
      await client.query("delete from reporting_daily_metrics where restaurant_id = $1", [restaurantId]);
      await client.query(
        `insert into reporting_daily_metrics (
           id,
           restaurant_id,
           date,
           total_orders,
           revenue_cents,
           average_order_value_cents,
           approval_rate,
           success_rate,
           rejected_orders,
           average_lead_time_minutes,
           upcoming_scheduled_order_volume
         )
         select
           'metric_' || restaurant_id || '_' || to_char((requested_fulfillment_time at time zone 'UTC')::date, 'YYYY_MM_DD') as id,
           restaurant_id,
           (requested_fulfillment_time at time zone 'UTC')::date as date,
           count(*)::int as total_orders,
           coalesce(sum(total_estimate_cents), 0)::int as revenue_cents,
           round(coalesce(avg(total_estimate_cents), 0))::int as average_order_value_cents,
           coalesce(
             round(
               avg(
                 case
                   when approval_required = false or status in ('approved', 'submitted_to_pos', 'accepted', 'preparing', 'ready', 'completed') then 1
                   else 0
                 end
               )::numeric,
               4
             ),
             0
           ) as approval_rate,
           coalesce(
             round(
               avg(
                 case
                   when status in ('submitted_to_pos', 'accepted', 'preparing', 'ready', 'completed') then 1
                   else 0
                 end
               )::numeric,
               4
             ),
             0
           ) as success_rate,
           count(*) filter (where status in ('rejected', 'failed', 'cancelled'))::int as rejected_orders,
           round(
             avg(
               greatest(
                 extract(epoch from (requested_fulfillment_time - created_at)) / 60,
                 0
               )
             )
           )::int as average_lead_time_minutes,
           count(*) filter (
             where requested_fulfillment_time > $2::timestamptz
               and status not in ('rejected', 'failed', 'cancelled', 'completed')
           )::int as upcoming_scheduled_order_volume
         from agent_orders
         where restaurant_id = $1
         group by restaurant_id, (requested_fulfillment_time at time zone 'UTC')::date
         on conflict (id) do update set
           restaurant_id = excluded.restaurant_id,
           date = excluded.date,
           total_orders = excluded.total_orders,
           revenue_cents = excluded.revenue_cents,
           average_order_value_cents = excluded.average_order_value_cents,
           approval_rate = excluded.approval_rate,
           success_rate = excluded.success_rate,
           rejected_orders = excluded.rejected_orders,
           average_lead_time_minutes = excluded.average_lead_time_minutes,
           upcoming_scheduled_order_volume = excluded.upcoming_scheduled_order_volume`,
        [restaurantId, nowIso],
      );
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  private async getOperatorMemberships(operatorUserId: string) {
    const membershipsResult = await this.pool.query(
      "select * from operator_memberships where operator_user_id = $1 order by created_at asc",
      [operatorUserId],
    );
    return membershipsResult.rows.map(mapOperatorMembership);
  }
}
