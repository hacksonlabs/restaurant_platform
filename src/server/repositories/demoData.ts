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

const FOOD_IMAGE_URLS = {
  restLbSteakhouse: "https://images.pexels.com/photos/67468/pexels-photo-67468.jpeg",
  itemRibeye: "https://images.pexels.com/photos/675951/pexels-photo-675951.jpeg",
  itemFilet: "https://images.pexels.com/photos/361184/asparagus-steak-veal-steak-veal-361184.jpeg",
  itemCaesar: "https://images.pexels.com/photos/2097090/pexels-photo-2097090.jpeg",
  itemButterCake: "https://images.pexels.com/photos/291528/pexels-photo-291528.jpeg",
  restPizzaPalace: "https://images.pexels.com/photos/825661/pexels-photo-825661.jpeg",
  itemPizzaMargherita: "https://images.pexels.com/photos/315755/pexels-photo-315755.jpeg",
  itemPizzaBbq: "https://images.pexels.com/photos/1653877/pexels-photo-1653877.jpeg",
  itemPizzaKnots: "https://images.pexels.com/photos/37047927/pexels-photo-37047927.jpeg",
  restGreenLeafSalads: "https://images.pexels.com/photos/1640774/pexels-photo-1640774.jpeg",
  itemGreenCobb: "https://images.pexels.com/photos/1213710/pexels-photo-1213710.jpeg",
  itemGreenKale: "https://images.pexels.com/photos/257816/pexels-photo-257816.jpeg",
  itemGreenWrap: "https://images.pexels.com/photos/461198/pexels-photo-461198.jpeg",
  restSakuraSushiHouse: "https://images.pexels.com/photos/8696567/pexels-photo-8696567.jpeg",
  itemSakuraSalmonRoll: "https://images.pexels.com/photos/11661144/pexels-photo-11661144.jpeg",
  itemSakuraTunaBowl:
    "https://images.pexels.com/photos/4828250/pexels-photo-4828250.jpeg?cs=srgb&dl=pexels-alleksana-4828250.jpg&fm=jpg",
  itemSakuraEdamame:
    "https://images.pexels.com/photos/30358737/pexels-photo-30358737.jpeg?cs=srgb&dl=pexels-cottonbro-30358737.jpg&fm=jpg",
  restSunriseTaqueria:
    "https://images.pexels.com/photos/4958641/pexels-photo-4958641.jpeg?cs=srgb&dl=pexels-los-muertos-crew-4958641.jpg&fm=jpg",
  itemTacoAlPastor:
    "https://images.pexels.com/photos/4958641/pexels-photo-4958641.jpeg?cs=srgb&dl=pexels-los-muertos-crew-4958641.jpg&fm=jpg",
  itemTacoBurrito: "https://images.pexels.com/photos/5848704/pexels-photo-5848704.jpeg",
  itemTacoStreetCorn: "https://images.pexels.com/photos/3647378/pexels-photo-3647378.jpeg",
  restMidnightNoodleBar:
    "https://images.pexels.com/photos/15985539/pexels-photo-15985539.jpeg?cs=srgb&dl=pexels-pixabay-45170-15985539.jpg&fm=jpg",
  itemNoodleGarlicChili:
    "https://images.pexels.com/photos/15985539/pexels-photo-15985539.jpeg?cs=srgb&dl=pexels-pixabay-45170-15985539.jpg&fm=jpg",
  itemNoodleMisoUdon:
    "https://images.pexels.com/photos/31302048/pexels-photo-31302048.jpeg",
  itemNoodleGyoza:
    "https://images.pexels.com/photos/2098120/pexels-photo-2098120.jpeg?cs=srgb&dl=pexels-jeshoots-com-147458-2098120.jpg&fm=jpg",
  restHarborSandwichCo:
    "https://images.pexels.com/photos/15153241/pexels-photo-15153241.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=750&w=1260",
  itemHarborTurkeyClub: "https://images.pexels.com/photos/32318138/pexels-photo-32318138.jpeg",
  itemHarborPastramiMelt:
    "https://images.pexels.com/photos/1633578/pexels-photo-1633578.jpeg?cs=srgb&dl=pexels-engin-akyurt-1435907-1633578.jpg&fm=jpg",
  itemHarborTomatoSoup:
    "https://images.pexels.com/photos/27098513/pexels-photo-27098513.jpeg",
} as const;

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
    imageUrl: FOOD_IMAGE_URLS.restLbSteakhouse,
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
      imageUrl: FOOD_IMAGE_URLS.itemRibeye,
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
      imageUrl: FOOD_IMAGE_URLS.itemFilet,
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
      imageUrl: FOOD_IMAGE_URLS.itemCaesar,
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
      imageUrl: FOOD_IMAGE_URLS.itemButterCake,
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
      modifierGroupIds?: string[];
      availability?: "available" | "unavailable";
      mappingStatus?: "mapped" | "needs_review";
    }>;
    modifierGroups?: Array<{
      id: string;
      name: string;
      selectionType: "single" | "multi";
      required: boolean;
      minSelections: number;
      maxSelections: number;
    }>;
    modifiers?: Array<{
      id: string;
      modifierGroupId: string;
      name: string;
      priceCents: number;
      isAvailable: boolean;
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

    const modifierGroups = (input.modifierGroups ?? []).map<CanonicalModifierGroup>((group) => ({
      id: group.id,
      restaurantId: input.restaurantId,
      name: group.name,
      selectionType: group.selectionType,
      required: group.required,
      minSelections: group.minSelections,
      maxSelections: group.maxSelections,
    }));

    const modifiers = (input.modifiers ?? []).map<CanonicalModifier>((modifier) => ({
      id: modifier.id,
      modifierGroupId: modifier.modifierGroupId,
      name: modifier.name,
      priceCents: modifier.priceCents,
      isAvailable: modifier.isAvailable,
    }));

    const menuItems = input.menuItems.map<CanonicalMenuItem>((item) => ({
      id: item.id,
      restaurantId: input.restaurantId,
      category: item.category,
      name: item.name,
      description: item.description,
      imageUrl: item.imageUrl,
      priceCents: item.priceCents,
      availability: item.availability ?? "available",
      mappingStatus: item.mappingStatus ?? "mapped",
      modifierGroupIds: item.modifierGroupIds ?? [],
      posRef: { provider: "toast", externalId: item.posExternalId },
    }));

    const posMappings = [
      ...menuItems.map<POSMenuMapping>((item) => ({
        id: `map_${item.id}`,
        restaurantId: input.restaurantId,
        canonicalType: "item",
        canonicalId: item.id,
        provider: "toast",
        providerReference: item.posRef.externalId,
        status: item.mappingStatus,
      })),
      ...modifierGroups.map<POSMenuMapping>((group) => ({
        id: `map_${group.id}`,
        restaurantId: input.restaurantId,
        canonicalType: "modifier_group",
        canonicalId: group.id,
        provider: "toast",
        providerReference: `toast_${group.id}`,
        status: "mapped",
      })),
      ...modifiers.map<POSMenuMapping>((modifier) => ({
        id: `map_${modifier.id}`,
        restaurantId: input.restaurantId,
        canonicalType: "modifier",
        canonicalId: modifier.id,
        provider: "toast",
        providerReference: `toast_${modifier.id}`,
        status: "mapped",
      })),
    ];

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
      modifierGroups,
      modifiers,
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
    imageUrl: FOOD_IMAGE_URLS.restPizzaPalace,
    cuisineType: "Pizza",
    description: "Shareable pies, garlic knots, and easy crowd ordering for pickup or delivery.",
    rating: 4.5,
    deliveryFee: 199,
    minimumOrder: 1800,
    supportsCatering: true,
    maxOrderDollarAmount: 300,
    modifierGroups: [
      {
        id: "mg_pizza_crust",
        name: "Crust Style",
        selectionType: "single",
        required: true,
        minSelections: 1,
        maxSelections: 1,
      },
      {
        id: "mg_pizza_cheese",
        name: "Cheese Level",
        selectionType: "single",
        required: true,
        minSelections: 1,
        maxSelections: 1,
      },
      {
        id: "mg_pizza_toppings",
        name: "Toppings",
        selectionType: "multi",
        required: false,
        minSelections: 0,
        maxSelections: 4,
      },
    ],
    modifiers: [
      { id: "mod_pizza_classic", modifierGroupId: "mg_pizza_crust", name: "Classic Crust", priceCents: 0, isAvailable: true },
      { id: "mod_pizza_thin", modifierGroupId: "mg_pizza_crust", name: "Thin Crust", priceCents: 0, isAvailable: true },
      { id: "mod_pizza_gluten_free", modifierGroupId: "mg_pizza_crust", name: "Gluten Free Crust", priceCents: 300, isAvailable: true },
      { id: "mod_pizza_light_cheese", modifierGroupId: "mg_pizza_cheese", name: "Light Cheese", priceCents: 0, isAvailable: true },
      { id: "mod_pizza_regular_cheese", modifierGroupId: "mg_pizza_cheese", name: "Regular Cheese", priceCents: 0, isAvailable: true },
      { id: "mod_pizza_extra_cheese", modifierGroupId: "mg_pizza_cheese", name: "Extra Cheese", priceCents: 200, isAvailable: true },
      { id: "mod_pizza_pepperoni", modifierGroupId: "mg_pizza_toppings", name: "Pepperoni", priceCents: 250, isAvailable: true },
      { id: "mod_pizza_mushrooms", modifierGroupId: "mg_pizza_toppings", name: "Roasted Mushrooms", priceCents: 150, isAvailable: true },
      { id: "mod_pizza_burrata", modifierGroupId: "mg_pizza_toppings", name: "Burrata", priceCents: 350, isAvailable: false },
    ],
    menuItems: [
      {
        id: "item_pizza_margherita",
        category: "Pizzas",
        name: "Margherita Pizza",
        description: "Classic tomato, mozzarella, and basil.",
        imageUrl: FOOD_IMAGE_URLS.itemPizzaMargherita,
        priceCents: 1399,
        posExternalId: "toast_item_pizza_margherita",
        modifierGroupIds: ["mg_pizza_crust", "mg_pizza_cheese", "mg_pizza_toppings"],
      },
      {
        id: "item_pizza_bbq",
        category: "Pizzas",
        name: "BBQ Chicken Pizza",
        description: "BBQ chicken, onions, and cilantro.",
        imageUrl: FOOD_IMAGE_URLS.itemPizzaBbq,
        priceCents: 1799,
        posExternalId: "toast_item_pizza_bbq",
        modifierGroupIds: ["mg_pizza_crust", "mg_pizza_cheese", "mg_pizza_toppings"],
      },
      {
        id: "item_pizza_knots",
        category: "Sides",
        name: "Garlic Knots",
        description: "Baked knots with roasted garlic butter.",
        imageUrl: FOOD_IMAGE_URLS.itemPizzaKnots,
        priceCents: 799,
        posExternalId: "toast_item_pizza_knots",
        modifierGroupIds: ["mg_pizza_toppings"],
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
    imageUrl: FOOD_IMAGE_URLS.restGreenLeafSalads,
    cuisineType: "Salads",
    description: "Fresh salads and wraps with lighter delivery-friendly team meal options.",
    rating: 4.6,
    deliveryFee: 249,
    minimumOrder: 1500,
    supportsCatering: true,
    maxOrderDollarAmount: 350,
    modifierGroups: [
      {
        id: "mg_green_protein",
        name: "Protein Choice",
        selectionType: "single",
        required: false,
        minSelections: 0,
        maxSelections: 1,
      },
      {
        id: "mg_green_dressing",
        name: "Dressing",
        selectionType: "single",
        required: true,
        minSelections: 1,
        maxSelections: 1,
      },
      {
        id: "mg_green_extras",
        name: "Crunch & Extras",
        selectionType: "multi",
        required: false,
        minSelections: 0,
        maxSelections: 3,
      },
    ],
    modifiers: [
      { id: "mod_green_chicken", modifierGroupId: "mg_green_protein", name: "Grilled Chicken", priceCents: 300, isAvailable: true },
      { id: "mod_green_tofu", modifierGroupId: "mg_green_protein", name: "Herb Tofu", priceCents: 200, isAvailable: true },
      { id: "mod_green_salmon", modifierGroupId: "mg_green_protein", name: "Salmon", priceCents: 450, isAvailable: false },
      { id: "mod_green_tahini", modifierGroupId: "mg_green_dressing", name: "Lemon Tahini", priceCents: 0, isAvailable: true },
      { id: "mod_green_caesar", modifierGroupId: "mg_green_dressing", name: "Caesar", priceCents: 0, isAvailable: true },
      { id: "mod_green_goddess", modifierGroupId: "mg_green_dressing", name: "Green Goddess", priceCents: 0, isAvailable: true },
      { id: "mod_green_avocado", modifierGroupId: "mg_green_extras", name: "Avocado", priceCents: 200, isAvailable: true },
      { id: "mod_green_chickpeas", modifierGroupId: "mg_green_extras", name: "Crispy Chickpeas", priceCents: 150, isAvailable: true },
      { id: "mod_green_feta", modifierGroupId: "mg_green_extras", name: "Feta", priceCents: 175, isAvailable: true },
    ],
    menuItems: [
      {
        id: "item_green_cobb",
        category: "Salads",
        name: "Cobb Power Salad",
        description: "Chicken, egg, avocado, bacon, and greens.",
        imageUrl: FOOD_IMAGE_URLS.itemGreenCobb,
        priceCents: 1499,
        posExternalId: "toast_item_green_cobb",
        modifierGroupIds: ["mg_green_protein", "mg_green_dressing", "mg_green_extras"],
      },
      {
        id: "item_green_kale",
        category: "Salads",
        name: "Kale Caesar",
        description: "Kale, parmesan, and brioche crumb.",
        imageUrl: FOOD_IMAGE_URLS.itemGreenKale,
        priceCents: 1399,
        posExternalId: "toast_item_green_kale",
        modifierGroupIds: ["mg_green_protein", "mg_green_dressing", "mg_green_extras"],
      },
      {
        id: "item_green_wrap",
        category: "Wraps",
        name: "Mediterranean Chicken Wrap",
        description: "Grilled chicken, cucumber, tomato, and feta.",
        imageUrl: FOOD_IMAGE_URLS.itemGreenWrap,
        priceCents: 1599,
        posExternalId: "toast_item_green_wrap",
        modifierGroupIds: ["mg_green_protein", "mg_green_dressing", "mg_green_extras"],
      },
    ],
  });

  const sakuraSushiHouse = createSimpleRestaurantSeed({
    restaurantId: "rest_sakura_sushi_house",
    name: "Sakura Sushi House",
    locationLabel: "East El Camino",
    address1: "895 E El Camino Real",
    city: "Sunnyvale",
    state: "CA",
    postalCode: "94087",
    latitude: 37.3619,
    longitude: -122.0249,
    contactEmail: "ops@sakurasushi.example",
    contactPhone: "(408) 555-7331",
    imageUrl: FOOD_IMAGE_URLS.restSakuraSushiHouse,
    cuisineType: "Sushi",
    description: "Bright sushi sets, rice bowls, and polished small plates for high-trust demo ordering.",
    rating: 4.8,
    deliveryFee: 299,
    minimumOrder: 2200,
    supportsCatering: true,
    maxOrderDollarAmount: 325,
    modifierGroups: [
      { id: "mg_sakura_rice", name: "Rice Style", selectionType: "single", required: false, minSelections: 0, maxSelections: 1 },
      { id: "mg_sakura_sauce", name: "Sauce Finish", selectionType: "single", required: true, minSelections: 1, maxSelections: 1 },
      { id: "mg_sakura_addons", name: "Add Ons", selectionType: "multi", required: false, minSelections: 0, maxSelections: 3 },
    ],
    modifiers: [
      { id: "mod_sakura_white_rice", modifierGroupId: "mg_sakura_rice", name: "White Rice", priceCents: 0, isAvailable: true },
      { id: "mod_sakura_brown_rice", modifierGroupId: "mg_sakura_rice", name: "Brown Rice", priceCents: 100, isAvailable: true },
      { id: "mod_sakura_soy", modifierGroupId: "mg_sakura_sauce", name: "Soy Glaze", priceCents: 0, isAvailable: true },
      { id: "mod_sakura_spicy_mayo", modifierGroupId: "mg_sakura_sauce", name: "Spicy Mayo", priceCents: 100, isAvailable: true },
      { id: "mod_sakura_ponzu", modifierGroupId: "mg_sakura_sauce", name: "Ponzu", priceCents: 0, isAvailable: true },
      { id: "mod_sakura_avocado", modifierGroupId: "mg_sakura_addons", name: "Avocado", priceCents: 150, isAvailable: true },
      { id: "mod_sakura_crispy_onion", modifierGroupId: "mg_sakura_addons", name: "Crispy Onion", priceCents: 100, isAvailable: true },
      { id: "mod_sakura_toro", modifierGroupId: "mg_sakura_addons", name: "Toro Add-On", priceCents: 400, isAvailable: false },
    ],
    menuItems: [
      {
        id: "item_sakura_salmon_roll",
        category: "Rolls",
        name: "Salmon Crunch Roll",
        description: "Salmon, cucumber, avocado, and tempura crunch.",
        imageUrl: FOOD_IMAGE_URLS.itemSakuraSalmonRoll,
        priceCents: 1699,
        posExternalId: "toast_item_sakura_salmon_roll",
        modifierGroupIds: ["mg_sakura_sauce", "mg_sakura_addons"],
      },
      {
        id: "item_sakura_tuna_bowl",
        category: "Bowls",
        name: "Spicy Tuna Bowl",
        description: "Spicy tuna, pickled cucumber, rice, and sesame.",
        imageUrl: FOOD_IMAGE_URLS.itemSakuraTunaBowl,
        priceCents: 1799,
        posExternalId: "toast_item_sakura_tuna_bowl",
        modifierGroupIds: ["mg_sakura_rice", "mg_sakura_sauce", "mg_sakura_addons"],
      },
      {
        id: "item_sakura_edamame",
        category: "Small Plates",
        name: "Sea Salt Edamame",
        description: "Warm edamame with flaky salt and chili flakes.",
        imageUrl: FOOD_IMAGE_URLS.itemSakuraEdamame,
        priceCents: 699,
        posExternalId: "toast_item_sakura_edamame",
        modifierGroupIds: ["mg_sakura_sauce"],
      },
    ],
  });

  const sunriseTaqueria = createSimpleRestaurantSeed({
    restaurantId: "rest_sunrise_taqueria",
    name: "Sunrise Taqueria",
    locationLabel: "Fair Oaks",
    address1: "1105 Fair Oaks Ave",
    city: "Sunnyvale",
    state: "CA",
    postalCode: "94089",
    latitude: 37.3852,
    longitude: -122.0082,
    contactEmail: "ops@sunrisetaqueria.example",
    contactPhone: "(408) 555-2408",
    imageUrl: FOOD_IMAGE_URLS.restSunriseTaqueria,
    cuisineType: "Mexican",
    description: "Colorful tacos, burritos, and sides that read beautifully on camera and in shared carts.",
    rating: 4.7,
    deliveryFee: 249,
    minimumOrder: 1600,
    supportsCatering: true,
    maxOrderDollarAmount: 285,
    modifierGroups: [
      { id: "mg_taco_tortilla", name: "Tortilla Style", selectionType: "single", required: true, minSelections: 1, maxSelections: 1 },
      { id: "mg_taco_salsa", name: "Salsa Choice", selectionType: "single", required: true, minSelections: 1, maxSelections: 1 },
      { id: "mg_taco_extras", name: "Extras", selectionType: "multi", required: false, minSelections: 0, maxSelections: 3 },
    ],
    modifiers: [
      { id: "mod_taco_corn", modifierGroupId: "mg_taco_tortilla", name: "Corn Tortilla", priceCents: 0, isAvailable: true },
      { id: "mod_taco_flour", modifierGroupId: "mg_taco_tortilla", name: "Flour Tortilla", priceCents: 0, isAvailable: true },
      { id: "mod_taco_roja", modifierGroupId: "mg_taco_salsa", name: "Salsa Roja", priceCents: 0, isAvailable: true },
      { id: "mod_taco_verde", modifierGroupId: "mg_taco_salsa", name: "Salsa Verde", priceCents: 0, isAvailable: true },
      { id: "mod_taco_chipotle", modifierGroupId: "mg_taco_salsa", name: "Smoky Chipotle", priceCents: 50, isAvailable: true },
      { id: "mod_taco_pickled_onion", modifierGroupId: "mg_taco_extras", name: "Pickled Onion", priceCents: 75, isAvailable: true },
      { id: "mod_taco_cotija", modifierGroupId: "mg_taco_extras", name: "Cotija", priceCents: 100, isAvailable: true },
      { id: "mod_taco_guac", modifierGroupId: "mg_taco_extras", name: "Guacamole", priceCents: 250, isAvailable: false },
    ],
    menuItems: [
      {
        id: "item_taco_al_pastor",
        category: "Tacos",
        name: "Al Pastor Taco Trio",
        description: "Three tacos with pineapple, onion, and cilantro.",
        imageUrl: FOOD_IMAGE_URLS.itemTacoAlPastor,
        priceCents: 1599,
        posExternalId: "toast_item_taco_al_pastor",
        modifierGroupIds: ["mg_taco_tortilla", "mg_taco_salsa", "mg_taco_extras"],
      },
      {
        id: "item_taco_burrito",
        category: "Burritos",
        name: "Carne Asada Burrito",
        description: "Carne asada, rice, beans, pico, and crema.",
        imageUrl: FOOD_IMAGE_URLS.itemTacoBurrito,
        priceCents: 1699,
        posExternalId: "toast_item_taco_burrito",
        modifierGroupIds: ["mg_taco_tortilla", "mg_taco_salsa", "mg_taco_extras"],
      },
      {
        id: "item_taco_street_corn",
        category: "Sides",
        name: "Street Corn Cup",
        description: "Roasted corn with cotija, lime, and chile.",
        imageUrl: FOOD_IMAGE_URLS.itemTacoStreetCorn,
        priceCents: 799,
        posExternalId: "toast_item_taco_street_corn",
        modifierGroupIds: ["mg_taco_salsa", "mg_taco_extras"],
      },
    ],
  });

  const midnightNoodleBar = createSimpleRestaurantSeed({
    restaurantId: "rest_midnight_noodle_bar",
    name: "Midnight Noodle Bar",
    locationLabel: "Downtown Sunnyvale",
    address1: "301 W Washington Ave",
    city: "Sunnyvale",
    state: "CA",
    postalCode: "94086",
    latitude: 37.3691,
    longitude: -122.0377,
    contactEmail: "ops@midnightnoodle.example",
    contactPhone: "(408) 555-9077",
    imageUrl: FOOD_IMAGE_URLS.restMidnightNoodleBar,
    cuisineType: "Asian",
    description: "Late-night noodle bowls and craveable small plates designed to make the menu feel rich and premium.",
    rating: 4.7,
    deliveryFee: 299,
    minimumOrder: 1800,
    supportsCatering: true,
    maxOrderDollarAmount: 340,
    modifierGroups: [
      { id: "mg_noodle_spice", name: "Spice Level", selectionType: "single", required: true, minSelections: 1, maxSelections: 1 },
      { id: "mg_noodle_protein", name: "Protein Boost", selectionType: "single", required: false, minSelections: 0, maxSelections: 1 },
      { id: "mg_noodle_finish", name: "Finishing Touches", selectionType: "multi", required: false, minSelections: 0, maxSelections: 3 },
    ],
    modifiers: [
      { id: "mod_noodle_mild", modifierGroupId: "mg_noodle_spice", name: "Mild", priceCents: 0, isAvailable: true },
      { id: "mod_noodle_medium", modifierGroupId: "mg_noodle_spice", name: "Medium", priceCents: 0, isAvailable: true },
      { id: "mod_noodle_hot", modifierGroupId: "mg_noodle_spice", name: "Hot", priceCents: 0, isAvailable: true },
      { id: "mod_noodle_chicken", modifierGroupId: "mg_noodle_protein", name: "Chicken", priceCents: 300, isAvailable: true },
      { id: "mod_noodle_pork", modifierGroupId: "mg_noodle_protein", name: "Braised Pork", priceCents: 350, isAvailable: true },
      { id: "mod_noodle_tofu", modifierGroupId: "mg_noodle_protein", name: "Tofu", priceCents: 250, isAvailable: true },
      { id: "mod_noodle_soft_egg", modifierGroupId: "mg_noodle_finish", name: "Soft Egg", priceCents: 150, isAvailable: false },
      { id: "mod_noodle_chili_oil", modifierGroupId: "mg_noodle_finish", name: "Chili Oil", priceCents: 50, isAvailable: true },
      { id: "mod_noodle_crispy_garlic", modifierGroupId: "mg_noodle_finish", name: "Crispy Garlic", priceCents: 100, isAvailable: true },
    ],
    menuItems: [
      {
        id: "item_noodle_garlic_chili",
        category: "Noodles",
        name: "Garlic Chili Noodles",
        description: "Savory noodles with chili crisp and scallion.",
        imageUrl: FOOD_IMAGE_URLS.itemNoodleGarlicChili,
        priceCents: 1599,
        posExternalId: "toast_item_noodle_garlic_chili",
        modifierGroupIds: ["mg_noodle_spice", "mg_noodle_protein", "mg_noodle_finish"],
      },
      {
        id: "item_noodle_miso_udon",
        category: "Noodles",
        name: "Miso Sesame Udon",
        description: "Silky udon in a nutty miso sesame sauce.",
        imageUrl: FOOD_IMAGE_URLS.itemNoodleMisoUdon,
        priceCents: 1699,
        posExternalId: "toast_item_noodle_miso_udon",
        modifierGroupIds: ["mg_noodle_spice", "mg_noodle_protein", "mg_noodle_finish"],
      },
      {
        id: "item_noodle_gyoza",
        category: "Small Plates",
        name: "Pork Gyoza",
        description: "Pan-seared dumplings with soy dipping sauce.",
        imageUrl: FOOD_IMAGE_URLS.itemNoodleGyoza,
        priceCents: 899,
        posExternalId: "toast_item_noodle_gyoza",
        modifierGroupIds: ["mg_noodle_finish"],
      },
    ],
  });

  const harborSandwichCo = createSimpleRestaurantSeed({
    restaurantId: "rest_harbor_sandwich_co",
    name: "Harbor Sandwich Co",
    locationLabel: "Murphy Avenue",
    address1: "251 N Murphy Ave",
    city: "Sunnyvale",
    state: "CA",
    postalCode: "94085",
    latitude: 37.3791,
    longitude: -122.0306,
    contactEmail: "ops@harborsandwich.example",
    contactPhone: "(408) 555-4412",
    imageUrl: FOOD_IMAGE_URLS.restHarborSandwichCo,
    cuisineType: "Sandwiches",
    description: "Stacked sandwiches, warm soups, and polished lunch-friendly extras for office ordering.",
    rating: 4.6,
    deliveryFee: 199,
    minimumOrder: 1400,
    supportsCatering: true,
    maxOrderDollarAmount: 260,
    modifierGroups: [
      { id: "mg_harbor_bread", name: "Bread Choice", selectionType: "single", required: true, minSelections: 1, maxSelections: 1 },
      { id: "mg_harbor_side", name: "Side Choice", selectionType: "single", required: false, minSelections: 0, maxSelections: 1 },
      { id: "mg_harbor_extras", name: "Add Ons", selectionType: "multi", required: false, minSelections: 0, maxSelections: 3 },
    ],
    modifiers: [
      { id: "mod_harbor_sesame", modifierGroupId: "mg_harbor_bread", name: "Sesame Roll", priceCents: 0, isAvailable: true },
      { id: "mod_harbor_wheat", modifierGroupId: "mg_harbor_bread", name: "Wheat", priceCents: 0, isAvailable: true },
      { id: "mod_harbor_sourdough", modifierGroupId: "mg_harbor_bread", name: "Sourdough", priceCents: 0, isAvailable: false },
      { id: "mod_harbor_chips", modifierGroupId: "mg_harbor_side", name: "Kettle Chips", priceCents: 0, isAvailable: true },
      { id: "mod_harbor_salad", modifierGroupId: "mg_harbor_side", name: "Little Gem Salad", priceCents: 250, isAvailable: true },
      { id: "mod_harbor_soup", modifierGroupId: "mg_harbor_side", name: "Tomato Soup Cup", priceCents: 300, isAvailable: true },
      { id: "mod_harbor_avocado", modifierGroupId: "mg_harbor_extras", name: "Avocado", priceCents: 200, isAvailable: true },
      { id: "mod_harbor_pickles", modifierGroupId: "mg_harbor_extras", name: "Pickles", priceCents: 75, isAvailable: true },
      { id: "mod_harbor_bacon", modifierGroupId: "mg_harbor_extras", name: "Applewood Bacon", priceCents: 250, isAvailable: true },
    ],
    menuItems: [
      {
        id: "item_harbor_turkey_club",
        category: "Sandwiches",
        name: "Turkey Avocado Club",
        description: "Roasted turkey, avocado, tomato, and bacon aioli.",
        imageUrl: FOOD_IMAGE_URLS.itemHarborTurkeyClub,
        priceCents: 1599,
        posExternalId: "toast_item_harbor_turkey_club",
        modifierGroupIds: ["mg_harbor_bread", "mg_harbor_side", "mg_harbor_extras"],
      },
      {
        id: "item_harbor_pastrami_melt",
        category: "Sandwiches",
        name: "Hot Pastrami Melt",
        description: "Warm pastrami, Swiss, mustard, and caramelized onion.",
        imageUrl: FOOD_IMAGE_URLS.itemHarborPastramiMelt,
        priceCents: 1699,
        posExternalId: "toast_item_harbor_pastrami_melt",
        modifierGroupIds: ["mg_harbor_bread", "mg_harbor_side", "mg_harbor_extras"],
      },
      {
        id: "item_harbor_tomato_soup",
        category: "Soups",
        name: "Tomato Soup Cup",
        description: "Slow-simmered tomato soup with basil oil.",
        imageUrl: FOOD_IMAGE_URLS.itemHarborTomatoSoup,
        priceCents: 699,
        posExternalId: "toast_item_harbor_tomato_soup",
        modifierGroupIds: ["mg_harbor_extras"],
      },
    ],
  });

  return {
    restaurants: [
      restaurant,
      pizzaPalace.restaurant,
      greenLeafSalads.restaurant,
      sakuraSushiHouse.restaurant,
      sunriseTaqueria.restaurant,
      midnightNoodleBar.restaurant,
      harborSandwichCo.restaurant,
    ],
    locations: [
      location,
      pizzaPalace.location,
      greenLeafSalads.location,
      sakuraSushiHouse.location,
      sunriseTaqueria.location,
      midnightNoodleBar.location,
      harborSandwichCo.location,
    ],
    posConnections: [
      posConnection,
      pizzaPalace.posConnection,
      greenLeafSalads.posConnection,
      sakuraSushiHouse.posConnection,
      sunriseTaqueria.posConnection,
      midnightNoodleBar.posConnection,
      harborSandwichCo.posConnection,
    ],
    menuItems: [
      ...menuItems,
      ...pizzaPalace.menuItems,
      ...greenLeafSalads.menuItems,
      ...sakuraSushiHouse.menuItems,
      ...sunriseTaqueria.menuItems,
      ...midnightNoodleBar.menuItems,
      ...harborSandwichCo.menuItems,
    ],
    modifierGroups: [
      ...modifierGroups,
      ...pizzaPalace.modifierGroups,
      ...greenLeafSalads.modifierGroups,
      ...sakuraSushiHouse.modifierGroups,
      ...sunriseTaqueria.modifierGroups,
      ...midnightNoodleBar.modifierGroups,
      ...harborSandwichCo.modifierGroups,
    ],
    modifiers: [
      ...modifiers,
      ...pizzaPalace.modifiers,
      ...greenLeafSalads.modifiers,
      ...sakuraSushiHouse.modifiers,
      ...sunriseTaqueria.modifiers,
      ...midnightNoodleBar.modifiers,
      ...harborSandwichCo.modifiers,
    ],
    posMappings: [
      ...posMappings,
      ...pizzaPalace.posMappings,
      ...greenLeafSalads.posMappings,
      ...sakuraSushiHouse.posMappings,
      ...sunriseTaqueria.posMappings,
      ...midnightNoodleBar.posMappings,
      ...harborSandwichCo.posMappings,
    ],
    agents: [phantomAgent, coachImHungryAgent],
    agentApiKeys: [agentApiKey],
    operatorUsers: [operatorUser],
    operatorMemberships: [
      operatorMembership,
      pizzaPalace.membership,
      greenLeafSalads.membership,
      sakuraSushiHouse.membership,
      sunriseTaqueria.membership,
      midnightNoodleBar.membership,
      harborSandwichCo.membership,
    ],
    operatorSessions: [],
    permissions: [
      permission,
      coachPermission,
      pizzaPalace.permission,
      pizzaPalace.coachPermission,
      greenLeafSalads.permission,
      greenLeafSalads.coachPermission,
      sakuraSushiHouse.permission,
      sakuraSushiHouse.coachPermission,
      sunriseTaqueria.permission,
      sunriseTaqueria.coachPermission,
      midnightNoodleBar.permission,
      midnightNoodleBar.coachPermission,
      harborSandwichCo.permission,
      harborSandwichCo.coachPermission,
    ],
    orderingRules: [
      orderingRule,
      pizzaPalace.orderingRule,
      greenLeafSalads.orderingRule,
      sakuraSushiHouse.orderingRule,
      sunriseTaqueria.orderingRule,
      midnightNoodleBar.orderingRule,
      harborSandwichCo.orderingRule,
    ],
    orders: [order],
    orderItems,
    orderModifiers,
    validationResults: [],
    quotes: [],
    posSubmissions: [],
    statusEvents,
    reportingMetrics,
    auditLogs: [
      ...auditLogs,
      pizzaPalace.auditLog,
      greenLeafSalads.auditLog,
      sakuraSushiHouse.auditLog,
      sunriseTaqueria.auditLog,
      midnightNoodleBar.auditLog,
      harborSandwichCo.auditLog,
    ],
    idempotencyRecords: [],
    retryAttempts: [],
    ingestedEvents: [],
  };
}
