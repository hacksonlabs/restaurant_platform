import { sha256 } from "../utils/crypto";
import { createId } from "../utils/ids";
import type {
  Agent,
  AgentApiKey,
  OperatorMembership,
  OperatorSession,
  OperatorUser,
  AgentOrderItemRecord,
  AgentOrderModifierRecord,
  AgentOrderRecord,
  AuditLog,
  CanonicalMenuItem,
  CanonicalModifier,
  CanonicalModifierGroup,
  EventIngestionRecord,
  IdempotencyRecord,
  OrderingRule,
  POSConnection,
  POSMenuMapping,
  ReportingDailyMetric,
  Restaurant,
  RestaurantAgentPermission,
  RestaurantLocation,
  RetryAttempt,
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
  operatorUsers: OperatorUser[];
  operatorMemberships: OperatorMembership[];
  operatorSessions: OperatorSession[];
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
  idempotencyRecords: IdempotencyRecord[];
  retryAttempts: RetryAttempt[];
  ingestedEvents: EventIngestionRecord[];
}

export function createDemoSeed(demoPhantomApiKey: string): DemoSeedState {
  const now = new Date("2026-05-01T18:00:00.000Z").toISOString();
  const restaurantId = "rest_lb_steakhouse";
  const locationId = "loc_lb_main";
  const phantomAgentId = "agent_phantom";
  const coachImHungryAgentId = "agent_coachimhungry";
  const orderId = "order_lb_demo_001";

  const restaurant: Restaurant = {
    id: restaurantId,
    name: "LB Steakhouse",
    location: "1533 Ashcroft Way, Sunnyvale, CA 94087",
    timezone: "America/Los_Angeles",
    imageUrl: "https://images.pexels.com/photos/67468/pexels-photo-67468.jpeg",
    cuisineType: "Steakhouse",
    description: "Classic steakhouse plates, polished sides, and a strong team-order catering fit.",
    rating: 4.7,
    deliveryFee: 299,
    minimumOrder: 2500,
    supportsCatering: true,
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
    name: "Ashcroft Way Test Kitchen",
    address1: "1533 Ashcroft Way",
    city: "Sunnyvale",
    state: "CA",
    postalCode: "94087",
    latitude: 37.3509,
    longitude: -122.0378,
  };

  const posConnection: POSConnection = {
    id: "posconn_lb_toast",
    restaurantId,
    provider: "toast",
    status: "sandbox",
    mode: "mock",
    restaurantGuid: "toast-rest-guid-lb-steakhouse",
    locationId: "toast-location-lb-ashcroft",
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
      imageUrl: "https://images.pexels.com/photos/675951/pexels-photo-675951.jpeg",
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
      imageUrl: "https://images.pexels.com/photos/361184/asparagus-steak-veal-steak-veal-361184.jpeg",
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
      imageUrl: "https://images.pexels.com/photos/2097090/pexels-photo-2097090.jpeg",
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
      imageUrl: "https://images.pexels.com/photos/291528/pexels-photo-291528.jpeg",
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

  const phantomAgent: Agent = {
    id: phantomAgentId,
    name: "Phantom",
    slug: "phantom",
    description: "Default first-party agent integration.",
    createdAt: now,
  };

  const coachImHungryAgent: Agent = {
    id: coachImHungryAgentId,
    name: "CoachImHungry",
    slug: "coachimhungry",
    description: "External MealOps ordering agent acting on behalf of customers.",
    createdAt: now,
  };

  const agentApiKey: AgentApiKey = {
    id: "key_coachimhungry_demo",
    agentId: coachImHungryAgentId,
    label: "CoachImHungry local demo key",
    keyPrefix: demoPhantomApiKey.slice(0, 8),
    keyHash: sha256(demoPhantomApiKey),
    scopes: [
      "restaurants:read",
      "menus:read",
      "payments:start",
      "orders:validate",
      "orders:quote",
      "orders:submit",
      "orders:status",
    ],
    lastUsedAt: now,
    createdAt: now,
  };

  const operatorUser: OperatorUser = {
    id: "op_dev_rest",
    email: "dev@rest.com",
    fullName: "Restaurant Dev Operator",
    createdAt: now,
  };

  const operatorMembership: OperatorMembership = {
    id: "membership_lb_owner",
    operatorUserId: operatorUser.id,
    restaurantId,
    locationId,
    role: "owner",
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

  const coachPermission: RestaurantAgentPermission = {
    id: "perm_lb_coachimhungry",
    restaurantId,
    agentId: coachImHungryAgentId,
    status: "allowed",
    notes: "Seeded CoachImHungry allow-list entry.",
    lastActivityAt: now,
  };

  const orderingRule: OrderingRule = {
    id: "rules_lb_default",
    restaurantId,
    minimumLeadTimeMinutes: 90,
    maxOrderDollarAmount: 250,
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
    allowedAgentIds: [phantomAgentId, coachImHungryAgentId],
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

  function createSimpleRestaurantSeed(input: {
    restaurantId: string;
    name: string;
    locationLabel: string;
    address1: string;
    city: string;
    state: string;
    postalCode: string;
    latitude: number;
    longitude: number;
    contactEmail: string;
    contactPhone: string;
    imageUrl: string;
    cuisineType: string;
    description: string;
    rating: number;
    deliveryFee: number;
    minimumOrder: number;
    supportsCatering?: boolean;
  menuItems: Array<{
      id: string;
      category: string;
      name: string;
      description: string;
      imageUrl: string;
      priceCents: number;
      posExternalId: string;
    }>;
    maxOrderDollarAmount: number;
  }) {
    const locationId = `loc_${input.restaurantId.replace(/^rest_/, "")}_main`;
    const restaurant: Restaurant = {
      id: input.restaurantId,
      name: input.name,
      location: `${input.address1}, ${input.city}, ${input.state} ${input.postalCode}`,
      timezone: "America/Los_Angeles",
      imageUrl: input.imageUrl,
      cuisineType: input.cuisineType,
      description: input.description,
      rating: input.rating,
      deliveryFee: input.deliveryFee,
      minimumOrder: input.minimumOrder,
      supportsCatering: input.supportsCatering ?? true,
      posProvider: "toast",
      agentOrderingEnabled: true,
      defaultApprovalMode: "threshold_review",
      contactEmail: input.contactEmail,
      contactPhone: input.contactPhone,
      fulfillmentTypesSupported: ["pickup", "delivery", "catering"],
      createdAt: now,
      updatedAt: now,
    };

    const location: RestaurantLocation = {
      id: locationId,
      restaurantId: input.restaurantId,
      name: input.locationLabel,
      address1: input.address1,
      city: input.city,
      state: input.state,
      postalCode: input.postalCode,
      latitude: input.latitude,
      longitude: input.longitude,
    };

    const posConnection: POSConnection = {
      id: `posconn_${input.restaurantId.replace(/^rest_/, "")}_toast`,
      restaurantId: input.restaurantId,
      provider: "toast",
      status: "sandbox",
      mode: "mock",
      restaurantGuid: `toast-rest-guid-${input.restaurantId.replace(/^rest_/, "")}`,
      locationId: `toast-location-${input.restaurantId.replace(/^rest_/, "")}-main`,
      lastTestedAt: now,
      lastSyncedAt: now,
      metadata: { source: "demo" },
    };

    const menuItems = input.menuItems.map<CanonicalMenuItem>((item) => ({
      id: item.id,
      restaurantId: input.restaurantId,
      category: item.category,
      name: item.name,
      description: item.description,
      imageUrl: item.imageUrl,
      priceCents: item.priceCents,
      availability: "available",
      mappingStatus: "mapped",
      modifierGroupIds: [],
      posRef: { provider: "toast", externalId: item.posExternalId },
    }));

    const posMappings = menuItems.map<POSMenuMapping>((item) => ({
      id: `map_${item.id}`,
      restaurantId: input.restaurantId,
      canonicalType: "item",
      canonicalId: item.id,
      provider: "toast",
      providerReference: item.posRef.externalId,
      status: "mapped",
    }));

    const membership: OperatorMembership = {
      id: `membership_${input.restaurantId.replace(/^rest_/, "")}_owner`,
      operatorUserId: operatorUser.id,
      restaurantId: input.restaurantId,
      locationId,
      role: "owner",
      createdAt: now,
    };

    const permission: RestaurantAgentPermission = {
      id: `perm_${input.restaurantId.replace(/^rest_/, "")}_phantom`,
      restaurantId: input.restaurantId,
      agentId: phantomAgentId,
      status: "allowed",
      notes: "Seeded default allow-list entry.",
      lastActivityAt: now,
    };

    const coachPermission: RestaurantAgentPermission = {
      id: `perm_${input.restaurantId.replace(/^rest_/, "")}_coachimhungry`,
      restaurantId: input.restaurantId,
      agentId: coachImHungryAgentId,
      status: "allowed",
      notes: "Seeded CoachImHungry allow-list entry.",
      lastActivityAt: now,
    };

    const orderingRule: OrderingRule = {
      id: `rules_${input.restaurantId.replace(/^rest_/, "")}_default`,
      restaurantId: input.restaurantId,
      minimumLeadTimeMinutes: 45,
      maxOrderDollarAmount: input.maxOrderDollarAmount,
      maxItemQuantity: 1000,
      maxHeadcount: 1000,
      autoAcceptEnabled: false,
      managerApprovalThresholdCents: 5000,
      blackoutWindows: [],
      allowedFulfillmentTypes: ["pickup", "delivery", "catering"],
      substitutionPolicy: "strict",
      paymentPolicy: "required_before_submit",
      allowedAgentIds: [phantomAgentId, coachImHungryAgentId],
    };

    const auditLog: AuditLog = {
      id: `audit_${input.restaurantId.replace(/^rest_/, "")}_menu_sync`,
      restaurantId: input.restaurantId,
      actorType: "system",
      actorId: "seed",
      action: "menu.synced",
      targetType: "pos_connection",
      targetId: posConnection.id,
      summary: "Seeded Toast sandbox menu sync completed.",
      createdAt: now,
    };

    return {
      restaurant,
      location,
      posConnection,
      menuItems,
      posMappings,
      membership,
      permission,
      coachPermission,
      orderingRule,
      auditLog,
    };
  }

  const pizzaPalace = createSimpleRestaurantSeed({
    restaurantId: "rest_pizza_palace",
    name: "Pizza Palace",
    locationLabel: "Sunnyvale Saratoga",
    address1: "1325 Sunnyvale Saratoga Rd",
    city: "Sunnyvale",
    state: "CA",
    postalCode: "94087",
    latitude: 37.3385,
    longitude: -122.0322,
    contactEmail: "ops@pizzapalace.example",
    contactPhone: "(123) 456-7890",
    imageUrl: "https://images.pexels.com/photos/825661/pexels-photo-825661.jpeg",
    cuisineType: "Pizza",
    description: "Shareable pies, garlic knots, and easy crowd ordering for pickup or delivery.",
    rating: 4.5,
    deliveryFee: 199,
    minimumOrder: 1800,
    supportsCatering: true,
    maxOrderDollarAmount: 300,
    menuItems: [
      {
        id: "item_pizza_margherita",
        category: "Pizzas",
        name: "Margherita Pizza",
        description: "Classic tomato, mozzarella, and basil.",
        imageUrl: "https://images.pexels.com/photos/315755/pexels-photo-315755.jpeg",
        priceCents: 1399,
        posExternalId: "toast_item_pizza_margherita",
      },
      {
        id: "item_pizza_bbq",
        category: "Pizzas",
        name: "BBQ Chicken Pizza",
        description: "BBQ chicken, onions, and cilantro.",
        imageUrl: "https://images.pexels.com/photos/1653877/pexels-photo-1653877.jpeg",
        priceCents: 1799,
        posExternalId: "toast_item_pizza_bbq",
      },
      {
        id: "item_pizza_knots",
        category: "Sides",
        name: "Garlic Knots",
        description: "Baked knots with roasted garlic butter.",
        imageUrl: "https://images.pexels.com/photos/6941037/pexels-photo-6941037.jpeg",
        priceCents: 799,
        posExternalId: "toast_item_pizza_knots",
      },
    ],
  });

  const greenLeafSalads = createSimpleRestaurantSeed({
    restaurantId: "rest_green_leaf_salads",
    name: "Green Leaf Salads",
    locationLabel: "West El Camino",
    address1: "650 W El Camino Real",
    city: "Sunnyvale",
    state: "CA",
    postalCode: "94087",
    latitude: 37.3794,
    longitude: -122.0428,
    contactEmail: "ops@greenleafsalads.example",
    contactPhone: "(408) 555-5505",
    imageUrl: "https://images.pexels.com/photos/1640774/pexels-photo-1640774.jpeg",
    cuisineType: "Salads",
    description: "Fresh salads and wraps with lighter delivery-friendly team meal options.",
    rating: 4.6,
    deliveryFee: 249,
    minimumOrder: 1500,
    supportsCatering: true,
    maxOrderDollarAmount: 350,
    menuItems: [
      {
        id: "item_green_cobb",
        category: "Salads",
        name: "Cobb Power Salad",
        description: "Chicken, egg, avocado, bacon, and greens.",
        imageUrl: "https://images.pexels.com/photos/1213710/pexels-photo-1213710.jpeg",
        priceCents: 1499,
        posExternalId: "toast_item_green_cobb",
      },
      {
        id: "item_green_kale",
        category: "Salads",
        name: "Kale Caesar",
        description: "Kale, parmesan, and brioche crumb.",
        imageUrl: "https://images.pexels.com/photos/257816/pexels-photo-257816.jpeg",
        priceCents: 1399,
        posExternalId: "toast_item_green_kale",
      },
      {
        id: "item_green_wrap",
        category: "Wraps",
        name: "Mediterranean Chicken Wrap",
        description: "Grilled chicken, cucumber, tomato, and feta.",
        imageUrl: "https://images.pexels.com/photos/461198/pexels-photo-461198.jpeg",
        priceCents: 1599,
        posExternalId: "toast_item_green_wrap",
      },
    ],
  });

  return {
    restaurants: [restaurant, pizzaPalace.restaurant, greenLeafSalads.restaurant],
    locations: [location, pizzaPalace.location, greenLeafSalads.location],
    posConnections: [posConnection, pizzaPalace.posConnection, greenLeafSalads.posConnection],
    menuItems: [...menuItems, ...pizzaPalace.menuItems, ...greenLeafSalads.menuItems],
    modifierGroups,
    modifiers,
    posMappings: [...posMappings, ...pizzaPalace.posMappings, ...greenLeafSalads.posMappings],
    agents: [phantomAgent, coachImHungryAgent],
    agentApiKeys: [agentApiKey],
    operatorUsers: [operatorUser],
    operatorMemberships: [operatorMembership, pizzaPalace.membership, greenLeafSalads.membership],
    operatorSessions: [],
    permissions: [
      permission,
      coachPermission,
      pizzaPalace.permission,
      pizzaPalace.coachPermission,
      greenLeafSalads.permission,
      greenLeafSalads.coachPermission,
    ],
    orderingRules: [orderingRule, pizzaPalace.orderingRule, greenLeafSalads.orderingRule],
    orders: [order],
    orderItems,
    orderModifiers,
    validationResults: [],
    quotes: [],
    posSubmissions: [],
    statusEvents,
    reportingMetrics,
    auditLogs: [...auditLogs, pizzaPalace.auditLog, greenLeafSalads.auditLog],
    idempotencyRecords: [],
    retryAttempts: [],
    ingestedEvents: [],
  };
}
