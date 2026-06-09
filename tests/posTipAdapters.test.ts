import { afterEach, describe, expect, it, vi } from "vitest";
import { DeliverectAdapterMock } from "../src/server/pos/deliverectMock";
import { DeliverectAdapterLive } from "../src/server/pos/deliverectLive";
import { ToastAdapterMock } from "../src/server/pos/toastMock";
import type { AppEnv } from "../src/server/config/env";
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

const deliverectLiveConnection: POSConnection = {
  ...deliverectConnection,
  mode: "live",
  metadata: {
    deliverectAccountId: "acct_test",
    deliverectStoreId: "store_test",
    deliverectChannelLinkId: "channel_link_test",
  },
};

function buildContext(connection: POSConnection): POSContext {
  return {
    restaurant,
    location,
    connection,
    menuItems,
    modifierGroups,
    modifiers,
    menuMappings: [
      {
        id: "map_item_test",
        restaurantId: "rest_test",
        canonicalType: "item",
        canonicalId: "item_test",
        provider: "deliverect",
        providerReference: "DELIVERECT_ITEM_TEST",
        status: "mapped",
      },
      {
        id: "map_modifier_test",
        restaurantId: "rest_test",
        canonicalType: "modifier",
        canonicalId: "mod_test",
        provider: "deliverect",
        providerReference: "DELIVERECT_MOD_TEST",
        status: "mapped",
      },
    ],
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
  afterEach(() => {
    vi.restoreAllMocks();
  });

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

  it("requests Deliverect sandbox tokens with the documented field names", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/oauth/token")) {
        return new Response(
          JSON.stringify({
            access_token: "deliverect-token",
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            token_type: "Bearer",
            scope: "mealops",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      return new Response(JSON.stringify({ id: "store_test" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const env = {
      deliverectBaseUrl: "https://api.staging.deliverect.com",
      deliverectAudience: "https://api.staging.deliverect.com",
      deliverectGrantType: "token",
      deliverectScope: "mealops",
      deliverectClientId: "client-id",
      deliverectClientSecret: "client-secret",
      deliverectAccessToken: "",
      deliverectAccountId: "",
      deliverectStoreId: "",
      deliverectChannelLinkId: "",
    } as AppEnv;
    const adapter = new DeliverectAdapterLive(env);

    const diagnostics = await adapter.diagnose(deliverectLiveConnection, buildContext(deliverectLiveConnection));

    expect(diagnostics.checks.find((check) => check.key === "auth")?.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.staging.deliverect.com/oauth/token",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          client_id: "client-id",
          client_secret: "client-secret",
          audience: "https://api.staging.deliverect.com",
          grant_type: "token",
          scope: "mealops",
        }),
      }),
    );
  });

  it("validates Deliverect Channel API order readiness without remote validation calls", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.endsWith("/oauth/token")) {
          return new Response(JSON.stringify({ access_token: "deliverect-token", expires_in: 3600 }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ message: `unexpected request ${String(url)} ${init?.method ?? "GET"}` }), { status: 500 });
      }),
    );

    const adapter = new DeliverectAdapterLive({
      deliverectBaseUrl: "https://api.staging.deliverect.com",
      deliverectClientId: "client-id",
      deliverectClientSecret: "client-secret",
    } as AppEnv);

    const result = await adapter.validateOrder(buildOrder(0), buildContext(deliverectLiveConnection));

    expect(result.valid).toBe(true);
  });

  it("submits Deliverect orders with the documented Channel API endpoint and payload", async () => {
    let channelOrderBody: any;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.endsWith("/mealops/order/channel_link_test")) {
          channelOrderBody = JSON.parse(String(init?.body ?? "{}"));
          return new Response(JSON.stringify({ orderId: "deliverect_channel_order_test" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ message: "unexpected request" }), { status: 500 });
      }),
    );

    const adapter = new DeliverectAdapterLive({
      deliverectBaseUrl: "https://api.staging.deliverect.com",
      deliverectAccessToken: "deliverect-token",
      deliverectScope: "mealops",
    } as AppEnv);
    const order = buildOrder(0);

    const result = await adapter.submitOrder(
      order,
      { ok: true, subtotalCents: 1400, taxCents: 126, feesCents: 0, tipCents: 0, totalCents: 1526 },
      buildContext(deliverectLiveConnection),
    );

    expect(result.ok).toBe(true);
    expect(channelOrderBody).toMatchObject({
      channelOrderId: order.external_order_reference,
      channelOrderDisplayId: order.external_order_reference,
      channelLinkId: "channel_link_test",
      orderType: 1,
      orderIsAlreadyPaid: true,
      decimalDigits: 2,
      payment: {
        amount: 1526,
        type: 0,
        due: 0,
      },
      customer: {
        name: "Taylor",
        email: "taylor@example.com",
      },
      items: [
        {
          plu: "DELIVERECT_ITEM_TEST",
          name: "Test Bowl",
          price: 1200,
          quantity: 1,
          subItems: [
            {
              plu: "DELIVERECT_MOD_TEST",
              name: "Extra Sauce",
              price: 200,
              quantity: 1,
            },
          ],
        },
      ],
    });
  });
});
