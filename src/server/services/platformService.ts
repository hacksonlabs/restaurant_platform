import { canonicalOrderIntentSchema } from "../../shared/schemas";
import type {
  Agent,
  AgentApiScope,
  AgentApiKey,
  AuthenticatedOperator,
  AgentOrderItemRecord,
  AgentOrderModifierRecord,
  AgentOrderRecord,
  AgentOrderStatus,
  CanonicalOrderIntent,
  DashboardSnapshot,
  OrderQuote,
  POSPaymentSessionResult,
  OrderValidationResult,
  POSContext,
  POSDiagnosticsResult,
  POSOrderSubmission,
  Restaurant,
  RestaurantReportingSnapshot,
  ValidationIssue,
  OperatorRole,
  POSProvider,
} from "../../shared/types";
import { POSAdapterRegistry } from "../pos/registry";
import type { OrderDetailRecord, PlatformRepository } from "../repositories/platformRepository";
import type { OperatorIdentity } from "../auth/supabaseAuth";
import { randomToken, sha256 } from "../utils/crypto";
import { createId } from "../utils/ids";
import { log } from "../utils/logger";
import type { RestaurantLocation } from "../../shared/types";

function formatRestaurantAddress(location: RestaurantLocation | null, fallback: string) {
  if (!location) return fallback;

  const parts = [
    location.address1,
    [location.city, location.state, location.postalCode].filter(Boolean).join(" "),
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(", ") : fallback;
}

function normalizeText(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  return text || null;
}

export class PlatformService {
  private quoteExpiryMs = 15 * 60 * 1000;
  private operatorSessionTtlMs = 7 * 24 * 60 * 60 * 1000;
  private operatorSessionAuthRefreshMs = 5 * 60 * 1000;
  private retryBaseDelayMs = 75;
  private operatorSessionVerificationCache = new Map<string, number>();

  private quoteAllowedValidationCodes = new Set([
    "order_value_too_large",
    "too_many_items",
    "headcount_too_large",
  ]);

  constructor(
    private repository: PlatformRepository,
    private adapters = new POSAdapterRegistry(),
    private operatorAuth?: {
      isEnabled(): boolean;
      signInWithPassword(email: string, password: string): Promise<OperatorIdentity>;
      getUserById(userId: string): Promise<OperatorIdentity | null>;
    },
  ) {}

  async listRestaurants() {
    return this.repository.listRestaurants();
  }

  async listAgentRestaurants(agentId: string) {
    const [restaurants, agent] = await Promise.all([this.repository.listRestaurants(), this.getAgent(agentId)]);
    const allowedEntries = await Promise.all(
      restaurants.map(async (restaurant) => {
        const [permission, connection, location, rules] = await Promise.all([
          this.repository.getPermission(restaurant.id, agentId),
          this.repository.getPOSConnection(restaurant.id),
          this.repository.getLocation(restaurant.id),
          this.repository.getRules(restaurant.id),
        ]);
        if (!permission || permission.status !== "allowed" || !restaurant.agentOrderingEnabled) {
          return null;
        }
        return {
          id: restaurant.id,
          name: restaurant.name,
          location: restaurant.location,
          image_url: restaurant.imageUrl ?? null,
          imageUrl: restaurant.imageUrl ?? null,
          cuisine_type: restaurant.cuisineType ?? null,
          cuisine: restaurant.cuisineType ?? null,
          description: restaurant.description ?? null,
          rating: restaurant.rating ?? null,
          delivery_fee: restaurant.deliveryFee ?? null,
          minimum_order: restaurant.minimumOrder ?? null,
          max_order_dollar_amount: rules?.maxOrderDollarAmount ?? null,
          max_order_cents:
            rules?.maxOrderDollarAmount != null ? Math.round(rules.maxOrderDollarAmount * 100) : null,
          max_item_quantity: rules?.maxItemQuantity ?? null,
          max_headcount: rules?.maxHeadcount ?? null,
          supports_catering: restaurant.supportsCatering ?? false,
          address: formatRestaurantAddress(location, restaurant.location),
          address1: location?.address1 ?? null,
          city: location?.city ?? null,
          state: location?.state ?? null,
          postalCode: location?.postalCode ?? null,
          latitude: location?.latitude ?? null,
          longitude: location?.longitude ?? null,
          timezone: restaurant.timezone,
          posProvider: restaurant.posProvider,
          fulfillmentTypesSupported: restaurant.fulfillmentTypesSupported,
          defaultApprovalMode: restaurant.defaultApprovalMode,
          agentOrderingEnabled: restaurant.agentOrderingEnabled,
          posConnectionStatus: connection?.status ?? "not_connected",
          permissionStatus: permission.status,
          agent: {
            id: agent.id,
            slug: agent.slug,
            name: agent.name,
          },
        };
      }),
    );
    return allowedEntries.filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
  }

  async listAccessibleRestaurants(operatorUserId: string) {
    return this.repository.listAccessibleRestaurants(operatorUserId);
  }

  async loginOperator(email: string, password: string) {
    const authenticated = await this.resolveOperatorLogin(email, password);
    const sessionToken = randomToken(32);
    const sessionTokenHash = sha256(sessionToken);
    const selectedMembership = authenticated.selectedMembership;
    await this.repository.createOperatorSession({
      operatorUserId: authenticated.user.id,
      selectedRestaurantId: selectedMembership.restaurantId,
      selectedLocationId: selectedMembership.locationId,
      sessionTokenHash,
      expiresAt: new Date(Date.now() + this.operatorSessionTtlMs).toISOString(),
    });
    await this.repository.appendAuditLog({
      restaurantId: selectedMembership.restaurantId,
      actorType: "manager",
      actorId: authenticated.user.id,
      action: "operator.login",
      targetType: "operator_user",
      targetId: authenticated.user.id,
      summary: `Operator ${authenticated.user.email} signed in.`,
    });
    this.operatorSessionVerificationCache.set(sessionTokenHash, Date.now());
    return {
      sessionToken,
      authenticated,
      restaurants: await this.repository.listAccessibleRestaurants(authenticated.user.id),
    };
  }

  async getOperatorSession(rawSessionToken: string) {
    return this.resolveOperatorSession(rawSessionToken, {
      includeRestaurants: true,
      forceRefreshIdentity: true,
    });
  }

  async getOperatorRequestSession(rawSessionToken: string) {
    return this.resolveOperatorSession(rawSessionToken, {
      includeRestaurants: false,
      forceRefreshIdentity: false,
    });
  }

  async logoutOperator(rawSessionToken: string) {
    const sessionTokenHash = sha256(rawSessionToken);
    const authenticated = await this.repository.getAuthenticatedOperatorBySessionToken(sessionTokenHash);
    await this.repository.deleteOperatorSession(sessionTokenHash);
    this.operatorSessionVerificationCache.delete(sessionTokenHash);
    if (authenticated) {
      await this.repository.appendAuditLog({
        restaurantId: authenticated.selectedMembership.restaurantId,
        actorType: "manager",
        actorId: authenticated.user.id,
        action: "operator.logout",
        targetType: "operator_user",
        targetId: authenticated.user.id,
        summary: `Operator ${authenticated.user.email} signed out.`,
      });
    }
  }

  async selectOperatorTenant(rawSessionToken: string, restaurantId: string, locationId?: string) {
    const sessionTokenHash = sha256(rawSessionToken);
    const session = await this.getOperatorRequestSession(rawSessionToken);
    const membership =
      session.memberships.find((entry) => entry.restaurantId === restaurantId && entry.locationId === locationId) ??
      session.memberships.find((entry) => entry.restaurantId === restaurantId);
    if (!membership) {
      throw new Error("Operator does not have access to that restaurant.");
    }
    await this.repository.updateOperatorSessionSelection(sessionTokenHash, restaurantId, locationId);
    return {
      ...session,
      selectedMembership: membership,
      restaurants: await this.repository.listAccessibleRestaurants(session.user.id),
    };
  }

  private async resolveOperatorSession(
    rawSessionToken: string,
    options: { includeRestaurants: boolean; forceRefreshIdentity: boolean },
  ) {
    const sessionTokenHash = sha256(rawSessionToken);
    let authenticated = await this.repository.getAuthenticatedOperatorBySessionToken(sessionTokenHash);
    if (!authenticated) {
      throw new Error("Not signed in.");
    }

    const shouldRefreshIdentity =
      this.operatorAuth?.isEnabled() &&
      authenticated.user.supabaseUserId &&
      (
        options.forceRefreshIdentity ||
        (this.operatorSessionVerificationCache.get(sessionTokenHash) ?? 0) + this.operatorSessionAuthRefreshMs <
          Date.now()
      );

    if (shouldRefreshIdentity) {
      const selectedMembershipBeforeRefresh = authenticated.selectedMembership;
      const authUser = await this.operatorAuth.getUserById(authenticated.user.supabaseUserId);
      if (!authUser) {
        this.operatorSessionVerificationCache.delete(sessionTokenHash);
        throw new Error("Supabase Auth account is no longer active.");
      }
      const refreshed = await this.repository.reconcileOperatorIdentity(authUser, { updateLastLoginAt: false });
      if (refreshed) {
        const preservedSelection =
          refreshed.memberships.find(
            (entry) =>
              entry.restaurantId === selectedMembershipBeforeRefresh.restaurantId &&
              entry.locationId === selectedMembershipBeforeRefresh.locationId,
          ) ??
          refreshed.memberships.find(
            (entry) => entry.restaurantId === selectedMembershipBeforeRefresh.restaurantId,
          ) ??
          refreshed.selectedMembership;
        authenticated = {
          ...refreshed,
          selectedMembership: preservedSelection,
        };
      }
      this.operatorSessionVerificationCache.set(sessionTokenHash, Date.now());
    }

    if (!options.includeRestaurants) {
      return authenticated;
    }

    return {
      ...authenticated,
      restaurants: await this.repository.listAccessibleRestaurants(authenticated.user.id),
    };
  }

  assertOperatorAccess(authenticated: AuthenticatedOperator, restaurantId: string, allowedRoles?: OperatorRole[]) {
    const membership = authenticated.memberships.find((entry) => entry.restaurantId === restaurantId);
    if (!membership) {
      throw new Error("Operator does not have access to this restaurant.");
    }
    if (allowedRoles && !allowedRoles.includes(membership.role)) {
      throw new Error("Operator role does not allow this action.");
    }
    return membership;
  }

  async getRestaurant(restaurantId: string) {
    const restaurant = await this.repository.getRestaurant(restaurantId);
    if (!restaurant) {
      throw new Error(`Restaurant ${restaurantId} not found.`);
    }
    return restaurant;
  }

  async updateRestaurant(restaurantId: string, patch: Partial<Restaurant>) {
    const updated = await this.repository.updateRestaurant(restaurantId, {
      ...patch,
      updatedAt: new Date().toISOString(),
    });
    await this.repository.appendAuditLog({
      restaurantId,
      actorType: "manager",
      actorId: "demo_manager",
      action: "restaurant.updated",
      targetType: "restaurant",
      targetId: restaurantId,
      summary: "Restaurant profile/settings updated.",
    });
    return updated;
  }

  async getDashboard(restaurantId: string): Promise<DashboardSnapshot> {
    const [restaurant, posConnection, dashboardStats, recentActivity] = await Promise.all([
      this.getRestaurant(restaurantId),
      this.getPOSConnection(restaurantId),
      this.repository.getDashboardStats(restaurantId),
      this.repository.getRecentAuditLogs(restaurantId, 6),
    ]);

    return {
      restaurant,
      posConnectionStatus: posConnection.status,
      agentOrderingStatus: restaurant.agentOrderingEnabled ? "enabled" : "disabled",
      ordersThisWeek: dashboardStats.ordersThisWeek,
      revenueFromAgentOrdersCents: dashboardStats.revenueFromAgentOrdersCents,
      topItem: dashboardStats.topItem,
      ordersNeedingReview: dashboardStats.ordersNeedingReview,
      recentActivity,
    };
  }

  async getPOSConnection(restaurantId: string) {
    const connection = await this.repository.getPOSConnection(restaurantId);
    if (!connection) {
      throw new Error(`POS connection missing for restaurant ${restaurantId}.`);
    }
    return connection;
  }

  async testPOSConnection(restaurantId: string) {
    const connection = await this.getPOSConnection(restaurantId);
    const adapter = this.adapters.getAdapter(connection);
    const result = await adapter.testConnection(connection);
    await this.repository.updatePOSConnection(connection.id, {
      status: result.status,
      lastTestedAt: result.checkedAt,
    });
    await this.repository.appendAuditLog({
      restaurantId,
      actorType: "manager",
      actorId: "demo_manager",
      action: "pos_connection.tested",
      targetType: "pos_connection",
      targetId: connection.id,
      summary: result.message,
    });
    return result;
  }

  async getMenu(restaurantId: string) {
    return this.repository.getMenu(restaurantId);
  }

  async syncMenu(restaurantId: string) {
    const context = await this.getPOSContext(restaurantId);
    const adapter = this.adapters.getAdapter(context.connection);
    await this.repository.appendAuditLog({
      restaurantId,
      actorType: "manager",
      actorId: "demo_manager",
      action: "menu.sync_started",
      targetType: "restaurant",
      targetId: restaurantId,
      summary: `Menu sync started for ${context.connection.provider}.`,
    });
    const result = await adapter.syncMenu(context.connection, context);
    await this.repository.updatePOSConnection(context.connection.id, {
      lastSyncedAt: result.syncedAt,
    });
    await this.repository.appendAuditLog({
      restaurantId,
      actorType: "manager",
      actorId: "demo_manager",
      action: "menu.sync_completed",
      targetType: "restaurant",
      targetId: restaurantId,
      summary: result.message,
    });
    return result;
  }

  async getPOSDiagnostics(restaurantId: string): Promise<POSDiagnosticsResult> {
    const context = await this.getPOSContext(restaurantId);
    const adapter = this.adapters.getAdapter(context.connection);
    if (adapter.diagnose) {
      return adapter.diagnose(context.connection, context);
    }
    return {
      provider: context.connection.provider,
      mode: context.connection.mode,
      overallOk: true,
      checks: [{ key: "adapter", ok: true, message: "No adapter-specific diagnostics are implemented." }],
    };
  }

  async getRules(restaurantId: string) {
    const rules = await this.repository.getRules(restaurantId);
    if (!rules) {
      throw new Error(`Rules missing for restaurant ${restaurantId}.`);
    }
    return rules;
  }

  async updateRules(restaurantId: string, patch: Record<string, unknown>) {
    const updated = await this.repository.updateRules(restaurantId, patch as any);
    await this.repository.appendAuditLog({
      restaurantId,
      actorType: "manager",
      actorId: "demo_manager",
      action: "rules.updated",
      targetType: "ordering_rules",
      targetId: updated.id,
      summary: "Ordering rules updated.",
    });
    return updated;
  }

  async listAgents(restaurantId: string) {
    return this.repository.listAgents(restaurantId);
  }

  async createAgentApiKey(restaurantId: string, agentId: string, label: string, scopes: AgentApiScope[]) {
    const rawKey = `phm_${randomToken(18)}`;
    const key = await this.repository.createAgentApiKey({
      agentId,
      label,
      keyPrefix: rawKey.slice(0, 8),
      keyHash: sha256(rawKey),
      scopes,
    });
    await this.repository.appendAuditLog({
      restaurantId,
      actorType: "manager",
      actorId: "operator",
      action: "agent.api_key_created",
      targetType: "agent_api_key",
      targetId: key.id,
      summary: `Created API key ${key.label} for agent ${agentId}.`,
    });
    return { rawKey, key };
  }

  async rotateAgentApiKey(restaurantId: string, agentId: string, keyId: string, scopes: AgentApiScope[]) {
    const existing = (await this.repository.listAgentApiKeys(agentId)).find((entry) => entry.id === keyId);
    if (!existing) {
      throw new Error(`Agent API key ${keyId} not found.`);
    }
    const rawKey = `phm_${randomToken(18)}`;
    const updated = await this.repository.updateAgentApiKey(keyId, {
      keyPrefix: rawKey.slice(0, 8),
      keyHash: sha256(rawKey),
      scopes,
      rotatedAt: new Date().toISOString(),
      revokedAt: undefined,
    });
    await this.repository.appendAuditLog({
      restaurantId,
      actorType: "manager",
      actorId: "operator",
      action: "agent.api_key_rotated",
      targetType: "agent_api_key",
      targetId: updated.id,
      summary: `Rotated API key ${updated.label} for agent ${agentId}.`,
    });
    return { rawKey, key: updated };
  }

  async revokeAgentApiKey(restaurantId: string, agentId: string, keyId: string) {
    const existing = (await this.repository.listAgentApiKeys(agentId)).find((entry) => entry.id === keyId);
    if (!existing) {
      throw new Error(`Agent API key ${keyId} not found.`);
    }
    const updated = await this.repository.updateAgentApiKey(keyId, {
      revokedAt: new Date().toISOString(),
    });
    await this.repository.appendAuditLog({
      restaurantId,
      actorType: "manager",
      actorId: "operator",
      action: "agent.api_key_revoked",
      targetType: "agent_api_key",
      targetId: updated.id,
      summary: `Revoked API key ${updated.label} for agent ${agentId}.`,
    });
    return updated;
  }

  async updateAgentPermission(restaurantId: string, agentId: string, status: any, notes?: string) {
    const permission = await this.repository.getPermission(restaurantId, agentId);
    if (!permission) {
      throw new Error(`Permission for agent ${agentId} not found.`);
    }
    const updated = await this.repository.updatePermission(permission.id, {
      status,
      notes,
      lastActivityAt: new Date().toISOString(),
    });
    await this.repository.appendAuditLog({
      restaurantId,
      actorType: "manager",
      actorId: "demo_manager",
      action: "agent.permission_updated",
      targetType: "restaurant_agent_permission",
      targetId: updated.id,
      summary: `Agent permission set to ${status}.`,
    });
    return updated;
  }

  async listOrders(restaurantId: string) {
    const orders = await this.repository.listOrders(restaurantId);
    return this.groupOrdersForReview(orders);
  }

  async getOrder(restaurantId: string, orderId: string) {
    const detail = await this.getSingleOrderDetail(restaurantId, orderId);
    if (!detail) {
      throw new Error(`Order ${orderId} not found.`);
    }
    const groupOrders = await this.getDecisionGroupOrders(restaurantId, detail.order);
    if (groupOrders.length <= 1) {
      return detail;
    }
    return this.buildGroupedOrderDetail(restaurantId, groupOrders);
  }

  async updateOrderStatus(
    restaurantId: string,
    orderId: string,
    status: AgentOrderStatus,
    message: string,
    options: { refreshReporting?: boolean } = {},
  ) {
    const updated = await this.repository.updateOrder(orderId, {
      status,
      updatedAt: new Date().toISOString(),
    });
    await Promise.all([
      this.repository.appendStatusEvent({ orderId, status, message }),
      this.repository.appendAuditLog({
        restaurantId,
        actorType: "manager",
        actorId: "demo_manager",
        action: `order.${status}`,
        targetType: "agent_order",
        targetId: orderId,
        summary: message,
      }),
    ]);
    if (options.refreshReporting !== false) {
      await this.repository.refreshReportingMetrics(restaurantId);
    }
    return updated;
  }

  async approveOrder(restaurantId: string, orderId: string) {
    const order = await this.requirePendingDecisionOrder(restaurantId, orderId);
    const groupOrders = await this.getDecisionGroupOrders(restaurantId, order);
    const representative = groupOrders[0] ?? order;
    const decisionMessage = this.buildGroupDecisionMessage(groupOrders, "approved");

    await Promise.all(
      groupOrders.map(async (groupOrder) => {
        log("info", "order_approved", {
          restaurantId,
          orderId: groupOrder.id,
          splitGroupId: representative.splitGroupId ?? null,
        });
        await this.updateOrderStatus(restaurantId, groupOrder.id, "approved", decisionMessage, {
          refreshReporting: false,
        });
      }),
    );
    await this.repository.refreshReportingMetrics(restaurantId);

    await Promise.all(
      groupOrders.map(async (groupOrder) => {
        try {
          await this.submitOrderToPOS(restaurantId, groupOrder.id);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          await Promise.all([
            this.repository.appendStatusEvent({
              orderId: groupOrder.id,
              status: "approved",
              message: `Order was approved, but POS submission needs attention: ${message}`,
            }),
            this.repository.appendAuditLog({
              restaurantId,
              actorType: "system",
              actorId: "pos_submit_after_approval",
              action: "order.pos_submission_attention_needed",
              targetType: "agent_order",
              targetId: groupOrder.id,
              summary: `Order was approved, but POS submission needs attention: ${message}`,
            }),
          ]);
          log("warn", "pos_submission_attention_needed", {
            restaurantId,
            orderId: groupOrder.id,
            correlationId: groupOrder.externalOrderReference,
            splitGroupId: representative.splitGroupId ?? null,
            error: message,
          });
        }
      }),
    );

    return this.getCurrentGroupedOrderState(restaurantId, representative.id);
  }

  async rejectOrder(restaurantId: string, orderId: string) {
    const order = await this.requirePendingDecisionOrder(restaurantId, orderId);
    const groupOrders = await this.getDecisionGroupOrders(restaurantId, order);
    const representative = groupOrders[0] ?? order;
    const decisionMessage = this.buildGroupDecisionMessage(groupOrders, "rejected");

    await Promise.all(
      groupOrders.map(async (groupOrder) => {
        log("warn", "order_rejected", {
          restaurantId,
          orderId: groupOrder.id,
          splitGroupId: representative.splitGroupId ?? null,
        });
        await this.updateOrderStatus(restaurantId, groupOrder.id, "rejected", decisionMessage, {
          refreshReporting: false,
        });
      }),
    );
    await this.repository.refreshReportingMetrics(restaurantId);

    return this.getCurrentGroupedOrderState(restaurantId, representative.id);
  }

  async submitOrderToPOS(restaurantId: string, orderId: string) {
    const detail = await this.requireSingleOrderDetail(restaurantId, orderId);
    const quote = await this.ensureFreshQuote(detail.order);
    await this.assertReadyForPOSSubmission(detail.order, quote);
    await this.updateOrderStatus(restaurantId, orderId, "submitting_to_pos", "Submitting order to POS.", {
      refreshReporting: false,
    });
    const context = await this.getPOSContext(restaurantId);
    const adapter = this.adapters.getAdapter(context.connection);
    const payloadSnapshot = this.buildPayloadSnapshot(detail.order, quote, context);
    const response = await this.withRetry(
      "pos_submit",
      orderId,
      payloadSnapshot,
      async () => adapter.submitOrder(detail.order.orderIntent, this.quoteToQuoteResult(quote), context),
      (error) => this.isTransientError(error),
      3,
    );
    const submission: POSOrderSubmission = {
      id: createId("sub"),
      orderId,
      provider: context.connection.provider,
      status: response.status,
      externalOrderId: response.externalOrderId ?? undefined,
      response: response.raw,
      payloadSnapshot,
      attemptCount: 1,
      submittedAt: new Date().toISOString(),
    };
    await this.repository.saveSubmission(submission);
    log(response.ok ? "info" : "error", "pos_submission", {
      restaurantId,
      orderId,
      correlationId: detail.order.externalOrderReference,
      status: response.status,
      externalOrderId: response.externalOrderId ?? undefined,
    });
    await this.updateOrderStatus(
      restaurantId,
      orderId,
      response.status === "accepted" ? "accepted" : response.status === "failed" ? "failed" : "submitted_to_pos",
      response.message,
    );
    return submission;
  }

  async getReporting(restaurantId: string): Promise<RestaurantReportingSnapshot> {
    return this.repository.getReporting(restaurantId);
  }

  async authenticateAgentKey(rawKey: string) {
    const keyRecord = await this.repository.authenticateAgentKey(sha256(rawKey));
    if (!keyRecord) {
      throw new Error("Invalid API key.");
    }
    if (keyRecord.revokedAt) {
      throw new Error("API key has been revoked.");
    }
    return keyRecord;
  }

  assertAgentScope(key: AgentApiKey, scope: AgentApiScope) {
    if (scope === "payments:start" && key.scopes.includes("orders:submit")) {
      return;
    }
    if (!key.scopes.includes(scope)) {
      throw new Error(`Agent API key is missing required scope: ${scope}.`);
    }
  }

  async validateAgentAccess(restaurantId: string, agentId: string) {
    const restaurant = await this.getRestaurant(restaurantId);
    if (!restaurant.agentOrderingEnabled) {
      throw new Error("Restaurant has agent ordering disabled.");
    }
    const permission = await this.repository.getPermission(restaurantId, agentId);
    if (!permission || permission.status !== "allowed") {
      throw new Error("Agent is not allowed for this restaurant.");
    }
    return permission;
  }

  private async resolveOperatorLogin(email: string, password: string) {
    if (!this.operatorAuth?.isEnabled()) {
      const authenticated = await this.repository.authenticateOperator(email, password);
      if (!authenticated) {
        await this.auditFailedOperatorLogin(email);
        throw new Error("Invalid email or password.");
      }
      return authenticated;
    }

    try {
      const authUser = await this.operatorAuth.signInWithPassword(email, password);
      const authenticated = await this.repository.reconcileOperatorIdentity(authUser, {
        allowSeededDevBootstrap: true,
        updateLastLoginAt: true,
      });
      if (!authenticated) {
        throw new Error("No restaurant access is configured for this operator.");
      }
      return authenticated;
    } catch (error) {
      await this.auditFailedOperatorLogin(email);
      throw error;
    }
  }

  private async auditFailedOperatorLogin(email: string) {
    const operator = await this.repository.reconcileOperatorIdentity(
      { id: "audit-only", email, fullName: "Restaurant Operator" },
      { allowSeededDevBootstrap: false, updateLastLoginAt: false, linkIdentity: false },
    );
    if (!operator) {
      return;
    }
    await this.repository.appendAuditLog({
      restaurantId: operator.selectedMembership.restaurantId,
      actorType: "manager",
      actorId: operator.user.id,
      action: "operator.login_failed",
      targetType: "operator_user",
      targetId: operator.user.id,
      summary: `Failed sign-in attempt for ${email}.`,
    });
    log("warn", "auth_failure", { email });
  }

  async getOperationalDiagnostics(restaurantId: string) {
    return this.repository.getOperationalDiagnostics(restaurantId);
  }

  async replayFailedOrder(restaurantId: string, orderId: string) {
    return this.submitOrderToPOS(restaurantId, orderId);
  }

  async refreshOrderStatus(restaurantId: string, orderId: string) {
    const detail = await this.requireSingleOrderDetail(restaurantId, orderId);
    const latestSubmission = detail.submissions[0];
    if (!latestSubmission?.externalOrderId) {
      throw new Error("Order has no external POS order id.");
    }
    const context = await this.getPOSContext(restaurantId);
    const adapter = this.adapters.getAdapter(context.connection);
    const status = await this.withRetry(
      "status_poll",
      orderId,
      { externalOrderId: latestSubmission.externalOrderId },
      async () => adapter.getOrderStatus(latestSubmission.externalOrderId!, context),
      (error) => this.isTransientError(error),
      2,
    );
    await this.appendTimelineAndAuditForStatus(restaurantId, orderId, status.status, status.message);
    return status;
  }

  async ingestProviderEvent(provider: Extract<POSProvider, "toast" | "deliverect">, eventType: string, payload: Record<string, unknown>) {
    return this.repository.saveEventIngestion({
      provider,
      eventType,
      payload,
      externalEventId: typeof payload.id === "string" ? payload.id : undefined,
      orderId: typeof payload.orderId === "string" ? payload.orderId : undefined,
      status: "received",
      processedAt: undefined,
    });
  }

  async validateOrder(orderInput: unknown): Promise<OrderValidationResult> {
    const parsed = canonicalOrderIntentSchema.parse(orderInput);
    return this.runIdempotent("validate", parsed, async (orderId, idempotencyKey) => {
      const result = await this.performRuleValidation(parsed, orderId);
      result.idempotencyKey = idempotencyKey;
      log("info", "order_validation", {
        restaurantId: parsed.restaurant_id,
        agentId: parsed.agent_id,
        orderId,
        correlationId: parsed.external_order_reference,
        idempotencyKey,
        valid: result.valid,
      });
      return result;
    });
  }

  async quoteOrder(orderInput: unknown): Promise<OrderQuote> {
    const parsed = canonicalOrderIntentSchema.parse(orderInput);
    return this.runIdempotent("quote", parsed, async (orderId, idempotencyKey) => {
      const validation = await this.performRuleValidation(parsed, orderId);
      const blockingIssues = validation.issues.filter(
        (issue) =>
          issue.severity === "error" &&
          !this.quoteAllowedValidationCodes.has(issue.code),
      );
      if (blockingIssues.length > 0) {
        throw new Error("Order is not valid for quoting.");
      }
      const quote = await this.withRetry(
        "quote",
        undefined,
        parsed,
        async () => this.buildQuote(parsed, orderId),
        (error) => this.isTransientError(error),
        2,
      );
      quote.idempotencyKey = idempotencyKey;
      log("info", "order_quote", {
        restaurantId: parsed.restaurant_id,
        agentId: parsed.agent_id,
        orderId,
        correlationId: parsed.external_order_reference,
        idempotencyKey,
        totalCents: quote.totalCents,
      });
      return quote;
    });
  }

  async startPaymentSession(
    orderInput: unknown,
    paymentSession: { successUrl: string; cancelUrl: string },
  ): Promise<POSPaymentSessionResult> {
    const parsed = canonicalOrderIntentSchema.parse(orderInput);
    await this.validateAgentAccess(parsed.restaurant_id, parsed.agent_id);
    const validation = await this.performRuleValidation(
      parsed,
      (await this.repository.findOrderIdByReference(parsed.external_order_reference)) ?? parsed.external_order_reference,
    );
    if (!validation.valid) {
      throw new Error("Order failed validation.");
    }
    const context = await this.getPOSContext(parsed.restaurant_id);
    const adapter = this.adapters.getAdapter(context.connection);
    if (!adapter.startPayment) {
      throw new Error(`POS provider ${context.connection.provider} does not support hosted payment starts.`);
    }
    const quote = await this.withRetry(
      "quote",
      undefined,
      parsed,
      async () => this.buildQuote(parsed, parsed.external_order_reference),
      (error) => this.isTransientError(error),
      2,
    );
    const quoteResult = this.quoteToQuoteResult(quote);
    const result = await adapter.startPayment(parsed, quoteResult, paymentSession, context);
    log("info", "payment_start", {
      restaurantId: parsed.restaurant_id,
      agentId: parsed.agent_id,
      correlationId: parsed.external_order_reference,
      paymentStatus: result.status,
      paymentReference: result.paymentReference ?? null,
    });
    return result;
  }

  async submitAgentOrder(orderInput: unknown): Promise<AgentOrderRecord> {
    const parsed = canonicalOrderIntentSchema.parse(orderInput);
    return this.runIdempotent("submit", parsed, async (orderId, idempotencyKey) => {
      await this.validateAgentAccess(parsed.restaurant_id, parsed.agent_id);
      const validation = await this.performRuleValidation(parsed, orderId);
      validation.idempotencyKey = idempotencyKey;
      if (!validation.valid) {
        throw new Error("Order failed validation.");
      }
      const quote = await this.withRetry(
        "quote",
        undefined,
        parsed,
        async () => this.buildQuote(parsed, orderId),
        (error) => this.isTransientError(error),
        2,
      );
      quote.idempotencyKey = idempotencyKey;
      const approvalRequired = await this.requiresApproval(parsed);
      const now = new Date().toISOString();
      const sourceQuoteTotalCents = this.readSourceQuoteTotalCents(parsed);
      const order: AgentOrderRecord = {
        id: orderId,
        restaurantId: parsed.restaurant_id,
        agentId: parsed.agent_id,
        externalOrderReference: parsed.external_order_reference,
        customerName: parsed.customer.name,
        customerEmail: parsed.customer.email,
        teamName: parsed.customer.teamName,
        fulfillmentType: parsed.fulfillment_type,
        requestedFulfillmentTime: parsed.requested_fulfillment_time,
        headcount: parsed.headcount,
        status: approvalRequired ? "needs_approval" : "approved",
        approvalRequired,
        totalEstimateCents: sourceQuoteTotalCents ?? quote.totalCents,
        createdAt: now,
        updatedAt: now,
        packagingInstructions: parsed.packaging_instructions,
        dietaryConstraints: parsed.dietary_constraints,
        orderIntent: parsed,
      };
      const { items, modifiers } = this.buildOrderRelations(orderId, parsed);
      await this.repository.createOrderGraph({
        order,
        items,
        modifiers,
        validationResult: validation,
        quote,
        statusEvents: [
          { orderId, status: "received", message: "Order received through agent API." },
          {
            orderId,
            status: order.status,
            message: approvalRequired ? "Order requires approval based on restaurant rules." : "Order auto-approved by restaurant rules.",
          },
        ],
        auditLog: {
          restaurantId: parsed.restaurant_id,
          actorType: "agent",
          actorId: parsed.agent_id,
          action: "order.submitted",
          targetType: "agent_order",
          targetId: order.id,
          summary: `Agent submitted order ${parsed.external_order_reference}.`,
        },
      });
      await this.repository.refreshReportingMetrics(parsed.restaurant_id);
      log("info", "order_submit", {
        restaurantId: parsed.restaurant_id,
        agentId: parsed.agent_id,
        orderId,
        correlationId: parsed.external_order_reference,
        idempotencyKey,
        status: order.status,
      });
      return order;
    });
  }

  async getAgentOrderStatus(orderId: string) {
    const order = await this.repository.getOrderById(orderId);
    if (!order) {
      throw new Error(`Order ${orderId} not found.`);
    }
    const latestSubmission = await this.repository.getLatestSubmission(orderId);
    if (latestSubmission?.externalOrderId) {
      try {
        const context = await this.getPOSContext(order.restaurantId);
        const adapter = this.adapters.getAdapter(context.connection);
        await this.withRetry(
          "status_poll",
          orderId,
          { externalOrderId: latestSubmission.externalOrderId },
          async () => adapter.getOrderStatus(latestSubmission.externalOrderId!, context),
          (error) => this.isTransientError(error),
          2,
        );
      } catch {
        // preserve last known state
      }
    }
    return {
      orderId,
      status: order.status,
      totalEstimateCents: order.totalEstimateCents,
      externalOrderId: latestSubmission?.externalOrderId ?? null,
      updatedAt: order.updatedAt,
    };
  }

  private async getAgent(agentId: string): Promise<Agent> {
    const agent = await this.repository.getAgent(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found.`);
    }
    return agent;
  }

  private async getPOSContext(restaurantId: string): Promise<POSContext> {
    const [restaurant, location, connection, menu] = await Promise.all([
      this.getRestaurant(restaurantId),
      this.repository.getLocation(restaurantId),
      this.getPOSConnection(restaurantId),
      this.repository.getMenu(restaurantId),
    ]);
    if (!location) {
      throw new Error("Restaurant location missing.");
    }
    return {
      restaurant,
      location,
      connection,
      menuItems: menu.items,
      modifierGroups: menu.modifierGroups,
      modifiers: menu.modifiers,
    };
  }

  private async performRuleValidation(order: CanonicalOrderIntent, orderId: string): Promise<OrderValidationResult> {
    const restaurant = await this.getRestaurant(order.restaurant_id);
    await this.validateAgentAccess(order.restaurant_id, order.agent_id);
    const rules = await this.getRules(order.restaurant_id);
    const context = await this.getPOSContext(order.restaurant_id);
    const issues: ValidationIssue[] = [];
    const minutesUntil = (new Date(order.requested_fulfillment_time).getTime() - Date.now()) / 60000;

    if (!restaurant.agentOrderingEnabled) {
      issues.push({
        code: "ordering_disabled",
        message: "Restaurant has disabled agent ordering.",
        severity: "error",
      });
    }

    if (minutesUntil < rules.minimumLeadTimeMinutes) {
      issues.push({
        code: "lead_time_too_short",
        message: `Minimum lead time is ${rules.minimumLeadTimeMinutes} minutes.`,
        field: "requested_fulfillment_time",
        severity: "error",
      });
    }

    if (order.headcount > rules.maxHeadcount) {
      issues.push({
        code: "headcount_too_large",
        message: `Maximum headcount is ${rules.maxHeadcount}.`,
        field: "headcount",
        severity: "error",
      });
    }

    if (!rules.allowedFulfillmentTypes.includes(order.fulfillment_type)) {
      issues.push({
        code: "fulfillment_type_not_allowed",
        message: `Fulfillment type ${order.fulfillment_type} is not enabled for this restaurant.`,
        field: "fulfillment_type",
        severity: "error",
      });
    }

    const menuItemMap = new Map(context.menuItems.map((item) => [item.id, item]));
    const modifierGroupMap = new Map(context.modifierGroups.map((group) => [group.id, group]));
    const modifierMap = new Map(context.modifiers.map((modifier) => [modifier.id, modifier]));

    let aggregateItemQuantity = 0;
    let aggregateTotalCents = 0;

    order.items.forEach((item, index) => {
      aggregateItemQuantity += item.quantity;
      const menuItem = menuItemMap.get(item.item_id);
      if (!menuItem) {
        issues.push({
          code: "item_not_found",
          message: `Item ${item.item_id} is not in the canonical menu.`,
          field: `items.${index}.item_id`,
          severity: "error",
        });
        return;
      }
      aggregateTotalCents += menuItem.priceCents * item.quantity;
      if (menuItem.mappingStatus === "needs_review") {
        issues.push({
          code: "mapping_needs_review",
          message: `${menuItem.name} still needs POS mapping review.`,
          field: `items.${index}.item_id`,
          severity: "warning",
        });
      }
      item.modifiers.forEach((modifier, modifierIndex) => {
        const group = modifierGroupMap.get(modifier.modifier_group_id);
        const modifierRecord = modifierMap.get(modifier.modifier_id);
        if (!group || !menuItem.modifierGroupIds.includes(group.id)) {
          issues.push({
            code: "modifier_group_invalid",
            message: `Modifier group ${modifier.modifier_group_id} is not valid for ${menuItem.name}.`,
            field: `items.${index}.modifiers.${modifierIndex}.modifier_group_id`,
            severity: "error",
          });
        }
        if (!modifierRecord || modifierRecord.modifierGroupId !== modifier.modifier_group_id) {
          issues.push({
            code: "modifier_invalid",
            message: `Modifier ${modifier.modifier_id} is not valid for group ${modifier.modifier_group_id}.`,
            field: `items.${index}.modifiers.${modifierIndex}.modifier_id`,
            severity: "error",
          });
        } else {
          aggregateTotalCents += modifierRecord.priceCents * modifier.quantity;
        }
      });
    });

    if (aggregateItemQuantity > rules.maxItemQuantity) {
      issues.push({
        code: "too_many_items",
        message: `Maximum total item quantity is ${rules.maxItemQuantity}.`,
        field: "items",
        severity: "error",
      });
    }

    const maxOrderCents = Math.round(rules.maxOrderDollarAmount * 100);
    if (aggregateTotalCents > maxOrderCents) {
      issues.push({
        code: "order_value_too_large",
        message: `Maximum order amount is $${rules.maxOrderDollarAmount.toFixed(2)} before tax and fees.`,
        severity: "error",
      });
    }

    return {
      id: createId("ovr"),
      orderId,
      valid: issues.every((issue) => issue.severity !== "error"),
      issues,
      checkedAt: new Date().toISOString(),
    };
  }

  private quoteToQuoteResult(quote: OrderQuote) {
    return {
      ok: true,
      subtotalCents: quote.subtotalCents,
      taxCents: quote.taxCents,
      feesCents: quote.feesCents,
      totalCents: quote.totalCents,
      message: "Using stored quote.",
    };
  }

  private readSourceQuoteTotalCents(order: CanonicalOrderIntent) {
    const raw = order.metadata?.source_quote_total_cents;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
  }

  private async buildQuote(order: CanonicalOrderIntent, orderId: string) {
    const context = await this.getPOSContext(order.restaurant_id);
    const adapter = this.adapters.getAdapter(context.connection);
    const quoteResult = await adapter.quoteOrder(order, context);
    return {
      id: createId("quote"),
      orderId,
      subtotalCents: quoteResult.subtotalCents,
      taxCents: quoteResult.taxCents,
      feesCents: quoteResult.feesCents,
      totalCents: quoteResult.totalCents,
      currency: "USD" as const,
      quotedAt: new Date().toISOString(),
    };
  }

  private buildPayloadSnapshot(order: AgentOrderRecord, quote: OrderQuote, context: POSContext) {
    return {
      canonicalOrder: order.orderIntent,
      quote: this.quoteToQuoteResult(quote),
      posProvider: context.connection.provider,
      restaurantGuid: context.connection.restaurantGuid,
      locationId: context.connection.locationId,
      mappedItemIds: order.orderIntent.items.map((item) => item.item_id),
    };
  }

  private async quotePersistedOrder(order: AgentOrderRecord) {
    const quote = await this.buildQuote(order.orderIntent, order.id);
    await this.repository.saveQuote(quote);
    return quote;
  }

  private async requireFreshQuote(order: AgentOrderRecord) {
    const quote = await this.repository.getLatestQuote(order.id);
    if (!quote) {
      throw new Error("Order must be quoted before submitting to POS.");
    }
    const ageMs = Date.now() - new Date(quote.quotedAt).getTime();
    if (ageMs > this.quoteExpiryMs) {
      throw new Error("Stored quote has expired. Requote before submitting to POS.");
    }
    return quote;
  }

  private async ensureFreshQuote(order: AgentOrderRecord) {
    try {
      return await this.requireFreshQuote(order);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes("expired")) {
        throw error;
      }
      const refreshed = await this.withRetry(
        "quote",
        order.id,
        order.orderIntent,
        async () => this.quotePersistedOrder(order),
        (retryError) => this.isTransientError(retryError),
        2,
      );
      await this.repository.appendAuditLog({
        restaurantId: order.restaurantId,
        actorType: "system",
        actorId: "quote_refresh",
        action: "order.quote_refreshed",
        targetType: "agent_order",
        targetId: order.id,
        summary: "Stored quote expired and was refreshed before POS submission.",
      });
      await this.repository.appendStatusEvent({
        orderId: order.id,
        status: order.status,
        message: "Stored quote expired and was refreshed before POS submission.",
      });
      log("info", "order_quote_refreshed", {
        restaurantId: order.restaurantId,
        orderId: order.id,
        correlationId: order.externalOrderReference,
        totalCents: refreshed.totalCents,
      });
      return refreshed;
    }
  }

  private async appendTimelineAndAuditForStatus(restaurantId: string, orderId: string, status: AgentOrderStatus, message: string) {
    await this.repository.appendStatusEvent({ orderId, status, message });
    await this.repository.appendAuditLog({
      restaurantId,
      actorType: "system",
      actorId: "status_refresh",
      action: `order.${status}`,
      targetType: "agent_order",
      targetId: orderId,
      summary: message,
    });
  }

  private isTransientError(error: unknown) {
    const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
    return message.includes("timeout") || message.includes("tempor") || message.includes("429") || message.includes("5");
  }

  private async sleep(ms: number) {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async withRetry<T>(
    stage: "quote" | "pos_submit" | "status_poll",
    orderId: string | undefined,
    payloadSnapshot: Record<string, unknown>,
    task: () => Promise<T>,
    shouldRetry: (error: unknown) => boolean,
    maxAttempts: number,
  ) {
    let attempt = 0;
    let lastError: unknown;
    while (attempt < maxAttempts) {
      attempt += 1;
      try {
        const result = await task();
        await this.repository.saveRetryAttempt({
          orderId,
          stage,
          attemptNumber: attempt,
          status: "succeeded",
          payloadSnapshot,
          responseSnapshot: result && typeof result === "object" ? (result as Record<string, unknown>) : { result },
        });
        return result;
      } catch (error) {
        lastError = error;
        await this.repository.saveRetryAttempt({
          orderId,
          stage,
          attemptNumber: attempt,
          status: "failed",
          errorMessage: error instanceof Error ? error.message : String(error),
          payloadSnapshot,
        });
        if (attempt >= maxAttempts || !shouldRetry(error)) {
          throw error;
        }
        await this.sleep(this.retryBaseDelayMs * 2 ** (attempt - 1));
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  private buildIdempotencyKey(scope: "validate" | "quote" | "submit", order: CanonicalOrderIntent) {
    return String(order.metadata?.idempotency_key ?? `${scope}:${order.external_order_reference}`);
  }

  private isDuplicateIdempotencyError(error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return message.includes("api_idempotency_records_scope_restaurant_id_agent_id_idempo_key");
  }

  private async waitForIdempotentResult<T extends Record<string, unknown>>(
    scope: "validate" | "quote" | "submit",
    restaurantId: string,
    agentId: string,
    idempotencyKey: string,
    requestHash: string,
  ): Promise<T | null> {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const record = await this.repository.getIdempotencyRecord(scope, restaurantId, agentId, idempotencyKey);
      if (!record) {
        await this.sleep(25);
        continue;
      }
      if (record.requestHash !== requestHash) {
        throw new Error(`Idempotency key ${idempotencyKey} was already used for a different request.`);
      }
      if (record.status === "completed" && record.response) {
        return record.response as T;
      }
      if (record.status === "failed") {
        throw new Error(record.error || "A prior identical request failed.");
      }
      await this.sleep(50);
    }
    return null;
  }

  private async runIdempotent<T extends Record<string, unknown>>(
    scope: "validate" | "quote" | "submit",
    parsed: CanonicalOrderIntent,
    work: (orderId: string, idempotencyKey: string) => Promise<T>,
  ): Promise<T> {
    const idempotencyKey = this.buildIdempotencyKey(scope, parsed);
    const requestHash = sha256(JSON.stringify(parsed));
    const existing = await this.repository.getIdempotencyRecord(scope, parsed.restaurant_id, parsed.agent_id, idempotencyKey);
    if (existing) {
      if (existing.requestHash !== requestHash) {
        throw new Error(`Idempotency key ${idempotencyKey} was already used for a different request.`);
      }
      if (existing.status === "completed" && existing.response) {
        return existing.response as T;
      }
      if (existing.status === "pending") {
        const pendingResult = await this.waitForIdempotentResult<T>(scope, parsed.restaurant_id, parsed.agent_id, idempotencyKey, requestHash);
        if (pendingResult) {
          return pendingResult;
        }
        throw new Error("An identical request is already in progress.");
      }
      await this.repository.updateIdempotencyRecord(existing.id, { status: "pending", error: undefined });
    } else {
      try {
        await this.repository.createIdempotencyRecord({
          scope,
          restaurantId: parsed.restaurant_id,
          agentId: parsed.agent_id,
          idempotencyKey,
          requestHash,
          status: "pending",
        });
      } catch (error) {
        if (!this.isDuplicateIdempotencyError(error)) {
          throw error;
        }
        const concurrentResult = await this.waitForIdempotentResult<T>(scope, parsed.restaurant_id, parsed.agent_id, idempotencyKey, requestHash);
        if (concurrentResult) {
          return concurrentResult;
        }
      }
    }
    const record = await this.repository.getIdempotencyRecord(scope, parsed.restaurant_id, parsed.agent_id, idempotencyKey);
    if (!record) {
      throw new Error("Failed to establish idempotency record.");
    }
    const orderId =
      scope === "submit"
        ? (await this.repository.findOrderIdByReference(parsed.external_order_reference)) ?? createId("order")
        : (await this.repository.findOrderIdByReference(parsed.external_order_reference)) ?? parsed.external_order_reference;
    try {
      const result = await work(orderId, idempotencyKey);
      const persistedOrderId =
        scope === "submit" && "id" in result && typeof result.id === "string"
          ? result.id
          : undefined;
      await this.repository.updateIdempotencyRecord(record.id, {
        status: "completed",
        response: result,
        orderId: persistedOrderId,
      });
      return result;
    } catch (error) {
      await this.repository.updateIdempotencyRecord(record.id, {
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private async assertReadyForPOSSubmission(order: AgentOrderRecord, quote: OrderQuote) {
    await this.validateAgentAccess(order.restaurantId, order.agentId);
    if (!quote.orderId || quote.orderId !== order.id) {
      throw new Error("Stored quote does not belong to this order.");
    }
    if (order.status !== "approved") {
      throw new Error("Order must be approved before live POS submission.");
    }
    const duplicateOrderId = await this.repository.findOrderIdByReference(order.externalOrderReference);
    if (duplicateOrderId && duplicateOrderId !== order.id) {
      throw new Error("Order external reference must be unique before POS submission.");
    }
    const requestedAt = new Date(order.requestedFulfillmentTime).getTime();
    if (Number.isNaN(requestedAt) || requestedAt <= Date.now()) {
      throw new Error("Order requested fulfillment time must be a valid future timestamp.");
    }

    const menu = await this.repository.getMenu(order.restaurantId);
    const mappedItems = new Set(
      menu.mappings.filter((mapping) => mapping.canonicalType === "item" && mapping.status === "mapped").map((mapping) => mapping.canonicalId),
    );
    const mappedGroups = new Set(
      menu.mappings
        .filter((mapping) => mapping.canonicalType === "modifier_group" && mapping.status === "mapped")
        .map((mapping) => mapping.canonicalId),
    );
    const mappedModifiers = new Set(
      menu.mappings
        .filter((mapping) => mapping.canonicalType === "modifier" && mapping.status === "mapped")
        .map((mapping) => mapping.canonicalId),
    );

    for (const item of order.orderIntent.items) {
      if (!mappedItems.has(item.item_id)) {
        throw new Error(`POS mapping is missing for item ${item.item_id}.`);
      }
      for (const modifier of item.modifiers) {
        if (!mappedGroups.has(modifier.modifier_group_id)) {
          throw new Error(`POS mapping is missing for modifier group ${modifier.modifier_group_id}.`);
        }
        if (!mappedModifiers.has(modifier.modifier_id)) {
          throw new Error(`POS mapping is missing for modifier ${modifier.modifier_id}.`);
        }
      }
    }
  }

  private async requirePendingDecisionOrder(restaurantId: string, orderId: string) {
    const order = (await this.requireSingleOrderDetail(restaurantId, orderId)).order;
    if (order.status !== "needs_approval") {
      throw new Error("Order decision is final and cannot be changed.");
    }
    return order;
  }

  private async getSingleOrderDetail(restaurantId: string, orderId: string) {
    return this.repository.getOrderDetail(restaurantId, orderId);
  }

  private async requireSingleOrderDetail(restaurantId: string, orderId: string) {
    const detail = await this.getSingleOrderDetail(restaurantId, orderId);
    if (!detail) {
      throw new Error(`Order ${orderId} not found.`);
    }
    return detail;
  }

  private getSplitGroupId(order: AgentOrderRecord | null | undefined) {
    return normalizeText(
      order?.splitGroupId ||
      order?.orderIntent?.metadata?.split_group_id,
    );
  }

  private buildGroupedOrderDetail(
    restaurantId: string,
    groupOrders: AgentOrderRecord[],
  ): Promise<OrderDetailRecord> {
    return (async () => {
      const sortedOrders = this.sortSplitGroupOrders(groupOrders);
      const details = await Promise.all(
        sortedOrders.map(async (order) => this.requireSingleOrderDetail(restaurantId, order.id)),
      );
      const representative = details[0]?.order ?? sortedOrders[0];
      const groupedOrder = this.buildGroupedOrder(
        details.map((detail) => detail.order),
        representative,
      );

      const timeline = details
        .flatMap((detail, index) => {
          const suborderIndex = index + 1;
          const suborderLabel = `Suborder ${suborderIndex} of ${details.length}`;
          return (detail.timeline ?? []).map((event) => ({
            ...event,
            message: `${suborderLabel}: ${event.message}`,
            details: {
              ...(event.details ?? {}),
              orderId: detail.order.id,
              externalOrderReference: detail.order.externalOrderReference,
              splitGroupIndex: detail.order.splitGroupIndex ?? suborderIndex,
              splitGroupSize: details.length,
            },
          }));
        })
        .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());

      return {
        order: groupedOrder,
        groupedOrders: details.map((detail) => detail.order),
        items: details.flatMap((detail, index) =>
          detail.items.map((item) => ({
            ...item,
            groupOrderId: detail.order.id,
            groupOrderIndex: detail.order.splitGroupIndex ?? index + 1,
            groupOrderSize: details.length,
          })),
        ),
        validationResults: details
          .flatMap((detail) => detail.validationResults)
          .sort((left, right) => new Date(right.checkedAt).getTime() - new Date(left.checkedAt).getTime()),
        quotes: details
          .flatMap((detail) => detail.quotes)
          .sort((left, right) => new Date(right.quotedAt).getTime() - new Date(left.quotedAt).getTime()),
        submissions: details
          .flatMap((detail) => detail.submissions)
          .sort((left, right) => new Date(right.submittedAt).getTime() - new Date(left.submittedAt).getTime()),
        statusEvents: details
          .flatMap((detail) => detail.statusEvents)
          .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()),
        auditLogs: details
          .flatMap((detail) => detail.auditLogs ?? [])
          .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()),
        retries: details
          .flatMap((detail) => detail.retries ?? [])
          .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()),
        timeline,
        diagnostics: {
          rawOrderIntent: groupedOrder.orderIntent,
          latestValidation: details.flatMap((detail) => detail.validationResults)[0],
          latestQuote: details.flatMap((detail) => detail.quotes)[0],
          latestSubmission: details.flatMap((detail) => detail.submissions)[0],
          mappedPayload: details.flatMap((detail) => detail.submissions)[0]?.payloadSnapshot,
          retries: details.flatMap((detail) => detail.retries ?? []),
        },
      };
    })();
  }

  private buildGroupedOrder(groupOrders: AgentOrderRecord[], representative: AgentOrderRecord): AgentOrderRecord {
    const sortedGroupOrders = this.sortSplitGroupOrders(groupOrders);

    if (groupOrders.length <= 1) {
      return representative;
    }

    return {
      ...representative,
      status: this.getGroupedOrderStatus(sortedGroupOrders, representative.status),
      totalEstimateCents: sortedGroupOrders.reduce((sum, order) => sum + Math.max(0, Number(order.totalEstimateCents || 0)), 0),
      headcount: sortedGroupOrders.reduce((sum, order) => sum + Math.max(0, Number(order.headcount || 0)), 0),
      splitGroupId: this.getSplitGroupId(representative) || undefined,
      splitGroupSize: sortedGroupOrders.length,
      groupedOrderIds: sortedGroupOrders.map((order) => order.id),
      orderIntent: {
        ...representative.orderIntent,
        metadata: {
          ...(representative.orderIntent?.metadata || {}),
          split_group_id: this.getSplitGroupId(representative) || undefined,
          split_group_size: sortedGroupOrders.length,
          split_child_order_ids: sortedGroupOrders.map((order) => order.id),
        },
      },
    };
  }

  private groupOrdersForReview(orders: AgentOrderRecord[]) {
    const grouped = new Map<string, AgentOrderRecord[]>();
    const standalone: AgentOrderRecord[] = [];

    for (const order of orders) {
      const splitGroupId = this.getSplitGroupId(order);
      if (!splitGroupId) {
        standalone.push(order);
        continue;
      }
      const bucket = grouped.get(splitGroupId) ?? [];
      bucket.push(order);
      grouped.set(splitGroupId, bucket);
    }

    const aggregated = Array.from(grouped.values()).map((groupOrders) => {
      const representative =
        this.sortSplitGroupOrders(groupOrders)[0] ?? groupOrders[0];
      return this.buildGroupedOrder(groupOrders, representative);
    });

    return [...standalone, ...aggregated].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  private async getCurrentGroupedOrderState(restaurantId: string, representativeOrderId: string) {
    const refreshedRepresentative = await this.repository.getOrderById(representativeOrderId);
    if (!refreshedRepresentative) {
      throw new Error(`Order ${representativeOrderId} not found.`);
    }
    const refreshedGroupOrders = await this.getDecisionGroupOrders(restaurantId, refreshedRepresentative);
    const refreshedRepresentativeOrder = refreshedGroupOrders[0] ?? refreshedRepresentative;
    return this.buildGroupedOrder(refreshedGroupOrders, refreshedRepresentativeOrder);
  }

  private async getDecisionGroupOrders(restaurantId: string, order: AgentOrderRecord) {
    const splitGroupId = this.getSplitGroupId(order);
    if (!splitGroupId) return [order];

    const orders = await this.repository.listOrders(restaurantId);
    const siblings = this.sortSplitGroupOrders(
      orders.filter((entry) => this.getSplitGroupId(entry) === splitGroupId),
    );

    return siblings.length ? siblings : [order];
  }

  private sortSplitGroupOrders(groupOrders: AgentOrderRecord[]) {
    return [...groupOrders].sort((left, right) => {
      const leftIndex = Number(left.splitGroupIndex ?? left.orderIntent?.metadata?.split_group_index ?? Number.MAX_SAFE_INTEGER);
      const rightIndex = Number(right.splitGroupIndex ?? right.orderIntent?.metadata?.split_group_index ?? Number.MAX_SAFE_INTEGER);
      return leftIndex - rightIndex || left.createdAt.localeCompare(right.createdAt);
    });
  }

  private getGroupedOrderStatus(groupOrders: AgentOrderRecord[], fallbackStatus: AgentOrderStatus) {
    const statuses = groupOrders
      .map((order) => normalizeText(order.status))
      .filter((status): status is AgentOrderStatus => Boolean(status));

    if (!statuses.length) {
      return fallbackStatus;
    }

    if (statuses.some((status) => status === "failed")) return "failed";
    if (statuses.some((status) => status === "cancelled")) return "cancelled";
    if (statuses.some((status) => status === "rejected")) return "rejected";
    if (statuses.some((status) => status === "completed")) return "completed";
    if (statuses.some((status) => status === "ready")) return "ready";
    if (statuses.some((status) => status === "preparing")) return "preparing";
    if (statuses.some((status) => status === "accepted")) return "accepted";
    if (statuses.some((status) => status === "submitted_to_pos")) return "submitted_to_pos";
    if (statuses.some((status) => status === "approved")) return "approved";
    if (statuses.some((status) => status === "submitting_to_pos")) return "submitting_to_pos";
    if (statuses.every((status) => status === "needs_approval")) return "needs_approval";

    return fallbackStatus;
  }

  private buildGroupDecisionMessage(groupOrders: AgentOrderRecord[], decision: "approved" | "rejected") {
    if (groupOrders.length <= 1) {
      return decision === "approved" ? "Manager approved the order." : "Manager rejected the order.";
    }

    return decision === "approved"
      ? `Manager approved split order bundle (${groupOrders.length} linked orders).`
      : `Manager rejected split order bundle (${groupOrders.length} linked orders).`;
  }

  private async requiresApproval(order: CanonicalOrderIntent) {
    const rules = await this.getRules(order.restaurant_id);
    if (order.approval_requirements?.manager_approval_required) {
      return true;
    }
    const context = await this.getPOSContext(order.restaurant_id);
    const itemMap = new Map(context.menuItems.map((entry) => [entry.id, entry]));
    const estimatedSubtotal = order.items.reduce((sum, item) => {
      const menuItem = itemMap.get(item.item_id);
      return sum + (menuItem?.priceCents ?? 0) * item.quantity;
    }, 0);
    return !rules.autoAcceptEnabled || estimatedSubtotal >= rules.managerApprovalThresholdCents;
  }

  private buildOrderRelations(orderId: string, parsed: CanonicalOrderIntent) {
    const items: AgentOrderItemRecord[] = [];
    const modifiers: AgentOrderModifierRecord[] = [];
    parsed.items.forEach((item) => {
      const itemId = createId("order_item");
      items.push({
        id: itemId,
        orderId,
        menuItemId: item.item_id,
        quantity: item.quantity,
        notes: item.notes,
      });
      item.modifiers.forEach((modifier) => {
        modifiers.push({
          id: createId("order_mod"),
          orderItemId: itemId,
          modifierGroupId: modifier.modifier_group_id,
          modifierId: modifier.modifier_id,
          quantity: modifier.quantity,
        });
      });
    });
    return { items, modifiers };
  }
}
