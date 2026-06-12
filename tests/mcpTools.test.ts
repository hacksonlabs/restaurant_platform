import { describe, expect, it } from "vitest";
import { InMemoryPlatformRepository } from "../src/server/repositories/platformRepository";
import { PlatformService } from "../src/server/services/platformService";
import {
  authenticateMcpAgent,
  getMenuTool,
  quoteOrderTool,
  searchRestaurantsTool,
  startPaymentTool,
  submitOrderTool,
  validateOrderTool,
} from "../src/server/mcp/tools";

function createContext() {
  const service = new PlatformService(new InMemoryPlatformRepository("coachimhungry_demo_live_local_key"));
  return authenticateMcpAgent(service, "coachimhungry_demo_live_local_key").then((agentKey) => ({
    service,
    agentKey,
  }));
}

function orderPayload(reference: string) {
  return {
      restaurant_id: "rest_lb_steakhouse",
      order: {
        restaurant_id: "rest_lb_steakhouse",
        agent_id: "agent_coachimhungry",
      external_order_reference: reference,
      customer: { name: "Morgan", email: "morgan@example.com" },
      fulfillment_type: "pickup" as const,
      requested_fulfillment_time: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
      headcount: 2,
      tip_cents: 0,
      payment_policy: "required_before_submit" as const,
      items: [{ item_id: "item_filet", quantity: 1, modifiers: [] }],
      dietary_constraints: [],
      substitution_policy: "strict" as const,
      metadata: {},
    },
  };
}

describe("Phantom MCP tools", () => {
  it("returns discoverable restaurants for the authenticated MCP agent", async () => {
    const context = await createContext();

    const result = await searchRestaurantsTool(context, {
      query: "steak",
      address: "1533 Ashcroft Way, Sunnyvale, CA 94087",
      latitude: 37.3509,
      longitude: -122.0378,
      radius_miles: 3,
      limit: 10,
    });

    expect(result.restaurants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "rest_lb_steakhouse",
          permissionStatus: "allowed",
          max_order_dollar_amount: 250,
          max_order_cents: 25000,
        }),
      ]),
    );
  });

  it("does not return broad restaurant discovery results without location context", async () => {
    const context = await createContext();

    const result = await searchRestaurantsTool(context, {
      query: "steak",
      fulfillment_type: "pickup",
      limit: 10,
    });

    expect(result.restaurants).toEqual([]);
  });

  it("filters discoverable restaurants by radius for pickup and delivery", async () => {
    const context = await createContext();

    const nearby = await searchRestaurantsTool(context, {
      fulfillment_type: "delivery",
      address: "1533 Ashcroft Way, Sunnyvale, CA 94087",
      latitude: 37.3509,
      longitude: -122.0378,
      radius_miles: 2,
      limit: 10,
    });

    expect(nearby.restaurants.map((restaurant) => restaurant.id)).toEqual(
      expect.arrayContaining([
        "rest_lb_steakhouse",
        "rest_pizza_palace",
        "rest_green_leaf_salads",
      ]),
    );
  });

  it("filters out mock providers while keeping non-mock restaurants that lack coordinates", async () => {
    const result = await searchRestaurantsTool(
      {
        agentKey: {
          id: "key_test",
          agentId: "agent_coachimhungry",
          label: "test",
          keyPrefix: "test",
          keyHash: "hash",
          scopes: ["restaurants:read"],
          createdAt: new Date().toISOString(),
        },
        service: {
          assertAgentScope: () => undefined,
          listAgentRestaurants: async () => [
            {
              id: "rest_lb_steakhouse",
              name: "LB Steakhouse",
              location: "1533 Ashcroft Way, Sunnyvale, CA 94087",
              latitude: 37.3509,
              longitude: -122.0378,
              posProvider: "mock",
              fulfillmentTypesSupported: ["pickup"],
            },
            {
              id: "rest_gdczn7pb",
              name: "MealOps - Test Location 1",
              location: "MealOps - Test Location 1",
              latitude: null,
              longitude: null,
              posProvider: "deliverect",
              fulfillmentTypesSupported: ["pickup"],
            },
          ],
        } as any,
      },
      {
        fulfillment_type: "pickup",
        exclude_pos_provider: "mock",
        address: "1533 Ashcroft Way, Sunnyvale, CA 94087",
        latitude: 37.3509,
        longitude: -122.0378,
        radius_miles: 6,
        limit: 10,
      },
    );

    expect(result.restaurants.map((restaurant) => restaurant.id)).toEqual(["rest_gdczn7pb"]);
    expect(result.restaurants[0]).toEqual(
      expect.objectContaining({
        posProvider: "deliverect",
        distanceMiles: null,
      }),
    );
  });

  it("does not give onboarding restaurants seeded coordinates just because they share a demo address", async () => {
    const result = await searchRestaurantsTool(
      {
        agentKey: {
          id: "key_test",
          agentId: "agent_coachimhungry",
          label: "test",
          keyPrefix: "test",
          keyHash: "hash",
          scopes: ["restaurants:read"],
          createdAt: new Date().toISOString(),
        },
        service: {
          assertAgentScope: () => undefined,
          listAgentRestaurants: async () => [
            {
              id: "rest_pizza_palace",
              name: "Pizza Palace",
              location: "1325 Sunnyvale Saratoga Rd, Sunnyvale, CA 94087",
              latitude: null,
              longitude: null,
              fulfillmentTypesSupported: ["delivery"],
            },
            {
              id: "rest_jlc3hzu8",
              name: "Pizza Palace - Sunnyvale",
              location: "1325 Sunnyvale Saratoga Rd, Sunnyvale, CA 94087",
              latitude: null,
              longitude: null,
              fulfillmentTypesSupported: ["delivery"],
            },
          ],
        } as any,
      },
      {
        fulfillment_type: "delivery",
        address: "1533 Ashcroft Way, Sunnyvale, CA 94087",
        latitude: 37.3509,
        longitude: -122.0378,
        radius_miles: 6,
        limit: 10,
      },
    );

    expect(result.restaurants.map((restaurant) => restaurant.id)).toEqual(["rest_pizza_palace"]);
  });

  it("returns the canonical menu for an allowed restaurant", async () => {
    const context = await createContext();

    const result = await getMenuTool(context, {
      restaurant_id: "rest_lb_steakhouse",
    });

    expect(result.items.length).toBeGreaterThan(0);
    expect(result.modifierGroups.length).toBeGreaterThan(0);
    expect(result.items[0]).toEqual(
      expect.objectContaining({
        imageUrl: expect.stringMatching(/^https?:\/\//),
      }),
    );
  });

  it("validates and quotes an order through the MCP handler layer", async () => {
    const context = await createContext();

    const validation = await validateOrderTool(context, orderPayload("mcp-validate-1"));
    const quote = await quoteOrderTool(context, orderPayload("mcp-quote-1"));

    expect(validation.valid).toBe(true);
    expect(quote.totalCents).toBeGreaterThan(0);
  });

  it("quotes oversized orders through MCP when only split-resolvable limits are exceeded", async () => {
    const context = await createContext();

    const quote = await quoteOrderTool(context, {
      restaurant_id: "rest_lb_steakhouse",
      order: {
        restaurant_id: "rest_lb_steakhouse",
        agent_id: "agent_coachimhungry",
        external_order_reference: "mcp-quote-oversized-1",
        customer: { name: "Morgan", email: "morgan@example.com" },
        fulfillment_type: "pickup",
        requested_fulfillment_time: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
        headcount: 6,
        payment_policy: "required_before_submit",
        items: [{ item_id: "item_filet", quantity: 6, modifiers: [] }],
        dietary_constraints: [],
        substitution_policy: "strict",
        metadata: {},
      },
    });

    expect(quote.totalCents).toBeGreaterThan(0);
  });

  it("starts a hosted payment session for the authenticated MCP agent", async () => {
    const context = await createContext();

    const result = await startPaymentTool(context, {
      ...orderPayload("mcp-pay-1"),
      success_url: "https://mealops.test/order/success?orderId=mealops-order-1",
      cancel_url: "https://mealops.test/shopping-cart-checkout?cartId=cart-1",
    });

    expect(result.ok).toBe(true);
    expect(result.status).toBe("redirect_required");
    expect(result.paymentReference).toBeTruthy();
    expect(result.redirectUrl).toContain("mealops.test/order/success");
  });

  it("passes tip amounts through MCP quote and payment flows", async () => {
    const context = await createContext();
    const tippedPayload = {
      restaurant_id: "rest_lb_steakhouse",
      order: {
        ...orderPayload("mcp-tip-1").order,
        tip_cents: 725,
      },
    };

    const quote = await quoteOrderTool(context, tippedPayload);
    const payment = await startPaymentTool(context, {
      ...tippedPayload,
      success_url: "https://mealops.test/order/success?orderId=mcp-tip-1",
      cancel_url: "https://mealops.test/shopping-cart-checkout?cartId=mcp-tip-1",
    });

    expect(quote.tipCents).toBe(725);
    expect(quote.totalCents).toBe(quote.subtotalCents + quote.taxCents + quote.feesCents + quote.tipCents);
    expect(payment.totalCents).toBe(quote.totalCents);
  });

  it("submits an order using the authenticated MCP agent identity", async () => {
    const context = await createContext();

    const result = await submitOrderTool(context, orderPayload("mcp-submit-1"));

    expect(result.agentId).toBe("agent_coachimhungry");
    expect(result.restaurantId).toBe("rest_lb_steakhouse");
    expect(result.status).toMatch(/needs_approval|approved|accepted/);
  });

  it("returns only schema-declared fields from submit_order, even with empty split metadata", async () => {
    const context = await createContext();
    const payload = orderPayload("mcp-submit-schema-1");
    payload.order.metadata = {
      source_platform: "mealops",
      split_group_id: "",
      split_group_index: null,
      split_group_size: null,
    } as Record<string, unknown>;

    const result = await submitOrderTool(context, payload);

    const allowedKeys = new Set([
      "id",
      "restaurantId",
      "agentId",
      "externalOrderReference",
      "customerName",
      "customerEmail",
      "teamName",
      "fulfillmentType",
      "requestedFulfillmentTime",
      "headcount",
      "status",
      "approvalRequired",
      "totalEstimateCents",
      "createdAt",
      "updatedAt",
      "notes",
      "packagingInstructions",
      "dietaryConstraints",
      "orderIntent",
    ]);
    const extraKeys = Object.keys(result).filter((key) => !allowedKeys.has(key));
    expect(extraKeys).toEqual([]);
  });
});
