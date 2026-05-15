import { describe, expect, it } from "vitest";
import { DeliverectAdapterMock } from "../src/server/pos/deliverectMock";
import { ToastAdapterMock } from "../src/server/pos/toastMock";
import type {
  CanonicalMenuItem,
  CanonicalModifier,
  CanonicalModifierGroup,
  CanonicalOrderIntent,
  POSConnection,
  POSContext,
  Restaurant,
  RestaurantLocation,
} from "../src/shared/types";

const restaurant: Restaurant = {
  id: "rest_test",
  name: "Test Restaurant",
  location: "123 Main St",
  timezone: "America/Los_Angeles",
  posProvider: "toast",
  agentOrderingEnabled: true,
  defaultApprovalMode: "threshold_review",
  contactEmail: "ops@test.com",
  contactPhone: "555-555-5555",
  fulfillmentTypesSupported: ["pickup"],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const location: RestaurantLocation = {
  id: "loc_test",
  restaurantId: "rest_test",
  name: "Main",
  address1: "123 Main St",
  city: "Sunnyvale",
  state: "CA",
  postalCode: "94086",
};

const menuItems: CanonicalMenuItem[] = [
  {
    id: "item_test",
    restaurantId: "rest_test",
    category: "Entrees",
    name: "Test Bowl",
    description: "Test item",
    priceCents: 1200,
    availability: "available",
    mappingStatus: "mapped",
    modifierGroupIds: ["mg_test"],
    posRef: {
      provider: "toast",
      externalId: "toast_item_test",
    },
  },
];

const modifierGroups: CanonicalModifierGroup[] = [
  {
    id: "mg_test",
    restaurantId: "rest_test",
    name: "Extras",
    selectionType: "multi",
    required: false,
    minSelections: 0,
    maxSelections: 2,
  },
];

const modifiers: CanonicalModifier[] = [
  {
    id: "mod_test",
    modifierGroupId: "mg_test",
    name: "Extra Sauce",
    priceCents: 200,
    isAvailable: true,
  },
];

const toastConnection: POSConnection = {
  id: "pos_toast_test",
  restaurantId: "rest_test",
  provider: "toast",
  status: "sandbox",
  mode: "mock",
  metadata: {},
};

const deliverectConnection: POSConnection = {
  id: "pos_deliverect_test",
  restaurantId: "rest_test",
  provider: "deliverect",
  status: "sandbox",
  mode: "mock",
  metadata: {},
};

function buildContext(connection: POSConnection): POSContext {
  return {
    restaurant,
    location,
    connection,
    menuItems,
    modifierGroups,
    modifiers,
  };
}

function buildOrder(tipCents: number): CanonicalOrderIntent {
  return {
    restaurant_id: "rest_test",
    agent_id: "agent_test",
    external_order_reference: `tip-order-${tipCents}`,
    customer: {
      name: "Taylor",
      email: "taylor@example.com",
    },
    fulfillment_type: "pickup",
    requested_fulfillment_time: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    headcount: 1,
    tip_cents: tipCents,
    payment_policy: "required_before_submit",
    items: [
      {
        item_id: "item_test",
        quantity: 1,
        modifiers: [
          {
            modifier_group_id: "mg_test",
            modifier_id: "mod_test",
            quantity: 1,
          },
        ],
      },
    ],
    dietary_constraints: [],
    substitution_policy: "strict",
    metadata: {},
  };
}

describe("POS mock adapters tip support", () => {
  it("includes tips in mock Toast quotes", async () => {
    const adapter = new ToastAdapterMock();
    const quote = await adapter.quoteOrder(buildOrder(500), buildContext(toastConnection));

    expect(quote.tipCents).toBe(500);
    expect(quote.totalCents).toBe(1200 + 200 + Math.round((1200 + 200) * 0.09) + Math.round((1200 + 200) * 0.03) + 500);
  });

  it("includes tips in mock Deliverect quotes", async () => {
    const adapter = new DeliverectAdapterMock();
    const quote = await adapter.quoteOrder(buildOrder(425), buildContext(deliverectConnection));

    expect(quote.tipCents).toBe(425);
    expect(quote.totalCents).toBe(1200 + 200 + Math.round((1200 + 200) * 0.09) + 425);
  });
});
