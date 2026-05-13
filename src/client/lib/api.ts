import type {
  AuthenticatedOperator,
  AgentOrderRecord,
  AgentApiScope,
  DashboardSnapshot,
  OrderingRule,
  Restaurant,
} from "@shared/types";
import { clearResourceCache } from "./resourceCache";

export interface OperatorAuthPayload extends AuthenticatedOperator {
  restaurants: Array<Restaurant & { memberships: Array<{ id: string; role: string; locationId?: string }> }>;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const method = (init?.method ?? "GET").toUpperCase();
  const response = await fetch(path, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error || `Request failed: ${response.status}`);
  }

  if (method !== "GET") {
    clearResourceCache();
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

export const api = {
  authMe: () => request<OperatorAuthPayload>("/api/auth/me"),
  login: (email: string, password: string) =>
    request<OperatorAuthPayload>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  logout: () =>
    request<void>("/api/auth/logout", {
      method: "POST",
    }),
  selectTenant: (restaurantId: string, locationId?: string) =>
    request<OperatorAuthPayload>("/api/auth/select-tenant", {
      method: "POST",
      body: JSON.stringify({ restaurantId, locationId }),
    }),
  restaurants: () => request<Restaurant[]>("/api/restaurants"),
  restaurant: (restaurantId: string) => request<Restaurant>(`/api/restaurants/${restaurantId}`),
  updateRestaurant: (restaurantId: string, body: Partial<Restaurant>) =>
    request<Restaurant>(`/api/restaurants/${restaurantId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  dashboard: (restaurantId: string) =>
    request<DashboardSnapshot>(`/api/restaurants/${restaurantId}/dashboard`),
  posConnection: (restaurantId: string) =>
    request(`/api/restaurants/${restaurantId}/pos-connection`),
  testPOSConnection: (restaurantId: string) =>
    request(`/api/restaurants/${restaurantId}/pos-connection/test`, { method: "POST" }),
  menu: (restaurantId: string) =>
    request(`/api/restaurants/${restaurantId}/menu`),
  syncMenu: (restaurantId: string) =>
    request(`/api/restaurants/${restaurantId}/menu/sync`, { method: "POST" }),
  rules: (restaurantId: string) =>
    request<OrderingRule>(`/api/restaurants/${restaurantId}/rules`),
  updateRules: (restaurantId: string, body: Partial<OrderingRule>) =>
    request<OrderingRule>(`/api/restaurants/${restaurantId}/rules`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  agents: (restaurantId: string) =>
    request(`/api/restaurants/${restaurantId}/agents`),
  agent: async (restaurantId: string, agentId: string) => {
    const agents = await request<any[]>(`/api/restaurants/${restaurantId}/agents`);
    const agent = agents.find((entry) => entry.agent.id === agentId);
    if (!agent) {
      throw new Error("Agent not found.");
    }
    return agent;
  },
  updateAgentPermission: (restaurantId: string, agentId: string, body: { status: string; notes?: string }) =>
    request(`/api/restaurants/${restaurantId}/agents/${agentId}/permission`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  createAgentKey: (restaurantId: string, agentId: string, body: { label: string; scopes: AgentApiScope[] }) =>
    request(`/api/restaurants/${restaurantId}/agents/${agentId}/keys`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  rotateAgentKey: (restaurantId: string, agentId: string, keyId: string, body: { scopes: AgentApiScope[] }) =>
    request(`/api/restaurants/${restaurantId}/agents/${agentId}/keys/${keyId}/rotate`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  revokeAgentKey: (restaurantId: string, agentId: string, keyId: string) =>
    request(`/api/restaurants/${restaurantId}/agents/${agentId}/keys/${keyId}/revoke`, {
      method: "POST",
    }),
  orders: (restaurantId: string) =>
    request<AgentOrderRecord[]>(`/api/restaurants/${restaurantId}/orders`),
  order: (restaurantId: string, orderId: string) =>
    request(`/api/restaurants/${restaurantId}/orders/${orderId}`),
  approveOrder: (restaurantId: string, orderId: string) =>
    request(`/api/restaurants/${restaurantId}/orders/${orderId}/approve`, { method: "POST" }),
  rejectOrder: (restaurantId: string, orderId: string) =>
    request(`/api/restaurants/${restaurantId}/orders/${orderId}/reject`, { method: "POST" }),
  submitOrderToPOS: (restaurantId: string, orderId: string) =>
    request(`/api/restaurants/${restaurantId}/orders/${orderId}/submit-to-pos`, { method: "POST" }),
  replayOrderSubmit: (restaurantId: string, orderId: string) =>
    request(`/api/restaurants/${restaurantId}/orders/${orderId}/replay-submit`, { method: "POST" }),
  refreshOrderStatus: (restaurantId: string, orderId: string) =>
    request(`/api/restaurants/${restaurantId}/orders/${orderId}/refresh-status`, { method: "POST" }),
  reporting: (restaurantId: string) =>
    request(`/api/restaurants/${restaurantId}/reporting`),
  operationsDiagnostics: (restaurantId: string) =>
    request(`/api/restaurants/${restaurantId}/operations/diagnostics`),
};
