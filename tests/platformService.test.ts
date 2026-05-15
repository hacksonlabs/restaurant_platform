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
    agent_id: "agent_phantom",
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
    agent_id: "agent_phantom",
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

  it("persists POS submission status for the order lifecycle", async () => {
    const service = createService();
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
    const order = await service.submitAgentOrder(agentOrder("decision-lock-approve"));

    await service.approveOrder("rest_lb_steakhouse", order.id);

    await expect(service.rejectOrder("rest_lb_steakhouse", order.id)).rejects.toThrow(
      "Order decision is final and cannot be changed.",
    );
  });

  it("locks the manager decision once an order is rejected", async () => {
    const service = createService();
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
      service.assertOperatorAccess(authenticatedOperator("viewer"), "rest_lb_steakhouse", ["owner", "manager", "staff"]),
    ).toThrow("Operator role does not allow this action.");

    expect(() =>
      service.assertOperatorAccess(authenticatedOperator("staff"), "rest_lb_steakhouse", ["owner", "manager"]),
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
          agentId: "agent_phantom",
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

  it("prevents staff from changing ordering rules through the restaurant API", async () => {
    const service = createService();
    const repository = (service as any).repository as InMemoryPlatformRepository;
    repository.state.operatorMemberships[0].role = "staff";
    const { server, baseUrl } = await startServer(service);
    openServers.push(server);
    const { cookie } = await loginOperator(baseUrl);

    const response = await fetch(`${baseUrl}/api/restaurants/rest_lb_steakhouse/rules`, {
      method: "PATCH",
      headers: {
        cookie,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ autoAcceptEnabled: false }),
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "Operator role does not allow this action." });
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
