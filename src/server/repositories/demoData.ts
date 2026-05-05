import { sha256 } from "../utils/crypto";
import { createId } from "../utils/ids";
import type {
  Agent,
  AgentApiKey,
  AgentOrderItemRecord,
  AgentOrderModifierRecord,
  AgentOrderRecord,
  AuditLog,
  CanonicalMenuItem,
  CanonicalModifier,
  CanonicalModifierGroup,
  OrderingRule,
  POSConnection,
  POSMenuMapping,
  ReportingDailyMetric,
  Restaurant,
  RestaurantAgentPermission,
  RestaurantLocation,
  StatusEvent,
} from "../../shared/types";

export interface DemoSeedState {
  restaurants: Restaurant[];
  locations: RestaurantLocation[];
  posConnections: POSConnection[];
  menuItems: CanonicalMenuItem[];
  modifierGroups: CanonicalModifierGroup[];
  modifiers: CanonicalModifier[];
  posMappings: POSMenuMapping[];
  agents: Agent[];
  agentApiKeys: AgentApiKey[];
  permissions: RestaurantAgentPermission[];
  orderingRules: OrderingRule[];
  orders: AgentOrderRecord[];
  orderItems: AgentOrderItemRecord[];
  orderModifiers: AgentOrderModifierRecord[];
  validationResults: Array<any>;
  quotes: Array<any>;
  posSubmissions: Array<any>;
  statusEvents: StatusEvent[];
  reportingMetrics: ReportingDailyMetric[];
  auditLogs: AuditLog[];
}

export function createDemoSeed(demoPhantomApiKey: string): DemoSeedState {
  const now = new Date("2026-05-01T18:00:00.000Z").toISOString();
  const restaurantId = "rest_lb_steakhouse";
  const locationId = "loc_lb_main";
  const phantomAgentId = "agent_phantom";
  const orderId = "order_lb_demo_001";

  const restaurant: Restaurant = {
    id: restaurantId,
    name: "LB Steakhouse",
    location: "San Jose, CA",
    timezone: "America/Los_Angeles",
    posProvider: "toast",
    agentOrderingEnabled: true,
    defaultApprovalMode: "threshold_review",
    contactEmail: "ops@lbsteakhouse.example",
    contactPhone: "(408) 555-0193",
    fulfillmentTypesSupported: ["pickup", "delivery", "catering"],
    createdAt: now,
    updatedAt: now,
  };

  const location: RestaurantLocation = {
    id: locationId,
    restaurantId,
    name: "Santana Row",
    address1: "334 Santana Row",
    city: "San Jose",
    state: "CA",
    postalCode: "95128",
  };

  const posConnection: POSConnection = {
    id: "posconn_lb_toast",
    restaurantId,
    provider: "toast",
    status: "sandbox",
    mode: "mock",
    restaurantGuid: "toast-rest-guid-lb-steakhouse",
    locationId: "toast-location-lb-main",
    lastTestedAt: now,
    lastSyncedAt: now,
    metadata: {
      source: "demo",
    },
  };

  const modifierGroups: CanonicalModifierGroup[] = [
    {
      id: "mg_temp",
      restaurantId,
      name: "Steak Temperature",
      selectionType: "single",
      required: true,
      minSelections: 1,
      maxSelections: 1,
    },
    {
      id: "mg_side",
      restaurantId,
      name: "Choice of Side",
      selectionType: "single",
      required: true,
      minSelections: 1,
      maxSelections: 1,
    },
    {
      id: "mg_addons",
      restaurantId,
      name: "Add Ons",
      selectionType: "multi",
      required: false,
      minSelections: 0,
      maxSelections: 3,
    },
  ];

  const modifiers: CanonicalModifier[] = [
    { id: "mod_rare", modifierGroupId: "mg_temp", name: "Rare", priceCents: 0, isAvailable: true },
    { id: "mod_medium_rare", modifierGroupId: "mg_temp", name: "Medium Rare", priceCents: 0, isAvailable: true },
    { id: "mod_medium", modifierGroupId: "mg_temp", name: "Medium", priceCents: 0, isAvailable: true },
    { id: "mod_truffle_fries", modifierGroupId: "mg_side", name: "Truffle Fries", priceCents: 0, isAvailable: true },
    { id: "mod_mashed", modifierGroupId: "mg_side", name: "Yukon Gold Mash", priceCents: 0, isAvailable: true },
    { id: "mod_asparagus", modifierGroupId: "mg_side", name: "Charred Asparagus", priceCents: 200, isAvailable: true },
    { id: "mod_sauce", modifierGroupId: "mg_addons", name: "Peppercorn Sauce", priceCents: 250, isAvailable: true },
    { id: "mod_shrimp", modifierGroupId: "mg_addons", name: "Garlic Shrimp", priceCents: 900, isAvailable: true },
  ];

  const menuItems: CanonicalMenuItem[] = [
    {
      id: "item_ribeye",
      restaurantId,
      category: "Steaks",
      name: "16oz Prime Ribeye",
      description: "Dry-aged ribeye with rosemary butter.",
      priceCents: 5600,
      availability: "available",
      mappingStatus: "mapped",
      modifierGroupIds: ["mg_temp", "mg_side", "mg_addons"],
      posRef: { provider: "toast", externalId: "toast_item_ribeye" },
    },
    {
      id: "item_filet",
      restaurantId,
      category: "Steaks",
      name: "8oz Center Cut Filet",
      description: "Tender filet with sea salt finish.",
      priceCents: 4900,
      availability: "available",
      mappingStatus: "mapped",
      modifierGroupIds: ["mg_temp", "mg_side", "mg_addons"],
      posRef: { provider: "toast", externalId: "toast_item_filet" },
    },
    {
      id: "item_caesar",
      restaurantId,
      category: "Starters",
      name: "Tableside Caesar",
      description: "Romaine, parmesan, brioche crumb.",
      priceCents: 1600,
      availability: "available",
      mappingStatus: "mapped",
      modifierGroupIds: [],
      posRef: { provider: "toast", externalId: "toast_item_caesar" },
    },
    {
      id: "item_butter_cake",
      restaurantId,
      category: "Dessert",
      name: "Butter Cake",
      description: "Warm vanilla butter cake with berries.",
      priceCents: 1400,
      availability: "available",
      mappingStatus: "needs_review",
      modifierGroupIds: [],
      posRef: { provider: "toast", externalId: "toast_item_butter_cake" },
    },
  ];

  const posMappings: POSMenuMapping[] = [
    ...menuItems.map((item) => ({
      id: createId("map"),
      restaurantId,
      canonicalType: "item" as const,
      canonicalId: item.id,
      provider: "toast" as const,
      providerReference: item.posRef.externalId,
      status: item.mappingStatus,
    })),
    ...modifierGroups.map((group) => ({
      id: createId("map"),
      restaurantId,
      canonicalType: "modifier_group" as const,
      canonicalId: group.id,
      provider: "toast" as const,
      providerReference: `toast_${group.id}`,
      status: "mapped" as const,
    })),
    ...modifiers.map((modifier) => ({
      id: createId("map"),
      restaurantId,
      canonicalType: "modifier" as const,
      canonicalId: modifier.id,
      provider: "toast" as const,
      providerReference: `toast_${modifier.id}`,
      status: "mapped" as const,
    })),
  ];

  const agent: Agent = {
    id: phantomAgentId,
    name: "Phantom",
    slug: "phantom",
    description: "Default first-party agent integration.",
    createdAt: now,
  };

  const agentApiKey: AgentApiKey = {
    id: "key_phantom_demo",
    agentId: phantomAgentId,
    label: "Local demo key",
    keyPrefix: demoPhantomApiKey.slice(0, 8),
    keyHash: sha256(demoPhantomApiKey),
    lastUsedAt: now,
    createdAt: now,
  };

  const permission: RestaurantAgentPermission = {
    id: "perm_lb_phantom",
    restaurantId,
    agentId: phantomAgentId,
    status: "allowed",
    notes: "Seeded default allow-list entry.",
    lastActivityAt: now,
  };

  const orderingRule: OrderingRule = {
    id: "rules_lb_default",
    restaurantId,
    minimumLeadTimeMinutes: 90,
    maxOrderDollarAmount: 2500,
    maxItemQuantity: 25,
    maxHeadcount: 40,
    autoAcceptEnabled: false,
    managerApprovalThresholdCents: 80000,
    blackoutWindows: [
      {
        id: "blackout_brunch",
        label: "Sunday Brunch Blackout",
        startsAt: "2026-05-03T17:00:00.000Z",
        endsAt: "2026-05-03T21:00:00.000Z",
      },
    ],
    allowedFulfillmentTypes: ["pickup", "delivery", "catering"],
    substitutionPolicy: "require_approval",
    paymentPolicy: "required_before_submit",
    allowedAgentIds: [phantomAgentId],
  };

  const orderIntent = {
    restaurant_id: restaurantId,
    agent_id: phantomAgentId,
    external_order_reference: "phantom-team-lunch-1001",
    customer: {
      name: "Avery Chen",
      email: "avery@phantom.example",
      phone: "408-555-0110",
      teamName: "Design Team",
    },
    fulfillment_type: "catering" as const,
    requested_fulfillment_time: "2026-05-02T19:30:00.000Z",
    headcount: 8,
    budget_constraints: {
      max_total_cents: 120000,
    },
    payment_policy: "required_before_submit" as const,
    items: [
      {
        item_id: "item_ribeye",
        quantity: 4,
        modifiers: [
          { modifier_group_id: "mg_temp", modifier_id: "mod_medium_rare", quantity: 1 },
          { modifier_group_id: "mg_side", modifier_id: "mod_truffle_fries", quantity: 1 },
        ],
      },
      {
        item_id: "item_filet",
        quantity: 2,
        modifiers: [
          { modifier_group_id: "mg_temp", modifier_id: "mod_medium", quantity: 1 },
          { modifier_group_id: "mg_side", modifier_id: "mod_mashed", quantity: 1 },
          { modifier_group_id: "mg_addons", modifier_id: "mod_sauce", quantity: 1 },
        ],
      },
      {
        item_id: "item_caesar",
        quantity: 2,
        modifiers: [],
      },
    ],
    dietary_constraints: ["nut_free"],
    packaging_instructions: "Label each entree with guest name when possible.",
    substitution_policy: "require_approval" as const,
    approval_requirements: {
      manager_approval_required: true,
    },
    metadata: {
      source: "seed_demo",
    },
  };

  const order: AgentOrderRecord = {
    id: orderId,
    restaurantId,
    agentId: phantomAgentId,
    externalOrderReference: orderIntent.external_order_reference,
    customerName: orderIntent.customer.name,
    customerEmail: orderIntent.customer.email,
    teamName: orderIntent.customer.teamName,
    fulfillmentType: orderIntent.fulfillment_type,
    requestedFulfillmentTime: orderIntent.requested_fulfillment_time,
    headcount: orderIntent.headcount,
    status: "needs_approval",
    approvalRequired: true,
    totalEstimateCents: 29697,
    createdAt: now,
    updatedAt: now,
    packagingInstructions: orderIntent.packaging_instructions,
    dietaryConstraints: orderIntent.dietary_constraints,
    orderIntent,
  };

  const orderItems: AgentOrderItemRecord[] = [
    { id: "order_item_1", orderId, menuItemId: "item_ribeye", quantity: 4 },
    { id: "order_item_2", orderId, menuItemId: "item_filet", quantity: 2 },
    { id: "order_item_3", orderId, menuItemId: "item_caesar", quantity: 2 },
  ];

  const orderModifiers: AgentOrderModifierRecord[] = [
    { id: "order_mod_1", orderItemId: "order_item_1", modifierGroupId: "mg_temp", modifierId: "mod_medium_rare", quantity: 1 },
    { id: "order_mod_2", orderItemId: "order_item_1", modifierGroupId: "mg_side", modifierId: "mod_truffle_fries", quantity: 1 },
    { id: "order_mod_3", orderItemId: "order_item_2", modifierGroupId: "mg_temp", modifierId: "mod_medium", quantity: 1 },
    { id: "order_mod_4", orderItemId: "order_item_2", modifierGroupId: "mg_side", modifierId: "mod_mashed", quantity: 1 },
    { id: "order_mod_5", orderItemId: "order_item_2", modifierGroupId: "mg_addons", modifierId: "mod_sauce", quantity: 1 },
  ];

  const reportingMetrics: ReportingDailyMetric[] = [
    {
      id: "metric_2026_04_29",
      restaurantId,
      date: "2026-04-29",
      totalOrders: 5,
      revenueCents: 126400,
      averageOrderValueCents: 25280,
      approvalRate: 0.4,
      successRate: 1,
      rejectedOrders: 0,
      averageLeadTimeMinutes: 185,
      upcomingScheduledOrderVolume: 3,
    },
    {
      id: "metric_2026_04_30",
      restaurantId,
      date: "2026-04-30",
      totalOrders: 6,
      revenueCents: 148800,
      averageOrderValueCents: 24800,
      approvalRate: 0.5,
      successRate: 0.83,
      rejectedOrders: 1,
      averageLeadTimeMinutes: 205,
      upcomingScheduledOrderVolume: 4,
    },
    {
      id: "metric_2026_05_01",
      restaurantId,
      date: "2026-05-01",
      totalOrders: 4,
      revenueCents: 98700,
      averageOrderValueCents: 24675,
      approvalRate: 0.75,
      successRate: 1,
      rejectedOrders: 0,
      averageLeadTimeMinutes: 220,
      upcomingScheduledOrderVolume: 5,
    },
  ];

  const auditLogs: AuditLog[] = [
    {
      id: "audit_1",
      restaurantId,
      actorType: "system",
      actorId: "seed",
      action: "menu.synced",
      targetType: "pos_connection",
      targetId: posConnection.id,
      summary: "Seeded Toast sandbox menu sync completed.",
      createdAt: now,
    },
    {
      id: "audit_2",
      restaurantId,
      actorType: "agent",
      actorId: phantomAgentId,
      action: "order.received",
      targetType: "agent_order",
      targetId: orderId,
      summary: "Phantom submitted a catering request for the Design Team.",
      createdAt: now,
    },
  ];

  const statusEvents: StatusEvent[] = [
    {
      id: "evt_1",
      orderId,
      status: "received",
      message: "Order received from Phantom.",
      createdAt: now,
    },
    {
      id: "evt_2",
      orderId,
      status: "needs_approval",
      message: "Order exceeded auto-accept threshold and needs manager review.",
      createdAt: now,
    },
  ];

  return {
    restaurants: [restaurant],
    locations: [location],
    posConnections: [posConnection],
    menuItems,
    modifierGroups,
    modifiers,
    posMappings,
    agents: [agent],
    agentApiKeys: [agentApiKey],
    permissions: [permission],
    orderingRules: [orderingRule],
    orders: [order],
    orderItems,
    orderModifiers,
    validationResults: [],
    quotes: [],
    posSubmissions: [],
    statusEvents,
    reportingMetrics,
    auditLogs,
  };
}
