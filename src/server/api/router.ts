import { Router } from "express";
import {
  canonicalOrderIntentSchema,
  patchOrderingRulesSchema,
  patchPermissionSchema,
  patchRestaurantSchema,
} from "../../shared/schemas";
import { requireAgentApiKey } from "../auth/middleware";
import { requireRestaurantSession, restaurantAuthRoutes } from "../auth/restaurantSession";
import type { AppEnv } from "../config/env";
import type { PlatformService } from "../services/platformService";

function asyncHandler(fn: Parameters<Router["get"]>[1]) {
  return (request: any, response: any, next: any) => Promise.resolve(fn(request, response, next)).catch(next);
}

export function createApiRouter(service: PlatformService, env: AppEnv) {
  const router = Router();
  const restaurantAuth = restaurantAuthRoutes(env);

  router.get("/health", (_request, response) => {
    response.json({ ok: true, service: "phantom" });
  });

  router.get("/auth/me", restaurantAuth.me);
  router.post("/auth/login", restaurantAuth.login);
  router.post("/auth/logout", restaurantAuth.logout);

  router.use("/restaurants", requireRestaurantSession(env));

  router.get(
    "/restaurants",
    asyncHandler(async (_request, response) => {
      response.json(await service.listRestaurants());
    }),
  );

  router.get(
    "/restaurants/:restaurantId",
    asyncHandler(async (request, response) => {
      response.json(await service.getRestaurant(request.params.restaurantId));
    }),
  );

  router.patch(
    "/restaurants/:restaurantId",
    asyncHandler(async (request, response) => {
      const patch = patchRestaurantSchema.parse(request.body);
      response.json(await service.updateRestaurant(request.params.restaurantId, patch));
    }),
  );

  router.get(
    "/restaurants/:restaurantId/dashboard",
    asyncHandler(async (request, response) => {
      response.json(await service.getDashboard(request.params.restaurantId));
    }),
  );

  router.get(
    "/restaurants/:restaurantId/pos-connection",
    asyncHandler(async (request, response) => {
      response.json(await service.getPOSConnection(request.params.restaurantId));
    }),
  );

  router.post(
    "/restaurants/:restaurantId/pos-connection/test",
    asyncHandler(async (request, response) => {
      response.json(await service.testPOSConnection(request.params.restaurantId));
    }),
  );

  router.get(
    "/restaurants/:restaurantId/pos-diagnostics",
    asyncHandler(async (request, response) => {
      response.json(await service.getPOSDiagnostics(request.params.restaurantId));
    }),
  );

  router.get(
    "/restaurants/:restaurantId/menu",
    asyncHandler(async (request, response) => {
      response.json(await service.getMenu(request.params.restaurantId));
    }),
  );

  router.post(
    "/restaurants/:restaurantId/menu/sync",
    asyncHandler(async (request, response) => {
      response.json(await service.syncMenu(request.params.restaurantId));
    }),
  );

  router.get(
    "/restaurants/:restaurantId/rules",
    asyncHandler(async (request, response) => {
      response.json(await service.getRules(request.params.restaurantId));
    }),
  );

  router.patch(
    "/restaurants/:restaurantId/rules",
    asyncHandler(async (request, response) => {
      const patch = patchOrderingRulesSchema.parse(request.body);
      response.json(await service.updateRules(request.params.restaurantId, patch));
    }),
  );

  router.get(
    "/restaurants/:restaurantId/agents",
    asyncHandler(async (request, response) => {
      response.json(await service.listAgents(request.params.restaurantId));
    }),
  );

  router.patch(
    "/restaurants/:restaurantId/agents/:agentId/permission",
    asyncHandler(async (request, response) => {
      const patch = patchPermissionSchema.parse(request.body);
      response.json(
        await service.updateAgentPermission(request.params.restaurantId, request.params.agentId, patch.status, patch.notes),
      );
    }),
  );

  router.get(
    "/restaurants/:restaurantId/orders",
    asyncHandler(async (request, response) => {
      response.json(await service.listOrders(request.params.restaurantId));
    }),
  );

  router.get(
    "/restaurants/:restaurantId/orders/:orderId",
    asyncHandler(async (request, response) => {
      response.json(await service.getOrder(request.params.restaurantId, request.params.orderId));
    }),
  );

  router.post(
    "/restaurants/:restaurantId/orders/:orderId/approve",
    asyncHandler(async (request, response) => {
      response.json(await service.approveOrder(request.params.restaurantId, request.params.orderId));
    }),
  );

  router.post(
    "/restaurants/:restaurantId/orders/:orderId/reject",
    asyncHandler(async (request, response) => {
      response.json(await service.rejectOrder(request.params.restaurantId, request.params.orderId));
    }),
  );

  router.post(
    "/restaurants/:restaurantId/orders/:orderId/submit-to-pos",
    asyncHandler(async (request, response) => {
      response.json(await service.submitOrderToPOS(request.params.restaurantId, request.params.orderId));
    }),
  );

  router.get(
    "/restaurants/:restaurantId/reporting",
    asyncHandler(async (request, response) => {
      response.json(await service.getReporting(request.params.restaurantId));
    }),
  );

  router.get(
    "/agent/restaurants/:restaurantId/menu",
    requireAgentApiKey(service),
    asyncHandler(async (request, response) => {
      await service.validateAgentAccess(request.params.restaurantId, request.agentKey!.agentId);
      response.json(await service.getMenu(request.params.restaurantId));
    }),
  );

  router.post(
    "/agent/restaurants/:restaurantId/orders/validate",
    requireAgentApiKey(service),
    asyncHandler(async (request, response) => {
      const parsed = canonicalOrderIntentSchema.parse(request.body);
      await service.validateAgentAccess(request.params.restaurantId, request.agentKey!.agentId);
      response.json(await service.validateOrder(parsed));
    }),
  );

  router.post(
    "/agent/restaurants/:restaurantId/orders/quote",
    requireAgentApiKey(service),
    asyncHandler(async (request, response) => {
      const parsed = canonicalOrderIntentSchema.parse(request.body);
      await service.validateAgentAccess(request.params.restaurantId, request.agentKey!.agentId);
      response.json(await service.quoteOrder(parsed));
    }),
  );

  router.post(
    "/agent/restaurants/:restaurantId/orders/submit",
    requireAgentApiKey(service),
    asyncHandler(async (request, response) => {
      const parsed = canonicalOrderIntentSchema.parse(request.body);
      await service.validateAgentAccess(request.params.restaurantId, request.agentKey!.agentId);
      response.json(await service.submitAgentOrder(parsed));
    }),
  );

  router.get(
    "/agent/orders/:orderId/status",
    requireAgentApiKey(service),
    asyncHandler(async (request, response) => {
      response.json(await service.getAgentOrderStatus(request.params.orderId));
    }),
  );

  router.use((error: unknown, _request: any, response: any, _next: any) => {
    const message = error instanceof Error ? error.message : "Internal server error";
    response.status(400).json({ error: message });
  });

  return router;
}
