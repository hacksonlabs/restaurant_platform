import { z } from "zod";
import type { AgentApiKey, CanonicalOrderIntent, FulfillmentType } from "../../shared/types";
import { canonicalOrderIntentSchema } from "../../shared/schemas";
import type { PlatformService } from "../services/platformService";

const searchRestaurantsInputSchema = z.object({
  query: z.string().trim().min(1).optional(),
  fulfillment_type: z.enum(["pickup", "delivery", "catering"]).optional(),
  address: z.string().trim().min(1).optional(),
  latitude: z.number().finite().optional(),
  longitude: z.number().finite().optional(),
  radius_miles: z.number().positive().max(50).optional(),
  requested_time: z.string().datetime().optional(),
  limit: z.number().int().positive().max(50).optional(),
});

const getMenuInputSchema = z.object({
  restaurant_id: z.string().min(1),
});

const orderToolInputSchema = z.object({
  restaurant_id: z.string().min(1),
  order: canonicalOrderIntentSchema,
});

const startPaymentInputSchema = z.object({
  restaurant_id: z.string().min(1),
  order: canonicalOrderIntentSchema,
  success_url: z.string().url(),
  cancel_url: z.string().url(),
});

const getOrderStatusInputSchema = z.object({
  order_id: z.string().min(1),
});

export type SearchRestaurantsInput = z.infer<typeof searchRestaurantsInputSchema>;
export type GetMenuInput = z.infer<typeof getMenuInputSchema>;
export type OrderToolInput = z.infer<typeof orderToolInputSchema>;
export type StartPaymentInput = z.infer<typeof startPaymentInputSchema>;
export type GetOrderStatusInput = z.infer<typeof getOrderStatusInputSchema>;

export interface PhantomMcpContext {
  service: PlatformService;
  agentKey: AgentApiKey;
}

function normalizeOrderForAgent(input: OrderToolInput, agentId: string): CanonicalOrderIntent {
  if (input.order.restaurant_id !== input.restaurant_id) {
    throw new Error("Tool input restaurant_id must match order.restaurant_id.");
  }
  if (input.order.agent_id && input.order.agent_id !== agentId) {
    throw new Error("Tool input order.agent_id must match the authenticated MCP agent identity.");
  }
  return {
    ...input.order,
    restaurant_id: input.restaurant_id,
    agent_id: agentId,
  };
}

function textSearch(value: string, query: string) {
  return value.toLowerCase().includes(query.toLowerCase());
}

function normalizeText(value: string | null | undefined) {
  return String(value || "").trim();
}

function normalizeAddressKey(value: string | null | undefined) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/\broad\b/g, "rd")
    .replace(/\bstreet\b/g, "st")
    .replace(/\bavenue\b/g, "ave")
    .replace(/\bdrive\b/g, "dr")
    .replace(/\bboulevard\b/g, "blvd")
    .replace(/\s+/g, " ")
    .trim();
}

function buildRestaurantAddress(restaurant: {
  address?: string | null;
  address1?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  location: string;
}) {
  return (
    normalizeText(restaurant.address) ||
    [
      normalizeText(restaurant.address1),
      [normalizeText(restaurant.city), normalizeText(restaurant.state), normalizeText(restaurant.postalCode)]
        .filter(Boolean)
        .join(" "),
    ]
      .filter(Boolean)
      .join(", ") ||
    restaurant.location
  );
}

function resolveSeededRestaurantCoordinates(restaurant: {
  address?: string | null;
  address1?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  location: string;
}) {
  if (typeof restaurant.latitude === "number" && typeof restaurant.longitude === "number") {
    return {
      lat: restaurant.latitude,
      lng: restaurant.longitude,
    };
  }

  const seededCoordinatesByAddress = new Map<string, { lat: number; lng: number }>([
    ["1533 ashcroft way, sunnyvale, ca 94087", { lat: 37.3509, lng: -122.0378 }],
    ["1325 sunnyvale saratoga rd, sunnyvale, ca 94087", { lat: 37.3385, lng: -122.0322 }],
    ["650 w el camino real, sunnyvale, ca 94087", { lat: 37.3794, lng: -122.0428 }],
  ]);

  const candidates = [
    buildRestaurantAddress(restaurant),
    restaurant.location,
    [
      normalizeText(restaurant.address1),
      [normalizeText(restaurant.city), normalizeText(restaurant.state), normalizeText(restaurant.postalCode)]
        .filter(Boolean)
        .join(" "),
    ]
      .filter(Boolean)
      .join(", "),
  ];

  for (const candidate of candidates) {
    const coords = seededCoordinatesByAddress.get(normalizeAddressKey(candidate));
    if (coords) return coords;
  }

  return null;
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function computeDistanceMiles(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number },
) {
  const earthRadiusMiles = 3958.7613;
  const deltaLat = toRadians(destination.lat - origin.lat);
  const deltaLng = toRadians(destination.lng - origin.lng);
  const lat1 = toRadians(origin.lat);
  const lat2 = toRadians(destination.lat);
  const haversine =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
  return 2 * earthRadiusMiles * Math.asin(Math.sqrt(haversine));
}

function extractPostalCode(value: string | null | undefined) {
  const match = normalizeText(value).match(/\b\d{5}(?:-\d{4})?\b/);
  return match ? match[0] : null;
}

function extractCityFragment(value: string | null | undefined) {
  const parts = normalizeText(value).split(",");
  return parts.length >= 2 ? parts[1].trim().toLowerCase() : null;
}

function buildSearchOrigin(input: SearchRestaurantsInput) {
  if (typeof input.latitude === "number" && typeof input.longitude === "number") {
    return { lat: input.latitude, lng: input.longitude };
  }
  return null;
}

function filterRestaurants(
  restaurants: Awaited<ReturnType<PlatformService["listAgentRestaurants"]>>,
  input: SearchRestaurantsInput,
) {
  const limit = input.limit ?? 20;
  const query = normalizeText(input.query);
  const fulfillmentType = input.fulfillment_type;
  const searchAddress = normalizeText(input.address);
  const origin = buildSearchOrigin(input);
  const radiusMiles = input.radius_miles ?? null;
  const searchPostalCode = extractPostalCode(searchAddress);
  const searchCity = extractCityFragment(searchAddress);

  if (!searchAddress && !origin) {
    return [];
  }

  return restaurants
    .map((restaurant) => {
      const address = buildRestaurantAddress(restaurant);
      const coordinates = resolveSeededRestaurantCoordinates(restaurant);
      const distanceMiles =
        origin && coordinates ? computeDistanceMiles(origin, coordinates) : null;

      return {
        ...restaurant,
        address,
        coordinates,
        distanceMiles,
      };
    })
    .filter((restaurant) => {
      if (
        query &&
        !textSearch(restaurant.name, query) &&
        !textSearch(restaurant.location, query) &&
        !textSearch(restaurant.address, query)
      ) {
        return false;
      }
      if (fulfillmentType && !restaurant.fulfillmentTypesSupported.includes(fulfillmentType)) {
        return false;
      }
      if (origin) {
        if (!restaurant.coordinates) return false;
        if (radiusMiles != null && (restaurant.distanceMiles == null || restaurant.distanceMiles > radiusMiles)) {
          return false;
        }
        return true;
      }
      if (searchPostalCode) {
        return extractPostalCode(restaurant.address) === searchPostalCode;
      }
      if (searchCity) {
        return extractCityFragment(restaurant.address) === searchCity;
      }
      return Boolean(searchAddress);
    })
    .sort((left, right) => {
      if (left.distanceMiles != null && right.distanceMiles != null) {
        if (left.distanceMiles !== right.distanceMiles) {
          return left.distanceMiles - right.distanceMiles;
        }
      } else if (left.distanceMiles != null) {
        return -1;
      } else if (right.distanceMiles != null) {
        return 1;
      }
      return left.name.localeCompare(right.name);
    })
    .slice(0, limit);
}

export async function authenticateMcpAgent(service: PlatformService, rawApiKey: string) {
  const key = await service.authenticateAgentKey(rawApiKey);
  return key;
}

export async function searchRestaurantsTool(context: PhantomMcpContext, input: SearchRestaurantsInput) {
  context.service.assertAgentScope(context.agentKey, "restaurants:read");
  const restaurants = await context.service.listAgentRestaurants(context.agentKey.agentId);
  return {
    restaurants: filterRestaurants(restaurants, input),
  };
}

export async function getMenuTool(context: PhantomMcpContext, input: GetMenuInput) {
  context.service.assertAgentScope(context.agentKey, "menus:read");
  await context.service.validateAgentAccess(input.restaurant_id, context.agentKey.agentId);
  return await context.service.getMenu(input.restaurant_id);
}

export async function validateOrderTool(context: PhantomMcpContext, input: OrderToolInput) {
  context.service.assertAgentScope(context.agentKey, "orders:validate");
  await context.service.validateAgentAccess(input.restaurant_id, context.agentKey.agentId);
  const normalized = normalizeOrderForAgent(input, context.agentKey.agentId);
  return await context.service.validateOrder(normalized);
}

export async function quoteOrderTool(context: PhantomMcpContext, input: OrderToolInput) {
  context.service.assertAgentScope(context.agentKey, "orders:quote");
  await context.service.validateAgentAccess(input.restaurant_id, context.agentKey.agentId);
  const normalized = normalizeOrderForAgent(input, context.agentKey.agentId);
  return await context.service.quoteOrder(normalized);
}

export async function startPaymentTool(context: PhantomMcpContext, input: StartPaymentInput) {
  context.service.assertAgentScope(context.agentKey, "payments:start");
  await context.service.validateAgentAccess(input.restaurant_id, context.agentKey.agentId);
  const normalized = normalizeOrderForAgent(input, context.agentKey.agentId);
  return await context.service.startPaymentSession(normalized, {
    successUrl: input.success_url,
    cancelUrl: input.cancel_url,
  });
}

export async function submitOrderTool(context: PhantomMcpContext, input: OrderToolInput) {
  context.service.assertAgentScope(context.agentKey, "orders:submit");
  await context.service.validateAgentAccess(input.restaurant_id, context.agentKey.agentId);
  const normalized = normalizeOrderForAgent(input, context.agentKey.agentId);
  return await context.service.submitAgentOrder(normalized);
}

export async function getOrderStatusTool(context: PhantomMcpContext, input: GetOrderStatusInput) {
  context.service.assertAgentScope(context.agentKey, "orders:status");
  return await context.service.getAgentOrderStatus(input.order_id);
}

export const phantomMcpSchemas = {
  searchRestaurantsInputSchema,
  getMenuInputSchema,
  orderToolInputSchema,
  startPaymentInputSchema,
  getOrderStatusInputSchema,
};
