import express from "express";
import { createHash } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { createApiRouter } from "../src/server/api/router";
import { InMemoryPlatformRepository } from "../src/server/repositories/platformRepository";
import { PlatformService } from "../src/server/services/platformService";
import type { OperatorIdentity } from "../src/server/auth/supabaseAuth";
import type { AuthenticatedOperator, CanonicalOrderIntent } from "../src/shared/types";

function createService() {
  return new PlatformService(new InMemoryPlatformRepository("coachimhungry_demo_live_local_key"));
}

function createAuthBackedService(authProvider: {
  isEnabled(): boolean;
  signInWithPassword(email: string, password: string): Promise<OperatorIdentity>;
  getUserById(userId: string): Promise<OperatorIdentity | null>;
}) {
  return new PlatformService(new InMemoryPlatformRepository("coachimhungry_demo_live_local_key"), undefined, authProvider);
}

function futureIso(hoursFromNow = 24) {
  return new Date(Date.now() + hoursFromNow * 60 * 60 * 1000).toISOString();
}

async function submitSampleOrder(service: PlatformService, reference: string) {
  return service.submitAgentOrder({
    restaurant_id: "rest_lb_steakhouse",
    agent_id: "agent_coachimhungry",
    external_order_reference: reference,
    customer: { name: "Alex", email: "alex@example.com" },
    fulfillment_type: "pickup",
    requested_fulfillment_time: futureIso(48),
    headcount: 4,
    payment_policy: "required_before_submit",
    items: [{ item_id: "item_ribeye", quantity: 1, modifiers: [] }],
    dietary_constraints: [],
    substitution_policy: "strict",
    metadata: {},
  });
}

async function startServer(service: PlatformService) {
  const app = express();
  app.use(express.json());
  app.use("/api", createApiRouter(service));
  const server = await new Promise<import("node:http").Server>((resolve) => {
    const running = app.listen(0, () => resolve(running));
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to start test server.");
  }
  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`,
  };
}

async function loginOperator(baseUrl: string, email = "dev@rest.com", password = "password") {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  return {
    response,
    cookie: response.headers.get("set-cookie") ?? "",
  };
}

function agentOrder(reference: string): CanonicalOrderIntent {
  return {
    restaurant_id: "rest_lb_steakhouse",
    agent_id: "agent_coachimhungry",
    external_order_reference: reference,
    customer: { name: "Jordan", email: "jordan@example.com" },
    fulfillment_type: "pickup",
    requested_fulfillment_time: futureIso(48),
    headcount: 2,
    tip_cents: 0,
    payment_policy: "required_before_submit",
    items: [{ item_id: "item_filet", quantity: 1, modifiers: [] }],
    dietary_constraints: [],
    substitution_policy: "strict",
    metadata: {},
  };
}

function authenticatedOperator(role: AuthenticatedOperator["selectedMembership"]["role"]): AuthenticatedOperator {
  return {
    user: {
      id: "op_test",
      email: "ops@test.com",
      fullName: "Ops Test",
      createdAt: new Date().toISOString(),
    },
    memberships: [
      {
        id: "membership_test",
        operatorUserId: "op_test",
        restaurantId: "rest_lb_steakhouse",
        role,
        createdAt: new Date().toISOString(),
      },
    ],
    selectedMembership: {
      id: "membership_test",
      operatorUserId: "op_test",
      restaurantId: "rest_lb_steakhouse",
      role,
      createdAt: new Date().toISOString(),
    },
  };
}

const openServers: import("node:http").Server[] = [];

afterEach(async () => {
  await Promise.all(
    openServers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        }),
    ),
  );
});

describe("PlatformService", () => {
  it("validates a permitted order successfully", async () => {
    const service = createService();
    const result = await service.validateOrder(agentOrder("test-validate-1"));
    expect(result.valid).toBe(true);
  });

  it("surfaces Phantom-owned restaurant order limits and menu item images", async () => {
    const service = createService();
    const restaurants = await service.listAgentRestaurants("agent_coachimhungry");
    const steakhouse = restaurants.find((restaurant) => restaurant.id === "rest_lb_steakhouse");
    const menu = await service.getMenu("rest_lb_steakhouse");

    expect(steakhouse).toEqual(
      expect.objectContaining({
        max_order_dollar_amount: 250,
        max_order_cents: 25000,
      }),
    );
    expect(menu.items[0]).toEqual(
      expect.objectContaining({
        imageUrl: expect.stringMatching(/^https?:\/\//),
      }),
    );
  });

  it("blocks agents that are not allowed for the restaurant", async () => {
    const service = createService();

    await expect(
      service.validateOrder({
        ...agentOrder("test-validate-2"),
        agent_id: "agent_unknown",
      }),
    ).rejects.toThrow("Agent is not allowed for this restaurant.");
  });

  it("creates an order with persisted lifecycle records", async () => {
    const service = createService();
    const order = await service.submitAgentOrder(agentOrder("test-submit-1"));
    const detail = await service.getOrder("rest_lb_steakhouse", order.id);

    expect(detail.order.externalOrderReference).toBe("test-submit-1");
    expect(detail.items).toHaveLength(1);
    expect(detail.validationResults).toHaveLength(1);
    expect(detail.quotes).toHaveLength(1);
    expect(detail.statusEvents.map((event) => event.status)).toContain("received");
  });

  it("includes tip amounts in quotes, payment sessions, and submitted order totals", async () => {
    const service = createService();
    const tippedOrder = {
      ...agentOrder("test-tip-flow-1"),
      tip_cents: 650,
    };

    const quote = await service.quoteOrder(tippedOrder);
    const payment = await service.startPaymentSession(tippedOrder, {
      successUrl: "https://mealops.test/order/success?orderId=test-tip-flow-1",
      cancelUrl: "https://mealops.test/order/cancel?orderId=test-tip-flow-1",
    });
    const order = await service.submitAgentOrder(tippedOrder);
    const detail = await service.getOrder("rest_lb_steakhouse", order.id);

    expect(quote.tipCents).toBe(650);
    expect(quote.totalCents).toBe(quote.subtotalCents + quote.taxCents + quote.feesCents + quote.tipCents);
    expect(payment.totalCents).toBe(quote.totalCents);
    expect(order.totalEstimateCents).toBe(quote.totalCents);
    expect(detail.quotes[0]?.tipCents).toBe(650);
  });

  it("prefers the upstream source quote total for operator-facing order totals", async () => {
    const service = createService();
    const order = await service.submitAgentOrder({
      ...agentOrder("test-submit-source-total"),
      metadata: { source_quote_total_cents: 12100 },
    });
    const detail = await service.getOrder("rest_lb_steakhouse", order.id);

    expect(order.totalEstimateCents).toBe(12100);
    expect(detail.order.totalEstimateCents).toBe(12100);
    expect(detail.quotes[0]?.totalCents).toBeGreaterThan(0);
  });

  it("skips manager approval when auto accept is enabled", async () => {
    const service = createService();
    await service.updateRules("rest_lb_steakhouse", {
      autoAcceptEnabled: true,
      managerApprovalThresholdCents: 1,
    });

    const order = await service.submitAgentOrder(agentOrder("auto-accept-enabled"));
    const detail = await service.getOrder("rest_lb_steakhouse", order.id);

    expect(order.status).toBe("accepted");
    expect(detail.order.status).toBe("accepted");
    expect(detail.order.approvalRequired).toBe(false);
    expect(detail.statusEvents.at(-1)?.status).toBe("accepted");
  });

  it("persists POS submission status for the order lifecycle", async () => {
    const service = createService();
    await service.updateRules("rest_lb_steakhouse", { autoAcceptEnabled: false });
    const order = await service.submitAgentOrder(agentOrder("test-submit-2"));

    await service.approveOrder("rest_lb_steakhouse", order.id);
    const status = await service.getAgentOrderStatus(order.id);
    const detail = await service.getOrder("rest_lb_steakhouse", order.id);

    expect(status.externalOrderId).toContain("toast_mock_");
    expect(detail.submissions).toHaveLength(1);
    expect(detail.statusEvents[0]?.status).toMatch(/accepted|submitted_to_pos/);
  });

  it("groups split child orders into one queue entry and approves them together", async () => {
    const service = createService();
    await service.updateRules("rest_lb_steakhouse", { autoAcceptEnabled: false });
    const first = await service.submitAgentOrder({
      ...agentOrder("split-child-1"),
      headcount: 2,
      metadata: {
        split_group_id: "split-parent-1",
        split_group_index: 1,
        split_group_size: 2,
      },
    });
    const second = await service.submitAgentOrder({
      ...agentOrder("split-child-2"),
      headcount: 3,
      metadata: {
        split_group_id: "split-parent-1",
        split_group_index: 2,
        split_group_size: 2,
      },
    });

    const queue = await service.listOrders("rest_lb_steakhouse");
    const grouped = queue.find((entry) => entry.splitGroupId === "split-parent-1");

    expect(grouped).toBeTruthy();
    expect(grouped?.splitGroupSize).toBe(2);
    expect(grouped?.groupedOrderIds).toEqual([first.id, second.id]);
    expect(grouped?.totalEstimateCents).toBe(first.totalEstimateCents + second.totalEstimateCents);
    expect(grouped?.headcount).toBe(5);

    await service.approveOrder("rest_lb_steakhouse", first.id);

    const firstDetail = await service.getOrder("rest_lb_steakhouse", first.id);
    const secondDetail = await service.getOrder("rest_lb_steakhouse", second.id);
    expect(firstDetail.order.status).toMatch(/accepted|submitted_to_pos/);
    expect(secondDetail.order.status).toMatch(/accepted|submitted_to_pos/);
  });

  it("expands grouped split order detail across all child orders", async () => {
    const service = createService();
    const children = await Promise.all(
      [1, 2, 3].map((index) =>
        service.submitAgentOrder({
          ...agentOrder(`split-detail-${index}`),
          headcount: index,
          items: [{ item_id: index === 3 ? "item_ribeye" : "item_filet", quantity: index, modifiers: [] }],
          metadata: {
            split_group_id: "split-parent-detail",
            split_group_index: index,
            split_group_size: 3,
          },
        }),
      ),
    );

    const detail = await service.getOrder("rest_lb_steakhouse", children[1].id);

    expect(detail.order.splitGroupSize).toBe(3);
    expect(detail.order.groupedOrderIds).toEqual(children.map((child) => child.id));
    expect(detail.groupedOrders?.map((order) => order.id)).toEqual(children.map((child) => child.id));
    expect(detail.items).toHaveLength(3);
    expect(detail.items.map((item) => item.orderId)).toEqual(children.map((child) => child.id));
    expect(detail.timeline?.every((event) => event.message.includes("Suborder"))).toBe(true);
  });

  it("locks the manager decision once an order is approved", async () => {
    const service = createService();
    await service.updateRules("rest_lb_steakhouse", { autoAcceptEnabled: false });
    const order = await service.submitAgentOrder(agentOrder("decision-lock-approve"));

    await service.approveOrder("rest_lb_steakhouse", order.id);

    await expect(service.rejectOrder("rest_lb_steakhouse", order.id)).rejects.toThrow(
      "Order decision is final and cannot be changed.",
    );
  });

  it("locks the manager decision once an order is rejected", async () => {
    const service = createService();
    await service.updateRules("rest_lb_steakhouse", { autoAcceptEnabled: false });
    const order = await service.submitAgentOrder(agentOrder("decision-lock-reject"));

    await service.rejectOrder("rest_lb_steakhouse", order.id);

    await expect(service.approveOrder("rest_lb_steakhouse", order.id)).rejects.toThrow(
      "Order decision is final and cannot be changed.",
    );
  });

  it("blocks POS submission until an approval-required order is approved", async () => {
    const service = createService();

    const order = await service.submitAgentOrder({
      ...agentOrder("test-submit-approval"),
      approval_requirements: { manager_approval_required: true },
    });

    await expect(service.submitOrderToPOS("rest_lb_steakhouse", order.id)).rejects.toThrow(
      "Order must be approved before live POS submission.",
    );
  });

  it("updates reporting after persisted orders are created", async () => {
    const service = createService();

    await service.submitAgentOrder({
      ...agentOrder("test-reporting-1"),
      items: [{ item_id: "item_ribeye", quantity: 2, modifiers: [] }],
      headcount: 3,
    });

    const reporting = await service.getReporting("rest_lb_steakhouse");

    expect(reporting.metrics.length).toBeGreaterThan(0);
    expect(reporting.topItems.some((item) => item.name.includes("Prime Ribeye"))).toBe(true);
  });

  it("aligns dashboard weekly totals to the current week window", async () => {
    const previousDemoNow = process.env.VITE_DEMO_NOW;
    process.env.VITE_DEMO_NOW = "2026-10-17T18:00:00.000Z";
    try {
      const service = createService();
      const repository = (service as any).repository as InMemoryPlatformRepository;
      const firstWeekOrder = await service.submitAgentOrder({
        ...agentOrder("dashboard-week-1"),
        approval_requirements: { manager_approval_required: false },
        requested_fulfillment_time: "2026-10-18T18:00:00.000Z",
      });
      const secondWeekOrder = await service.submitAgentOrder({
        ...agentOrder("dashboard-week-2"),
        approval_requirements: { manager_approval_required: false },
        requested_fulfillment_time: "2026-10-17T20:00:00.000Z",
      });
      const olderOrder = await service.submitAgentOrder({
        ...agentOrder("dashboard-week-old"),
        approval_requirements: { manager_approval_required: false },
        requested_fulfillment_time: "2026-10-19T18:00:00.000Z",
      });

      await repository.updateOrder(firstWeekOrder.id, { createdAt: "2026-10-17T12:00:00.000Z" });
      await repository.updateOrder(secondWeekOrder.id, { createdAt: "2026-10-14T09:00:00.000Z" });
      await repository.updateOrder(olderOrder.id, {
        createdAt: "2026-10-10T18:00:00.000Z",
        requestedFulfillmentTime: "2026-10-11T18:00:00.000Z",
      });

      const dashboard = await service.getDashboard("rest_lb_steakhouse");

      expect(dashboard.ordersThisWeek).toBe(2);
      expect(dashboard.revenueFromAgentOrdersCents).toBe(
        firstWeekOrder.totalEstimateCents + secondWeekOrder.totalEstimateCents,
      );
    } finally {
      if (previousDemoNow === undefined) {
        delete process.env.VITE_DEMO_NOW;
      } else {
        process.env.VITE_DEMO_NOW = previousDemoNow;
      }
    }
  });

  it("filters reporting by fulfillment date instead of creation date", async () => {
    const previousDemoNow = process.env.VITE_DEMO_NOW;
    process.env.VITE_DEMO_NOW = "2026-10-17T18:00:00.000Z";
    try {
      const service = createService();
      const repository = (service as any).repository as InMemoryPlatformRepository;
      const order = await service.submitAgentOrder({
        ...agentOrder("reporting-fulfillment-date"),
        approval_requirements: { manager_approval_required: false },
        requested_fulfillment_time: "2026-10-18T18:00:00.000Z",
        items: [{ item_id: "item_ribeye", quantity: 2, modifiers: [] }],
      });

      await repository.updateOrder(order.id, { createdAt: "2026-10-10T12:00:00.000Z" });
      await repository.refreshReportingMetrics("rest_lb_steakhouse");

      const reporting = await service.getReporting("rest_lb_steakhouse", {
        startDate: "2026-10-12",
        endDate: "2026-10-19",
      });

      expect(reporting.metrics.some((metric) => metric.date.startsWith("2026-10-18"))).toBe(true);
      expect(reporting.topItems.some((item) => item.name.includes("Prime Ribeye"))).toBe(true);
    } finally {
      if (previousDemoNow === undefined) {
        delete process.env.VITE_DEMO_NOW;
      } else {
        process.env.VITE_DEMO_NOW = previousDemoNow;
      }
    }
  });

  it("only shows active incoming orders and sorts them by requested time", async () => {
    const service = createService();
    const repository = (service as any).repository as InMemoryPlatformRepository;
    for (const existingOrder of repository.state.orders.filter((order) => order.restaurantId === "rest_lb_steakhouse")) {
      await repository.updateOrder(existingOrder.id, { status: "completed" });
    }

    const lateOrder = await service.submitAgentOrder({
      ...agentOrder("queue-late"),
      requested_fulfillment_time: futureIso(72),
    });
    const earlyOrder = await service.submitAgentOrder({
      ...agentOrder("queue-early"),
      requested_fulfillment_time: futureIso(24),
    });
    const stalePastOrder = await service.submitAgentOrder({
      ...agentOrder("queue-stale-past"),
      requested_fulfillment_time: futureIso(30),
    });
    const rejectedOrder = await service.submitAgentOrder({
      ...agentOrder("queue-rejected"),
      requested_fulfillment_time: futureIso(48),
    });
    await repository.updateOrder(lateOrder.id, { status: "completed" });
    await repository.updateOrder(stalePastOrder.id, {
      requestedFulfillmentTime: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    });
    await repository.updateOrder(rejectedOrder.id, { status: "rejected" });

    const orders = await service.listOrders("rest_lb_steakhouse");

    expect(orders.map((order) => order.id)).toEqual([earlyOrder.id]);
    expect(orders.some((order) => order.id === lateOrder.id)).toBe(false);
    expect(orders.some((order) => order.id === stalePastOrder.id)).toBe(false);
    expect(orders.findIndex((order) => order.id === earlyOrder.id)).toBeGreaterThanOrEqual(0);
    expect(orders.map((order) => order.id)).not.toContain(lateOrder.id);
    expect(orders.map((order) => order.id)).not.toContain(stalePastOrder.id);
    expect(orders.map((order) => order.id)).not.toContain(rejectedOrder.id);

    const queueTimes = orders.map((order) => new Date(order.requestedFulfillmentTime).getTime());
    expect(queueTimes).toEqual([...queueTimes].sort((a, b) => a - b));
  });

  it("creates a mock order that lands inside the current demo week window", async () => {
    const previousDemoNow = process.env.VITE_DEMO_NOW;
    process.env.VITE_DEMO_NOW = "2026-10-17T18:00:00.000Z";

    try {
      const service = createService();
      const order = await service.createMockOrderForRestaurant("rest_pizza_palace");
      const orders = await service.listOrders("rest_pizza_palace");
      const requestedTime = new Date(order.requestedFulfillmentTime).getTime();
      const demoNow = new Date("2026-10-17T18:00:00.000Z").getTime();
      const endOfWeekWindow = demoNow + 7 * 24 * 60 * 60 * 1000;

      expect(order.restaurantId).toBe("rest_pizza_palace");
      expect(order.agentId).toBe("agent_coachimhungry");
      expect(order.orderIntent.metadata.source).toBe("demo_add_mock_order");
      expect(requestedTime).toBeGreaterThan(demoNow);
      expect(requestedTime).toBeLessThan(endOfWeekWindow);
      expect(orders.some((entry) => entry.id === order.id)).toBe(true);
    } finally {
      if (previousDemoNow === undefined) {
        delete process.env.VITE_DEMO_NOW;
      } else {
        process.env.VITE_DEMO_NOW = previousDemoNow;
      }
    }
  });

  it("reuses the same persisted submit result for repeated idempotent order submissions", async () => {
    const service = createService();
    const payload = {
      ...agentOrder("idem-submit-1"),
      metadata: { idempotency_key: "pilot-submit-1" },
    };

    const first = await service.submitAgentOrder(payload);
    const second = await service.submitAgentOrder(payload);
    const orders = await service.listOrders("rest_lb_steakhouse");

    expect(first.id).toBe(second.id);
    expect(orders.filter((entry) => entry.externalOrderReference === "idem-submit-1")).toHaveLength(1);
  });

  it("reuses the same quote result for repeated idempotent quote requests", async () => {
    const service = createService();
    const payload = {
      ...agentOrder("idem-quote-1"),
      metadata: { idempotency_key: "pilot-quote-1" },
    };

    const first = await service.quoteOrder(payload);
    const second = await service.quoteOrder(payload);

    expect(first.id).toBe(second.id);
    expect(first.totalCents).toBe(second.totalCents);
  });

  it("treats quote requests with only a different created_at_iso as the same idempotent request", async () => {
    const service = createService();
    const firstPayload = {
      ...agentOrder("idem-quote-created-at"),
      created_at_iso: "2026-05-18T19:00:00.000Z",
      metadata: { idempotency_key: "pilot-quote-created-at" },
    };
    const secondPayload = {
      ...firstPayload,
      created_at_iso: "2026-05-18T19:00:05.000Z",
    };

    const first = await service.quoteOrder(firstPayload);
    const second = await service.quoteOrder(secondPayload);

    expect(first.id).toBe(second.id);
    expect(first.totalCents).toBe(second.totalCents);
  });

  it("backfills missing tipCents on cached idempotent quote responses", async () => {
    const service = createService();
    const repository = (service as any).repository as InMemoryPlatformRepository;
    const payload = {
      ...agentOrder("idem-quote-legacy-tip"),
      metadata: { idempotency_key: "pilot-quote-legacy-tip" },
    };

    await repository.createIdempotencyRecord({
      scope: "quote",
      restaurantId: payload.restaurant_id,
      agentId: payload.agent_id,
      idempotencyKey: "pilot-quote-legacy-tip",
      requestHash: createHash("sha256").update(JSON.stringify(payload)).digest("hex"),
      status: "completed",
      response: {
        id: "quote_legacy",
        orderId: "idem-quote-legacy-tip",
        subtotalCents: 2500,
        taxCents: 225,
        feesCents: 299,
        totalCents: 3024,
        currency: "USD",
        quotedAt: new Date().toISOString(),
      },
    });

    const result = await service.quoteOrder(payload);

    expect(result.tipCents).toBe(0);
    expect(result.totalCents).toBe(3024);
  });

  it("still returns a quote when validation only fails on split-resolvable size limits", async () => {
    const service = createService();
    const oversized = {
      ...agentOrder("quote-oversized-1"),
      headcount: 6,
      items: [{ item_id: "item_filet", quantity: 6, modifiers: [] }],
    };

    const validation = await service.validateOrder(oversized);
    const quote = await service.quoteOrder(oversized);

    expect(validation.valid).toBe(false);
    expect(validation.issues.some((issue) => issue.code === "order_value_too_large")).toBe(true);
    expect(quote.totalCents).toBeGreaterThan(0);
  });

  it("surfaces operational diagnostics for mapping gaps and stuck orders", async () => {
    const service = createService();
    await service.updateRules("rest_lb_steakhouse", { autoAcceptEnabled: false });
    await service.submitAgentOrder(agentOrder("diag-submit-1"));

    const diagnostics = await service.getOperationalDiagnostics("rest_lb_steakhouse");

    expect(diagnostics.stuckOrders.length).toBeGreaterThan(0);
    expect(diagnostics.mappingIssues.some((item) => item.menuItemId === "item_butter_cake")).toBe(true);
  });

  it("denies operator access to another restaurant even if the URL is changed", () => {
    const service = createService();

    expect(() =>
      service.assertOperatorAccess(authenticatedOperator("owner"), "rest_other_restaurant"),
    ).toThrow("Operator does not have access to this restaurant.");
  });

  it("rejects actions when the operator role is below the required level", () => {
    const service = createService();

    expect(() =>
      service.assertOperatorAccess(authenticatedOperator("viewer"), "rest_lb_steakhouse", ["owner", "staff"]),
    ).toThrow("Operator role does not allow this action.");

    expect(() =>
      service.assertOperatorAccess(authenticatedOperator("staff"), "rest_lb_steakhouse", ["owner"]),
    ).toThrow("Operator role does not allow this action.");
  });

  it("rejects revoked agent keys", async () => {
    const service = createService();
    const repository = (service as any).repository as InMemoryPlatformRepository;
    repository.state.agentApiKeys[0].revokedAt = new Date().toISOString();

    await expect(service.authenticateAgentKey("coachimhungry_demo_live_local_key")).rejects.toThrow("Invalid API key.");
  });

  it("rejects missing agent scopes", () => {
    const service = createService();

    expect(() =>
      service.assertAgentScope(
        {
          id: "key_scope_test",
          agentId: "agent_coachimhungry",
          label: "Limited key",
          keyPrefix: "phm_test",
          keyHash: "hash",
          scopes: ["menus:read"],
          createdAt: new Date().toISOString(),
        },
        "orders:submit",
      ),
    ).toThrow("Agent API key is missing required scope: orders:submit.");
  });

  it("blocks blocked agents from menu and order endpoints", async () => {
    const service = createService();
    const repository = (service as any).repository as InMemoryPlatformRepository;
    const demoAgentPermission = repository.state.permissions.find((entry) => entry.agentId === "agent_coachimhungry");
    if (!demoAgentPermission) throw new Error("CoachImHungry permission missing from seed.");
    demoAgentPermission.status = "blocked";
    const { server, baseUrl } = await startServer(service);
    openServers.push(server);

    const menuResponse = await fetch(`${baseUrl}/api/agent/restaurants/rest_lb_steakhouse/menu`, {
      headers: { "x-agent-api-key": "coachimhungry_demo_live_local_key" },
    });
    const submitResponse = await fetch(`${baseUrl}/api/agent/restaurants/rest_lb_steakhouse/orders/submit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-agent-api-key": "coachimhungry_demo_live_local_key",
      },
      body: JSON.stringify(agentOrder("blocked-agent-submit")),
    });

    expect(menuResponse.status).toBe(400);
    expect(await menuResponse.json()).toEqual({ error: "Agent is not allowed for this restaurant." });
    expect(submitResponse.status).toBe(400);
  });

  it("lists discoverable restaurants for an allowed agent key", async () => {
    const service = createService();
    const { server, baseUrl } = await startServer(service);
    openServers.push(server);

    const params = new URLSearchParams({
      address: "1533 Ashcroft Way, Sunnyvale, CA 94087",
      lat: "37.3509",
      lng: "-122.0378",
      radiusMiles: "3",
      fulfillmentType: "pickup",
    });
    const response = await fetch(`${baseUrl}/api/agent/restaurants?${params.toString()}`, {
      headers: { "x-agent-api-key": "coachimhungry_demo_live_local_key" },
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "rest_lb_steakhouse",
          name: "LB Steakhouse",
          posProvider: "toast",
          permissionStatus: "allowed",
        }),
      ]),
    );
  });

  it("ingests deliverect inbound events with the correct provider label", async () => {
    const service = createService();
    const { server, baseUrl } = await startServer(service);
    openServers.push(server);

    const response = await fetch(`${baseUrl}/api/internal/events/deliverect`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id: "evt_deliverect_1",
        type: "checkout.completed",
        orderId: "order_test_123",
      }),
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.provider).toBe("deliverect");
    expect(payload.eventType).toBe("checkout.completed");
  });

  it("discovers Deliverect onboarding locations through the backend API", async () => {
    const service = createService();
    const { server, baseUrl } = await startServer(service);
    openServers.push(server);

    const response = await fetch(`${baseUrl}/api/onboarding/discover`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "deliverect", query: "Sunnyvale" }),
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.provider).toBe("deliverect");
    expect(payload.locations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "Pizza Palace - Sunnyvale",
        }),
      ]),
    );
  });

  it("creates and fetches an onboarding access request through the backend API", async () => {
    const service = createService();
    const { server, baseUrl } = await startServer(service);
    openServers.push(server);

    const createResponse = await fetch(`${baseUrl}/api/onboarding/request-access`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: "deliverect",
        providerAccountId: "acct_deliverect_demo_001",
        providerLocationIds: ["deliv_loc_1", "deliv_loc_2"],
        email: "owner@example.com",
      }),
    });
    const created = await createResponse.json();

    expect(createResponse.status).toBe(200);
    expect(created.status).toBe("pending");

    const getResponse = await fetch(`${baseUrl}/api/onboarding/${created.id}`);
    const fetched = await getResponse.json();

    expect(getResponse.status).toBe(200);
    expect(fetched.email).toBe("owner@example.com");
    expect(fetched.providerLocationIds).toEqual(["deliv_loc_1", "deliv_loc_2"]);
  });

  it("activates onboarding and signs the operator into the console", async () => {
    const service = createService();
    const { server, baseUrl } = await startServer(service);
    openServers.push(server);

    const response = await fetch(`${baseUrl}/api/onboarding/activate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: "deliverect",
        providerAccountId: "acct_deliverect_demo_001",
        providerLocationIds: ["deliv_loc_1", "deliv_loc_2"],
        fullName: "Chain Owner",
        email: "chain.owner@example.com",
        password: "password123",
      }),
    });
    const payload = await response.json();
    const cookie = response.headers.get("set-cookie") ?? "";
    const selectedRestaurantId = payload.selectedMembership.restaurantId;

    const [posResponse, menuResponse] = await Promise.all([
      fetch(`${baseUrl}/api/restaurants/${selectedRestaurantId}/pos-connection`, {
        headers: { cookie },
      }),
      fetch(`${baseUrl}/api/restaurants/${selectedRestaurantId}/menu`, {
        headers: { cookie },
      }),
    ]);
    const posConnection = await posResponse.json();
    const menu = await menuResponse.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("phantom_restaurant_session=");
    expect(payload.user.email).toBe("chain.owner@example.com");
    expect(payload.memberships).toHaveLength(2);
    expect(payload.restaurants).toHaveLength(2);
    expect(payload.restaurants.every((restaurant: { id: string }) => restaurant.id !== "rest_pizza_palace")).toBe(true);
    expect(payload.selectedMembership.restaurantId).not.toBe("rest_pizza_palace");
    expect(posResponse.status).toBe(200);
    expect(posConnection.lastSyncedAt).toBeTruthy();
    expect(menu.items.length).toBeGreaterThan(0);
    expect(menu.items.some((item: { name: string }) => item.name === "Margherita Pizza")).toBe(true);
  });

  it("still loads inherited menu data when an onboarding restaurant is missing explicit template metadata", async () => {
    const service = createService();
    const repository = (service as any).repository as InMemoryPlatformRepository;
    const authenticated = await repository.createOnboardingOperatorAccount({
      activation: {
        provider: "deliverect",
        providerAccountId: "acct_deliverect_demo_001",
        providerLocationIds: ["deliv_loc_3"],
        fullName: "Chain Owner",
        email: "fallback.owner@example.com",
        password: "password123",
      },
      accountName: "Pizza Palace",
      locations: [
        {
          id: "deliv_loc_3",
          name: "Pizza Palace - Palo Alto",
          address: "855 El Camino Real, Palo Alto, CA 94301",
          timezone: "America/Los_Angeles",
        },
      ],
    });

    const createdRestaurantId = authenticated.selectedMembership.restaurantId;
    const connection = await repository.getPOSConnection(createdRestaurantId);
    expect(connection).not.toBeNull();

    await repository.updatePOSConnection(connection!.id, {
      metadata: {
        source: "onboarding",
        accountName: "Pizza Palace",
        providerLocationId: "deliv_loc_3",
      },
    });

    const menu = await service.getMenu(createdRestaurantId);
    expect(menu.items.length).toBeGreaterThan(0);
    expect(menu.items.some((item) => item.name === "Margherita Pizza")).toBe(true);
  });

  it("lets an owner create and list team members with restaurant access assignments", async () => {
    const service = createService();
    const { server, baseUrl } = await startServer(service);
    openServers.push(server);
    const { cookie } = await loginOperator(baseUrl);

    const createResponse = await fetch(`${baseUrl}/api/restaurants/rest_lb_steakhouse/team-members`, {
      method: "POST",
      headers: {
        cookie,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        fullName: "Jordan Staff",
        email: "jordan.staff@example.com",
        password: "password123",
        role: "staff",
        accessScope: "selected",
        restaurantIds: ["rest_lb_steakhouse", "rest_pizza_palace"],
      }),
    });
    const created = await createResponse.json();

    const listResponse = await fetch(`${baseUrl}/api/restaurants/rest_lb_steakhouse/team-members`, {
      headers: { cookie },
    });
    const listed = await listResponse.json();

    expect(createResponse.status).toBe(200);
    expect(created.user.email).toBe("jordan.staff@example.com");
    expect(created.assignments).toHaveLength(2);
    expect(listResponse.status).toBe(200);
    expect(listed).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          user: expect.objectContaining({ email: "jordan.staff@example.com" }),
          assignments: expect.arrayContaining([
            expect.objectContaining({ restaurantId: "rest_lb_steakhouse", role: "staff" }),
            expect.objectContaining({ restaurantId: "rest_pizza_palace", role: "staff" }),
          ]),
        }),
      ]),
    );
  });

  it("lets an owner edit and delete team members from the team access API", async () => {
    const service = createService();
    const { server, baseUrl } = await startServer(service);
    openServers.push(server);
    const { cookie } = await loginOperator(baseUrl);

    const createResponse = await fetch(`${baseUrl}/api/restaurants/rest_lb_steakhouse/team-members`, {
      method: "POST",
      headers: {
        cookie,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        fullName: "Taylor Viewer",
        email: "taylor.viewer@example.com",
        password: "password123",
        role: "viewer",
        accessScope: "selected",
        restaurantIds: ["rest_lb_steakhouse"],
      }),
    });
    const created = await createResponse.json();

    const updateResponse = await fetch(
      `${baseUrl}/api/restaurants/rest_lb_steakhouse/team-members/${created.user.id}`,
      {
        method: "PATCH",
        headers: {
          cookie,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fullName: "Taylor Staff",
          email: "taylor.staff@example.com",
          role: "staff",
          accessScope: "all",
          restaurantIds: [],
        }),
      },
    );
    const updated = await updateResponse.json();

    const deleteResponse = await fetch(
      `${baseUrl}/api/restaurants/rest_lb_steakhouse/team-members/${created.user.id}`,
      {
        method: "DELETE",
        headers: { cookie },
      },
    );

    const listResponse = await fetch(`${baseUrl}/api/restaurants/rest_lb_steakhouse/team-members`, {
      headers: { cookie },
    });
    const listed = await listResponse.json();

    expect(updateResponse.status).toBe(200);
    expect(updated.user.fullName).toBe("Taylor Staff");
    expect(updated.assignments.length).toBeGreaterThan(1);
    expect(deleteResponse.status).toBe(204);
    expect(listed.some((member: { user: { id: string } }) => member.user.id === created.user.id)).toBe(false);
  });

  it("prevents a viewer from approving orders through the restaurant API", async () => {
    const service = createService();
    const repository = (service as any).repository as InMemoryPlatformRepository;
    repository.state.operatorMemberships[0].role = "viewer";
    const order = await submitSampleOrder(service, "viewer-approve-order");
    const { server, baseUrl } = await startServer(service);
    openServers.push(server);
    const { cookie } = await loginOperator(baseUrl);

    const response = await fetch(`${baseUrl}/api/restaurants/rest_lb_steakhouse/orders/${order.id}/approve`, {
      method: "POST",
      headers: { cookie },
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "Operator role does not allow this action." });
  });

  it("allows a viewer with restaurant access to add a demo mock order", async () => {
    const service = createService();
    const repository = (service as any).repository as InMemoryPlatformRepository;
    repository.state.operatorMemberships[0].role = "viewer";
    const { server, baseUrl } = await startServer(service);
    openServers.push(server);
    const { cookie } = await loginOperator(baseUrl);

    const response = await fetch(`${baseUrl}/api/restaurants/rest_lb_steakhouse/orders/mock`, {
      method: "POST",
      headers: { cookie },
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.restaurantId).toBe("rest_lb_steakhouse");
    expect(payload.orderIntent.metadata.source).toBe("demo_add_mock_order");
  });

  it("allows staff to change restaurant info and ordering rules through the restaurant API", async () => {
    const service = createService();
    const repository = (service as any).repository as InMemoryPlatformRepository;
    repository.state.operatorMemberships[0].role = "staff";
    const { server, baseUrl } = await startServer(service);
    openServers.push(server);
    const { cookie } = await loginOperator(baseUrl);

    const rulesResponse = await fetch(`${baseUrl}/api/restaurants/rest_lb_steakhouse/rules`, {
      method: "PATCH",
      headers: {
        cookie,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ autoAcceptEnabled: false }),
    });

    expect(rulesResponse.status).toBe(200);
    expect(await rulesResponse.json()).toEqual(expect.objectContaining({ autoAcceptEnabled: false }));

    const restaurantResponse = await fetch(`${baseUrl}/api/restaurants/rest_lb_steakhouse`, {
      method: "PATCH",
      headers: {
        cookie,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ contactPhone: "555-111-2222" }),
    });

    expect(restaurantResponse.status).toBe(200);
    expect(await restaurantResponse.json()).toEqual(expect.objectContaining({ contactPhone: "555-111-2222" }));
  });

  it("returns 403 when a logged-in operator requests a restaurant outside their memberships", async () => {
    const service = createService();
    const repository = (service as any).repository as InMemoryPlatformRepository;
    repository.state.restaurants.push({
      ...repository.state.restaurants[0],
      id: "rest_other_restaurant",
      name: "Other Restaurant",
    });
    const { server, baseUrl } = await startServer(service);
    openServers.push(server);
    const { cookie } = await loginOperator(baseUrl);

    const response = await fetch(`${baseUrl}/api/restaurants/rest_other_restaurant`, {
      headers: { cookie },
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "Operator does not have access to this restaurant." });
  });

  it("links an existing operator record to a Supabase Auth identity on first live login", async () => {
    const service = createAuthBackedService({
      isEnabled: () => true,
      signInWithPassword: async () => ({
        id: "11111111-1111-1111-1111-111111111111",
        email: "dev@rest.com",
        fullName: "Restaurant Dev Operator",
        lastSignInAt: new Date().toISOString(),
      }),
      getUserById: async (userId) => ({
        id: userId,
        email: "dev@rest.com",
        fullName: "Restaurant Dev Operator",
      }),
    });
    const repository = (service as any).repository as InMemoryPlatformRepository;

    const result = await service.loginOperator("dev@rest.com", "ignored-by-supabase-auth");

    expect(result.authenticated.user.supabaseUserId).toBe("11111111-1111-1111-1111-111111111111");
    expect(repository.state.operatorUsers[0].supabaseUserId).toBe("11111111-1111-1111-1111-111111111111");
  });

  it("bootstraps the seeded mock tenant for dev@rest.com when only Supabase Auth exists", async () => {
    const service = createAuthBackedService({
      isEnabled: () => true,
      signInWithPassword: async () => ({
        id: "44444444-4444-4444-4444-444444444444",
        email: "dev@rest.com",
        fullName: "Restaurant Dev Operator",
      }),
      getUserById: async (userId) => ({
        id: userId,
        email: "dev@rest.com",
        fullName: "Restaurant Dev Operator",
      }),
    });
    const repository = (service as any).repository as InMemoryPlatformRepository;
    repository.state.operatorUsers = [];
    repository.state.operatorMemberships = [];

    const result = await service.loginOperator("dev@rest.com", "password");

    expect(result.authenticated.user.id).toBe("op_dev_rest");
    expect(result.authenticated.user.supabaseUserId).toBe("44444444-4444-4444-4444-444444444444");
    expect(result.restaurants.map((entry) => entry.id)).toContain("rest_lb_steakhouse");
    expect(repository.state.operatorMemberships).toHaveLength(1);
    expect(repository.state.operatorMemberships[0].restaurantId).toBe("rest_lb_steakhouse");
  });

  it("rejects live login when Supabase Auth succeeds but no operator membership exists in Phantom", async () => {
    const service = createAuthBackedService({
      isEnabled: () => true,
      signInWithPassword: async () => ({
        id: "22222222-2222-2222-2222-222222222222",
        email: "unknown@rest.com",
      }),
      getUserById: async () => null,
    });

    await expect(service.loginOperator("unknown@rest.com", "password")).rejects.toThrow(
      "No restaurant access is configured for this operator.",
    );
  });

  it("invalidates a Phantom session when the linked Supabase Auth user is no longer active", async () => {
    const service = createAuthBackedService({
      isEnabled: () => true,
      signInWithPassword: async () => ({
        id: "33333333-3333-3333-3333-333333333333",
        email: "dev@rest.com",
        fullName: "Restaurant Dev Operator",
      }),
      getUserById: async () => null,
    });

    const login = await service.loginOperator("dev@rest.com", "password");

    await expect(service.getOperatorSession(login.sessionToken)).rejects.toThrow(
      "Supabase Auth account is no longer active.",
    );
  });

  it("preserves the selected tenant after refreshing the linked Supabase Auth user", async () => {
    const service = createAuthBackedService({
      isEnabled: () => true,
      signInWithPassword: async () => ({
        id: "084528ba-851b-41d8-962d-8ae0c6171d6b",
        email: "dev@rest.com",
        fullName: "Restaurant Dev Operator",
      }),
      getUserById: async (userId) => ({
        id: userId,
        email: "dev@rest.com",
        fullName: "Restaurant Dev Operator",
      }),
    });

    const login = await service.loginOperator("dev@rest.com", "password");
    await service.selectOperatorTenant(login.sessionToken, "rest_pizza_palace");
    const session = await service.getOperatorSession(login.sessionToken);

    expect(session.selectedMembership.restaurantId).toBe("rest_pizza_palace");
  });
});
