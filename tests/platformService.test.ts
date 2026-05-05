import { describe, expect, it } from "vitest";
import { InMemoryPlatformRepository } from "../src/server/repositories/platformRepository";
import { PlatformService } from "../src/server/services/platformService";
import { ToastAdapterMock } from "../src/server/pos/toastMock";

function createService() {
  return new PlatformService(new InMemoryPlatformRepository("phantom_demo_live_local_key"));
}

describe("PlatformService", () => {
  it("validates a permitted order successfully", async () => {
    const service = createService();
    const result = await service.validateOrder({
      restaurant_id: "rest_lb_steakhouse",
      agent_id: "agent_phantom",
      external_order_reference: "test-validate-1",
      customer: { name: "Alex", email: "alex@example.com" },
      fulfillment_type: "pickup",
      requested_fulfillment_time: "2099-01-01T20:00:00.000Z",
      headcount: 4,
      payment_policy: "required_before_submit",
      items: [{ item_id: "item_ribeye", quantity: 1, modifiers: [] }],
      dietary_constraints: [],
      substitution_policy: "strict",
      metadata: {},
    });

    expect(result.valid).toBe(true);
  });

  it("blocks agents that are not allowed for the restaurant", async () => {
    const service = createService();

    await expect(
      service.validateOrder({
        restaurant_id: "rest_lb_steakhouse",
        agent_id: "agent_unknown",
        external_order_reference: "test-validate-2",
        customer: { name: "Alex", email: "alex@example.com" },
        fulfillment_type: "pickup",
        requested_fulfillment_time: "2099-01-01T20:00:00.000Z",
        headcount: 4,
        payment_policy: "required_before_submit",
        items: [{ item_id: "item_ribeye", quantity: 1, modifiers: [] }],
        dietary_constraints: [],
        substitution_policy: "strict",
        metadata: {},
      }),
    ).rejects.toThrow("Agent is not allowed for this restaurant.");
  });

  it("quotes menu items and modifiers through the Toast mock adapter", async () => {
    const service = createService();
    const [restaurant, location, connection, menu] = await Promise.all([
      service.getRestaurant("rest_lb_steakhouse"),
      (service as any).repository.getLocation("rest_lb_steakhouse"),
      service.getPOSConnection("rest_lb_steakhouse"),
      service.getMenu("rest_lb_steakhouse"),
    ]);
    const adapter = new ToastAdapterMock();
    const context = {
      restaurant,
      location,
      connection,
      menuItems: menu.items,
      modifierGroups: menu.modifierGroups,
      modifiers: menu.modifiers,
    };

    const quote = await adapter.quoteOrder(
      {
        restaurant_id: "rest_lb_steakhouse",
        agent_id: "agent_phantom",
        external_order_reference: "quote-test",
        customer: { name: "Alex" },
        fulfillment_type: "pickup",
        requested_fulfillment_time: "2099-01-01T20:00:00.000Z",
        headcount: 2,
        payment_policy: "required_before_submit",
        items: [
          {
            item_id: "item_filet",
            quantity: 2,
            modifiers: [
              { modifier_group_id: "mg_addons", modifier_id: "mod_sauce", quantity: 2 },
            ],
          },
        ],
        dietary_constraints: [],
        substitution_policy: "strict",
        metadata: {},
      },
      context,
    );

    expect(quote.totalCents).toBeGreaterThan(0);
    expect(quote.subtotalCents).toBe(10300);
  });

  it("creates an order with persisted lifecycle records", async () => {
    const service = createService();

    const order = await service.submitAgentOrder({
      restaurant_id: "rest_lb_steakhouse",
      agent_id: "agent_phantom",
      external_order_reference: "test-submit-1",
      customer: { name: "Alex", email: "alex@example.com" },
      fulfillment_type: "pickup",
      requested_fulfillment_time: "2099-01-01T20:00:00.000Z",
      headcount: 4,
      payment_policy: "required_before_submit",
      items: [{ item_id: "item_ribeye", quantity: 1, modifiers: [] }],
      dietary_constraints: [],
      substitution_policy: "strict",
      metadata: {},
    });

    const detail = await service.getOrder("rest_lb_steakhouse", order.id);

    expect(detail.order.externalOrderReference).toBe("test-submit-1");
    expect(detail.items).toHaveLength(1);
    expect(detail.validationResults).toHaveLength(1);
    expect(detail.quotes).toHaveLength(1);
    expect(detail.statusEvents.map((event) => event.status)).toContain("received");
  });

  it("persists POS submission status for the order lifecycle", async () => {
    const service = createService();

    const order = await service.submitAgentOrder({
      restaurant_id: "rest_lb_steakhouse",
      agent_id: "agent_phantom",
      external_order_reference: "test-submit-2",
      customer: { name: "Jordan" },
      fulfillment_type: "pickup",
      requested_fulfillment_time: "2099-01-01T20:00:00.000Z",
      headcount: 2,
      payment_policy: "required_before_submit",
      items: [{ item_id: "item_filet", quantity: 1, modifiers: [] }],
      dietary_constraints: [],
      substitution_policy: "strict",
      metadata: {},
    });

    await service.approveOrder("rest_lb_steakhouse", order.id);
    await service.submitOrderToPOS("rest_lb_steakhouse", order.id);
    const status = await service.getAgentOrderStatus(order.id);
    const detail = await service.getOrder("rest_lb_steakhouse", order.id);

    expect(status.externalOrderId).toContain("toast_mock_");
    expect(detail.submissions).toHaveLength(1);
    expect(detail.statusEvents[0]?.status).toMatch(/accepted|submitted_to_pos/);
  });

  it("blocks POS submission until an approval-required order is approved", async () => {
    const service = createService();

    const order = await service.submitAgentOrder({
      restaurant_id: "rest_lb_steakhouse",
      agent_id: "agent_phantom",
      external_order_reference: "test-submit-approval",
      customer: { name: "Taylor" },
      fulfillment_type: "pickup",
      requested_fulfillment_time: "2099-01-01T20:00:00.000Z",
      headcount: 2,
      payment_policy: "required_before_submit",
      items: [{ item_id: "item_filet", quantity: 1, modifiers: [] }],
      dietary_constraints: [],
      substitution_policy: "strict",
      approval_requirements: { manager_approval_required: true },
      metadata: {},
    });

    await expect(service.submitOrderToPOS("rest_lb_steakhouse", order.id)).rejects.toThrow(
      "Order must be approved before live POS submission.",
    );
  });

  it("updates reporting after persisted orders are created", async () => {
    const service = createService();

    await service.submitAgentOrder({
      restaurant_id: "rest_lb_steakhouse",
      agent_id: "agent_phantom",
      external_order_reference: "test-reporting-1",
      customer: { name: "Morgan" },
      fulfillment_type: "pickup",
      requested_fulfillment_time: "2099-01-01T20:00:00.000Z",
      headcount: 3,
      payment_policy: "required_before_submit",
      items: [{ item_id: "item_ribeye", quantity: 2, modifiers: [] }],
      dietary_constraints: [],
      substitution_policy: "strict",
      metadata: {},
    });

    const reporting = await service.getReporting("rest_lb_steakhouse");

    expect(reporting.metrics.length).toBeGreaterThan(0);
    expect(reporting.topItems.some((item) => item.name.includes("Prime Ribeye"))).toBe(true);
  });
});
