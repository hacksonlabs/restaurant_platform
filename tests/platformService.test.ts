import express from "express";
import { createHash, createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApiRouter } from "../src/server/api/router";
import { POSAdapterRegistry } from "../src/server/pos/registry";
import { InMemoryPlatformRepository } from "../src/server/repositories/platformRepository";
import { PlatformService } from "../src/server/services/platformService";
import type { OperatorIdentity } from "../src/server/auth/supabaseAuth";
import type { AppEnv } from "../src/server/config/env";
import type { AuthenticatedOperator, AuthenticatedPlatformAdmin, CanonicalOrderIntent } from "../src/shared/types";

function createService() {
  return new PlatformService(new InMemoryPlatformRepository("coachimhungry_demo_live_local_key"));
}

function createServiceWithEnv(env: Partial<AppEnv>) {
  const typedEnv = env as AppEnv;
  return new PlatformService(
    new InMemoryPlatformRepository("coachimhungry_demo_live_local_key"),
    new POSAdapterRegistry(undefined, typedEnv),
    undefined,
    typedEnv,
  );
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
  app.use(express.json({
    verify: (request: any, _response, buffer) => {
      request.rawBody = buffer.toString("utf8");
    },
  }));
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

function authenticatedPlatformAdmin(): AuthenticatedPlatformAdmin {
  return {
    user: {
      id: "pa_akayla_mealops",
      email: "akayla@mealops.ai",
      fullName: "Akayla MealOps Admin",
      status: "active",
      createdAt: new Date().toISOString(),
    },
  };
}

async function createDeliverectProviderLocation(service: PlatformService, suffix: string) {
  const repository = (service as any).repository as InMemoryPlatformRepository;
  const account = await repository.upsertProviderAccount({
    provider: "deliverect",
    externalAccountId: `acct_deliverect_${suffix}`,
    displayName: `MealOps Deliverect ${suffix}`,
    environment: "sandbox",
    status: "sandbox",
    metadata: { scope: "mealops" },
    lastSyncedAt: new Date().toISOString(),
  });
  const providerLocation = await repository.upsertProviderLocation({
    providerAccountId: account.id,
    provider: "deliverect",
    externalLocationId: `deliverect_location_${suffix}`,
    externalStoreId: `deliverect_store_${suffix}`,
    channelLinkId: `channel_link_${suffix}`,
    channelName: "mealops",
    name: `MealOps - ${suffix}`,
    address: "20 Provider Way",
    timezone: "America/Los_Angeles",
    status: "sandbox",
    rawProviderPayload: { fulfillmentTypes: ["pickup", "delivery"] },
    lastSyncedAt: new Date().toISOString(),
  });
  return { repository, account, providerLocation };
}

function deliverectMenuPayload(suffix: string, eventId = `menu_event_${suffix}`) {
  return {
    channelLinkId: `channel_link_${suffix}`,
    eventId,
    items: [
      {
        menu: "Lunch",
        categories: [
          {
            name: "Entrees",
            products: [
              {
                plu: `ENTREE-${suffix}`,
                name: `Channel Entree ${suffix}`,
                description: "Imported from Deliverect Channel push",
                price: 1500,
                modifierGroups: [
                  {
                    id: `sauce_group_${suffix}`,
                    name: "Sauce",
                    min: 1,
                    max: 1,
                    modifiers: [
                      { plu: `SAUCE-A-${suffix}`, name: "Sauce A", price: 0 },
                      { plu: `SAUCE-B-${suffix}`, name: "Sauce B", price: 100 },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}

async function provisionDeliverectMenuRestaurant(service: PlatformService, suffix: string) {
  const setup = await createDeliverectProviderLocation(service, suffix);
  const provisioned = await service.provisionProviderLocation(authenticatedPlatformAdmin(), setup.providerLocation.id);
  const menuResult = await service.ingestDeliverectMenuUpdate(deliverectMenuPayload(suffix));
  const menu = await service.getMenu(provisioned.restaurant.id);
  return { ...setup, provisioned, menuResult, menu };
}

function deliverectOrderIntent(
  restaurantId: string,
  reference: string,
  itemId: string,
  modifiers: CanonicalOrderIntent["items"][number]["modifiers"],
  metadata: Record<string, unknown>,
): CanonicalOrderIntent {
  return {
    restaurant_id: restaurantId,
    agent_id: "agent_coachimhungry",
    external_order_reference: reference,
    customer: { name: "Channel Guest", email: "guest@example.com", phone: "555-0100" },
    fulfillment_type: "pickup",
    requested_fulfillment_time: futureIso(24),
    headcount: 2,
    payment_policy: "required_before_submit",
    items: [{ item_id: itemId, quantity: 1, modifiers }],
    dietary_constraints: [],
    substitution_policy: "strict",
    metadata,
  };
}

const openServers: import("node:http").Server[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
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
        agent: expect.objectContaining({
          partnerId: "partner_coachimhungry",
          partner: expect.objectContaining({
            id: "partner_coachimhungry",
            status: "approved",
          }),
        }),
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
    repository.state.partnerCredentials[0].revokedAt = new Date().toISOString();
    repository.state.agentApiKeys[0].revokedAt = new Date().toISOString();

    await expect(service.authenticateAgentKey("coachimhungry_demo_live_local_key")).rejects.toThrow("Invalid API key.");
  });

  it("authenticates the seeded demo key through the partner credential model", async () => {
    const service = createService();
    const key = await service.authenticateAgentKey("coachimhungry_demo_live_local_key");

    expect(key.agentId).toBe("agent_coachimhungry");
    expect(key.partnerId).toBe("partner_coachimhungry");
    expect(key.credentialType).toBe("partner_credential");
    expect(key.credentialId).toBe("pcred_coachimhungry_demo");
    expect(key.scopes).toContain("orders:submit");
  });

  it("creates and revokes partner credentials without changing legacy key behavior", async () => {
    const service = createService();
    const created = await service.createPartnerCredential(
      "rest_lb_steakhouse",
      "partner_coachimhungry",
      "agent_coachimhungry",
      "OpenAI pilot credential",
      ["menus:read", "orders:validate"],
      "test",
    );

    const authenticated = await service.authenticateAgentKey(created.rawKey);
    expect(authenticated).toEqual(
      expect.objectContaining({
        agentId: "agent_coachimhungry",
        partnerId: "partner_coachimhungry",
        credentialType: "partner_credential",
        credentialId: created.credential.id,
      }),
    );
    expect(authenticated.scopes).toEqual(["menus:read", "orders:validate"]);

    await service.revokePartnerCredential("rest_lb_steakhouse", "partner_coachimhungry", created.credential.id);
    await expect(service.authenticateAgentKey(created.rawKey)).rejects.toThrow("Invalid API key.");

    const legacyKey = await service.authenticateAgentKey("coachimhungry_demo_live_local_key");
    expect(legacyKey.credentialType).toBe("partner_credential");
  });

  it("associates seeded agents with an approved partner without changing restaurant access", async () => {
    const service = createService();
    const agents = await service.listAgents("rest_lb_steakhouse");
    const coachAgent = agents.find((entry) => entry.agent.id === "agent_coachimhungry");

    expect(coachAgent).toBeTruthy();
    expect(coachAgent?.agent.partnerId).toBe("partner_coachimhungry");
    expect(coachAgent?.agent.partner).toEqual(
      expect.objectContaining({
        id: "partner_coachimhungry",
        status: "approved",
      }),
    );
    expect(coachAgent?.permission.status).toBe("allowed");
    expect(coachAgent?.apiKey?.scopes).toContain("orders:submit");
  });

  it("lists platform admin partners without exposing stored key hashes", async () => {
    const service = createService();
    const partners = await service.getPlatformAdminPartners(authenticatedPlatformAdmin());
    const coachPartner = partners.find((entry) => entry.partner.id === "partner_coachimhungry");

    expect(coachPartner?.agents[0]?.agent.id).toBe("agent_coachimhungry");
    expect(coachPartner?.credentials[0]).toEqual(
      expect.objectContaining({
        id: "pcred_coachimhungry_demo",
        partnerId: "partner_coachimhungry",
        agentId: "agent_coachimhungry",
      }),
    );
    expect(coachPartner?.credentials[0]).not.toHaveProperty("keyHash");
  });

  it("authenticates the seeded platform admin credential", async () => {
    const service = createService();
    const login = await service.loginPlatformAdmin("akayla@mealops.ai", "password");
    const session = await service.getPlatformAdminSession(login.sessionToken);

    expect(login.authenticated.user.email).toBe("akayla@mealops.ai");
    expect(session.user.email).toBe("akayla@mealops.ai");
    await expect(service.loginPlatformAdmin("coach@agent.com", "password")).rejects.toThrow("Invalid admin email or password.");
    await expect(service.loginPlatformAdmin("dev@rest.com", "password")).rejects.toThrow("Invalid admin email or password.");
  });

  it("maps multiple Deliverect provider locations from one account to separate restaurants", async () => {
    const service = createService();
    const repository = (service as any).repository as InMemoryPlatformRepository;
    const admin = authenticatedPlatformAdmin();
    const account = await repository.upsertProviderAccount({
      provider: "deliverect",
      externalAccountId: "acct_deliverect_test",
      displayName: "MealOps Deliverect Sandbox",
      environment: "sandbox",
      status: "sandbox",
      metadata: { scope: "mealops" },
      lastSyncedAt: new Date().toISOString(),
    });
    const location1 = await repository.upsertProviderLocation({
      providerAccountId: account.id,
      provider: "deliverect",
      externalLocationId: "deliverect_location_1",
      externalStoreId: "deliverect_store_1",
      channelLinkId: "channel_link_location_1_mealops",
      channelName: "mealops",
      name: "MealOps - Test Location 1",
      address: "1 Test Way",
      timezone: "America/Los_Angeles",
      status: "sandbox",
      rawProviderPayload: { fulfillmentTypes: ["pickup"] },
      lastSyncedAt: new Date().toISOString(),
    });
    const location2 = await repository.upsertProviderLocation({
      providerAccountId: account.id,
      provider: "deliverect",
      externalLocationId: "deliverect_location_2",
      externalStoreId: "deliverect_store_2",
      channelLinkId: "channel_link_location_2_mealops",
      channelName: "mealops",
      name: "MealOps - Test Location 2",
      address: "2 Test Way",
      timezone: "America/Los_Angeles",
      status: "sandbox",
      rawProviderPayload: { fulfillmentTypes: ["pickup"] },
      lastSyncedAt: new Date().toISOString(),
    });

    const connection1 = await service.mapProviderLocationToRestaurant(admin, location1.id, "rest_pizza_palace", "live", "sandbox");
    const connection2 = await service.mapProviderLocationToRestaurant(admin, location2.id, "rest_green_leaf_salads", "live", "sandbox");
    const locations = await service.listProviderLocations(admin, account.id);
    const mappedRestaurant = await service.getRestaurant("rest_pizza_palace");
    const mappedRules = await service.getRules("rest_pizza_palace");

    expect(connection1.providerAccountId).toBe(account.id);
    expect(connection2.providerAccountId).toBe(account.id);
    expect(connection1.providerLocationId).toBe(location1.id);
    expect(connection2.providerLocationId).toBe(location2.id);
    expect(connection1.metadata.deliverectAccountId).toBe("acct_deliverect_test");
    expect(connection1.metadata.deliverectLocationId).toBe("deliverect_location_1");
    expect(connection1.metadata.deliverectChannelLinkId).toBe("channel_link_location_1_mealops");
    expect(connection2.metadata.deliverectLocationId).toBe("deliverect_location_2");
    expect(connection2.metadata.deliverectChannelLinkId).toBe("channel_link_location_2_mealops");
    expect(mappedRestaurant.fulfillmentTypesSupported).toEqual(["pickup"]);
    expect(mappedRules.allowedFulfillmentTypes).toEqual(["pickup"]);
    expect(locations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: location1.id, mappedRestaurantId: "rest_pizza_palace" }),
        expect.objectContaining({ id: location2.id, mappedRestaurantId: "rest_green_leaf_salads" }),
      ]),
    );
  });

  it("updates an existing provider location when Channel registration returns the same channel link", async () => {
    const service = createService();
    const repository = (service as any).repository as InMemoryPlatformRepository;
    const account = await repository.upsertProviderAccount({
      provider: "deliverect",
      externalAccountId: "acct_deliverect_test",
      displayName: "MealOps Deliverect Sandbox",
      environment: "sandbox",
      status: "sandbox",
      metadata: { scope: "mealops" },
      lastSyncedAt: new Date().toISOString(),
    });
    const manualLocation = await repository.upsertProviderLocation({
      providerAccountId: account.id,
      provider: "deliverect",
      externalLocationId: "manual_location_id",
      externalStoreId: "manual_location_id",
      channelLinkId: "channel_link_location_1_mealops",
      channelName: "mealops",
      name: "MealOps - Test Location 1",
      address: "Manual address",
      timezone: "America/Los_Angeles",
      status: "sandbox",
      rawProviderPayload: { source: "manual" },
      lastSyncedAt: new Date().toISOString(),
    });

    const channelRegistrationLocation = await repository.upsertProviderLocation({
      providerAccountId: account.id,
      provider: "deliverect",
      externalLocationId: "STORE0005",
      externalStoreId: "store_123",
      channelLinkId: "channel_link_location_1_mealops",
      channelName: "mealops",
      name: "MealOps - Test Location 1",
      address: "1 Main Street, Ghent",
      timezone: "Europe/Brussels",
      status: "connected",
      rawProviderPayload: { source: "channel_registration", fulfillmentTypes: ["pickup", "delivery"] },
      lastSyncedAt: new Date().toISOString(),
    });
    const locations = await service.listProviderLocations(authenticatedPlatformAdmin(), account.id);

    expect(channelRegistrationLocation.id).toBe(manualLocation.id);
    expect(locations).toHaveLength(1);
    expect(locations[0]).toEqual(
      expect.objectContaining({
        id: manualLocation.id,
        externalLocationId: "STORE0005",
        externalStoreId: "store_123",
        address: "1 Main Street, Ghent",
        status: "connected",
      }),
    );
  });

  it("provisions a provider location as an orderable restaurant with welcoming defaults", async () => {
    const service = createService();
    const repository = (service as any).repository as InMemoryPlatformRepository;
    const admin = authenticatedPlatformAdmin();
    const account = await repository.upsertProviderAccount({
      provider: "deliverect",
      externalAccountId: "acct_deliverect_test",
      displayName: "MealOps Deliverect Sandbox",
      environment: "sandbox",
      status: "sandbox",
      metadata: { scope: "mealops" },
      lastSyncedAt: new Date().toISOString(),
    });
    const providerLocation = await repository.upsertProviderLocation({
      providerAccountId: account.id,
      provider: "deliverect",
      externalLocationId: "deliverect_location_provision",
      externalStoreId: "deliverect_store_provision",
      channelLinkId: "channel_link_provision_mealops",
      channelName: "mealops",
      name: "MealOps - Test Location Provision",
      address: "10 Provider Way",
      timezone: "America/Los_Angeles",
      status: "sandbox",
      rawProviderPayload: { fulfillmentTypes: ["pickup"] },
      lastSyncedAt: new Date().toISOString(),
    });

    const result = await service.provisionProviderLocation(admin, providerLocation.id);
    const rules = await service.getRules(result.restaurant.id);
    const agents = await service.listAgents(result.restaurant.id);
    const coach = agents.find((entry) => entry.agent.slug === "coachimhungry");

    expect(result.created).toBe(true);
    expect(result.restaurant.posProvider).toBe("deliverect");
    expect(result.connection.provider).toBe("deliverect");
    expect(result.connection.providerLocationId).toBe(providerLocation.id);
    expect(rules.autoAcceptEnabled).toBe(true);
    expect(rules.minimumLeadTimeMinutes).toBe(0);
    expect(rules.maxOrderDollarAmount).toBe(2147483647);
    expect(rules.maxHeadcount).toBe(2147483647);
    expect(result.restaurant.fulfillmentTypesSupported).toEqual(["pickup"]);
    expect(rules.allowedFulfillmentTypes).toEqual(["pickup"]);
    expect(rules.allowedAgentIds).toContain("agent_coachimhungry");
    expect(coach?.permission.status).toBe("allowed");
  });

  it("imports Deliverect menu update webhooks by channel link", async () => {
    const service = createService();
    const repository = (service as any).repository as InMemoryPlatformRepository;
    const admin = authenticatedPlatformAdmin();
    const account = await repository.upsertProviderAccount({
      provider: "deliverect",
      externalAccountId: "acct_deliverect_menu_push",
      displayName: "MealOps Deliverect Menu Push",
      environment: "sandbox",
      status: "sandbox",
      metadata: { scope: "mealops" },
      lastSyncedAt: new Date().toISOString(),
    });
    const providerLocation = await repository.upsertProviderLocation({
      providerAccountId: account.id,
      provider: "deliverect",
      externalLocationId: "deliverect_location_menu_push",
      externalStoreId: "deliverect_store_menu_push",
      channelLinkId: "channel_link_menu_push",
      channelName: "mealops",
      name: "MealOps - Menu Push Location",
      address: "20 Provider Way",
      timezone: "America/Los_Angeles",
      status: "sandbox",
      rawProviderPayload: {},
      lastSyncedAt: new Date().toISOString(),
    });
    const provisioned = await service.provisionProviderLocation(admin, providerLocation.id);

    const result = await service.ingestDeliverectMenuUpdate({
      channelLinkId: "channel_link_menu_push",
      eventId: "menu_push_event_1",
      items: [
        {
          menuId: "menu_lunch",
          menu: "Lunch",
          categories: [
            {
              name: "Bowls",
              products: [
                {
                  plu: "mealops_bowl_001",
                  name: "MealOps Bowl",
                  description: "Imported from Deliverect push",
                  price: 1499,
                  modifierGroups: [
                    {
                      id: "sauce_group",
                      name: "Sauce",
                      modifiers: [{ plu: "sauce_hot", name: "Hot Sauce", price: 50 }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
    const menu = await service.getMenu(provisioned.restaurant.id);
    const events = await service.listProviderEvents(admin, { provider: "deliverect", limit: 5 });
    const snapshots = await service.listProviderMenuSnapshots(admin, {
      provider: "deliverect",
      restaurantId: provisioned.restaurant.id,
    });
    const versions = await service.listCanonicalMenuVersions(admin, provisioned.restaurant.id);

    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        restaurantId: provisioned.restaurant.id,
        providerLocationId: providerLocation.id,
        channelLinkId: "channel_link_menu_push",
        snapshotId: expect.any(String),
        menuVersionId: expect.any(String),
        itemCount: 1,
        needsReview: 0,
      }),
    );
    expect(menu.version).toEqual(
      expect.objectContaining({
        id: result.menuVersionId,
        status: "published",
        providerMenuSnapshotId: result.snapshotId,
      }),
    );
    expect(menu.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "MealOps Bowl",
          menuVersionId: result.menuVersionId,
          mappingStatus: "mapped",
          posRef: expect.objectContaining({ externalId: "mealops_bowl_001" }),
        }),
      ]),
    );
    expect(snapshots[0]).toEqual(
      expect.objectContaining({
        id: result.snapshotId,
        providerLocationId: providerLocation.id,
        restaurantId: provisioned.restaurant.id,
        channelLinkId: "channel_link_menu_push",
        externalEventId: "menu_push_event_1",
        status: "processed",
      }),
    );
    expect(versions[0]).toEqual(
      expect.objectContaining({
        id: result.menuVersionId,
        providerMenuSnapshotId: result.snapshotId,
        status: "published",
        itemCount: 1,
      }),
    );
    expect(events[0]).toEqual(
      expect.objectContaining({
        eventType: "menu_update",
        externalEventId: "menu_push_event_1",
        status: "processed",
      }),
    );

    const replay = await service.ingestDeliverectMenuUpdate({
      channelLinkId: "channel_link_menu_push",
      eventId: "menu_push_event_1",
      items: [
        {
          menuId: "menu_lunch",
          menu: "Lunch",
          categories: [
            {
              name: "Bowls",
              products: [
                {
                  plu: "mealops_bowl_001",
                  name: "MealOps Bowl",
                  description: "Imported from Deliverect push",
                  price: 1499,
                  modifierGroups: [
                    {
                      id: "sauce_group",
                      name: "Sauce",
                      modifiers: [{ plu: "sauce_hot", name: "Hot Sauce", price: 50 }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
    const replaySnapshots = await service.listProviderMenuSnapshots(admin, {
      provider: "deliverect",
      restaurantId: provisioned.restaurant.id,
    });
    const replayVersions = await service.listCanonicalMenuVersions(admin, provisioned.restaurant.id);

    expect(replay).toEqual(
      expect.objectContaining({
        duplicate: true,
        previousSnapshotId: result.snapshotId,
      }),
    );
    expect(replaySnapshots).toHaveLength(2);
    expect(replaySnapshots[0]).toEqual(expect.objectContaining({ status: "ignored" }));
    expect(replayVersions.filter((version) => version.status === "published")).toHaveLength(1);
  });

  it("records failed Deliverect menu normalization without replacing the current published menu", async () => {
    const service = createService();
    const admin = authenticatedPlatformAdmin();
    const setup = await provisionDeliverectMenuRestaurant(service, "failed_menu");
    const before = await service.getMenu(setup.provisioned.restaurant.id);

    await expect(
      service.ingestDeliverectMenuUpdate({
        channelLinkId: "channel_link_failed_menu",
        eventId: "menu_event_failed_menu_bad",
        items: [{ menu: "Empty", categories: [] }],
      }),
    ).rejects.toThrow("No importable menu items");

    const after = await service.getMenu(setup.provisioned.restaurant.id);
    const snapshots = await service.listProviderMenuSnapshots(admin, {
      provider: "deliverect",
      restaurantId: setup.provisioned.restaurant.id,
      status: "failed",
    });
    const versions = await service.listCanonicalMenuVersions(admin, setup.provisioned.restaurant.id);

    expect(after.version?.id).toBe(before.version?.id);
    expect(after.items.map((item) => item.id)).toEqual(before.items.map((item) => item.id));
    expect(snapshots[0]).toEqual(
      expect.objectContaining({
        status: "failed",
        externalEventId: "menu_event_failed_menu_bad",
        error: expect.stringContaining("No importable menu items"),
      }),
    );
    expect(versions.filter((version) => version.status === "published")).toHaveLength(1);
  });

  it("blocks stale carts when a newer canonical Deliverect menu version is published", async () => {
    const service = createService();
    const setup = await provisionDeliverectMenuRestaurant(service, "version_drift");
    const item = setup.menu.items[0];
    const group = setup.menu.modifierGroups[0];
    const modifier = setup.menu.modifiers[0];
    const oldVersionId = setup.menu.version!.id;

    await service.ingestDeliverectMenuUpdate({
      ...deliverectMenuPayload("version_drift", "menu_event_version_drift_2"),
      updatedAt: "2026-06-09T18:00:00.000Z",
    });

    const validation = await service.validateOrder(
      deliverectOrderIntent(
        setup.provisioned.restaurant.id,
        "stale-cart-version-drift",
        item.id,
        [{ modifier_group_id: group.id, modifier_id: modifier.id, quantity: 1 }],
        { menu_version_id: oldVersionId },
      ),
    );

    expect(validation.valid).toBe(false);
    expect(validation.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "menu_version_stale" }),
      ]),
    );
  });

  it("enforces unavailable item validation from Deliverect canonical menus", async () => {
    const service = createService();
    const setup = await createDeliverectProviderLocation(service, "unavailable_item");
    const provisioned = await service.provisionProviderLocation(authenticatedPlatformAdmin(), setup.providerLocation.id);
    await service.ingestDeliverectMenuUpdate({
      channelLinkId: "channel_link_unavailable_item",
      eventId: "menu_event_unavailable_item",
      items: [
        {
          menu: "Lunch",
          categories: [
            {
              name: "Entrees",
              products: [{ plu: "UNAVAILABLE-ITEM", name: "Unavailable Entree", price: 1200, status: "unavailable" }],
            },
          ],
        },
      ],
    });
    const menu = await service.getMenu(provisioned.restaurant.id);

    const validation = await service.validateOrder(
      deliverectOrderIntent(provisioned.restaurant.id, "unavailable-item-validation", menu.items[0].id, [], {
        menu_version_id: menu.version!.id,
      }),
    );

    expect(validation.valid).toBe(false);
    expect(validation.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "item_unavailable" }),
      ]),
    );
  });

  it("enforces Deliverect modifier required and max-selection rules", async () => {
    const service = createService();
    const setup = await provisionDeliverectMenuRestaurant(service, "modifier_rules");
    const item = setup.menu.items[0];
    const group = setup.menu.modifierGroups[0];
    const [firstModifier, secondModifier] = setup.menu.modifiers;

    const missingRequired = await service.validateOrder(
      deliverectOrderIntent(setup.provisioned.restaurant.id, "missing-required-modifier", item.id, [], {
        menu_version_id: setup.menu.version!.id,
      }),
    );
    const tooMany = await service.validateOrder(
      deliverectOrderIntent(
        setup.provisioned.restaurant.id,
        "too-many-modifiers",
        item.id,
        [
          { modifier_group_id: group.id, modifier_id: firstModifier.id, quantity: 1 },
          { modifier_group_id: group.id, modifier_id: secondModifier.id, quantity: 1 },
        ],
        { menu_version_id: setup.menu.version!.id },
      ),
    );

    expect(missingRequired.valid).toBe(false);
    expect(missingRequired.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "required_modifier_missing" }),
      ]),
    );
    expect(tooMany.valid).toBe(false);
    expect(tooMany.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "too_many_modifiers" }),
      ]),
    );
  });

  it("replaces canonical menus without deleting prior menu records", async () => {
    const service = createService();
    const repository = (service as any).repository as InMemoryPlatformRepository;
    const before = await service.getMenu("rest_lb_steakhouse");
    const oldItem = before.items[0];
    expect(oldItem).toBeTruthy();

    const replacement = await service.replaceCanonicalMenu(
      "rest_lb_steakhouse",
      {
        items: [
          {
            id: "item_imported_bowl",
            restaurantId: "rest_lb_steakhouse",
            category: "Bowls",
            name: "Imported Bowl",
            description: "Imported from Deliverect",
            priceCents: 1299,
            availability: "available",
            mappingStatus: "mapped",
            modifierGroupIds: [],
            posRef: {
              provider: "deliverect",
              externalId: "bowl_001",
            },
          },
        ],
        modifierGroups: [],
        modifiers: [],
        mappings: [
          {
            id: "map_imported_bowl",
            restaurantId: "rest_lb_steakhouse",
            canonicalType: "item",
            canonicalId: "item_imported_bowl",
            provider: "deliverect",
            providerReference: "bowl_001",
            status: "mapped",
          },
        ],
      },
      "Imported test menu.",
    );
    const menu = await service.getMenu("rest_lb_steakhouse");
    const staleItem = ((repository as any).state.menuItems as typeof before.items).find((entry) => entry.id === oldItem.id);

    expect(replacement.items).toHaveLength(1);
    expect(menu.items).toEqual(expect.arrayContaining([expect.objectContaining({ id: "item_imported_bowl" })]));
    expect(staleItem).toEqual(
      expect.objectContaining({
        id: oldItem.id,
        availability: "unavailable",
        mappingStatus: "needs_review",
      }),
    );
  });

  it("creates, rotates, and revokes partner credentials through platform admin methods", async () => {
    const service = createService();
    const admin = authenticatedPlatformAdmin();
    const created = await service.createAdminPartnerCredential(
      admin,
      "partner_coachimhungry",
      "agent_coachimhungry",
      "OpenAI admin pilot",
      ["menus:read"],
      "test",
    );

    expect(created.credential).not.toHaveProperty("keyHash");
    const authenticatedCreated = await service.authenticateAgentKey(created.rawKey);
    expect(authenticatedCreated).toEqual(
      expect.objectContaining({
        partnerId: "partner_coachimhungry",
        credentialType: "partner_credential",
        scopes: ["menus:read"],
      }),
    );

    const rotated = await service.rotateAdminPartnerCredential(
      admin,
      "partner_coachimhungry",
      created.credential.id,
      ["menus:read", "orders:validate"],
      "live",
    );
    await expect(service.authenticateAgentKey(created.rawKey)).rejects.toThrow("Invalid API key.");
    const authenticatedRotated = await service.authenticateAgentKey(rotated.rawKey);
    expect(authenticatedRotated.scopes).toEqual(["menus:read", "orders:validate"]);
    expect(rotated.credential.environment).toBe("live");

    await service.revokeAdminPartnerCredential(admin, "partner_coachimhungry", created.credential.id);
    await expect(service.authenticateAgentKey(rotated.rawKey)).rejects.toThrow("Invalid API key.");
  });

  it("creates a new partner, agent, and credential through separate platform admin methods", async () => {
    const service = createService();
    const admin = authenticatedPlatformAdmin();
    const partner = await service.createAdminPartner(admin, "OpenAI", "platform@openai.com", "approved");
    const agent = await service.createAdminPartnerAgent(
      admin,
      partner.id,
      "OpenAI Ordering Agent",
    );
    const created = await service.createAdminPartnerCredential(
      admin,
      partner.id,
      agent.id,
      "OpenAI pilot access",
      ["restaurants:read", "orders:quote"],
      "test",
    );

    expect(partner).toEqual(
      expect.objectContaining({
        name: "OpenAI",
        slug: "openai",
        contactEmail: "platform@openai.com",
      }),
    );
    expect(agent).toEqual(
      expect.objectContaining({
        partnerId: partner.id,
        name: "OpenAI Ordering Agent",
        slug: "openai-ordering-agent",
      }),
    );
    expect(created.credential).toEqual(
      expect.objectContaining({
        agentId: agent.id,
        partnerId: partner.id,
        label: "OpenAI pilot access",
        scopes: ["restaurants:read", "orders:quote"],
      }),
    );
    expect(created.credential).not.toHaveProperty("keyHash");

    const authenticated = await service.authenticateAgentKey(created.rawKey);
    expect(authenticated).toEqual(
      expect.objectContaining({
        agentId: agent.id,
        partnerId: partner.id,
        credentialType: "partner_credential",
      }),
    );

    const partners = await service.getPlatformAdminPartners(admin);
    const openAiPartner = partners.find((entry) => entry.partner.id === partner.id);
    expect(openAiPartner?.agents.some((entry) => entry.agent.id === agent.id)).toBe(true);
    expect(openAiPartner?.credentials.some((entry) => entry.id === created.credential.id)).toBe(true);
  });

  it("shows approved live partner agents in restaurant access management before restaurant approval", async () => {
    const service = createService();
    const admin = authenticatedPlatformAdmin();
    const partner = await service.createAdminPartner(admin, "Live Partner", "live@example.com", "approved");
    const agent = await service.createAdminPartnerAgent(admin, partner.id, "Live Ordering Agent");
    await service.createAdminPartnerCredential(
      admin,
      partner.id,
      agent.id,
      "Test-only access",
      ["restaurants:read"],
      "test",
    );

    let restaurantAgents = await service.listAgents("rest_lb_steakhouse");
    expect(restaurantAgents.some((entry) => entry.agent.id === agent.id)).toBe(false);

    await service.createAdminPartnerCredential(
      admin,
      partner.id,
      agent.id,
      "Live access",
      ["restaurants:read", "orders:submit"],
      "live",
    );

    restaurantAgents = await service.listAgents("rest_lb_steakhouse");
    const pendingAgent = restaurantAgents.find((entry) => entry.agent.id === agent.id);
    expect(pendingAgent).toEqual(
      expect.objectContaining({
        permissionId: `pending:rest_lb_steakhouse:${agent.id}`,
        permission: expect.objectContaining({
          restaurantId: "rest_lb_steakhouse",
          agentId: agent.id,
          status: "pending",
        }),
      }),
    );

    const allowed = await service.updateAgentPermission("rest_lb_steakhouse", agent.id, "allowed");
    expect(allowed.status).toBe("allowed");
    await expect(service.validateAgentAccess("rest_lb_steakhouse", agent.id)).resolves.toEqual(
      expect.objectContaining({
        agentId: agent.id,
        status: "allowed",
      }),
    );
    await expect(
      service.createAgentApiKey("rest_lb_steakhouse", agent.id, "Restaurant key", ["orders:submit"]),
    ).rejects.toThrow("Partner-managed agent credentials are managed in Phantom Admin.");
  });

  it("edits partner, agent, and credential records without replacing their ids", async () => {
    const service = createService();
    const admin = authenticatedPlatformAdmin();
    const partner = await service.createAdminPartner(admin, "Old Company", "old@example.com", "approved");
    const agent = await service.createAdminPartnerAgent(admin, partner.id, "Old Surface");
    const created = await service.createAdminPartnerCredential(
      admin,
      partner.id,
      agent.id,
      "Old credential",
      ["restaurants:read"],
      "test",
    );

    const editedPartner = await service.updateAdminPartner(
      admin,
      partner.id,
      "New Company",
      "new@example.com",
      "suspended",
    );
    const editedAgent = await service.updateAdminPartnerAgent(admin, partner.id, agent.id, "New Surface");
    const editedCredential = await service.updateAdminPartnerCredential(
      admin,
      partner.id,
      created.credential.id,
      "New credential",
      ["menus:read", "orders:quote"],
      "live",
    );

    expect(editedPartner).toEqual(
      expect.objectContaining({
        id: partner.id,
        name: "New Company",
        slug: "new-company",
        contactEmail: "new@example.com",
        status: "suspended",
      }),
    );
    expect(editedAgent).toEqual(
      expect.objectContaining({
        id: agent.id,
        partnerId: partner.id,
        name: "New Surface",
        slug: "new-surface",
      }),
    );
    expect(editedCredential).toEqual(
      expect.objectContaining({
        id: created.credential.id,
        partnerId: partner.id,
        agentId: agent.id,
        label: "New credential",
        scopes: ["menus:read", "orders:quote"],
        environment: "live",
      }),
    );

    const authenticated = await service.authenticateAgentKey(created.rawKey);
    expect(authenticated).toEqual(
      expect.objectContaining({
        agentId: agent.id,
        partnerId: partner.id,
        credentialId: created.credential.id,
        scopes: ["menus:read", "orders:quote"],
      }),
    );

    const partners = await service.getPlatformAdminPartners(admin);
    const record = partners.find((entry) => entry.partner.id === partner.id);
    expect(record?.partner.name).toBe("New Company");
    expect(record?.agents[0]?.agent.id).toBe(agent.id);
    expect(record?.agents[0]?.agent.name).toBe("New Surface");
    expect(record?.credentials[0]?.id).toBe(created.credential.id);
    expect(record?.credentials[0]?.label).toBe("New credential");
  });

  it("removes partner credentials, agent surfaces, and partners through platform admin methods", async () => {
    const service = createService();
    const admin = authenticatedPlatformAdmin();
    const partner = await service.createAdminPartner(admin, "Removal Partner", "remove@example.com", "approved");
    const agent = await service.createAdminPartnerAgent(admin, partner.id, "Removal Agent");
    const credential = await service.createAdminPartnerCredential(
      admin,
      partner.id,
      agent.id,
      "Removal access",
      ["restaurants:read"],
      "test",
    );

    await service.removeAdminPartnerCredential(admin, partner.id, credential.credential.id);
    await expect(service.authenticateAgentKey(credential.rawKey)).rejects.toThrow("Invalid API key.");
    let partners = await service.getPlatformAdminPartners(admin);
    let removalPartner = partners.find((entry) => entry.partner.id === partner.id);
    expect(removalPartner?.credentials).toHaveLength(0);

    const secondCredential = await service.createAdminPartnerCredential(
      admin,
      partner.id,
      agent.id,
      "Removal access 2",
      ["menus:read"],
      "test",
    );
    await service.removeAdminPartnerAgent(admin, partner.id, agent.id);
    await expect(service.authenticateAgentKey(secondCredential.rawKey)).rejects.toThrow("Invalid API key.");
    partners = await service.getPlatformAdminPartners(admin);
    removalPartner = partners.find((entry) => entry.partner.id === partner.id);
    expect(removalPartner?.agents).toHaveLength(0);
    expect(removalPartner?.credentials).toHaveLength(0);

    await service.removeAdminPartner(admin, partner.id);
    partners = await service.getPlatformAdminPartners(admin);
    expect(partners.some((entry) => entry.partner.id === partner.id)).toBe(false);
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

  it("prevents restaurant-only partner credentials from reading menus", async () => {
    const service = createService();
    const repository = (service as any).repository as InMemoryPlatformRepository;
    repository.state.partnerCredentials[0].scopes = ["restaurants:read"];
    const { server, baseUrl } = await startServer(service);
    openServers.push(server);

    const restaurantsResponse = await fetch(`${baseUrl}/api/agent/restaurants`, {
      headers: { "x-agent-api-key": "coachimhungry_demo_live_local_key" },
    });
    const menuResponse = await fetch(`${baseUrl}/api/agent/restaurants/rest_lb_steakhouse/menu`, {
      headers: { "x-agent-api-key": "coachimhungry_demo_live_local_key" },
    });

    expect(restaurantsResponse.status).toBe(200);
    expect(menuResponse.status).toBe(400);
    expect(await menuResponse.json()).toEqual({ error: "Agent API key is missing required scope: menus:read." });
  });

  it("rejects legacy restaurant API keys for partner-managed agents", async () => {
    const service = createService();
    const repository = (service as any).repository as InMemoryPlatformRepository;
    repository.state.partnerCredentials = [];

    await expect(service.authenticateAgentKey("coachimhungry_demo_live_local_key")).rejects.toThrow("Invalid API key.");
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
          posProvider: "mock",
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

  it("rejects provider events when a configured webhook secret is missing or wrong", async () => {
    const service = createServiceWithEnv({ deliverectWebhookSecret: "deliverect-secret" });
    const { server, baseUrl } = await startServer(service);
    openServers.push(server);

    const missing = await fetch(`${baseUrl}/api/internal/events/deliverect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "evt_missing_secret", type: "checkout.completed" }),
    });
    const wrong = await fetch(`${baseUrl}/api/internal/events/deliverect`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-deliverect-webhook-secret": "wrong" },
      body: JSON.stringify({ id: "evt_wrong_secret", type: "checkout.completed" }),
    });
    const accepted = await fetch(`${baseUrl}/api/internal/events/deliverect`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-deliverect-webhook-secret": "deliverect-secret" },
      body: JSON.stringify({ id: "evt_right_secret", type: "checkout.completed" }),
    });

    expect(missing.status).toBe(400);
    expect(await missing.json()).toEqual({ error: "deliverect webhook verification failed." });
    expect(wrong.status).toBe(400);
    expect(accepted.status).toBe(200);
    expect((await accepted.json()).provider).toBe("deliverect");
  });

  it("accepts Deliverect menu update webhooks and imports the mapped restaurant menu", async () => {
    const service = createServiceWithEnv({ deliverectWebhookSecret: "deliverect-secret" });
    const repository = (service as any).repository as InMemoryPlatformRepository;
    const admin = authenticatedPlatformAdmin();
    const account = await repository.upsertProviderAccount({
      provider: "deliverect",
      externalAccountId: "acct_deliverect_route_menu_push",
      displayName: "MealOps Deliverect Route Menu Push",
      environment: "sandbox",
      status: "sandbox",
      metadata: { scope: "mealops" },
      lastSyncedAt: new Date().toISOString(),
    });
    const providerLocation = await repository.upsertProviderLocation({
      providerAccountId: account.id,
      provider: "deliverect",
      externalLocationId: "deliverect_route_location",
      externalStoreId: "deliverect_route_store",
      channelLinkId: "channel_link_route_menu_push",
      channelName: "mealops",
      name: "MealOps - Route Menu Push",
      status: "sandbox",
      rawProviderPayload: {},
      lastSyncedAt: new Date().toISOString(),
    });
    const provisioned = await service.provisionProviderLocation(admin, providerLocation.id);
    const { server, baseUrl } = await startServer(service);
    openServers.push(server);
    const menuPushPayload = {
      channelLinkId: "channel_link_route_menu_push",
      eventId: "route_menu_push_event",
      items: [
        {
          menu: "Lunch",
          categories: [
            {
              name: "Sandwiches",
              products: [{ plu: "route_sando_001", name: "Route Sandwich", price: 1199 }],
            },
          ],
        },
      ],
    };
    const rawPayload = JSON.stringify(menuPushPayload);
    const hmacSignature = createHmac("sha256", "channel_link_route_menu_push").update(rawPayload, "utf8").digest("hex");

    const response = await fetch(`${baseUrl}/api/webhooks/deliverect/channel/menu`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Server-Authorization-HMAC-SHA256": hmacSignature,
      },
      body: rawPayload,
    });
    const payload = await response.json();
    const menu = await service.getMenu(provisioned.restaurant.id);

    expect(response.status).toBe(200);
    expect(payload).toEqual(
      expect.objectContaining({
        ok: true,
        restaurantId: provisioned.restaurant.id,
        channelLinkId: "channel_link_route_menu_push",
        itemCount: 1,
      }),
    );
    expect(menu.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "Route Sandwich",
          posRef: expect.objectContaining({ externalId: "route_sando_001" }),
        }),
      ]),
    );
  });

  it("registers a Deliverect Channel link and returns the required webhook URLs", async () => {
    const service = createServiceWithEnv({
      deliverectBaseUrl: "https://api.staging.deliverect.com",
      deliverectAccountId: "acct_route_registration",
      deliverectScope: "mealops",
    });
    const repository = (service as any).repository as InMemoryPlatformRepository;
    await repository.upsertProviderAccount({
      provider: "deliverect",
      externalAccountId: "acct_route_registration",
      displayName: "MealOps Deliverect Registration",
      environment: "sandbox",
      status: "sandbox",
      metadata: { scope: "mealops" },
      lastSyncedAt: new Date().toISOString(),
    });
    const { server, baseUrl } = await startServer(service);
    openServers.push(server);

    const discovery = await fetch(`${baseUrl}/api/webhooks/deliverect/channel`, {
      headers: {
        "x-forwarded-proto": "https",
        "x-forwarded-host": "phantom.example.test",
      },
    });
    const response = await fetch(`${baseUrl}/api/webhooks/deliverect/channel/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-proto": "https",
        "x-forwarded-host": "phantom.example.test",
      },
      body: JSON.stringify({
        status: "active",
        channelLocationId: "external_loc_123",
        channelLinkId: "channel_link_registered",
        locationId: "deliverect_loc_123",
        channelLinkName: "MealOps",
      }),
    });
    const payload = await response.json();
    const discoveryPayload = await discovery.json();
    const providerLocations = await repository.listProviderLocations();

    expect(discovery.status).toBe(200);
    expect(discoveryPayload).toEqual(
      expect.objectContaining({
        statusUpdateURL: "https://phantom.example.test/api/webhooks/deliverect/channel/order-status",
        menuUpdateURL: "https://phantom.example.test/api/webhooks/deliverect/channel/menu",
        snoozeUnsnoozeURL: "https://phantom.example.test/api/webhooks/deliverect/channel/snooze",
        busyModeURL: "https://phantom.example.test/api/webhooks/deliverect/channel/busy-mode",
        updatePrepTimeURL: "https://phantom.example.test/api/webhooks/deliverect/channel/prep-time",
        courierUpdateURL: "https://phantom.example.test/api/webhooks/deliverect/channel/courier",
        paymentUpdateURL: "https://phantom.example.test/api/webhooks/deliverect/channel/payment",
      }),
    );
    expect(response.status).toBe(200);
    expect(payload).toEqual(
      expect.objectContaining({
        statusUpdateURL: "https://phantom.example.test/api/webhooks/deliverect/channel/order-status",
        menuUpdateURL: "https://phantom.example.test/api/webhooks/deliverect/channel/menu",
        snoozeUnsnoozeURL: "https://phantom.example.test/api/webhooks/deliverect/channel/snooze",
        busyModeURL: "https://phantom.example.test/api/webhooks/deliverect/channel/busy-mode",
      }),
    );
    expect(providerLocations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          externalLocationId: "deliverect_loc_123",
          channelLinkId: "channel_link_registered",
          channelName: "mealops",
          status: "connected",
        }),
      ]),
    );
  });

  it("handles duplicate Deliverect Channel registration webhooks idempotently", async () => {
    const service = createServiceWithEnv({
      deliverectBaseUrl: "https://api.staging.deliverect.com",
      deliverectAccountId: "acct_duplicate_registration",
      deliverectScope: "mealops",
    });
    const payload = {
      eventId: "evt_duplicate_registration",
      status: "active",
      channelLocationId: "external_duplicate_loc",
      channelLinkId: "channel_link_duplicate_registration",
      locationId: "deliverect_duplicate_loc",
      channelLinkName: "MealOps Duplicate",
    };

    const first = await service.ingestDeliverectChannelRegistration(payload, "https://staging-phantom.up.railway.app");
    const second = await service.ingestDeliverectChannelRegistration(payload, "https://staging-phantom.up.railway.app");
    const locations = await service.listProviderLocations(authenticatedPlatformAdmin());
    const events = await service.listProviderEvents(authenticatedPlatformAdmin(), { provider: "deliverect" });

    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
    expect(second.webhooks.menuUpdateURL).toBe("https://staging-phantom.up.railway.app/api/webhooks/deliverect/channel/menu");
    expect(locations.filter((location) => location.channelLinkId === "channel_link_duplicate_registration")).toHaveLength(1);
    expect(events.filter((event) => event.externalEventId === "evt_duplicate_registration")).toHaveLength(1);
  });

  it("applies Deliverect Channel snooze updates to canonical item availability", async () => {
    const service = createService();
    const repository = (service as any).repository as InMemoryPlatformRepository;
    const admin = authenticatedPlatformAdmin();
    const account = await repository.upsertProviderAccount({
      provider: "deliverect",
      externalAccountId: "acct_deliverect_snooze",
      displayName: "MealOps Deliverect Snooze",
      environment: "sandbox",
      status: "sandbox",
      metadata: { scope: "mealops" },
      lastSyncedAt: new Date().toISOString(),
    });
    const providerLocation = await repository.upsertProviderLocation({
      providerAccountId: account.id,
      provider: "deliverect",
      externalLocationId: "deliverect_snooze_location",
      channelLinkId: "channel_link_snooze",
      channelName: "mealops",
      name: "MealOps - Snooze Location",
      status: "sandbox",
      rawProviderPayload: {},
      lastSyncedAt: new Date().toISOString(),
    });
    const provisioned = await service.provisionProviderLocation(admin, providerLocation.id);
    await service.replaceCanonicalMenu(provisioned.restaurant.id, {
      items: [
        {
          id: "item_deliverect_snooze_burger",
          restaurantId: provisioned.restaurant.id,
          category: "Burgers",
          name: "Snooze Burger",
          description: "",
          priceCents: 1299,
          availability: "available",
          mappingStatus: "mapped",
          modifierGroupIds: [],
          posRef: { provider: "deliverect", externalId: "BURG-SNOOZE" },
        },
      ],
      modifierGroups: [],
      modifiers: [],
      mappings: [
        {
          id: "map_deliverect_snooze_burger",
          restaurantId: provisioned.restaurant.id,
          canonicalType: "item",
          canonicalId: "item_deliverect_snooze_burger",
          provider: "deliverect",
          providerReference: "BURG-SNOOZE",
          status: "mapped",
        },
      ],
    });

    const result = await service.ingestDeliverectChannelSnoozeUpdate({
      accountId: "acct_deliverect_snooze",
      locationId: "deliverect_snooze_location",
      channelLinkId: "channel_link_snooze",
      operations: [
        {
          action: "snooze",
          data: {
            items: [{ plu: "BURG-SNOOZE", snoozeStart: "2026-06-09T18:00:00Z", snoozeEnd: "2026-06-09T20:00:00Z" }],
          },
        },
      ],
    });
    const menu = await service.getMenu(provisioned.restaurant.id);

    expect(result.changedItemCount).toBe(1);
    expect(menu.items[0]).toEqual(expect.objectContaining({ availability: "unavailable" }));
  });

  it("applies Deliverect unsnooze and busy mode updates idempotently", async () => {
    const service = createService();
    const admin = authenticatedPlatformAdmin();
    const setup = await provisionDeliverectMenuRestaurant(service, "busy_unsnooze");
    const item = setup.menu.items[0];

    const snooze = await service.ingestDeliverectChannelSnoozeUpdate({
      eventId: "evt_busy_unsnooze_snooze",
      channelLinkId: "channel_link_busy_unsnooze",
      operations: [
        {
          action: "snooze",
          data: { items: [{ plu: item.posRef.externalId }] },
        },
      ],
    });
    const unsnooze = await service.ingestDeliverectChannelSnoozeUpdate({
      eventId: "evt_busy_unsnooze_unsnooze",
      channelLinkId: "channel_link_busy_unsnooze",
      operations: [
        {
          action: "unsnooze",
          data: { items: [{ plu: item.posRef.externalId }] },
        },
      ],
    });
    const busy = await service.ingestDeliverectChannelBusyMode({
      eventId: "evt_busy_unsnooze_busy",
      channelLinkId: "channel_link_busy_unsnooze",
      status: "paused",
      until: "2026-06-09T20:00:00.000Z",
    });
    const replayBusy = await service.ingestDeliverectChannelBusyMode({
      eventId: "evt_busy_unsnooze_busy",
      channelLinkId: "channel_link_busy_unsnooze",
      status: "paused",
      until: "2026-06-09T20:00:00.000Z",
    });
    const menu = await service.getMenu(setup.provisioned.restaurant.id);
    const locations = await service.listProviderLocations(admin, setup.account.id);

    expect(snooze.changedItemCount).toBe(1);
    expect(unsnooze.changedItemCount).toBe(1);
    expect(menu.items[0]).toEqual(expect.objectContaining({ availability: "available" }));
    expect(busy.providerLocationStatus).toBe("disabled");
    expect(replayBusy.eventId).toBe(busy.eventId);
    expect(locations[0].rawProviderPayload.channelState).toEqual(
      expect.objectContaining({
        busyMode: expect.objectContaining({
          payload: expect.objectContaining({ status: "paused" }),
        }),
      }),
    );
  });

  it("lists and returns provider event ingestion records for platform admins", async () => {
    const service = createService();
    const admin = authenticatedPlatformAdmin();
    const event = await service.ingestProviderEvent("deliverect", "checkout.completed", {
      id: "evt_deliverect_admin_list",
      type: "checkout.completed",
      status: "completed",
      metadata: {
        phantomOrderReference: "missing-order-reference",
      },
    });

    const events = await service.listProviderEvents(admin, { provider: "deliverect", status: "ignored", limit: 10 });
    const detail = await service.getProviderEvent(admin, event.id);

    expect(events).toEqual([expect.objectContaining({ id: event.id, provider: "deliverect", status: "ignored" })]);
    expect(detail).toEqual(expect.objectContaining({ id: event.id, externalEventId: "evt_deliverect_admin_list" }));
  });

  it("exposes provider event ingestion records through the platform admin API", async () => {
    const service = createService();
    const { server, baseUrl } = await startServer(service);
    openServers.push(server);
    const event = await service.ingestProviderEvent("deliverect", "checkout.completed", {
      id: "evt_deliverect_admin_api",
      type: "checkout.completed",
      status: "completed",
      authorization: "Bearer should-not-leak",
      payment: {
        cardNumber: "4242424242424242",
      },
      metadata: {
        phantomOrderReference: "missing-order-reference",
      },
    });

    const unauthorized = await fetch(`${baseUrl}/api/admin/provider-events?provider=deliverect`);
    const adminLogin = await fetch(`${baseUrl}/api/admin/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "akayla@mealops.ai", password: "password" }),
    });
    const adminCookie = adminLogin.headers.get("set-cookie") ?? "";
    const list = await fetch(`${baseUrl}/api/admin/provider-events?provider=deliverect&status=ignored&limit=5`, {
      headers: { cookie: adminCookie },
    });
    const detail = await fetch(`${baseUrl}/api/admin/provider-events/${event.id}`, {
      headers: { cookie: adminCookie },
    });

    expect(unauthorized.status).toBe(401);
    expect(adminLogin.status).toBe(200);
    expect(list.status).toBe(200);
    expect(await list.json()).toEqual([
      expect.objectContaining({ id: event.id, provider: "deliverect", status: "ignored" }),
    ]);
    expect(detail.status).toBe(200);
    expect(await detail.json()).toEqual(
      expect.objectContaining({
        id: event.id,
        payload: expect.objectContaining({
          authorization: "[redacted]",
          payment: "[redacted]",
        }),
      }),
    );
  });

  it("exposes safe Deliverect webhook and menu debug summaries for platform admins", async () => {
    const service = createService();
    const setup = await createDeliverectProviderLocation(service, "debug_admin");
    const provisioned = await service.provisionProviderLocation(authenticatedPlatformAdmin(), setup.providerLocation.id);
    await service.ingestDeliverectMenuUpdate({
      ...deliverectMenuPayload("debug_admin"),
      clientSecret: "menu-secret-should-not-leak",
    });
    const { server, baseUrl } = await startServer(service);
    openServers.push(server);

    const unauthorized = await fetch(`${baseUrl}/api/admin/debug/deliverect/webhooks?limit=5`);
    const adminLogin = await fetch(`${baseUrl}/api/admin/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "akayla@mealops.ai", password: "password" }),
    });
    const adminCookie = adminLogin.headers.get("set-cookie") ?? "";
    const webhookResponse = await fetch(`${baseUrl}/api/admin/debug/deliverect/webhooks?limit=5`, {
      headers: { cookie: adminCookie },
    });
    const menuResponse = await fetch(`${baseUrl}/api/admin/debug/deliverect/menus?channelLinkId=channel_link_debug_admin&limit=5`, {
      headers: { cookie: adminCookie },
    });
    const snapshotList = await service.listProviderMenuSnapshots(authenticatedPlatformAdmin(), {
      provider: "deliverect",
      restaurantId: provisioned.restaurant.id,
      limit: 1,
    });
    const snapshotDetail = await fetch(`${baseUrl}/api/admin/provider-menu-snapshots/${snapshotList[0].id}`, {
      headers: { cookie: adminCookie },
    });

    const webhookSummary = await webhookResponse.json();
    const menuSummary = await menuResponse.json();
    const snapshotDetailPayload = await snapshotDetail.json();

    expect(unauthorized.status).toBe(401);
    expect(webhookResponse.status).toBe(200);
    expect(JSON.stringify(webhookSummary)).not.toContain("menu-secret-should-not-leak");
    expect(webhookSummary.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: "menu_update",
          processingStatus: "processed",
          restaurantId: provisioned.restaurant.id,
          channelLinkId: "channel_link_debug_admin",
        }),
      ]),
    );
    expect(menuResponse.status).toBe(200);
    expect(menuSummary.items).toEqual([
      expect.objectContaining({
        provider: "deliverect",
        channelLinkId: "channel_link_debug_admin",
        normalizationStatus: "processed",
        itemCount: 1,
        modifierGroupCount: 1,
        latestPublishedCanonicalMenuVersion: expect.objectContaining({ status: "published" }),
        availabilitySummary: expect.objectContaining({
          items: expect.objectContaining({ available: 1, unavailable: 0 }),
        }),
      }),
    ]);
    expect(snapshotDetailPayload.rawPayload.clientSecret).toBe("[redacted]");
  });

  it("processes Deliverect checkout events into Phantom order status updates", async () => {
    const service = createService();
    const order = await submitSampleOrder(service, "deliverect-event-ref-1");

    const event = await service.ingestProviderEvent("deliverect", "checkout.completed", {
      id: "evt_deliverect_completed_1",
      type: "checkout.completed",
      checkoutId: "checkout_deliverect_1",
      status: "completed",
      metadata: {
        phantomOrderReference: "deliverect-event-ref-1",
      },
    });
    const detail = await service.getOrder(order.restaurantId, order.id);

    expect(event.status).toBe("processed");
    expect(event.orderId).toBe(order.id);
    expect(detail.order.status).toBe("completed");
    expect(detail.statusEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          orderId: order.id,
          status: "completed",
          message: "Deliverect checkout.completed reported completed.",
        }),
      ]),
    );
  });

  it("deduplicates repeated Deliverect events by external event id", async () => {
    const service = createService();
    const order = await submitSampleOrder(service, "deliverect-event-ref-dedupe");
    const payload = {
      id: "evt_deliverect_duplicate_1",
      type: "checkout.completed",
      checkoutId: "checkout_deliverect_duplicate_1",
      status: "completed",
      metadata: {
        phantomOrderReference: "deliverect-event-ref-dedupe",
      },
    };

    const first = await service.ingestProviderEvent("deliverect", "checkout.completed", payload);
    const second = await service.ingestProviderEvent("deliverect", "checkout.completed", payload);
    const detail = await service.getOrder(order.restaurantId, order.id);
    const completedEvents = detail.statusEvents.filter((event) => event.status === "completed");

    expect(second.id).toBe(first.id);
    expect(second.status).toBe("processed");
    expect(completedEvents).toHaveLength(1);
  });

  it("stores unknown Deliverect order statuses without changing Phantom order state and replays safely", async () => {
    const service = createService();
    const order = await submitSampleOrder(service, "deliverect-event-ref-unknown");
    const before = await service.getOrder(order.restaurantId, order.id);
    const payload = {
      id: "evt_deliverect_unknown_status",
      type: "order_status",
      status: "waiting_for_provider_magic",
      channelOrderId: "deliverect-event-ref-unknown",
      timeStamp: "2026-06-09T18:30:00.000Z",
    };

    const first = await service.ingestProviderEvent("deliverect", "order_status", payload);
    const replay = await service.ingestProviderEvent("deliverect", "order_status", payload);
    const after = await service.getOrder(order.restaurantId, order.id);

    expect(first.status).toBe("received");
    expect(replay.id).toBe(first.id);
    expect(after.order.status).toBe(before.order.status);
    expect(after.statusEvents.filter((event) => event.providerEventId === "evt_deliverect_unknown_status")).toHaveLength(0);
  });

  it("ignores out-of-order Deliverect events after terminal statuses", async () => {
    const service = createService();
    const order = await submitSampleOrder(service, "deliverect-event-ref-terminal");

    const completed = await service.ingestProviderEvent("deliverect", "checkout.completed", {
      id: "evt_deliverect_terminal_completed",
      type: "checkout.completed",
      status: "completed",
      metadata: {
        phantomOrderReference: "deliverect-event-ref-terminal",
      },
    });
    const stale = await service.ingestProviderEvent("deliverect", "checkout.accepted", {
      id: "evt_deliverect_terminal_accepted",
      type: "checkout.accepted",
      status: "accepted",
      metadata: {
        phantomOrderReference: "deliverect-event-ref-terminal",
      },
    });
    const detail = await service.getOrder(order.restaurantId, order.id);

    expect(completed.status).toBe("processed");
    expect(stale.status).toBe("ignored");
    expect(detail.order.status).toBe("completed");
    expect(detail.statusEvents).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: "accepted",
          message: "Deliverect checkout.accepted reported accepted.",
        }),
      ]),
    );
  });

  it("retries transient Deliverect create-order failures and records retry history", async () => {
    const service = createServiceWithEnv({
      deliverectBaseUrl: "https://deliverect.staging.test",
      deliverectAccessToken: "staging-token",
      deliverectScope: "mealops",
      deliverectRequestTimeoutMs: 1000,
      posRetryBaseDelayMs: 1,
    });
    const setup = await provisionDeliverectMenuRestaurant(service, "retry_success");
    const item = setup.menu.items[0];
    const group = setup.menu.modifierGroups[0];
    const modifier = setup.menu.modifiers[0];
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: "temporary outage" }), { status: 500 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ channelOrderId: "deliverect_retry_order_1" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const order = await service.submitAgentOrder(
      deliverectOrderIntent(
        setup.provisioned.restaurant.id,
        "deliverect-retry-success",
        item.id,
        [{ modifier_group_id: group.id, modifier_id: modifier.id, quantity: 1 }],
        { menu_version_id: setup.menu.version!.id },
      ),
    );
    const submission = await service.submitOrderToPOS(setup.provisioned.restaurant.id, order.id);
    const detail = await service.getOrder(setup.provisioned.restaurant.id, order.id);
    const submittedPayload = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0][0])).toBe("https://deliverect.staging.test/mealops/order/channel_link_retry_success");
    expect(submission).toEqual(
      expect.objectContaining({
        status: "submitted",
        externalOrderId: "deliverect_retry_order_1",
      }),
    );
    expect(submittedPayload).toEqual(
      expect.objectContaining({
        channelLinkId: "channel_link_retry_success",
        items: [
          expect.objectContaining({
            plu: "ENTREE-retry_success",
            subItems: [expect.objectContaining({ plu: "SAUCE-A-retry_success" })],
          }),
        ],
      }),
    );
    expect(detail.retries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ stage: "pos_submit", attemptNumber: 1, status: "failed" }),
        expect.objectContaining({ stage: "pos_submit", attemptNumber: 2, status: "succeeded" }),
      ]),
    );
  });

  it("does not duplicate Deliverect create-order calls for repeated POS submissions", async () => {
    const service = createServiceWithEnv({
      deliverectBaseUrl: "https://deliverect.staging.test",
      deliverectAccessToken: "staging-token",
      deliverectScope: "mealops",
      posRetryBaseDelayMs: 1,
    });
    const setup = await provisionDeliverectMenuRestaurant(service, "duplicate_submit");
    const item = setup.menu.items[0];
    const group = setup.menu.modifierGroups[0];
    const modifier = setup.menu.modifiers[0];
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ channelOrderId: "deliverect_duplicate_order_1" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const order = await service.submitAgentOrder(
      deliverectOrderIntent(
        setup.provisioned.restaurant.id,
        "deliverect-duplicate-submit",
        item.id,
        [{ modifier_group_id: group.id, modifier_id: modifier.id, quantity: 1 }],
        { menu_version_id: setup.menu.version!.id },
      ),
    );
    const first = await service.submitOrderToPOS(setup.provisioned.restaurant.id, order.id);
    const second = await service.submitOrderToPOS(setup.provisioned.restaurant.id, order.id);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(second.id).toBe(first.id);
    expect(second.externalOrderId).toBe("deliverect_duplicate_order_1");
  });

  it("stores permanent Deliverect create-order failures for debugging", async () => {
    const service = createServiceWithEnv({
      deliverectBaseUrl: "https://deliverect.staging.test",
      deliverectAccessToken: "staging-token",
      deliverectScope: "mealops",
      posRetryBaseDelayMs: 1,
    });
    const setup = await provisionDeliverectMenuRestaurant(service, "permanent_failure");
    const item = setup.menu.items[0];
    const group = setup.menu.modifierGroups[0];
    const modifier = setup.menu.modifiers[0];
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ message: "invalid channel order" }), { status: 400 }));
    vi.stubGlobal("fetch", fetchMock);

    const order = await service.submitAgentOrder(
      deliverectOrderIntent(
        setup.provisioned.restaurant.id,
        "deliverect-permanent-failure",
        item.id,
        [{ modifier_group_id: group.id, modifier_id: modifier.id, quantity: 1 }],
        { menu_version_id: setup.menu.version!.id },
      ),
    );
    const submission = await service.submitOrderToPOS(setup.provisioned.restaurant.id, order.id);
    const detail = await service.getOrder(setup.provisioned.restaurant.id, order.id);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(submission).toEqual(
      expect.objectContaining({
        status: "failed",
        externalOrderId: undefined,
        response: { message: "invalid channel order" },
      }),
    );
    expect(detail.order.status).toBe("failed");
    expect(detail.retries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          stage: "pos_submit",
          attemptNumber: 1,
          status: "succeeded",
          responseSnapshot: expect.objectContaining({ status: "failed" }),
        }),
      ]),
    );
  });

  it("exposes recent Deliverect order submission debug summaries for platform admins", async () => {
    const service = createServiceWithEnv({
      deliverectBaseUrl: "https://deliverect.staging.test",
      deliverectAccessToken: "staging-token",
      deliverectScope: "mealops",
      posRetryBaseDelayMs: 1,
    });
    const setup = await provisionDeliverectMenuRestaurant(service, "order_debug");
    const item = setup.menu.items[0];
    const group = setup.menu.modifierGroups[0];
    const modifier = setup.menu.modifiers[0];
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ message: "invalid channel order" }), { status: 400 })));
    const order = await service.submitAgentOrder(
      deliverectOrderIntent(
        setup.provisioned.restaurant.id,
        "deliverect-order-debug",
        item.id,
        [{ modifier_group_id: group.id, modifier_id: modifier.id, quantity: 1 }],
        { menu_version_id: setup.menu.version!.id },
      ),
    );
    await service.submitOrderToPOS(setup.provisioned.restaurant.id, order.id);
    vi.unstubAllGlobals();
    const { server, baseUrl } = await startServer(service);
    openServers.push(server);
    const adminLogin = await fetch(`${baseUrl}/api/admin/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "akayla@mealops.ai", password: "password" }),
    });
    const adminCookie = adminLogin.headers.get("set-cookie") ?? "";
    const response = await fetch(`${baseUrl}/api/admin/debug/deliverect/orders?channelLinkId=channel_link_order_debug&limit=5`, {
      headers: { cookie: adminCookie },
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.items).toEqual([
      expect.objectContaining({
        phantomOrderId: order.id,
        provider: "deliverect",
        channelLinkId: "channel_link_order_debug",
        canonicalStatus: "failed",
        submissionAttempts: 1,
        lastError: "invalid channel order",
        idempotencyKey: "submit:deliverect-order-debug",
        duplicateReuseAvailable: false,
        safeToRetry: true,
      }),
    ]);
  });

  it("discovers Olo onboarding locations through the backend API", async () => {
    const service = createService();
    const { server, baseUrl } = await startServer(service);
    openServers.push(server);

    const response = await fetch(`${baseUrl}/api/onboarding/discover`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "olo", query: "Palo Alto" }),
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.provider).toBe("olo");
    expect(payload.locations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "Green Leaf Salads - Palo Alto",
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
        provider: "olo",
        providerAccountId: "acct_olo_demo_001",
        providerLocationIds: ["olo_loc_1", "olo_loc_2"],
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
    expect(fetched.providerLocationIds).toEqual(["olo_loc_1", "olo_loc_2"]);
  });

  it("activates onboarding and signs the operator into the console", async () => {
    const service = createService();
    const { server, baseUrl } = await startServer(service);
    openServers.push(server);

    const response = await fetch(`${baseUrl}/api/onboarding/activate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: "pos",
        providerAccountId: "acct_pos_demo_001",
        providerLocationIds: ["pos_loc_1", "pos_loc_2"],
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
    expect(payload.restaurants.some((restaurant: { id: string }) => restaurant.id === "rest_green_leaf_salads")).toBe(true);
    expect(payload.selectedMembership.restaurantId).toBe("rest_green_leaf_salads");
    expect(posResponse.status).toBe(200);
    expect(posConnection.lastSyncedAt).toBeTruthy();
    expect(menu.items.length).toBeGreaterThan(0);
    expect(menu.items.some((item: { name: string }) => item.name === "Kale Caesar")).toBe(true);
  });

  it("still loads inherited menu data when an onboarding restaurant is missing explicit template metadata", async () => {
    const service = createService();
    const repository = (service as any).repository as InMemoryPlatformRepository;
    const authenticated = await repository.createOnboardingOperatorAccount({
      activation: {
        provider: "pos",
        providerAccountId: "acct_pos_demo_001",
        providerLocationIds: ["pos_loc_3"],
        fullName: "Chain Owner",
        email: "fallback.owner@example.com",
        password: "password123",
      },
      accountName: "Green Leaf Salads",
      locations: [
        {
          id: "pos_loc_3",
          name: "Green Leaf Salads - Palo Alto",
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
        accountName: "Green Leaf Salads",
        providerLocationId: "pos_loc_3",
      },
    });

    const menu = await service.getMenu(createdRestaurantId);
    expect(menu.items.length).toBeGreaterThan(0);
    expect(menu.items.some((item) => item.name === "Kale Caesar")).toBe(true);
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

  it("uses a separate Phantom Admin cookie from the restaurant console session", async () => {
    const service = createService();
    const { server, baseUrl } = await startServer(service);
    openServers.push(server);
    const restaurantLogin = await loginOperator(baseUrl);

    const adminWithRestaurantCookie = await fetch(`${baseUrl}/api/admin/partners`, {
      headers: { cookie: restaurantLogin.cookie },
    });
    const adminLogin = await fetch(`${baseUrl}/api/admin/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "akayla@mealops.ai", password: "password" }),
    });
    const adminCookie = adminLogin.headers.get("set-cookie") ?? "";
    const adminPartners = await fetch(`${baseUrl}/api/admin/partners`, {
      headers: { cookie: adminCookie },
    });
    const restaurantList = await fetch(`${baseUrl}/api/restaurants`, {
      headers: { cookie: restaurantLogin.cookie },
    });

    expect(adminWithRestaurantCookie.status).toBe(401);
    expect(adminLogin.status).toBe(200);
    expect(adminCookie).toContain("phantom_admin_session=");
    expect(adminCookie).not.toContain("phantom_restaurant_session=");
    expect(adminPartners.status).toBe(200);
    expect(restaurantList.status).toBe(200);
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
