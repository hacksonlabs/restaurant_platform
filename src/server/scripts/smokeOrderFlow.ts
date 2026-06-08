import fs from "node:fs/promises";
import path from "node:path";
import { getEnv } from "../config/env";

interface SessionState {
  cookie: string;
}

async function requestJson<T>(url: string, init: RequestInit = {}, session?: SessionState): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(session?.cookie ? { Cookie: session.cookie } : {}),
      ...(init.headers ?? {}),
    },
  });
  const setCookie = response.headers.get("set-cookie");
  if (setCookie && session) {
    session.cookie = setCookie.split(";")[0];
  }
  const payloadText = await response.text();
  const payload = payloadText ? JSON.parse(payloadText) : null;
  if (!response.ok) {
    throw new Error(`${response.status} ${payload?.error ?? payloadText}`);
  }
  return payload as T;
}

async function main() {
  const env = getEnv();
  const baseUrl = `http://localhost:${env.port}`;
  const adminSession: SessionState = { cookie: "" };

  await requestJson(`${baseUrl}/api/auth/login`, {
    method: "POST",
    body: JSON.stringify({
      email: env.restaurantAuthEmail,
      password: env.restaurantAuthPassword,
    }),
  }, adminSession);

  const restaurants = await requestJson<Array<{ id: string; name: string }>>(`${baseUrl}/api/restaurants`, {}, adminSession);
  const restaurant = restaurants.find((entry) => entry.id === env.restaurantAuthRestaurantId);
  if (!restaurant) {
    throw new Error(`Restaurant ${env.restaurantAuthRestaurantId} not found in admin API.`);
  }

  const menu = await requestJson<{ items: Array<{ id: string }>; mappings: Array<{ id: string }> }>(
    `${baseUrl}/api/restaurants/${restaurant.id}/menu`,
    {},
    adminSession,
  );
  if (menu.items.length === 0 || menu.mappings.length === 0) {
    throw new Error("Menu or mappings were empty during smoke test.");
  }

  const samplePath = path.resolve(process.cwd(), "examples/sample-agent-order.json");
  const sample = JSON.parse(await fs.readFile(samplePath, "utf8"));
  sample.external_order_reference = `smoke-${Date.now()}`;
  sample.requested_fulfillment_time = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
  sample.metadata = { ...(sample.metadata ?? {}), source: "smoke_script" };

  const agentHeaders = {
    "Content-Type": "application/json",
    "x-agent-api-key": env.demoPhantomApiKey,
  };

  const validation = await requestJson<{ valid: boolean }>(
    `${baseUrl}/api/agent/restaurants/${restaurant.id}/orders/validate`,
    { method: "POST", headers: agentHeaders, body: JSON.stringify(sample) },
  );
  if (!validation.valid) {
    throw new Error("Smoke validation request failed.");
  }

  const quote = await requestJson<{ totalCents: number }>(
    `${baseUrl}/api/agent/restaurants/${restaurant.id}/orders/quote`,
    { method: "POST", headers: agentHeaders, body: JSON.stringify(sample) },
  );
  if (!quote.totalCents) {
    throw new Error("Smoke quote request returned no total.");
  }

  const order = await requestJson<{ id: string; status: string }>(
    `${baseUrl}/api/agent/restaurants/${restaurant.id}/orders/submit`,
    { method: "POST", headers: agentHeaders, body: JSON.stringify(sample) },
  );
  let submittedToPosViaApproval = false;
  if (order.status === "needs_approval") {
    await requestJson(
      `${baseUrl}/api/restaurants/${restaurant.id}/orders/${order.id}/approve`,
      { method: "POST" },
      adminSession,
    );
    submittedToPosViaApproval = true;
  }

  if (!submittedToPosViaApproval) {
    await requestJson(
      `${baseUrl}/api/restaurants/${restaurant.id}/orders/${order.id}/submit-to-pos`,
      { method: "POST" },
      adminSession,
    );
  }

  const orderDetail = await requestJson<{
    order: { id: string; status: string };
    validationResults: Array<unknown>;
    quotes: Array<unknown>;
    submissions: Array<{ externalOrderId?: string }>;
    statusEvents: Array<{ status: string }>;
  }>(`${baseUrl}/api/restaurants/${restaurant.id}/orders/${order.id}`, {}, adminSession);

  if (orderDetail.validationResults.length === 0 || orderDetail.quotes.length === 0) {
    throw new Error("Persisted validation or quote records were missing.");
  }
  if (orderDetail.submissions.length === 0) {
    throw new Error("Persisted POS submissions were missing.");
  }
  if (!orderDetail.statusEvents.some((event) => event.status === "received")) {
    throw new Error("Persisted order status history was incomplete.");
  }

  const status = await requestJson<{ status: string; externalOrderId: string | null }>(
    `${baseUrl}/api/agent/orders/${order.id}/status`,
    { headers: agentHeaders },
  );
  if (!status.externalOrderId) {
    throw new Error("Agent status endpoint did not return the POS external order id.");
  }

  const reporting = await requestJson<{
    metrics: Array<{ totalOrders: number; revenueCents: number }>;
    topItems: Array<{ name: string; count: number }>;
  }>(`${baseUrl}/api/restaurants/${restaurant.id}/reporting`, {}, adminSession);

  if (reporting.metrics.length === 0 || reporting.topItems.length === 0) {
    throw new Error("Reporting did not reflect persisted order activity.");
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        restaurantId: restaurant.id,
        orderId: order.id,
        finalStatus: status.status,
        externalOrderId: status.externalOrderId,
        reportingSnapshotCount: reporting.metrics.length,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
