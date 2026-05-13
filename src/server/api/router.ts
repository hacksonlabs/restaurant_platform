import { Router } from "express";
import {
  canonicalOrderIntentSchema,
  patchOrderingRulesSchema,
  patchPermissionSchema,
  patchRestaurantSchema,
} from "../../shared/schemas";
import { phantomMcpSchemas, searchRestaurantsTool } from "../mcp/tools";
import { requireAgentApiKey } from "../auth/middleware";
import { requireRestaurantRole, requireRestaurantSession, restaurantAuthRoutes } from "../auth/restaurantSession";
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

  router.get("/health", (_request, response) => {
    response.json({ ok: true, service: "phantom" });
  });

  router.get("/auth/me", asyncHandler(restaurantAuth.me));
  router.post("/auth/login", rateLimit({ key: (request) => `auth:${request.ip ?? "local"}`, limit: 10, windowMs: 60_000, message: "Too many login attempts." }), asyncHandler(restaurantAuth.login));
  router.post("/auth/logout", asyncHandler(restaurantAuth.logout));
  router.post("/auth/select-tenant", asyncHandler(restaurantAuth.selectTenant));

  router.use("/restaurants", requireRestaurantSession(service));

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
    requireRestaurantRole(service, ["owner"]),
    asyncHandler(async (request, response) => {
      const patch = patchRestaurantSchema.parse(request.body);
      response.json(await service.updateRestaurant(request.params.restaurantId, patch));
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
    requireRestaurantRole(service, ["owner", "manager", "viewer"]),
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
    requireRestaurantRole(service, ["owner", "manager"]),
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
    requireRestaurantRole(service, ["owner", "manager"]),
    asyncHandler(async (request, response) => {
      response.json(await service.syncMenu(request.params.restaurantId));
    }),
  );

  router.get(
    "/restaurants/:restaurantId/rules",
    requireRestaurantRole(service, ["owner", "manager", "viewer"]),
    asyncHandler(async (request, response) => {
      response.json(await service.getRules(request.params.restaurantId));
    }),
  );

  router.patch(
    "/restaurants/:restaurantId/rules",
    requireRestaurantRole(service, ["owner", "manager"]),
    asyncHandler(async (request, response) => {
      const patch = patchOrderingRulesSchema.parse(request.body);
      response.json(await service.updateRules(request.params.restaurantId, patch));
    }),
  );

  router.get(
    "/restaurants/:restaurantId/agents",
    requireRestaurantRole(service, ["owner", "manager", "viewer"]),
    asyncHandler(async (request, response) => {
      response.json(await service.listAgents(request.params.restaurantId));
    }),
  );

  router.patch(
    "/restaurants/:restaurantId/agents/:agentId/permission",
    requireRestaurantRole(service, ["owner", "manager"]),
    asyncHandler(async (request, response) => {
      const patch = patchPermissionSchema.parse(request.body);
      response.json(
        await service.updateAgentPermission(request.params.restaurantId, request.params.agentId, patch.status, patch.notes),
      );
    }),
  );

  router.post(
    "/restaurants/:restaurantId/agents/:agentId/keys",
    requireRestaurantRole(service, ["owner", "manager"]),
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
    requireRestaurantRole(service, ["owner", "manager"]),
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
    requireRestaurantRole(service, ["owner", "manager"]),
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
    requireRestaurantRole(service, ["owner", "manager", "staff"]),
    asyncHandler(async (request, response) => {
      response.json(await service.approveOrder(request.params.restaurantId, request.params.orderId));
    }),
  );

  router.post(
    "/restaurants/:restaurantId/orders/:orderId/reject",
    requireRestaurantRole(service, ["owner", "manager", "staff"]),
    asyncHandler(async (request, response) => {
      response.json(await service.rejectOrder(request.params.restaurantId, request.params.orderId));
    }),
  );

  router.post(
    "/restaurants/:restaurantId/orders/:orderId/submit-to-pos",
    rateLimit({ key: (request) => `submit:${request.params.restaurantId}:${request.params.orderId}`, limit: 5, windowMs: 60_000, message: "Too many POS submission attempts." }),
    requireRestaurantRole(service, ["owner", "manager", "staff"]),
    asyncHandler(async (request, response) => {
      response.json(await service.submitOrderToPOS(request.params.restaurantId, request.params.orderId));
    }),
  );

  router.post(
    "/restaurants/:restaurantId/orders/:orderId/replay-submit",
    requireRestaurantRole(service, ["owner", "manager"]),
    asyncHandler(async (request, response) => {
      response.json(await service.replayFailedOrder(request.params.restaurantId, request.params.orderId));
    }),
  );

  router.post(
    "/restaurants/:restaurantId/orders/:orderId/refresh-status",
    requireRestaurantRole(service, ["owner", "manager", "staff"]),
    asyncHandler(async (request, response) => {
      response.json(await service.refreshOrderStatus(request.params.restaurantId, request.params.orderId));
    }),
  );

  router.get(
    "/restaurants/:restaurantId/reporting",
    requireRestaurantRole(service, ["owner", "manager", "viewer"]),
    asyncHandler(async (request, response) => {
      response.json(await service.getReporting(request.params.restaurantId));
    }),
  );

  router.get(
    "/restaurants/:restaurantId/operations/diagnostics",
    requireRestaurantRole(service, ["owner", "manager"]),
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
    const message = error instanceof Error ? error.message : "Internal server error";
    response.status(400).json({ error: message });
  });

  return router;
}
