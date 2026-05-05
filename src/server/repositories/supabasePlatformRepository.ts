import type { Pool } from "pg";
import type {
  AgentApiKey,
  AgentOrderRecord,
  AuditLog,
  CanonicalMenuItem,
  CanonicalModifier,
  CanonicalModifierGroup,
  OrderQuote,
  OrderValidationResult,
  OrderingRule,
  POSConnection,
  POSMenuMapping,
  POSOrderSubmission,
  ReportingDailyMetric,
  Restaurant,
  RestaurantAgentPermission,
  RestaurantLocation,
  StatusEvent,
} from "../../shared/types";
import type {
  AgentListEntry,
  DashboardStats,
  OrderDetailRecord,
  OrderGraphInput,
  PlatformRepository,
  ReportingSnapshotRecord,
} from "./platformRepository";
import { createId } from "../utils/ids";

function required<T>(value: T | null, message: string): T {
  if (!value) throw new Error(message);
  return value;
}

function mapRestaurant(row: any): Restaurant {
  return {
    id: row.id,
    name: row.name,
    location: row.location,
    timezone: row.timezone,
    posProvider: row.pos_provider,
    agentOrderingEnabled: row.agent_ordering_enabled,
    defaultApprovalMode: row.default_approval_mode,
    contactEmail: row.contact_email,
    contactPhone: row.contact_phone,
    fulfillmentTypesSupported: row.fulfillment_types_supported ?? [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
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
    name: row.name,
    slug: row.slug,
    description: row.description,
    createdAt: row.created_at,
  };
}

function mapKey(row: any): AgentApiKey {
  return {
    id: row.id,
    agentId: row.agent_id,
    label: row.label,
    keyPrefix: row.key_prefix,
    keyHash: row.key_hash,
    lastUsedAt: row.last_used_at ?? undefined,
    createdAt: row.created_at,
    rotatedAt: row.rotated_at ?? undefined,
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
  return {
    id: row.id,
    restaurantId: row.restaurant_id,
    agentId: row.agent_id,
    externalOrderReference: row.external_order_reference,
    customerName: row.customer_name,
    customerEmail: row.customer_email ?? undefined,
    teamName: row.team_name ?? undefined,
    fulfillmentType: row.fulfillment_type,
    requestedFulfillmentTime: row.requested_fulfillment_time,
    headcount: row.headcount,
    status: row.status,
    approvalRequired: row.approval_required,
    totalEstimateCents: row.total_estimate_cents,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    packagingInstructions: row.packaging_instructions ?? undefined,
    dietaryConstraints: row.dietary_constraints ?? [],
    orderIntent: row.order_intent,
  };
}

function mapValidation(row: any): OrderValidationResult {
  return {
    id: row.id,
    orderId: row.order_id,
    valid: row.valid,
    issues: row.issues ?? [],
    checkedAt: row.checked_at,
  };
}

function mapQuote(row: any): OrderQuote {
  return {
    id: row.id,
    orderId: row.order_id,
    subtotalCents: row.subtotal_cents,
    taxCents: row.tax_cents,
    feesCents: row.fees_cents,
    totalCents: row.total_cents,
    currency: row.currency,
    quotedAt: row.quoted_at,
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
    submittedAt: row.submitted_at,
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

export class SupabasePlatformRepository implements PlatformRepository {
  constructor(private pool: Pool) {}

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
    return result.rows[0] ? mapPOSConnection(result.rows[0]) : null;
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
    const [items, groups, modifiers, mappings] = await Promise.all([
      this.pool.query("select * from canonical_menu_items where restaurant_id = $1 order by category, name", [restaurantId]),
      this.pool.query("select * from canonical_modifier_groups where restaurant_id = $1 order by name", [restaurantId]),
      this.pool.query(
        `select m.*
         from canonical_modifiers m
         join canonical_modifier_groups g on g.id = m.modifier_group_id
         where g.restaurant_id = $1
         order by m.name`,
        [restaurantId],
      ),
      this.pool.query("select * from pos_menu_mappings where restaurant_id = $1 order by canonical_type, canonical_id", [restaurantId]),
    ]);
    return {
      items: items.rows.map(mapMenuItem),
      modifierGroups: groups.rows.map(mapModifierGroup),
      modifiers: modifiers.rows.map(mapModifier),
      mappings: mappings.rows.map(mapMapping),
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
         p.agent_id,
         p.status,
         p.notes,
         p.last_activity_at,
         a.name as agent_name,
         a.slug as agent_slug,
         a.description as agent_description,
         a.created_at as agent_created_at,
         k.id as key_id,
         k.label as key_label,
         k.key_prefix,
         k.last_used_at,
         k.created_at as key_created_at,
         k.rotated_at
       from restaurant_agent_permissions p
       join agents a on a.id = p.agent_id
       left join agent_api_keys k on k.agent_id = a.id and k.rotated_at is null
       where p.restaurant_id = $1
       order by a.name asc`,
      [restaurantId],
    );
    return result.rows.map((row) => ({
      permissionId: row.permission_id,
      agent: {
        id: row.agent_id,
        name: row.agent_name,
        slug: row.agent_slug,
        description: row.agent_description,
        createdAt: row.agent_created_at,
      },
      permission: {
        id: row.permission_id,
        restaurantId: row.restaurant_id,
        agentId: row.agent_id,
        status: row.status,
        notes: row.notes ?? undefined,
        lastActivityAt: row.last_activity_at ?? undefined,
      },
      apiKey: row.key_id
        ? {
            id: row.key_id,
            label: row.key_label,
            keyPrefix: row.key_prefix,
            lastUsedAt: row.last_used_at ?? undefined,
            createdAt: row.key_created_at,
            rotatedAt: row.rotated_at ?? undefined,
          }
        : null,
    }));
  }

  async getAgent(agentId: string) {
    const result = await this.pool.query("select * from agents where id = $1 limit 1", [agentId]);
    return result.rows[0] ? mapAgent(result.rows[0]) : null;
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

  async listOrders(restaurantId: string) {
    const result = await this.pool.query(
      "select * from agent_orders where restaurant_id = $1 order by created_at desc",
      [restaurantId],
    );
    return result.rows.map(mapOrder);
  }

  async getOrderDetail(restaurantId: string, orderId: string): Promise<OrderDetailRecord | null> {
    const orderResult = await this.pool.query(
      "select * from agent_orders where restaurant_id = $1 and id = $2 limit 1",
      [restaurantId, orderId],
    );
    if (!orderResult.rows[0]) return null;
    const order = mapOrder(orderResult.rows[0]);
    const [itemsResult, modifiersResult, validationsResult, quotesResult, submissionsResult, statusResult] = await Promise.all([
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

    return {
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
    };
  }

  async getOrderById(orderId: string) {
    const result = await this.pool.query("select * from agent_orders where id = $1 limit 1", [orderId]);
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
         (id, order_id, subtotal_cents, tax_cents, fees_cents, total_cents, currency, quoted_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          input.quote.id,
          input.quote.orderId,
          input.quote.subtotalCents,
          input.quote.taxCents,
          input.quote.feesCents,
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
      "insert into order_validation_results (id, order_id, valid, issues, checked_at) values ($1, $2, $3, $4::jsonb, $5)",
      [result.id, result.orderId, result.valid, JSON.stringify(result.issues), result.checkedAt],
    );
  }

  async saveQuote(quote: OrderQuote) {
    await this.pool.query(
      `insert into order_quotes
       (id, order_id, subtotal_cents, tax_cents, fees_cents, total_cents, currency, quoted_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [quote.id, quote.orderId, quote.subtotalCents, quote.taxCents, quote.feesCents, quote.totalCents, quote.currency, quote.quotedAt],
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
       (id, order_id, provider, status, external_order_id, response, submitted_at)
       values ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
      [
        submission.id,
        submission.orderId,
        submission.provider,
        submission.status,
        submission.externalOrderId ?? null,
        JSON.stringify(submission.response),
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

  async authenticateAgentKey(keyHash: string) {
    const result = await this.pool.query(
      "update agent_api_keys set last_used_at = now() where key_hash = $1 returning *",
      [keyHash],
    );
    return result.rows[0] ? mapKey(result.rows[0]) : null;
  }

  async getRecentAuditLogs(restaurantId: string, limit: number) {
    const result = await this.pool.query(
      "select * from audit_logs where restaurant_id = $1 order by created_at desc limit $2",
      [restaurantId, limit],
    );
    return result.rows.map(mapAudit);
  }

  async getDashboardStats(restaurantId: string): Promise<DashboardStats> {
    const ordersResult = await this.pool.query(
      `select
         count(*) filter (where created_at >= now() - interval '7 day')::int as orders_this_week,
         coalesce(sum(total_estimate_cents) filter (where created_at >= now() - interval '7 day'), 0)::int as revenue_from_agent_orders_cents,
         count(*) filter (where status = 'needs_approval')::int as orders_needing_review
       from agent_orders
       where restaurant_id = $1`,
      [restaurantId],
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

  async getReporting(restaurantId: string): Promise<ReportingSnapshotRecord> {
    await this.refreshReportingMetrics(restaurantId);
    const [metricsResult, topItemsResult, topModifiersResult, failureReasonsResult] = await Promise.all([
      this.pool.query("select * from reporting_daily_metrics where restaurant_id = $1 order by date desc", [restaurantId]),
      this.pool.query(
        `select m.name, sum(oi.quantity)::int as count
         from agent_order_items oi
         join agent_orders o on o.id = oi.order_id
         join canonical_menu_items m on m.id = oi.menu_item_id
         where o.restaurant_id = $1
         group by m.name
         order by count desc, m.name asc
         limit 5`,
        [restaurantId],
      ),
      this.pool.query(
        `select m.name, sum(om.quantity)::int as count
         from agent_order_modifiers om
         join agent_order_items oi on oi.id = om.order_item_id
         join agent_orders o on o.id = oi.order_id
         join canonical_modifiers m on m.id = om.modifier_id
         where o.restaurant_id = $1
         group by m.name
         order by count desc, m.name asc
         limit 5`,
        [restaurantId],
      ),
      this.pool.query(
        `with validation_failures as (
           select issue->>'message' as reason
           from order_validation_results vr
           join agent_orders o on o.id = vr.order_id
           cross join lateral jsonb_array_elements(vr.issues) as issue
           where o.restaurant_id = $1
             and coalesce(issue->>'severity', '') = 'error'
         ),
         submission_failures as (
           select coalesce(response->>'message', response->>'error', 'POS submission failed') as reason
           from pos_order_submissions ps
           join agent_orders o on o.id = ps.order_id
           where o.restaurant_id = $1
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
        [restaurantId],
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
           'metric_' || to_char((created_at at time zone 'UTC')::date, 'YYYY_MM_DD') as id,
           restaurant_id,
           (created_at at time zone 'UTC')::date as date,
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
             where requested_fulfillment_time > now()
               and status not in ('rejected', 'failed', 'cancelled', 'completed')
           )::int as upcoming_scheduled_order_volume
         from agent_orders
         where restaurant_id = $1
         group by restaurant_id, (created_at at time zone 'UTC')::date`,
        [restaurantId],
      );
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }
}
