import { canonicalOrderIntentSchema } from "../../shared/schemas";
import type {
  Agent,
  AgentOrderItemRecord,
  AgentOrderModifierRecord,
  AgentOrderRecord,
  AgentOrderStatus,
  CanonicalOrderIntent,
  DashboardSnapshot,
  OrderQuote,
  OrderValidationResult,
  POSContext,
  POSDiagnosticsResult,
  POSOrderSubmission,
  Restaurant,
  RestaurantReportingSnapshot,
  ValidationIssue,
} from "../../shared/types";
import { POSAdapterRegistry } from "../pos/registry";
import type { PlatformRepository } from "../repositories/platformRepository";
import { sha256 } from "../utils/crypto";
import { createId } from "../utils/ids";

export class PlatformService {
  private quoteExpiryMs = 15 * 60 * 1000;

  constructor(
    private repository: PlatformRepository,
    private adapters = new POSAdapterRegistry(),
  ) {}

  async listRestaurants() {
    return this.repository.listRestaurants();
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
    const result = await adapter.syncMenu(context.connection, context);
    await this.repository.updatePOSConnection(context.connection.id, {
      lastSyncedAt: result.syncedAt,
    });
    await this.repository.appendAuditLog({
      restaurantId,
      actorType: "manager",
      actorId: "demo_manager",
      action: "menu.synced",
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
    return this.repository.listOrders(restaurantId);
  }

  async getOrder(restaurantId: string, orderId: string) {
    const detail = await this.repository.getOrderDetail(restaurantId, orderId);
    if (!detail) {
      throw new Error(`Order ${orderId} not found.`);
    }
    return detail;
  }

  async updateOrderStatus(restaurantId: string, orderId: string, status: AgentOrderStatus, message: string) {
    const updated = await this.repository.updateOrder(orderId, {
      status,
      updatedAt: new Date().toISOString(),
    });
    await this.repository.appendStatusEvent({ orderId, status, message });
    await this.repository.appendAuditLog({
      restaurantId,
      actorType: "manager",
      actorId: "demo_manager",
      action: `order.${status}`,
      targetType: "agent_order",
      targetId: orderId,
      summary: message,
    });
    await this.repository.refreshReportingMetrics(restaurantId);
    return updated;
  }

  async approveOrder(restaurantId: string, orderId: string) {
    return this.updateOrderStatus(restaurantId, orderId, "approved", "Manager approved the order.");
  }

  async rejectOrder(restaurantId: string, orderId: string) {
    return this.updateOrderStatus(restaurantId, orderId, "rejected", "Manager rejected the order.");
  }

  async submitOrderToPOS(restaurantId: string, orderId: string) {
    const detail = await this.getOrder(restaurantId, orderId);
    const quote = await this.requireFreshQuote(detail.order);
    await this.assertReadyForPOSSubmission(detail.order, quote);
    await this.updateOrderStatus(restaurantId, orderId, "submitting_to_pos", "Submitting order to POS.");
    const context = await this.getPOSContext(restaurantId);
    const adapter = this.adapters.getAdapter(context.connection);
    const response = await adapter.submitOrder(detail.order.orderIntent, this.quoteToQuoteResult(quote), context);
    const submission: POSOrderSubmission = {
      id: createId("sub"),
      orderId,
      provider: context.connection.provider,
      status: response.status,
      externalOrderId: response.externalOrderId ?? undefined,
      response: response.raw,
      submittedAt: new Date().toISOString(),
    };
    await this.repository.saveSubmission(submission);
    await this.repository.refreshReportingMetrics(restaurantId);
    await this.updateOrderStatus(
      restaurantId,
      orderId,
      response.status === "accepted" ? "accepted" : "submitted_to_pos",
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
    return keyRecord;
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

  async validateOrder(orderInput: unknown): Promise<OrderValidationResult> {
    const parsed = canonicalOrderIntentSchema.parse(orderInput);
    const orderId = (await this.repository.findOrderIdByReference(parsed.external_order_reference)) ?? parsed.external_order_reference;
    return this.performRuleValidation(parsed, orderId);
  }

  async quoteOrder(orderInput: unknown): Promise<OrderQuote> {
    const parsed = canonicalOrderIntentSchema.parse(orderInput);
    const orderId = (await this.repository.findOrderIdByReference(parsed.external_order_reference)) ?? parsed.external_order_reference;
    const validation = await this.performRuleValidation(parsed, orderId);
    if (!validation.valid) {
      throw new Error("Order is not valid for quoting.");
    }
    return this.buildQuote(parsed, orderId);
  }

  async submitAgentOrder(orderInput: unknown): Promise<AgentOrderRecord> {
    const parsed = canonicalOrderIntentSchema.parse(orderInput);
    await this.validateAgentAccess(parsed.restaurant_id, parsed.agent_id);
    const orderId = createId("order");
    const validation = await this.performRuleValidation(parsed, orderId);
    if (!validation.valid) {
      throw new Error("Order failed validation.");
    }
    const quote = await this.buildQuote(parsed, orderId);
    const approvalRequired = await this.requiresApproval(parsed);
    const now = new Date().toISOString();
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
      totalEstimateCents: quote.totalCents,
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
          message: approvalRequired
            ? "Order requires approval based on restaurant rules."
            : "Order auto-approved by restaurant rules.",
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

    return order;
  }

  async getAgentOrderStatus(orderId: string) {
    const order = await this.repository.getOrderById(orderId);
    if (!order) {
      throw new Error(`Order ${orderId} not found.`);
    }
    const latestSubmission = await this.repository.getLatestSubmission(orderId);
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
