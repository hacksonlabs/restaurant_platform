import type {
  Agent,
  AuthenticatedOperator,
  AuthenticatedPlatformAdmin,
  AgentOrderRecord,
  AgentApiScope,
  CreateTeamMemberInput,
  DashboardSnapshot,
  OnboardingAccessRequestInput,
  OnboardingActivateInput,
  OnboardingDiscoveredAccount,
  OnboardingProvider,
  OnboardingRequestRecord,
  OrderingRule,
  Partner,
  PartnerCredentialEnvironment,
  PartnerCredentialSummary,
  PlatformAdminPartnerRecord,
  ReportingDateRange,
  Restaurant,
  RestaurantSignupInput,
  TeamMemberRecord,
  UpdateTeamMemberInput,
} from "@shared/types";
import { clearResourceCache } from "./resourceCache";

export interface OperatorAuthPayload extends AuthenticatedOperator {
  restaurants: Array<Restaurant & { memberships: Array<{ id: string; role: string; locationId?: string }> }>;
}

export type PlatformAdminAuthPayload = AuthenticatedPlatformAdmin;

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
  adminAuthMe: () => request<PlatformAdminAuthPayload>("/api/admin/auth/me"),
  login: (email: string, password: string) =>
    request<OperatorAuthPayload>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  adminLogin: (email: string, password: string) =>
    request<PlatformAdminAuthPayload>("/api/admin/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  signupRestaurant: (body: RestaurantSignupInput) =>
    request<OperatorAuthPayload>("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  discoverOnboarding: (provider: OnboardingProvider, query: string) =>
    request<OnboardingDiscoveredAccount>("/api/onboarding/discover", {
      method: "POST",
      body: JSON.stringify({ provider, query }),
    }),
  requestOnboardingAccess: (body: OnboardingAccessRequestInput) =>
    request<OnboardingRequestRecord>("/api/onboarding/request-access", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  activateOnboarding: (body: OnboardingActivateInput) =>
    request<OperatorAuthPayload>("/api/onboarding/activate", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  onboardingRequest: (requestId: string) =>
    request<OnboardingRequestRecord>(`/api/onboarding/${requestId}`),
  logout: () =>
    request<void>("/api/auth/logout", {
      method: "POST",
    }),
  adminLogout: () =>
    request<void>("/api/admin/auth/logout", {
      method: "POST",
    }),
  selectTenant: (restaurantId: string, locationId?: string) =>
    request<OperatorAuthPayload>("/api/auth/select-tenant", {
      method: "POST",
      body: JSON.stringify({ restaurantId, locationId }),
    }),
  restaurants: () => request<Restaurant[]>("/api/restaurants"),
  restaurant: (restaurantId: string) => request<Restaurant>(`/api/restaurants/${restaurantId}`),
  teamMembers: (restaurantId: string) =>
    request<TeamMemberRecord[]>(`/api/restaurants/${restaurantId}/team-members`),
  createTeamMember: (restaurantId: string, body: CreateTeamMemberInput) =>
    request<TeamMemberRecord>(`/api/restaurants/${restaurantId}/team-members`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateTeamMember: (restaurantId: string, operatorUserId: string, body: UpdateTeamMemberInput) =>
    request<TeamMemberRecord>(`/api/restaurants/${restaurantId}/team-members/${operatorUserId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deleteTeamMember: (restaurantId: string, operatorUserId: string) =>
    request<void>(`/api/restaurants/${restaurantId}/team-members/${operatorUserId}`, {
      method: "DELETE",
    }),
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
  reporting: (restaurantId: string, range?: ReportingDateRange) => {
    const params = new URLSearchParams();
    if (range?.startDate) params.set("startDate", range.startDate);
    if (range?.endDate) params.set("endDate", range.endDate);
    const query = params.toString();
    return request(`/api/restaurants/${restaurantId}/reporting${query ? `?${query}` : ""}`);
  },
  operationsDiagnostics: (restaurantId: string) =>
    request(`/api/restaurants/${restaurantId}/operations/diagnostics`),
  platformAdminPartners: () =>
    request<PlatformAdminPartnerRecord[]>("/api/admin/partners"),
  createPartner: (body: { name: string; contactEmail?: string; status: Partner["status"] }) =>
    request<Partner>("/api/admin/partners", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updatePartner: (partnerId: string, body: { name: string; contactEmail?: string; status: Partner["status"] }) =>
    request<Partner>(`/api/admin/partners/${partnerId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  removePartner: (partnerId: string) =>
    request<void>(`/api/admin/partners/${partnerId}`, {
      method: "DELETE",
    }),
  createPartnerCredential: (
    partnerId: string,
    body: { agentId: string; label: string; scopes: AgentApiScope[]; environment: PartnerCredentialEnvironment },
  ) =>
    request<{ rawKey: string; credential: PartnerCredentialSummary }>(`/api/admin/partners/${partnerId}/credentials`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  createPartnerAgent: (
    partnerId: string,
    body: { name: string },
  ) =>
    request<Agent>(`/api/admin/partners/${partnerId}/agents`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updatePartnerAgent: (partnerId: string, agentId: string, body: { name: string }) =>
    request<Agent>(`/api/admin/partners/${partnerId}/agents/${agentId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  removePartnerAgent: (partnerId: string, agentId: string) =>
    request<void>(`/api/admin/partners/${partnerId}/agents/${agentId}`, {
      method: "DELETE",
    }),
  rotatePartnerCredential: (
    partnerId: string,
    credentialId: string,
    body: { scopes: AgentApiScope[]; environment: PartnerCredentialEnvironment },
  ) =>
    request<{ rawKey: string; credential: PartnerCredentialSummary }>(
      `/api/admin/partners/${partnerId}/credentials/${credentialId}/rotate`,
      {
        method: "POST",
        body: JSON.stringify(body),
      },
    ),
  updatePartnerCredential: (
    partnerId: string,
    credentialId: string,
    body: { label: string; scopes: AgentApiScope[]; environment: PartnerCredentialEnvironment },
  ) =>
    request<PartnerCredentialSummary>(`/api/admin/partners/${partnerId}/credentials/${credentialId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  revokePartnerCredential: (partnerId: string, credentialId: string) =>
    request<PartnerCredentialSummary>(`/api/admin/partners/${partnerId}/credentials/${credentialId}/revoke`, {
      method: "POST",
    }),
  removePartnerCredential: (partnerId: string, credentialId: string) =>
    request<void>(`/api/admin/partners/${partnerId}/credentials/${credentialId}`, {
      method: "DELETE",
    }),
};
