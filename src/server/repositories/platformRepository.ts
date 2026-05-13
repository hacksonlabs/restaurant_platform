import { createDemoSeed, type DemoSeedState } from "./demoData";
import { createId } from "../utils/ids";
import { sha256 } from "../utils/crypto";
import type { OperatorIdentity } from "../auth/supabaseAuth";
import type {
  Agent,
  AgentApiScope,
  AgentApiKey,
  AuthenticatedOperator,
  AgentOrderItemRecord,
  AgentOrderModifierRecord,
  AgentOrderRecord,
  AuditLog,
  CanonicalMenuItem,
  CanonicalModifier,
  CanonicalModifierGroup,
  EventIngestionRecord,
  IdempotencyRecord,
  OperationalDiagnosticsSnapshot,
  OrderQuote,
  OrderTimelineEvent,
  OrderValidationResult,
  OrderingRule,
  POSConnection,
  POSMenuMapping,
  POSOrderSubmission,
  ReportingDailyMetric,
  Restaurant,
  RestaurantAgentPermission,
  RestaurantLocation,
  RetryAttempt,
  StatusEvent,
  ValidationIssue,
  OperatorMembership,
  OperatorUser,
  OrderDiagnostics,
} from "../../shared/types";

export interface AgentListEntry {
  permissionId: string;
  agent: Agent;
  permission: RestaurantAgentPermission;
  apiKey: Pick<AgentApiKey, "id" | "label" | "keyPrefix" | "scopes" | "lastUsedAt" | "createdAt" | "rotatedAt" | "revokedAt"> | null;
}

export interface OrderDetailRecord {
  order: AgentOrderRecord;
  groupedOrders?: AgentOrderRecord[];
  items: Array<
    AgentOrderItemRecord & {
      menuItem?: CanonicalMenuItem;
      modifiers: Array<
        AgentOrderModifierRecord & {
          modifier?: CanonicalModifier;
        }
      >;
    }
  >;
  validationResults: OrderValidationResult[];
  quotes: OrderQuote[];
  submissions: POSOrderSubmission[];
  statusEvents: StatusEvent[];
  auditLogs?: AuditLog[];
  retries?: RetryAttempt[];
  timeline?: OrderTimelineEvent[];
  diagnostics?: OrderDiagnostics;
}

export interface DashboardStats {
  ordersThisWeek: number;
  revenueFromAgentOrdersCents: number;
  topItem: string;
  ordersNeedingReview: number;
}

export interface ReportingSnapshotRecord {
  metrics: ReportingDailyMetric[];
  topItems: Array<{ name: string; count: number }>;
  topModifiers: Array<{ name: string; count: number }>;
  failureReasons: Array<{ reason: string; count: number }>;
}

export interface OrderGraphInput {
  order: AgentOrderRecord;
  items: AgentOrderItemRecord[];
  modifiers: AgentOrderModifierRecord[];
  validationResult: OrderValidationResult;
  quote: OrderQuote;
  statusEvents: Array<Omit<StatusEvent, "id" | "createdAt">>;
  auditLog: Omit<AuditLog, "id" | "createdAt">;
}

export interface ReconcileOperatorOptions {
  allowSeededDevBootstrap?: boolean;
  updateLastLoginAt?: boolean;
  linkIdentity?: boolean;
}

export interface PlatformRepository {
  authenticateOperator(email: string, password: string): Promise<AuthenticatedOperator | null>;
  reconcileOperatorIdentity(
    identity: OperatorIdentity,
    options?: ReconcileOperatorOptions,
  ): Promise<AuthenticatedOperator | null>;
  getAuthenticatedOperatorBySessionToken(sessionTokenHash: string): Promise<AuthenticatedOperator | null>;
  createOperatorSession(args: {
    operatorUserId: string;
    selectedRestaurantId: string;
    selectedLocationId?: string;
    sessionTokenHash: string;
    expiresAt: string;
  }): Promise<void>;
  updateOperatorSessionSelection(sessionTokenHash: string, restaurantId: string, locationId?: string): Promise<void>;
  deleteOperatorSession(sessionTokenHash: string): Promise<void>;
  listAccessibleRestaurants(operatorUserId: string): Promise<Array<Restaurant & { memberships: OperatorMembership[] }>>;
  listRestaurants(): Promise<Restaurant[]>;
  getRestaurant(restaurantId: string): Promise<Restaurant | null>;
  updateRestaurant(restaurantId: string, patch: Partial<Restaurant>): Promise<Restaurant>;
  getPOSConnection(restaurantId: string): Promise<POSConnection | null>;
  updatePOSConnection(connectionId: string, patch: Partial<POSConnection>): Promise<POSConnection>;
  getLocation(restaurantId: string): Promise<RestaurantLocation | null>;
  getMenu(restaurantId: string): Promise<{
    items: CanonicalMenuItem[];
    modifierGroups: CanonicalModifierGroup[];
    modifiers: CanonicalModifier[];
    mappings: POSMenuMapping[];
  }>;
  getRules(restaurantId: string): Promise<OrderingRule | null>;
  updateRules(restaurantId: string, patch: Partial<OrderingRule>): Promise<OrderingRule>;
  listAgents(restaurantId: string): Promise<AgentListEntry[]>;
  getAgent(agentId: string): Promise<Agent | null>;
  getPermission(restaurantId: string, agentId: string): Promise<RestaurantAgentPermission | null>;
  updatePermission(permissionId: string, patch: Partial<RestaurantAgentPermission>): Promise<RestaurantAgentPermission>;
  createAgentApiKey(args: {
    agentId: string;
    label: string;
    keyPrefix: string;
    keyHash: string;
    scopes: AgentApiScope[];
  }): Promise<AgentApiKey>;
  updateAgentApiKey(
    keyId: string,
    patch: Partial<Pick<AgentApiKey, "label" | "keyHash" | "keyPrefix" | "scopes" | "rotatedAt" | "revokedAt" | "lastUsedAt">>,
  ): Promise<AgentApiKey>;
  listAgentApiKeys(agentId: string): Promise<AgentApiKey[]>;
  listOrders(restaurantId: string): Promise<AgentOrderRecord[]>;
  getOrderDetail(restaurantId: string, orderId: string): Promise<OrderDetailRecord | null>;
  getOrderById(orderId: string): Promise<AgentOrderRecord | null>;
  findOrderIdByReference(reference: string): Promise<string | null>;
  createOrderGraph(input: OrderGraphInput): Promise<void>;
  updateOrder(orderId: string, patch: Partial<AgentOrderRecord>): Promise<AgentOrderRecord>;
  saveValidationResult(result: OrderValidationResult): Promise<void>;
  saveQuote(quote: OrderQuote): Promise<void>;
  getLatestQuote(orderId: string): Promise<OrderQuote | null>;
  saveSubmission(submission: POSOrderSubmission): Promise<void>;
  getLatestSubmission(orderId: string): Promise<POSOrderSubmission | null>;
  appendStatusEvent(event: Omit<StatusEvent, "id" | "createdAt">): Promise<StatusEvent>;
  appendAuditLog(log: Omit<AuditLog, "id" | "createdAt">): Promise<AuditLog>;
  authenticateAgentKey(keyHash: string): Promise<AgentApiKey | null>;
  getRecentAuditLogs(restaurantId: string, limit: number): Promise<AuditLog[]>;
  getDashboardStats(restaurantId: string): Promise<DashboardStats>;
  getReporting(restaurantId: string): Promise<ReportingSnapshotRecord>;
  refreshReportingMetrics(restaurantId: string): Promise<void>;
  getIdempotencyRecord(scope: "validate" | "quote" | "submit", restaurantId: string, agentId: string, idempotencyKey: string): Promise<IdempotencyRecord | null>;
  createIdempotencyRecord(input: Omit<IdempotencyRecord, "id" | "createdAt" | "updatedAt">): Promise<IdempotencyRecord>;
  updateIdempotencyRecord(recordId: string, patch: Partial<Pick<IdempotencyRecord, "status" | "response" | "error" | "orderId">>): Promise<IdempotencyRecord>;
  saveRetryAttempt(attempt: Omit<RetryAttempt, "id" | "createdAt">): Promise<RetryAttempt>;
  listRetryAttempts(orderId: string): Promise<RetryAttempt[]>;
  getOperationalDiagnostics(restaurantId: string): Promise<OperationalDiagnosticsSnapshot>;
  saveEventIngestion(record: Omit<EventIngestionRecord, "id" | "createdAt">): Promise<EventIngestionRecord>;
  listAuditLogsForOrder(orderId: string): Promise<AuditLog[]>;
}

function notFound(entity: string, id: string): Error {
  return new Error(`${entity} ${id} not found.`);
}

function computeTopItems(
  restaurantId: string,
  orders: AgentOrderRecord[],
  orderItems: AgentOrderItemRecord[],
  menuItems: CanonicalMenuItem[],
) {
  const menuById = new Map(menuItems.map((entry) => [entry.id, entry]));
  const orderById = new Map(orders.map((entry) => [entry.id, entry]));
  const counts = new Map<string, number>();
  orderItems.forEach((item) => {
    const order = orderById.get(item.orderId);
    const menuItem = menuById.get(item.menuItemId);
    if (!order || order.restaurantId !== restaurantId || !menuItem) return;
    counts.set(menuItem.name, (counts.get(menuItem.name) ?? 0) + item.quantity);
  });
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
}

function computeTopModifiers(
  restaurantId: string,
  orders: AgentOrderRecord[],
  orderItems: AgentOrderItemRecord[],
  orderModifiers: AgentOrderModifierRecord[],
  modifiers: CanonicalModifier[],
) {
  const orderItemById = new Map(orderItems.map((entry) => [entry.id, entry]));
  const orderById = new Map(orders.map((entry) => [entry.id, entry]));
  const modifierById = new Map(modifiers.map((entry) => [entry.id, entry]));
  const counts = new Map<string, number>();
  orderModifiers.forEach((entry) => {
    const orderItem = orderItemById.get(entry.orderItemId);
    const order = orderItem ? orderById.get(orderItem.orderId) : null;
    const modifier = modifierById.get(entry.modifierId);
    if (!order || order.restaurantId !== restaurantId || !modifier) return;
    counts.set(modifier.name, (counts.get(modifier.name) ?? 0) + entry.quantity);
  });
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
}

function computeFailureReasons(
  restaurantId: string,
  orders: AgentOrderRecord[],
  validationResults: OrderValidationResult[],
  submissions: POSOrderSubmission[],
) {
  const orderIds = new Set(orders.filter((entry) => entry.restaurantId === restaurantId).map((entry) => entry.id));
  const counts = new Map<string, number>();

  validationResults.forEach((result) => {
    if (!orderIds.has(result.orderId) || result.valid) return;
    const issues = result.issues.filter((issue) => issue.severity === "error");
    issues.forEach((issue) => {
      counts.set(issue.message, (counts.get(issue.message) ?? 0) + 1);
    });
  });

  submissions.forEach((submission) => {
    if (!orderIds.has(submission.orderId) || submission.status !== "failed") return;
    const rawReason =
      typeof submission.response.message === "string"
        ? submission.response.message
        : typeof submission.response.error === "string"
          ? submission.response.error
          : "POS submission failed";
    counts.set(rawReason, (counts.get(rawReason) ?? 0) + 1);
  });

  return [...counts.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
}

function computeReportingMetricsForState(
  restaurantId: string,
  orders: AgentOrderRecord[],
): ReportingDailyMetric[] {
  const relevantOrders = orders.filter((entry) => entry.restaurantId === restaurantId);
  const grouped = new Map<string, AgentOrderRecord[]>();
  relevantOrders.forEach((order) => {
    const date = order.createdAt.slice(0, 10);
    const list = grouped.get(date) ?? [];
    list.push(order);
    grouped.set(date, list);
  });
  return [...grouped.entries()]
    .map(([date, dateOrders]) => {
      const totalOrders = dateOrders.length;
      const revenueCents = dateOrders.reduce((sum, order) => sum + order.totalEstimateCents, 0);
      const approvedOrders = dateOrders.filter(
        (order) =>
          !order.approvalRequired ||
          ["approved", "submitted_to_pos", "accepted", "preparing", "ready", "completed"].includes(order.status),
      ).length;
      const successOrders = dateOrders.filter((order) =>
        ["submitted_to_pos", "accepted", "preparing", "ready", "completed"].includes(order.status),
      ).length;
      const rejectedOrders = dateOrders.filter((order) => ["rejected", "failed", "cancelled"].includes(order.status)).length;
      const averageLeadTimeMinutes =
        dateOrders.length === 0
          ? 0
          : Math.round(
              dateOrders.reduce((sum, order) => {
                const delta =
                  new Date(order.requestedFulfillmentTime).getTime() - new Date(order.createdAt).getTime();
                return sum + Math.max(0, delta / 60000);
              }, 0) / dateOrders.length,
            );
      const upcomingScheduledOrderVolume = dateOrders.filter(
        (order) =>
          new Date(order.requestedFulfillmentTime).getTime() > Date.now() &&
          !["rejected", "failed", "cancelled", "completed"].includes(order.status),
      ).length;
      return {
        id: `metric_${restaurantId}_${date.replace(/-/g, "_")}`,
        restaurantId,
        date,
        totalOrders,
        revenueCents,
        averageOrderValueCents: totalOrders === 0 ? 0 : Math.round(revenueCents / totalOrders),
        approvalRate: totalOrders === 0 ? 0 : approvedOrders / totalOrders,
        successRate: totalOrders === 0 ? 0 : successOrders / totalOrders,
        rejectedOrders,
        averageLeadTimeMinutes,
        upcomingScheduledOrderVolume,
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date));
}

function buildOrderTimeline(detail: {
  validationResults: OrderValidationResult[];
  quotes: OrderQuote[];
  submissions: POSOrderSubmission[];
  statusEvents: StatusEvent[];
  retries: RetryAttempt[];
  auditLogs: AuditLog[];
}) {
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

const SEEDED_DEV_OPERATOR_EMAIL = "dev@rest.com";
const SEEDED_DEV_OPERATOR_ID = "op_dev_rest";
const SEEDED_DEV_MEMBERSHIP_ID = "membership_lb_owner";
const SEEDED_DEV_RESTAURANT_ID = "rest_lb_steakhouse";
const SEEDED_DEV_LOCATION_ID = "loc_lb_main";

export class InMemoryPlatformRepository implements PlatformRepository {
  state: DemoSeedState;

  constructor(demoPhantomApiKey: string) {
    this.state = createDemoSeed(demoPhantomApiKey);
  }

  async authenticateOperator(email: string, password: string) {
    const user = this.state.operatorUsers.find(
      (entry) => entry.email.toLowerCase() === email.toLowerCase() && password === "password",
    );
    if (!user) return null;
    const memberships = this.state.operatorMemberships.filter((entry) => entry.operatorUserId === user.id);
    const selectedMembership = memberships[0];
    if (!selectedMembership) return null;
    return { user, memberships, selectedMembership };
  }

  async reconcileOperatorIdentity(
    identity: OperatorIdentity,
    options?: ReconcileOperatorOptions,
  ) {
    const normalizedEmail = identity.email.toLowerCase();
    let user =
      this.state.operatorUsers.find((entry) => entry.supabaseUserId === identity.id) ??
      this.state.operatorUsers.find((entry) => entry.email.toLowerCase() === normalizedEmail);

    if (!user && options?.allowSeededDevBootstrap && normalizedEmail === SEEDED_DEV_OPERATOR_EMAIL) {
      const restaurant = this.state.restaurants.find((entry) => entry.id === SEEDED_DEV_RESTAURANT_ID);
      if (!restaurant) return null;
      const location =
        this.state.locations.find((entry) => entry.restaurantId === SEEDED_DEV_RESTAURANT_ID)?.id ?? SEEDED_DEV_LOCATION_ID;
      user = {
        id: SEEDED_DEV_OPERATOR_ID,
        email: identity.email,
        fullName: identity.fullName ?? "Restaurant Dev Operator",
        supabaseUserId: identity.id,
        createdAt: new Date().toISOString(),
        lastLoginAt: options?.updateLastLoginAt ? new Date().toISOString() : undefined,
      };
      this.state.operatorUsers.unshift(user);
      this.state.operatorMemberships.unshift({
        id: SEEDED_DEV_MEMBERSHIP_ID,
        operatorUserId: user.id,
        restaurantId: SEEDED_DEV_RESTAURANT_ID,
        locationId: location,
        role: "owner",
        createdAt: new Date().toISOString(),
      });
    }

    if (!user) return null;

    if (options?.linkIdentity !== false && user.supabaseUserId && user.supabaseUserId !== identity.id) {
      throw new Error("Operator account is already linked to a different Supabase Auth user.");
    }

    user.email = identity.email;
    user.fullName = identity.fullName ?? user.fullName;
    if (options?.linkIdentity !== false) {
      user.supabaseUserId = identity.id;
    }
    if (options?.updateLastLoginAt) {
      user.lastLoginAt = new Date().toISOString();
    }

    const memberships = this.state.operatorMemberships.filter((entry) => entry.operatorUserId === user.id);
    const selectedMembership = memberships[0];
    if (!selectedMembership) return null;
    return { user, memberships, selectedMembership };
  }

  async getAuthenticatedOperatorBySessionToken(sessionTokenHash: string) {
    const session = this.state.operatorSessions.find(
      (entry) => sha256(`${entry.id}:${entry.operatorUserId}`) === sessionTokenHash || sessionTokenHash === entry.id,
    );
    if (!session || new Date(session.expiresAt).getTime() <= Date.now()) return null;
    const user = this.state.operatorUsers.find((entry) => entry.id === session.operatorUserId);
    if (!user) return null;
    const memberships = this.state.operatorMemberships.filter((entry) => entry.operatorUserId === user.id);
    const selectedMembership =
      memberships.find((entry) => entry.restaurantId === session.selectedRestaurantId && entry.locationId === session.selectedLocationId) ??
      memberships.find((entry) => entry.restaurantId === session.selectedRestaurantId) ??
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
    this.state.operatorSessions.unshift({
      id: args.sessionTokenHash,
      operatorUserId: args.operatorUserId,
      selectedRestaurantId: args.selectedRestaurantId,
      selectedLocationId: args.selectedLocationId,
      expiresAt: args.expiresAt,
      createdAt: new Date().toISOString(),
    });
  }

  async updateOperatorSessionSelection(sessionTokenHash: string, restaurantId: string, locationId?: string) {
    const session = this.state.operatorSessions.find((entry) => entry.id === sessionTokenHash);
    if (!session) return;
    session.selectedRestaurantId = restaurantId;
    session.selectedLocationId = locationId;
  }

  async deleteOperatorSession(sessionTokenHash: string) {
    this.state.operatorSessions = this.state.operatorSessions.filter((entry) => entry.id !== sessionTokenHash);
  }

  async listAccessibleRestaurants(operatorUserId: string) {
    const memberships = this.state.operatorMemberships.filter((entry) => entry.operatorUserId === operatorUserId);
    return this.state.restaurants
      .filter((restaurant) => memberships.some((membership) => membership.restaurantId === restaurant.id))
      .map((restaurant) => ({
        ...restaurant,
        memberships: memberships.filter((membership) => membership.restaurantId === restaurant.id),
      }));
  }

  async listRestaurants() {
    return this.state.restaurants;
  }

  async getRestaurant(restaurantId: string) {
    return this.state.restaurants.find((entry) => entry.id === restaurantId) ?? null;
  }

  async updateRestaurant(restaurantId: string, patch: Partial<Restaurant>) {
    const restaurant = await this.getRestaurant(restaurantId);
    if (!restaurant) throw notFound("Restaurant", restaurantId);
    const updated = { ...restaurant, ...patch };
    this.state.restaurants = this.state.restaurants.map((entry) => (entry.id === restaurantId ? updated : entry));
    return updated;
  }

  async getPOSConnection(restaurantId: string) {
    return this.state.posConnections.find((entry) => entry.restaurantId === restaurantId) ?? null;
  }

  async updatePOSConnection(connectionId: string, patch: Partial<POSConnection>) {
    const index = this.state.posConnections.findIndex((entry) => entry.id === connectionId);
    if (index < 0) throw notFound("POS connection", connectionId);
    const updated = { ...this.state.posConnections[index], ...patch };
    this.state.posConnections[index] = updated;
    return updated;
  }

  async getLocation(restaurantId: string) {
    return this.state.locations.find((entry) => entry.restaurantId === restaurantId) ?? null;
  }

  async getMenu(restaurantId: string) {
    return {
      items: this.state.menuItems.filter((entry) => entry.restaurantId === restaurantId),
      modifierGroups: this.state.modifierGroups.filter((entry) => entry.restaurantId === restaurantId),
      modifiers: this.state.modifiers,
      mappings: this.state.posMappings.filter((entry) => entry.restaurantId === restaurantId),
    };
  }

  async getRules(restaurantId: string) {
    return this.state.orderingRules.find((entry) => entry.restaurantId === restaurantId) ?? null;
  }

  async updateRules(restaurantId: string, patch: Partial<OrderingRule>) {
    const rules = await this.getRules(restaurantId);
    if (!rules) throw new Error(`Rules missing for restaurant ${restaurantId}.`);
    const updated = { ...rules, ...patch };
    this.state.orderingRules = this.state.orderingRules.map((entry) =>
      entry.restaurantId === restaurantId ? updated : entry,
    );
    return updated;
  }

  async listAgents(restaurantId: string) {
    return this.state.permissions
      .filter((permission) => permission.restaurantId === restaurantId)
      .map((permission) => {
        const agent = this.state.agents.find((entry) => entry.id === permission.agentId);
        if (!agent) {
          throw notFound("Agent", permission.agentId);
        }
        const key = this.state.agentApiKeys.find((entry) => entry.agentId === agent.id);
        return {
          permissionId: permission.id,
          agent,
          permission,
          apiKey: key
            ? {
                id: key.id,
                label: key.label,
                keyPrefix: key.keyPrefix,
                scopes: key.scopes,
                lastUsedAt: key.lastUsedAt,
                createdAt: key.createdAt,
                rotatedAt: key.rotatedAt,
                revokedAt: key.revokedAt,
              }
            : null,
        };
      });
  }

  async getAgent(agentId: string) {
    return this.state.agents.find((entry) => entry.id === agentId) ?? null;
  }

  async getPermission(restaurantId: string, agentId: string) {
    return this.state.permissions.find((entry) => entry.restaurantId === restaurantId && entry.agentId === agentId) ?? null;
  }

  async updatePermission(permissionId: string, patch: Partial<RestaurantAgentPermission>) {
    const index = this.state.permissions.findIndex((entry) => entry.id === permissionId);
    if (index < 0) throw notFound("Permission", permissionId);
    const updated = { ...this.state.permissions[index], ...patch };
    this.state.permissions[index] = updated;
    return updated;
  }

  async createAgentApiKey(args: {
    agentId: string;
    label: string;
    keyPrefix: string;
    keyHash: string;
    scopes: AgentApiScope[];
  }) {
    const key: AgentApiKey = {
      id: createId("key"),
      agentId: args.agentId,
      label: args.label,
      keyPrefix: args.keyPrefix,
      keyHash: args.keyHash,
      scopes: args.scopes,
      createdAt: new Date().toISOString(),
    };
    this.state.agentApiKeys.unshift(key);
    return key;
  }

  async updateAgentApiKey(
    keyId: string,
    patch: Partial<Pick<AgentApiKey, "label" | "keyHash" | "keyPrefix" | "scopes" | "rotatedAt" | "revokedAt" | "lastUsedAt">>,
  ) {
    const index = this.state.agentApiKeys.findIndex((entry) => entry.id === keyId);
    if (index < 0) throw notFound("Agent API key", keyId);
    const updated = { ...this.state.agentApiKeys[index], ...patch };
    this.state.agentApiKeys[index] = updated;
    return updated;
  }

  async listAgentApiKeys(agentId: string) {
    return this.state.agentApiKeys.filter((entry) => entry.agentId === agentId);
  }

  private decorateOrderAgent(order: AgentOrderRecord) {
    const metadata =
      order.orderIntent && typeof order.orderIntent === "object" && order.orderIntent.metadata && typeof order.orderIntent.metadata === "object"
        ? order.orderIntent.metadata
        : {};
    const agent = this.state.agents.find((entry) => entry.id === order.agentId);
    return {
      ...order,
      agentName: agent?.name ?? order.agentName,
      splitGroupId:
        typeof metadata.split_group_id === "string" ? metadata.split_group_id : order.splitGroupId,
      splitGroupIndex:
        Number.isFinite(Number(metadata.split_group_index))
          ? Math.round(Number(metadata.split_group_index))
          : order.splitGroupIndex,
      splitGroupSize:
        Number.isFinite(Number(metadata.split_group_size))
          ? Math.round(Number(metadata.split_group_size))
          : order.splitGroupSize,
    };
  }

  async listOrders(restaurantId: string) {
    return this.state.orders
      .filter((entry) => entry.restaurantId === restaurantId)
      .map((entry) => this.decorateOrderAgent(entry));
  }

  async getOrderDetail(restaurantId: string, orderId: string) {
    const order = this.state.orders.find((entry) => entry.restaurantId === restaurantId && entry.id === orderId);
    if (!order) return null;
    const detail = {
      order: this.decorateOrderAgent(order),
      items: this.state.orderItems.filter((entry) => entry.orderId === orderId).map((item) => ({
        ...item,
        menuItem: this.state.menuItems.find((menuItem) => menuItem.id === item.menuItemId),
        modifiers: this.state.orderModifiers
          .filter((entry) => entry.orderItemId === item.id)
          .map((modifier) => ({
            ...modifier,
            modifier: this.state.modifiers.find((entry) => entry.id === modifier.modifierId),
          })),
      })),
      validationResults: this.state.validationResults.filter((entry) => entry.orderId === orderId),
      quotes: this.state.quotes.filter((entry) => entry.orderId === orderId),
      submissions: this.state.posSubmissions.filter((entry) => entry.orderId === orderId),
      statusEvents: this.state.statusEvents.filter((entry) => entry.orderId === orderId),
      auditLogs: this.state.auditLogs.filter((entry) => entry.targetId === orderId || entry.restaurantId === restaurantId).slice(0, 20),
      retries: this.state.retryAttempts.filter((entry) => entry.orderId === orderId),
    };
    return {
      ...detail,
      timeline: buildOrderTimeline(detail),
      diagnostics: {
        rawOrderIntent: order.orderIntent,
        latestValidation: detail.validationResults[0],
        latestQuote: detail.quotes[0],
        latestSubmission: detail.submissions[0],
        mappedPayload: undefined,
        retries: detail.retries,
      },
    };
  }

  async getOrderById(orderId: string) {
    const order = this.state.orders.find((entry) => entry.id === orderId) ?? null;
    return order ? this.decorateOrderAgent(order) : null;
  }

  async findOrderIdByReference(reference: string) {
    return this.state.orders.find((entry) => entry.externalOrderReference === reference)?.id ?? null;
  }

  async createOrderGraph(input: OrderGraphInput) {
    this.state.orders.unshift(input.order);
    this.state.orderItems.unshift(...input.items);
    this.state.orderModifiers.unshift(...input.modifiers);
    this.state.validationResults.unshift(input.validationResult);
    this.state.quotes.unshift(input.quote);
    input.statusEvents
      .slice()
      .reverse()
      .forEach((event) => {
        this.appendStatusEvent(event);
      });
    await this.appendAuditLog(input.auditLog);
  }

  async updateOrder(orderId: string, patch: Partial<AgentOrderRecord>) {
    const index = this.state.orders.findIndex((entry) => entry.id === orderId);
    if (index < 0) throw notFound("Order", orderId);
    const updated = { ...this.state.orders[index], ...patch };
    this.state.orders[index] = updated;
    return updated;
  }

  async saveValidationResult(result: OrderValidationResult) {
    this.state.validationResults.unshift(result);
  }

  async saveQuote(quote: OrderQuote) {
    this.state.quotes.unshift(quote);
  }

  async getLatestQuote(orderId: string) {
    return this.state.quotes.find((entry) => entry.orderId === orderId) ?? null;
  }

  async saveSubmission(submission: POSOrderSubmission) {
    this.state.posSubmissions.unshift(submission);
  }

  async getLatestSubmission(orderId: string) {
    return this.state.posSubmissions.find((entry) => entry.orderId === orderId) ?? null;
  }

  async appendStatusEvent(event: Omit<StatusEvent, "id" | "createdAt">) {
    const created = {
      id: createId("evt"),
      createdAt: new Date().toISOString(),
      ...event,
    };
    this.state.statusEvents.unshift(created);
    return created;
  }

  async appendAuditLog(log: Omit<AuditLog, "id" | "createdAt">) {
    const created = {
      id: createId("audit"),
      createdAt: new Date().toISOString(),
      ...log,
    };
    this.state.auditLogs.unshift(created);
    return created;
  }

  async authenticateAgentKey(keyHash: string) {
    const keyRecord =
      this.state.agentApiKeys.find((entry) => entry.keyHash === keyHash && !entry.revokedAt) ?? null;
    if (keyRecord) {
      keyRecord.lastUsedAt = new Date().toISOString();
    }
    return keyRecord;
  }

  async getRecentAuditLogs(restaurantId: string, limit: number) {
    return this.state.auditLogs.filter((entry) => entry.restaurantId === restaurantId).slice(0, limit);
  }

  async getDashboardStats(restaurantId: string) {
    const orders = await this.listOrders(restaurantId);
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const weeklyOrders = orders.filter((entry) => new Date(entry.createdAt).getTime() >= sevenDaysAgo);
    const topItems = computeTopItems(restaurantId, this.state.orders, this.state.orderItems, this.state.menuItems);
    return {
      ordersThisWeek: weeklyOrders.length,
      revenueFromAgentOrdersCents: weeklyOrders.reduce((sum, entry) => sum + entry.totalEstimateCents, 0),
      topItem: topItems[0]?.name ?? "No orders yet",
      ordersNeedingReview: orders.filter((entry) => entry.status === "needs_approval").length,
    };
  }

  async getReporting(restaurantId: string) {
    return {
      metrics: this.state.reportingMetrics.filter((entry) => entry.restaurantId === restaurantId),
      topItems: computeTopItems(restaurantId, this.state.orders, this.state.orderItems, this.state.menuItems),
      topModifiers: computeTopModifiers(
        restaurantId,
        this.state.orders,
        this.state.orderItems,
        this.state.orderModifiers,
        this.state.modifiers,
      ),
      failureReasons: computeFailureReasons(
        restaurantId,
        this.state.orders,
        this.state.validationResults,
        this.state.posSubmissions,
      ),
    };
  }

  async refreshReportingMetrics(restaurantId: string) {
    this.state.reportingMetrics = [
      ...this.state.reportingMetrics.filter((entry) => entry.restaurantId !== restaurantId),
      ...computeReportingMetricsForState(restaurantId, this.state.orders),
    ].sort((a, b) => b.date.localeCompare(a.date));
  }

  async getIdempotencyRecord(scope: "validate" | "quote" | "submit", restaurantId: string, agentId: string, idempotencyKey: string) {
    return this.state.idempotencyRecords.find((entry) =>
      entry.scope === scope &&
      entry.restaurantId === restaurantId &&
      entry.agentId === agentId &&
      entry.idempotencyKey === idempotencyKey,
    ) ?? null;
  }

  async createIdempotencyRecord(input: Omit<IdempotencyRecord, "id" | "createdAt" | "updatedAt">) {
    const record: IdempotencyRecord = { ...input, id: createId("idem"), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    this.state.idempotencyRecords.unshift(record);
    return record;
  }

  async updateIdempotencyRecord(recordId: string, patch: Partial<Pick<IdempotencyRecord, "status" | "response" | "error" | "orderId">>) {
    const index = this.state.idempotencyRecords.findIndex((entry) => entry.id === recordId);
    if (index < 0) throw notFound("Idempotency record", recordId);
    const updated = { ...this.state.idempotencyRecords[index], ...patch, updatedAt: new Date().toISOString() };
    this.state.idempotencyRecords[index] = updated;
    return updated;
  }

  async saveRetryAttempt(attempt: Omit<RetryAttempt, "id" | "createdAt">) {
    const created: RetryAttempt = { ...attempt, id: createId("retry"), createdAt: new Date().toISOString() };
    this.state.retryAttempts.unshift(created);
    return created;
  }

  async listRetryAttempts(orderId: string) {
    return this.state.retryAttempts.filter((entry) => entry.orderId === orderId);
  }

  async getOperationalDiagnostics(restaurantId: string) {
    const orders = this.state.orders.filter((entry) => entry.restaurantId === restaurantId);
    return {
      failedOrders: orders.filter((entry) => ["failed", "rejected"].includes(entry.status)).map((entry) => ({ orderId: entry.id, status: entry.status, updatedAt: entry.updatedAt })),
      stuckOrders: orders.filter((entry) => ["needs_approval", "submitting_to_pos"].includes(entry.status)).map((entry) => ({ orderId: entry.id, status: entry.status, updatedAt: entry.updatedAt })),
      quoteFailures: this.state.retryAttempts.filter((entry) => entry.stage === "quote" && entry.status === "failed").map((entry) => ({ orderId: entry.orderId, count: 1, lastError: entry.errorMessage })),
      posFailures: this.state.retryAttempts.filter((entry) => entry.stage === "pos_submit" && entry.status === "failed").map((entry) => ({ orderId: entry.orderId, count: 1, lastError: entry.errorMessage })),
      retryQueue: this.state.retryAttempts.filter((entry) => entry.status === "pending"),
      mappingIssues: this.state.menuItems.filter((entry) => entry.restaurantId === restaurantId && entry.mappingStatus !== "mapped").map((entry) => ({ menuItemId: entry.id, name: entry.name, mappingStatus: entry.mappingStatus })),
    };
  }

  async saveEventIngestion(record: Omit<EventIngestionRecord, "id" | "createdAt">) {
    const created: EventIngestionRecord = { ...record, id: createId("evt_ingest"), createdAt: new Date().toISOString() };
    this.state.ingestedEvents.unshift(created);
    return created;
  }

  async listAuditLogsForOrder(orderId: string) {
    return this.state.auditLogs.filter((entry) => entry.targetId === orderId);
  }
}

export function formatFailureReason(issue: ValidationIssue) {
  return issue.message;
}
