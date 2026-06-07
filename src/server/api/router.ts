import { Router } from "express";
import { ZodError } from "zod";
import {
  canonicalOrderIntentSchema,
  createPartnerAgentSchema,
  createPartnerCredentialSchema,
  createPartnerSchema,
  createTeamMemberSchema,
  onboardingActivateSchema,
  onboardingAccessRequestSchema,
  onboardingDiscoverSchema,
  patchOrderingRulesSchema,
  patchPermissionSchema,
  patchRestaurantSchema,
  restaurantSignupSchema,
  rotatePartnerCredentialSchema,
  updatePartnerAgentSchema,
  updatePartnerCredentialSchema,
  updatePartnerSchema,
  updateTeamMemberSchema,
} from "../../shared/schemas";
import { phantomMcpSchemas, searchRestaurantsTool } from "../mcp/tools";
import { requireAgentApiKey } from "../auth/middleware";
import {
  platformAdminAuthRoutes,
  requirePlatformAdminSession,
  requireRestaurantRole,
  requireRestaurantSession,
  restaurantAuthRoutes,
} from "../auth/restaurantSession";
import { rateLimit } from "../middleware/rateLimit";
import type { PlatformService } from "../services/platformService";

function asyncHandler(fn: Parameters<Router["get"]>[1]) {
  return (request: any, response: any, next: any) => Promise.resolve(fn(request, response, next)).catch(next);
}

function parseInboundProvider(value: string): "toast" | "deliverect" {
  if (value === "toast" || value === "deliverect") {
    return value;
  }
  throw new Error(`Unsupported provider ${value}.`);
}

function normalizeQueryText(value: unknown) {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized || undefined;
}

function parseOptionalNumber(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function createApiRouter(service: PlatformService) {
  const router = Router();
  const restaurantAuth = restaurantAuthRoutes(service);
  const platformAdminAuth = platformAdminAuthRoutes(service);

  router.get("/health", (_request, response) => {
    response.json({ ok: true, service: "phantom" });
  });

  router.get("/auth/me", asyncHandler(restaurantAuth.me));
  router.post("/auth/login", rateLimit({ key: (request) => `auth:${request.ip ?? "local"}`, limit: 10, windowMs: 60_000, message: "Too many login attempts." }), asyncHandler(restaurantAuth.login));
  router.post("/auth/signup", rateLimit({ key: (request) => `signup:${request.ip ?? "local"}`, limit: 5, windowMs: 60_000, message: "Too many signup attempts." }), asyncHandler(async (request, response) => {
    const input = restaurantSignupSchema.parse(request.body);
    response.json(await restaurantAuth.signup(request, response, input));
  }));
  router.post("/auth/logout", asyncHandler(restaurantAuth.logout));
  router.post("/auth/select-tenant", asyncHandler(restaurantAuth.selectTenant));

  router.get("/admin/auth/me", asyncHandler(platformAdminAuth.me));
  router.post(
    "/admin/auth/login",
    rateLimit({ key: (request) => `admin-auth:${request.ip ?? "local"}`, limit: 10, windowMs: 60_000, message: "Too many admin login attempts." }),
    asyncHandler(platformAdminAuth.login),
  );
  router.post("/admin/auth/logout", asyncHandler(platformAdminAuth.logout));

  router.post(
    "/onboarding/discover",
    rateLimit({ key: (request) => `onboarding-discover:${request.ip ?? "local"}`, limit: 20, windowMs: 60_000, message: "Too many onboarding discovery attempts." }),
    asyncHandler(async (request, response) => {
      const input = onboardingDiscoverSchema.parse(request.body);
      response.json(await service.discoverOnboardingAccount(input.provider, input.query));
    }),
  );

  router.post(
    "/onboarding/request-access",
    rateLimit({ key: (request) => `onboarding-request:${request.ip ?? "local"}`, limit: 10, windowMs: 60_000, message: "Too many onboarding requests." }),
    asyncHandler(async (request, response) => {
      const input = onboardingAccessRequestSchema.parse(request.body);
      response.json(await service.createOnboardingAccessRequest(input));
    }),
  );

  router.post(
    "/onboarding/activate",
    rateLimit({ key: (request) => `onboarding-activate:${request.ip ?? "local"}`, limit: 10, windowMs: 60_000, message: "Too many onboarding activation attempts." }),
    asyncHandler(async (request, response) => {
      const input = onboardingActivateSchema.parse(request.body);
      response.json(await restaurantAuth.activateOnboarding(request, response, input));
    }),
  );

  router.get(
    "/onboarding/:requestId",
    asyncHandler(async (request, response) => {
      response.json(await service.getOnboardingRequest(request.params.requestId));
    }),
  );

  router.use("/restaurants", requireRestaurantSession(service));

  router.use("/admin", requirePlatformAdminSession(service));

  router.get(
    "/admin/partners",
    asyncHandler(async (request, response) => {
      response.json(await service.getPlatformAdminPartners(request.platformAdminSession!));
    }),
  );

  router.post(
    "/admin/partners",
    asyncHandler(async (request, response) => {
      const input = createPartnerSchema.parse(request.body);
      response.json(
        await service.createAdminPartner(
          request.platformAdminSession!,
          input.name,
          input.contactEmail || undefined,
          input.status,
        ),
      );
    }),
  );

  router.patch(
    "/admin/partners/:partnerId",
    asyncHandler(async (request, response) => {
      const input = updatePartnerSchema.parse(request.body);
      response.json(
        await service.updateAdminPartner(
          request.platformAdminSession!,
          request.params.partnerId,
          input.name,
          input.contactEmail || undefined,
          input.status,
        ),
      );
    }),
  );

  router.delete(
    "/admin/partners/:partnerId",
    asyncHandler(async (request, response) => {
      await service.removeAdminPartner(request.platformAdminSession!, request.params.partnerId);
      response.status(204).end();
    }),
  );

  router.post(
    "/admin/partners/:partnerId/agents",
    asyncHandler(async (request, response) => {
      const input = createPartnerAgentSchema.parse(request.body);
      response.json(
        await service.createAdminPartnerAgent(
          request.platformAdminSession!,
          request.params.partnerId,
          input.name,
        ),
      );
    }),
  );

  router.patch(
    "/admin/partners/:partnerId/agents/:agentId",
    asyncHandler(async (request, response) => {
      const input = updatePartnerAgentSchema.parse(request.body);
      response.json(
        await service.updateAdminPartnerAgent(
          request.platformAdminSession!,
          request.params.partnerId,
          request.params.agentId,
          input.name,
        ),
      );
    }),
  );

  router.delete(
    "/admin/partners/:partnerId/agents/:agentId",
    asyncHandler(async (request, response) => {
      await service.removeAdminPartnerAgent(
        request.platformAdminSession!,
        request.params.partnerId,
        request.params.agentId,
      );
      response.status(204).end();
    }),
  );

  router.post(
    "/admin/partners/:partnerId/credentials",
    asyncHandler(async (request, response) => {
      const input = createPartnerCredentialSchema.parse(request.body);
      response.json(
        await service.createAdminPartnerCredential(
          request.platformAdminSession!,
          request.params.partnerId,
          input.agentId,
          input.label,
          input.scopes,
          input.environment,
        ),
      );
    }),
  );

  router.patch(
    "/admin/partners/:partnerId/credentials/:credentialId",
    asyncHandler(async (request, response) => {
      const input = updatePartnerCredentialSchema.parse(request.body);
      response.json(
        await service.updateAdminPartnerCredential(
          request.platformAdminSession!,
          request.params.partnerId,
          request.params.credentialId,
          input.label,
          input.scopes,
          input.environment,
        ),
      );
    }),
  );

  router.delete(
    "/admin/partners/:partnerId/credentials/:credentialId",
    asyncHandler(async (request, response) => {
      await service.removeAdminPartnerCredential(
        request.platformAdminSession!,
        request.params.partnerId,
        request.params.credentialId,
      );
      response.status(204).end();
    }),
  );

  router.post(
    "/admin/partners/:partnerId/credentials/:credentialId/rotate",
    asyncHandler(async (request, response) => {
      const input = rotatePartnerCredentialSchema.parse(request.body);
      response.json(
        await service.rotateAdminPartnerCredential(
          request.platformAdminSession!,
          request.params.partnerId,
          request.params.credentialId,
          input.scopes,
          input.environment,
        ),
      );
    }),
  );

  router.post(
    "/admin/partners/:partnerId/credentials/:credentialId/revoke",
    asyncHandler(async (request, response) => {
      response.json(
        await service.revokeAdminPartnerCredential(
          request.platformAdminSession!,
          request.params.partnerId,
          request.params.credentialId,
        ),
      );
    }),
  );

  router.get(
    "/restaurants",
    asyncHandler(async (_request, response) => {
      response.json(await service.listAccessibleRestaurants(_request.restaurantSession!.user.id));
    }),
  );

  router.get(
    "/restaurants/:restaurantId",
    requireRestaurantRole(service),
    asyncHandler(async (request, response) => {
      response.json(await service.getRestaurant(request.params.restaurantId));
    }),
  );

  router.patch(
    "/restaurants/:restaurantId",
    requireRestaurantRole(service, ["owner", "staff"]),
    asyncHandler(async (request, response) => {
      const patch = patchRestaurantSchema.parse(request.body);
      response.json(await service.updateRestaurant(request.params.restaurantId, patch));
    }),
  );

  router.get(
    "/restaurants/:restaurantId/team-members",
    requireRestaurantRole(service, ["owner"]),
    asyncHandler(async (request, response) => {
      response.json(await service.listTeamMembers(request.restaurantSession!));
    }),
  );

  router.post(
    "/restaurants/:restaurantId/team-members",
    requireRestaurantRole(service, ["owner"]),
    asyncHandler(async (request, response) => {
      const input = createTeamMemberSchema.parse(request.body);
      response.json(await service.createTeamMember(request.restaurantSession!, input));
    }),
  );

  router.patch(
    "/restaurants/:restaurantId/team-members/:operatorUserId",
    requireRestaurantRole(service, ["owner"]),
    asyncHandler(async (request, response) => {
      const input = updateTeamMemberSchema.parse(request.body);
      response.json(await service.updateTeamMember(request.restaurantSession!, request.params.operatorUserId, input));
    }),
  );

  router.delete(
    "/restaurants/:restaurantId/team-members/:operatorUserId",
    requireRestaurantRole(service, ["owner"]),
    asyncHandler(async (request, response) => {
      await service.deleteTeamMember(request.restaurantSession!, request.params.operatorUserId);
      response.status(204).end();
    }),
  );

  router.get(
    "/restaurants/:restaurantId/dashboard",
    requireRestaurantRole(service),
    asyncHandler(async (request, response) => {
      response.json(await service.getDashboard(request.params.restaurantId));
    }),
  );

  router.get(
    "/restaurants/:restaurantId/pos-connection",
    requireRestaurantRole(service),
    asyncHandler(async (request, response) => {
      response.json(await service.getPOSConnection(request.params.restaurantId));
    }),
  );

  router.post(
    "/restaurants/:restaurantId/pos-connection/test",
    requireRestaurantRole(service, ["owner"]),
    asyncHandler(async (request, response) => {
      response.json(await service.testPOSConnection(request.params.restaurantId));
    }),
  );

  router.get(
    "/restaurants/:restaurantId/pos-diagnostics",
    requireRestaurantRole(service, ["owner"]),
    asyncHandler(async (request, response) => {
      response.json(await service.getPOSDiagnostics(request.params.restaurantId));
    }),
  );

  router.get(
    "/restaurants/:restaurantId/menu",
    requireRestaurantRole(service),
    asyncHandler(async (request, response) => {
      response.json(await service.getMenu(request.params.restaurantId));
    }),
  );

  router.post(
    "/restaurants/:restaurantId/menu/sync",
    requireRestaurantRole(service, ["owner"]),
    asyncHandler(async (request, response) => {
      response.json(await service.syncMenu(request.params.restaurantId));
    }),
  );

  router.get(
    "/restaurants/:restaurantId/rules",
    requireRestaurantRole(service),
    asyncHandler(async (request, response) => {
      response.json(await service.getRules(request.params.restaurantId));
    }),
  );

  router.patch(
    "/restaurants/:restaurantId/rules",
    requireRestaurantRole(service, ["owner", "staff"]),
    asyncHandler(async (request, response) => {
      const patch = patchOrderingRulesSchema.parse(request.body);
      response.json(await service.updateRules(request.params.restaurantId, patch));
    }),
  );

  router.get(
    "/restaurants/:restaurantId/agents",
    requireRestaurantRole(service),
    asyncHandler(async (request, response) => {
      response.json(await service.listAgents(request.params.restaurantId));
    }),
  );

  router.patch(
    "/restaurants/:restaurantId/agents/:agentId/permission",
    requireRestaurantRole(service, ["owner"]),
    asyncHandler(async (request, response) => {
      const patch = patchPermissionSchema.parse(request.body);
      response.json(
        await service.updateAgentPermission(request.params.restaurantId, request.params.agentId, patch.status, patch.notes),
      );
    }),
  );

  router.post(
    "/restaurants/:restaurantId/agents/:agentId/keys",
    requireRestaurantRole(service, ["owner"]),
    asyncHandler(async (request, response) => {
      response.json(
        await service.createAgentApiKey(
          request.params.restaurantId,
          request.params.agentId,
          String(request.body?.label ?? "Generated key"),
          request.body?.scopes ?? [],
        ),
      );
    }),
  );

  router.post(
    "/restaurants/:restaurantId/agents/:agentId/keys/:keyId/rotate",
    requireRestaurantRole(service, ["owner"]),
    asyncHandler(async (request, response) => {
      response.json(
        await service.rotateAgentApiKey(
          request.params.restaurantId,
          request.params.agentId,
          request.params.keyId,
          request.body?.scopes ?? [],
        ),
      );
    }),
  );

  router.post(
    "/restaurants/:restaurantId/agents/:agentId/keys/:keyId/revoke",
    requireRestaurantRole(service, ["owner"]),
    asyncHandler(async (request, response) => {
      response.json(
        await service.revokeAgentApiKey(request.params.restaurantId, request.params.agentId, request.params.keyId),
      );
    }),
  );

  router.get(
    "/restaurants/:restaurantId/orders",
    requireRestaurantRole(service),
    asyncHandler(async (request, response) => {
      response.json(await service.listOrders(request.params.restaurantId));
    }),
  );

  router.get(
    "/restaurants/:restaurantId/orders/:orderId",
    requireRestaurantRole(service),
    asyncHandler(async (request, response) => {
      response.json(await service.getOrder(request.params.restaurantId, request.params.orderId));
    }),
  );

  router.post(
    "/restaurants/:restaurantId/orders/:orderId/approve",
    requireRestaurantRole(service, ["owner", "staff"]),
    asyncHandler(async (request, response) => {
      response.json(await service.approveOrder(request.params.restaurantId, request.params.orderId));
    }),
  );

  router.post(
    "/restaurants/:restaurantId/orders/:orderId/reject",
    requireRestaurantRole(service, ["owner", "staff"]),
    asyncHandler(async (request, response) => {
      response.json(await service.rejectOrder(request.params.restaurantId, request.params.orderId));
    }),
  );

  router.post(
    "/restaurants/:restaurantId/orders/:orderId/submit-to-pos",
    rateLimit({ key: (request) => `submit:${request.params.restaurantId}:${request.params.orderId}`, limit: 5, windowMs: 60_000, message: "Too many POS submission attempts." }),
    requireRestaurantRole(service, ["owner", "staff"]),
    asyncHandler(async (request, response) => {
      response.json(await service.submitOrderToPOS(request.params.restaurantId, request.params.orderId));
    }),
  );

  router.post(
    "/restaurants/:restaurantId/orders/:orderId/replay-submit",
    requireRestaurantRole(service, ["owner", "staff"]),
    asyncHandler(async (request, response) => {
      response.json(await service.replayFailedOrder(request.params.restaurantId, request.params.orderId));
    }),
  );

  router.post(
    "/restaurants/:restaurantId/orders/:orderId/refresh-status",
    requireRestaurantRole(service, ["owner", "staff"]),
    asyncHandler(async (request, response) => {
      response.json(await service.refreshOrderStatus(request.params.restaurantId, request.params.orderId));
    }),
  );

  router.get(
    "/restaurants/:restaurantId/reporting",
    requireRestaurantRole(service),
    asyncHandler(async (request, response) => {
      const startDate = typeof request.query.startDate === "string" ? request.query.startDate : undefined;
      const endDate = typeof request.query.endDate === "string" ? request.query.endDate : undefined;
      response.json(await service.getReporting(request.params.restaurantId, { startDate, endDate }));
    }),
  );

  router.get(
    "/restaurants/:restaurantId/operations/diagnostics",
    requireRestaurantRole(service, ["owner"]),
    asyncHandler(async (request, response) => {
      response.json(await service.getOperationalDiagnostics(request.params.restaurantId));
    }),
  );

  router.get(
    "/agent/restaurants",
    rateLimit({ key: (request) => `agent:${request.header("x-agent-api-key") ?? request.ip ?? "local"}:restaurants`, limit: 120, windowMs: 60_000, message: "Too many agent requests." }),
    requireAgentApiKey(service),
    asyncHandler(async (request, response) => {
      service.assertAgentScope(request.agentKey!, "restaurants:read");
      const parsed = phantomMcpSchemas.searchRestaurantsInputSchema.parse({
        query: normalizeQueryText(request.query.query),
        fulfillment_type:
          normalizeQueryText(request.query.fulfillment_type) ??
          normalizeQueryText(request.query.fulfillmentType),
        address: normalizeQueryText(request.query.address),
        latitude: parseOptionalNumber(request.query.latitude) ?? parseOptionalNumber(request.query.lat),
        longitude: parseOptionalNumber(request.query.longitude) ?? parseOptionalNumber(request.query.lng),
        radius_miles:
          parseOptionalNumber(request.query.radius_miles) ?? parseOptionalNumber(request.query.radiusMiles),
        requested_time:
          normalizeQueryText(request.query.requested_time) ??
          normalizeQueryText(request.query.requestedTime),
        limit: parseOptionalNumber(request.query.limit),
      });
      const result = await searchRestaurantsTool(
        { service, agentKey: request.agentKey! },
        parsed,
      );
      response.json(result.restaurants);
    }),
  );

  router.get(
    "/agent/restaurants/:restaurantId/menu",
    rateLimit({ key: (request) => `agent:${request.header("x-agent-api-key") ?? request.ip ?? "local"}:menu`, limit: 120, windowMs: 60_000, message: "Too many agent requests." }),
    requireAgentApiKey(service),
    asyncHandler(async (request, response) => {
      service.assertAgentScope(request.agentKey!, "menus:read");
      await service.validateAgentAccess(request.params.restaurantId, request.agentKey!.agentId);
      response.json(await service.getMenu(request.params.restaurantId));
    }),
  );

  router.post(
    "/agent/restaurants/:restaurantId/orders/validate",
    rateLimit({ key: (request) => `agent:${request.header("x-agent-api-key") ?? request.ip ?? "local"}:validate`, limit: 60, windowMs: 60_000, message: "Too many validation requests." }),
    requireAgentApiKey(service),
    asyncHandler(async (request, response) => {
      const parsed = canonicalOrderIntentSchema.parse(request.body);
      service.assertAgentScope(request.agentKey!, "orders:validate");
      await service.validateAgentAccess(request.params.restaurantId, request.agentKey!.agentId);
      response.json(await service.validateOrder(parsed));
    }),
  );

  router.post(
    "/agent/restaurants/:restaurantId/orders/quote",
    rateLimit({ key: (request) => `agent:${request.header("x-agent-api-key") ?? request.ip ?? "local"}:quote`, limit: 60, windowMs: 60_000, message: "Too many quote requests." }),
    requireAgentApiKey(service),
    asyncHandler(async (request, response) => {
      const parsed = canonicalOrderIntentSchema.parse(request.body);
      service.assertAgentScope(request.agentKey!, "orders:quote");
      await service.validateAgentAccess(request.params.restaurantId, request.agentKey!.agentId);
      response.json(await service.quoteOrder(parsed));
    }),
  );

  router.post(
    "/agent/restaurants/:restaurantId/orders/submit",
    rateLimit({ key: (request) => `agent:${request.header("x-agent-api-key") ?? request.ip ?? "local"}:submit`, limit: 30, windowMs: 60_000, message: "Too many submission requests." }),
    requireAgentApiKey(service),
    asyncHandler(async (request, response) => {
      const parsed = canonicalOrderIntentSchema.parse(request.body);
      service.assertAgentScope(request.agentKey!, "orders:submit");
      await service.validateAgentAccess(request.params.restaurantId, request.agentKey!.agentId);
      response.json(await service.submitAgentOrder(parsed));
    }),
  );

  router.get(
    "/agent/orders/:orderId/status",
    rateLimit({ key: (request) => `agent:${request.header("x-agent-api-key") ?? request.ip ?? "local"}:status`, limit: 120, windowMs: 60_000, message: "Too many status requests." }),
    requireAgentApiKey(service),
    asyncHandler(async (request, response) => {
      service.assertAgentScope(request.agentKey!, "orders:status");
      response.json(await service.getAgentOrderStatus(request.params.orderId));
    }),
  );

  router.post(
    "/internal/events/:provider",
    asyncHandler(async (request, response) => {
      response.json(
        await service.ingestProviderEvent(
          parseInboundProvider(request.params.provider),
          String(request.body?.type ?? "unknown"),
          request.body ?? {},
        ),
      );
    }),
  );

  router.use((error: unknown, _request: any, response: any, _next: any) => {
    if (error instanceof ZodError) {
      const firstIssue = error.issues[0];
      response.status(400).json({ error: firstIssue?.message ?? "Invalid request payload." });
      return;
    }
    const message = error instanceof Error ? error.message : "Internal server error";
    response.status(400).json({ error: message });
  });

  return router;
}
