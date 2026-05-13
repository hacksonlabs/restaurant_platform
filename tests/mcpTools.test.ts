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

  it("returns the canonical menu for an allowed restaurant", async () => {
    const context = await createContext();

    const result = await getMenuTool(context, {
      restaurant_id: "rest_lb_steakhouse",
    });

    expect(result.items.length).toBeGreaterThan(0);
    expect(result.modifierGroups.length).toBeGreaterThan(0);
    expect(result.items[0]).toEqual(
      expect.objectContaining({
        imageUrl: expect.stringContaining("https://"),
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

  it("submits an order using the authenticated MCP agent identity", async () => {
    const context = await createContext();

    const result = await submitOrderTool(context, orderPayload("mcp-submit-1"));

    expect(result.agentId).toBe("agent_coachimhungry");
    expect(result.restaurantId).toBe("rest_lb_steakhouse");
    expect(result.status).toMatch(/needs_approval|approved/);
  });
});
