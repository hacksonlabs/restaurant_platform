import { canonicalOrderIntentSchema } from "../../shared/schemas";
import { createHmac, timingSafeEqual } from "node:crypto";
import type {
  Agent,
  AgentApiScope,
  AgentApiKey,
  AuthenticatedOperator,
  AuthenticatedPlatformAdmin,
  AgentOrderItemRecord,
  AgentOrderModifierRecord,
  AgentOrderRecord,
  AgentOrderStatus,
  CanonicalOrderIntent,
  DashboardSnapshot,
  OnboardingActivateInput,
  OnboardingAccessRequestInput,
  OnboardingDiscoveredAccount,
  OnboardingProvider,
  OnboardingRequestRecord,
  OrderQuote,
  POSPaymentSessionResult,
  OrderValidationResult,
  POSContext,
  POSDiagnosticsResult,
  POSOrderSubmission,
  PartnerCredential,
  PartnerCredentialEnvironment,
  PartnerCredentialSummary,
  PlatformAdminPartnerRecord,
  POSConnection,
  Restaurant,
  OrderingRule,
  ReportingDateRange,
  RestaurantReportingSnapshot,
  RestaurantSignupInput,
  ValidationIssue,
  FulfillmentType,
  OperatorRole,
  POSProvider,
  ProviderAccount,
  ProviderLocation,
  EventIngestionRecord,
  CreateTeamMemberInput,
  UpdateTeamMemberInput,
} from "../../shared/types";
import { POSAdapterRegistry } from "../pos/registry";
import type { AppEnv } from "../config/env";
import { normalizeDeliverectEvent } from "../providers/deliverectEventNormalizer";
import { extractDeliverectLocationAddress } from "../providers/deliverectLocation";
import { extractDeliverectMenuImageUrl, normalizeDeliverectMenu } from "../providers/deliverectMenuNormalizer";
import type { CanonicalMenuReplacement, OrderDetailRecord, PlatformRepository } from "../repositories/platformRepository";
import type { OperatorIdentity } from "../auth/supabaseAuth";
import { randomToken, sha256 } from "../utils/crypto";
import { createId } from "../utils/ids";
import { log } from "../utils/logger";
import type { RestaurantLocation } from "../../shared/types";

const EMPTY_DELIVERECT_MENU_ERROR =
  "Deliverect menu payload contained no products/categories. Add products to the Deliverect sandbox menu and trigger menu sync/publish again.";

function formatRestaurantAddress(location: RestaurantLocation | null, fallback: string) {
  if (!location) return fallback;

  const parts = [
    location.address1,
    [location.city, location.state, location.postalCode].filter(Boolean).join(" "),
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(", ") : fallback;
}

function resolveProviderLocationAddress(providerLocation: ProviderLocation) {
  const parsedAddress = extractDeliverectLocationAddress(providerLocation.rawProviderPayload);
  const fallbackAddress =
    providerLocation.address && providerLocation.address !== providerLocation.name
      ? providerLocation.address
      : undefined;
  const formattedAddress = parsedAddress?.formattedAddress ?? fallbackAddress;
  if (!formattedAddress) return null;
  return {
    formattedAddress,
    locationPatch: {
      address1: parsedAddress?.address1 ?? fallbackAddress ?? formattedAddress,
      city: parsedAddress?.city ?? "",
      state: parsedAddress?.state ?? "",
      postalCode: parsedAddress?.postalCode ?? "",
      latitude: parsedAddress?.latitude ?? null,
      longitude: parsedAddress?.longitude ?? null,
    },
  };
}

async function syncRestaurantImageFromDeliverectMenu(
  repository: PlatformRepository,
  restaurantId: string,
  payload: unknown,
) {
  const imageUrl = extractDeliverectMenuImageUrl(payload);
  if (!imageUrl) return;
  const restaurant = await repository.getRestaurant(restaurantId);
  if (!restaurant || restaurant.imageUrl === imageUrl) return;
  await repository.updateRestaurant(restaurantId, {
    imageUrl,
    updatedAt: new Date().toISOString(),
  });
}

function normalizeText(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  return text || null;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(payload: unknown, ...keys: string[]) {
  if (!isObject(payload)) return undefined;
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

function findNestedString(payload: unknown, keys: string[], depth = 0): string | undefined {
  if (depth > 5 || payload == null) return undefined;
  const direct = readString(payload, ...keys);
  if (direct) return direct;
  if (Array.isArray(payload)) {
    for (const item of payload) {
      const value = findNestedString(item, keys, depth + 1);
      if (value) return value;
    }
    return undefined;
  }
  if (!isObject(payload)) return undefined;
  for (const value of Object.values(payload)) {
    const nested = findNestedString(value, keys, depth + 1);
    if (nested) return nested;
  }
  return undefined;
}

function extractDeliverectChannelLinkId(payload: unknown) {
  return findNestedString(payload, ["channelLinkId", "channel_link_id", "channelLinkID", "channelLink"]);
}

function extractDeliverectMenuEventId(payload: unknown) {
  return findNestedString(payload, ["eventId", "event_id", "_id", "id", "menuId", "menu_id"]);
}

function eventPayloadRecord(payload: unknown): Record<string, unknown> {
  return isObject(payload) && !Array.isArray(payload) ? payload : { menus: payload };
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableJson(entry)).join(",")}]`;
  }
  if (isObject(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function payloadHash(payload: unknown) {
  return sha256(stableJson(payload));
}

const REDACTED_VALUE = "[redacted]";
const SENSITIVE_PAYLOAD_KEY = /(authorization|bearer|token|secret|password|api[-_ ]?key|service[-_ ]?role|client[-_ ]?secret|payment|card|cvv|cvc|iban|routing)/i;

function redactSensitivePayload(value: unknown, depth = 0): unknown {
  if (depth > 8) return "[redacted-depth-limit]";
  if (Array.isArray(value)) return value.map((entry) => redactSensitivePayload(entry, depth + 1));
  if (!isObject(value)) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      SENSITIVE_PAYLOAD_KEY.test(key) ? REDACTED_VALUE : redactSensitivePayload(entry, depth + 1),
    ]),
  );
}

function truncateText(value: unknown, maxLength = 300) {
  const text = normalizeText(value);
  if (!text) return undefined;
  return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
}

function readEventErrorSummary(payload: Record<string, unknown>) {
  return truncateText(
    readString(payload, "error", "message", "reason", "errorMessage") ??
      (isObject(payload.error) ? readString(payload.error, "message", "detail", "reason") : undefined),
  );
}

function readExternalStatus(payload: Record<string, unknown>) {
  return readString(payload, "status", "externalStatus", "orderStatus", "state", "action");
}

function appendPath(baseUrl: string, path: string) {
  return `${baseUrl.replace(/\/$/, "")}${path}`;
}

function deliverectProviderStatusFromChannelStatus(status: string | undefined): ProviderLocation["status"] {
  const normalized = status?.trim().toLowerCase();
  if (normalized === "inactive" || normalized === "disabled" || normalized === "disable" || normalized === "paused") return "disabled";
  if (normalized === "active" || normalized === "online") return "connected";
  return "sandbox";
}

function headerValue(headers: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = headers[key] ?? headers[key.toLowerCase()];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (Array.isArray(value)) {
      const first = value.find((entry) => typeof entry === "string" && entry.trim());
      if (typeof first === "string") return first.trim();
    }
  }
  return undefined;
}

function normalizeHmacSignature(value: string) {
  return value.trim().replace(/^sha256=/i, "").trim().toLowerCase();
}

function hmacSha256(rawBody: string, secret: string) {
  return createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
}

function timingSafeStringEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

const PROVIDER_FULFILLMENT_TYPE_VALUES = new Set(["pickup", "delivery", "catering"]);
const DELIVERECT_CHANNEL_DEFAULT_FULFILLMENT_TYPES: FulfillmentType[] = ["pickup"];
const DELIVERECT_MENU_TYPE_LABELS: Record<number, string> = {
  0: "delivery_and_pickup",
  1: "delivery",
  2: "pickup",
  3: "eat_in",
  4: "curbside",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeProviderFulfillmentType(value: unknown): FulfillmentType | null {
  const normalized = String(value).trim().toLowerCase();
  if (normalized === "1") return "pickup";
  if (normalized === "2") return "delivery";
  if (normalized === "takeaway" || normalized === "takeout" || normalized === "collection") return "pickup";
  return PROVIDER_FULFILLMENT_TYPE_VALUES.has(normalized) ? (normalized as FulfillmentType) : null;
}

function readFulfillmentTypesFromRecord(raw: Record<string, unknown> | null | undefined) {
  if (!raw) return [];
  const candidates = [
    raw.fulfillmentTypes,
    raw.fulfillment_types,
    raw.fulfillmentTypesSupported,
    raw.fulfillment_types_supported,
    raw.orderTypes,
    raw.order_types,
    raw.services,
    raw.channelLink && typeof raw.channelLink === "object" ? (raw.channelLink as Record<string, unknown>).fulfillmentTypes : undefined,
    raw.channelLink && typeof raw.channelLink === "object" ? (raw.channelLink as Record<string, unknown>).orderTypes : undefined,
    raw.store && typeof raw.store === "object" ? (raw.store as Record<string, unknown>).fulfillmentTypes : undefined,
    raw.store && typeof raw.store === "object" ? (raw.store as Record<string, unknown>).orderTypes : undefined,
  ];
  return Array.from(
    new Set(
      candidates
        .flatMap((candidate) => {
          if (Array.isArray(candidate)) return candidate;
          if (typeof candidate === "string") return candidate.split(",");
          return [];
        })
        .map(normalizeProviderFulfillmentType)
        .filter((value): value is FulfillmentType => value !== null),
    ),
  );
}

function readFulfillmentTypesFromProviderPayload(providerLocation: ProviderLocation) {
  return readFulfillmentTypesFromRecord(providerLocation.rawProviderPayload);
}

function readFulfillmentTypesFromConnection(connection: POSConnection | null | undefined) {
  if (!connection) return [];
  const rawProviderLocation = isRecord(connection.metadata.rawProviderLocation)
    ? connection.metadata.rawProviderLocation
    : undefined;
  return Array.from(
    new Set([
      ...readFulfillmentTypesFromRecord(connection.metadata),
      ...readFulfillmentTypesFromRecord(rawProviderLocation),
    ]),
  );
}

function deliverectMenuEntries(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) return payload.filter(isRecord);
  if (!isRecord(payload)) return [];
  if (Array.isArray(payload.menus)) return payload.menus.filter(isRecord);
  if (Array.isArray(payload.items)) return payload.items.filter(isRecord);
  if (isRecord(payload.payload)) return deliverectMenuEntries(payload.payload);
  if (Array.isArray(payload.payload)) return deliverectMenuEntries(payload.payload);
  return [payload];
}

function normalizeDeliverectMenuType(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isInteger(Number(value))) return Number(value);
  return null;
}

function mapDeliverectMenuTypeToFulfillmentTypes(menuType: number): FulfillmentType[] {
  if (menuType === 0 || menuType === 2) return ["pickup"];
  return [];
}

function resolveDeliverectMenuTypeFulfillment(payload: unknown) {
  const rawMenuTypes = deliverectMenuEntries(payload)
    .map((menu) => normalizeDeliverectMenuType(menu.menuType ?? menu.menu_type))
    .filter((value): value is number => value !== null);
  const knownMenuTypes = rawMenuTypes.filter((value) => Object.prototype.hasOwnProperty.call(DELIVERECT_MENU_TYPE_LABELS, value));
  const fulfillmentTypes = Array.from(
    new Set(knownMenuTypes.flatMap((menuType) => mapDeliverectMenuTypeToFulfillmentTypes(menuType))),
  );
  return {
    signalPresent: knownMenuTypes.length > 0,
    rawMenuTypes,
    knownMenuTypes,
    labels: knownMenuTypes.map((value) => DELIVERECT_MENU_TYPE_LABELS[value]),
    fulfillmentTypes,
  };
}

function readFulfillmentTypesFromMenuVersion(menuVersion: { metadata: Record<string, unknown> } | null | undefined) {
  return Array.from(
    new Set(
      (Array.isArray(menuVersion?.metadata?.phantomFulfillmentTypesFromMenuType)
        ? menuVersion.metadata.phantomFulfillmentTypesFromMenuType
        : [])
        .map(normalizeProviderFulfillmentType)
        .filter((value): value is FulfillmentType => value !== null),
    ),
  );
}

function hasDeliverectMenuTypeSignal(menuVersion: { metadata: Record<string, unknown> } | null | undefined) {
  return menuVersion?.metadata?.deliverectMenuTypeSignal === true;
}

function defaultFulfillmentTypesForProviderLocation(providerLocation: ProviderLocation): FulfillmentType[] {
  if (providerLocation.provider === "deliverect" && normalizeText(providerLocation.channelLinkId)) {
    return [...DELIVERECT_CHANNEL_DEFAULT_FULFILLMENT_TYPES];
  }
  return [];
}

function resolveFulfillmentTypesFromProviderLocation(providerLocation: ProviderLocation): FulfillmentType[] {
  const explicitTypes = readFulfillmentTypesFromProviderPayload(providerLocation);
  return explicitTypes.length > 0 ? explicitTypes : defaultFulfillmentTypesForProviderLocation(providerLocation);
}

function isDeliverectChannelConnection(connection: POSConnection | null | undefined) {
  if (!connection || connection.provider !== "deliverect") return false;
  const channelLinkId =
    normalizeText(connection.metadata.deliverectChannelLinkId) ??
    normalizeText(connection.metadata.channelLinkId) ??
    normalizeText(connection.metadata.channelLink);
  return Boolean(channelLinkId || connection.providerLocationId);
}

function defaultFulfillmentTypesForConnection(connection: POSConnection | null | undefined): FulfillmentType[] {
  return isDeliverectChannelConnection(connection) ? [...DELIVERECT_CHANNEL_DEFAULT_FULFILLMENT_TYPES] : [];
}

function resolveEffectiveFulfillmentTypes(
  restaurant: Restaurant,
  rules: OrderingRule | null,
  connection: POSConnection | null | undefined,
  menuVersion?: { metadata: Record<string, unknown> } | null,
) {
  const defaultTypes = defaultFulfillmentTypesForConnection(connection);
  const providerTypes = readFulfillmentTypesFromConnection(connection);
  const menuTypeTypes = readFulfillmentTypesFromMenuVersion(menuVersion);
  const menuTypeSignalPresent = hasDeliverectMenuTypeSignal(menuVersion);
  const restaurantTypes = restaurant.fulfillmentTypesSupported.length > 0
    ? restaurant.fulfillmentTypesSupported
    : rules?.allowedFulfillmentTypes.length
      ? rules.allowedFulfillmentTypes
      : providerTypes.length
        ? providerTypes
        : menuTypeSignalPresent
          ? menuTypeTypes
          : defaultTypes;
  const ruleTypes = rules?.allowedFulfillmentTypes.length
    ? rules.allowedFulfillmentTypes
    : restaurantTypes.length
      ? restaurantTypes
      : providerTypes.length
        ? providerTypes
        : menuTypeSignalPresent
          ? menuTypeTypes
          : defaultTypes;
  return { restaurantTypes, ruleTypes };
}

const EVENT_STATUS_RANK: Partial<Record<AgentOrderStatus, number>> = {
  received: 1,
  needs_approval: 2,
  approved: 3,
  submitting_to_pos: 4,
  submitted_to_pos: 5,
  accepted: 6,
  preparing: 7,
  ready: 8,
  completed: 9,
  rejected: 10,
  cancelled: 10,
  failed: 10,
};

function shouldApplyProviderStatus(current: AgentOrderStatus, incoming: AgentOrderStatus) {
  if (current === incoming) return false;
  const currentRank = EVENT_STATUS_RANK[current] ?? 0;
  const incomingRank = EVENT_STATUS_RANK[incoming] ?? 0;
  if (currentRank >= 10) return false;
  return incomingRank >= currentRank;
}

function slugify(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 48) || "agent"
  );
}

function summarizePartnerCredential(credential: PartnerCredential): PartnerCredentialSummary {
  return {
    id: credential.id,
    partnerId: credential.partnerId,
    agentId: credential.agentId,
    label: credential.label,
    keyPrefix: credential.keyPrefix,
    scopes: credential.scopes,
    environment: credential.environment,
    lastUsedAt: credential.lastUsedAt,
    createdAt: credential.createdAt,
    rotatedAt: credential.rotatedAt,
    revokedAt: credential.revokedAt,
  };
}

function extractPOSTimezone(metadata: Record<string, unknown> | undefined): string | null {
  if (!metadata) return null;
  const candidates = [
    metadata.timezone,
    metadata.restaurantTimezone,
    metadata.locationTimezone,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }
  return null;
}

const ONBOARDING_DISCOVERY_FIXTURES: Record<OnboardingProvider, OnboardingDiscoveredAccount> = {
  olo: {
    provider: "olo",
    accountId: "acct_olo_demo_001",
    name: "Green Leaf Salads",
    locations: [
      {
        id: "olo_loc_1",
        name: "Green Leaf Salads - Palo Alto",
        address: "251 University Ave, Palo Alto, CA 94301",
        timezone: "America/Los_Angeles",
      },
      {
        id: "olo_loc_2",
        name: "Green Leaf Salads - Redwood City",
        address: "1450 Broadway, Redwood City, CA 94063",
        timezone: "America/Los_Angeles",
      },
    ],
  },
  pos: {
    provider: "pos",
    accountId: "acct_pos_demo_001",
    name: "Green Leaf Salads",
    locations: [
      {
        id: "pos_loc_1",
        name: "Green Leaf Salads - Sunnyvale",
        address: "301 Castro St, Mountain View, CA 94041",
        timezone: "America/Los_Angeles",
      },
      {
        id: "pos_loc_2",
        name: "Green Leaf Salads - San Jose",
        address: "3055 Olin Ave, San Jose, CA 95128",
        timezone: "America/Los_Angeles",
      },
    ],
  },
};

function buildStableIdempotencyPayload(order: CanonicalOrderIntent) {
  const payload: Record<string, unknown> = {
    ...order,
  };
  delete payload.created_at_iso;
  return payload;
}

export class PlatformService {
  private quoteExpiryMs = 15 * 60 * 1000;
  private operatorSessionTtlMs = 7 * 24 * 60 * 60 * 1000;
  private operatorSessionAuthRefreshMs = 5 * 60 * 1000;
  private retryBaseDelayMs = 75;
  private operatorSessionVerificationCache = new Map<string, number>();

  private quoteAllowedValidationCodes = new Set([
    "order_value_too_large",
    "too_many_items",
    "headcount_too_large",
  ]);

  constructor(
    private repository: PlatformRepository,
    private adapters = new POSAdapterRegistry(),
    private operatorAuth?: {
      isEnabled(): boolean;
      signInWithPassword(email: string, password: string): Promise<OperatorIdentity>;
      createUserWithPassword(email: string, password: string, fullName: string): Promise<OperatorIdentity>;
      getUserById(userId: string): Promise<OperatorIdentity | null>;
    },
    private env?: AppEnv,
  ) {
    if (env?.posRetryBaseDelayMs) {
      this.retryBaseDelayMs = env.posRetryBaseDelayMs;
    }
  }

  async listRestaurants() {
    return this.repository.listRestaurants();
  }

  verifyProviderWebhook(
    provider: Extract<POSProvider, "toast" | "deliverect">,
    headers: Record<string, unknown>,
    body?: { rawBody?: string; payload?: unknown },
  ) {
    if (provider === "deliverect") {
      const hmacSignature = headerValue(
        headers,
        "x-server-authorization-hmac-sha256",
        "X-Server-Authorization-HMAC-SHA256",
        "x-deliverect-hmac-sha256",
        "x-deliverect-signature",
      );
      if (hmacSignature) {
        if (!body?.rawBody) {
          throw new Error("deliverect webhook HMAC verification failed because raw request body was unavailable.");
        }
        const channelLinkId = extractDeliverectChannelLinkId(body.payload);
        const secretCandidates = Array.from(
          new Set([this.env?.deliverectWebhookSecret, channelLinkId].filter((value): value is string => Boolean(value))),
        );
        if (secretCandidates.length === 0) {
          throw new Error("deliverect webhook HMAC verification failed because no HMAC secret candidate was available.");
        }
        const provided = normalizeHmacSignature(hmacSignature);
        const matched = secretCandidates.some((secret) => timingSafeStringEqual(hmacSha256(body.rawBody!, secret), provided));
        if (!matched) {
          throw new Error("deliverect webhook HMAC verification failed.");
        }
        return { verified: true, required: true, message: "deliverect webhook HMAC verified." };
      }
    }

    const secret = provider === "deliverect" ? this.env?.deliverectWebhookSecret : this.env?.toastWebhookSecret;
    if (!secret) {
      return {
        verified: false,
        required: false,
        message: `${provider} webhook secret is not configured; verification skipped.`,
      };
    }
    const headerCandidates =
      provider === "deliverect"
        ? ["x-deliverect-webhook-secret", "x-provider-webhook-secret"]
        : ["x-toast-webhook-secret", "x-provider-webhook-secret"];
    const provided = headerValue(headers, ...headerCandidates);
    if (provided !== secret) {
      throw new Error(`${provider} webhook verification failed.`);
    }
    return { verified: true, required: true, message: `${provider} webhook verified.` };
  }

  async listAgentRestaurants(agentId: string) {
    const [restaurants, agent] = await Promise.all([this.repository.listRestaurants(), this.getAgent(agentId)]);
    const allowedEntries = await Promise.all(
      restaurants.map(async (restaurant) => {
        const [permission, connection, location, rules, menu] = await Promise.all([
          this.repository.getPermission(restaurant.id, agentId),
          this.repository.getPOSConnection(restaurant.id),
          this.repository.getLocation(restaurant.id),
          this.repository.getRules(restaurant.id),
          this.repository.getMenu(restaurant.id),
        ]);
        if (!permission || permission.status !== "allowed" || !restaurant.agentOrderingEnabled) {
          return null;
        }
        const fulfillmentTypes = resolveEffectiveFulfillmentTypes(restaurant, rules, connection, menu.version);
        return {
          id: restaurant.id,
          name: restaurant.name,
          location: restaurant.location,
          image_url: restaurant.imageUrl ?? null,
          imageUrl: restaurant.imageUrl ?? null,
          cuisine_type: restaurant.cuisineType ?? null,
          cuisine: restaurant.cuisineType ?? null,
          description: restaurant.description ?? null,
          rating: restaurant.rating ?? null,
          delivery_fee: restaurant.deliveryFee ?? null,
          minimum_order: restaurant.minimumOrder ?? null,
          max_order_dollar_amount: rules?.maxOrderDollarAmount ?? null,
          max_order_cents:
            rules?.maxOrderDollarAmount != null ? Math.round(rules.maxOrderDollarAmount * 100) : null,
          max_item_quantity: rules?.maxItemQuantity ?? null,
          max_headcount: rules?.maxHeadcount ?? null,
          supports_catering: restaurant.supportsCatering ?? false,
          address: formatRestaurantAddress(location, restaurant.location),
          address1: location?.address1 ?? null,
          city: location?.city ?? null,
          state: location?.state ?? null,
          postalCode: location?.postalCode ?? null,
          latitude: location?.latitude ?? null,
          longitude: location?.longitude ?? null,
          timezone: restaurant.timezone,
          posProvider: restaurant.posProvider,
          fulfillmentTypesSupported: fulfillmentTypes.restaurantTypes,
          defaultApprovalMode: restaurant.defaultApprovalMode,
          agentOrderingEnabled: restaurant.agentOrderingEnabled,
          posConnectionStatus: connection?.status ?? "not_connected",
          permissionStatus: permission.status,
          agent: {
            id: agent.id,
            slug: agent.slug,
            name: agent.name,
            partnerId: agent.partnerId ?? null,
            partner: agent.partner
              ? {
                  id: agent.partner.id,
                  name: agent.partner.name,
                  slug: agent.partner.slug,
                  status: agent.partner.status,
                }
              : null,
          },
        };
      }),
    );
    return allowedEntries.filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
  }

  async getAgentRestaurantDetail(restaurantId: string, agentId: string) {
    await this.validateAgentAccess(restaurantId, agentId);
    const [restaurant, location, rules, menu, connection] = await Promise.all([
      this.getRestaurant(restaurantId),
      this.repository.getLocation(restaurantId),
      this.getRules(restaurantId),
      this.repository.getMenu(restaurantId),
      this.repository.getPOSConnection(restaurantId),
    ]);
    const fulfillmentTypes = resolveEffectiveFulfillmentTypes(restaurant, rules, connection, menu.version);
    const categories = Array.from(new Set(menu.items.map((item) => item.category))).map((name) => ({
      name,
      itemCount: menu.items.filter((item) => item.category === name).length,
    }));
    return {
      restaurant: {
        id: restaurant.id,
        name: restaurant.name,
        location: restaurant.location,
        timezone: restaurant.timezone,
        imageUrl: restaurant.imageUrl ?? null,
        cuisineType: restaurant.cuisineType ?? null,
        description: restaurant.description ?? null,
        rating: restaurant.rating ?? null,
        deliveryFee: restaurant.deliveryFee ?? null,
        minimumOrder: restaurant.minimumOrder ?? null,
        supportsCatering: restaurant.supportsCatering ?? false,
        fulfillmentTypesSupported: fulfillmentTypes.restaurantTypes,
        defaultApprovalMode: restaurant.defaultApprovalMode,
        agentOrderingEnabled: restaurant.agentOrderingEnabled,
      },
      location: location
        ? {
            id: location.id,
            name: location.name,
            address1: location.address1,
            city: location.city,
            state: location.state,
            postalCode: location.postalCode,
            latitude: location.latitude ?? null,
            longitude: location.longitude ?? null,
          }
        : null,
      rules: {
        minimumLeadTimeMinutes: rules.minimumLeadTimeMinutes,
        maxOrderDollarAmount: rules.maxOrderDollarAmount,
        maxItemQuantity: rules.maxItemQuantity,
        maxHeadcount: rules.maxHeadcount,
        allowedFulfillmentTypes: fulfillmentTypes.ruleTypes,
        substitutionPolicy: rules.substitutionPolicy,
        paymentPolicy: rules.paymentPolicy,
      },
      menu: {
        version: menu.version ?? null,
        itemCount: menu.items.length,
        modifierGroupCount: menu.modifierGroups.length,
        modifierCount: menu.modifiers.length,
        categories,
        availableItemCount: menu.items.filter((item) => item.availability === "available").length,
      },
    };
  }

  async listAccessibleRestaurants(operatorUserId: string) {
    return this.repository.listAccessibleRestaurants(operatorUserId);
  }

  async listTeamMembers(authenticated: AuthenticatedOperator) {
    const ownerRestaurantIds = [...new Set(
      authenticated.memberships.filter((entry) => entry.role === "owner").map((entry) => entry.restaurantId),
    )];
    return this.repository.listTeamMembers(ownerRestaurantIds);
  }

  async createTeamMember(authenticated: AuthenticatedOperator, input: CreateTeamMemberInput) {
    const ownerRestaurantIds = [...new Set(
      authenticated.memberships.filter((entry) => entry.role === "owner").map((entry) => entry.restaurantId),
    )];
    if (ownerRestaurantIds.length === 0) {
      throw new Error("Only owner accounts can manage staff.");
    }

    const selectedRestaurantIds = input.accessScope === "all" ? ownerRestaurantIds : input.restaurantIds;
    if (selectedRestaurantIds.length === 0) {
      throw new Error("Choose at least one restaurant for this account.");
    }

    for (const restaurantId of selectedRestaurantIds) {
      if (!ownerRestaurantIds.includes(restaurantId)) {
        throw new Error("You can only assign access to restaurants you own.");
      }
    }

    const identity = this.operatorAuth?.isEnabled()
      ? await this.operatorAuth.createUserWithPassword(input.email, input.password, input.fullName)
      : undefined;

    const created = await this.repository.createTeamMember({
      creatorUserId: authenticated.user.id,
      teamMember: {
        ...input,
        supabaseUserId: identity?.id,
      },
      restaurantIds: selectedRestaurantIds,
    });

    await Promise.all(
      selectedRestaurantIds.map((restaurantId) =>
        this.repository.appendAuditLog({
          restaurantId,
          actorType: "manager",
          actorId: authenticated.user.id,
          action: "operator.team_member_created",
          targetType: "operator_user",
          targetId: created.user.id,
          summary: `Created ${input.role} account for ${created.user.email}.`,
        }),
      ),
    );

    return created;
  }

  async updateTeamMember(authenticated: AuthenticatedOperator, operatorUserId: string, input: UpdateTeamMemberInput) {
    const ownerRestaurantIds = [...new Set(
      authenticated.memberships.filter((entry) => entry.role === "owner").map((entry) => entry.restaurantId),
    )];
    if (ownerRestaurantIds.length === 0) {
      throw new Error("Only owner accounts can manage staff.");
    }
    if (authenticated.user.id === operatorUserId && input.role !== "owner") {
      throw new Error("You cannot remove your own owner access.");
    }

    const selectedRestaurantIds = input.accessScope === "all" ? ownerRestaurantIds : input.restaurantIds;
    if (selectedRestaurantIds.length === 0) {
      throw new Error("Choose at least one restaurant for this account.");
    }
    for (const restaurantId of selectedRestaurantIds) {
      if (!ownerRestaurantIds.includes(restaurantId)) {
        throw new Error("You can only assign access to restaurants you own.");
      }
    }

    const updated = await this.repository.updateTeamMember({
      operatorUserId,
      teamMember: input,
      restaurantIds: selectedRestaurantIds,
      managedRestaurantIds: ownerRestaurantIds,
    });

    await Promise.all(
      selectedRestaurantIds.map((restaurantId) =>
        this.repository.appendAuditLog({
          restaurantId,
          actorType: "manager",
          actorId: authenticated.user.id,
          action: "operator.team_member_updated",
          targetType: "operator_user",
          targetId: operatorUserId,
          summary: `Updated team access for ${updated.user.email}.`,
        }),
      ),
    );

    return updated;
  }

  async deleteTeamMember(authenticated: AuthenticatedOperator, operatorUserId: string) {
    if (authenticated.user.id === operatorUserId) {
      throw new Error("You cannot delete your own account.");
    }
    const ownerRestaurantIds = [...new Set(
      authenticated.memberships.filter((entry) => entry.role === "owner").map((entry) => entry.restaurantId),
    )];
    if (ownerRestaurantIds.length === 0) {
      throw new Error("Only owner accounts can manage staff.");
    }
    await this.repository.deleteTeamMember(operatorUserId, ownerRestaurantIds);
    await Promise.all(
      ownerRestaurantIds.map((restaurantId) =>
        this.repository.appendAuditLog({
          restaurantId,
          actorType: "manager",
          actorId: authenticated.user.id,
          action: "operator.team_member_deleted",
          targetType: "operator_user",
          targetId: operatorUserId,
          summary: `Removed team member access.`,
        }),
      ),
    );
  }

  async loginOperator(email: string, password: string) {
    const authenticated = await this.resolveOperatorLogin(email, password);
    const sessionToken = randomToken(32);
    const sessionTokenHash = sha256(sessionToken);
    const selectedMembership = authenticated.selectedMembership;
    await this.repository.createOperatorSession({
      operatorUserId: authenticated.user.id,
      selectedRestaurantId: selectedMembership.restaurantId,
      selectedLocationId: selectedMembership.locationId,
      sessionTokenHash,
      expiresAt: new Date(Date.now() + this.operatorSessionTtlMs).toISOString(),
    });
    await this.repository.appendAuditLog({
      restaurantId: selectedMembership.restaurantId,
      actorType: "manager",
      actorId: authenticated.user.id,
      action: "operator.login",
      targetType: "operator_user",
      targetId: authenticated.user.id,
      summary: `Operator ${authenticated.user.email} signed in.`,
    });
    await this.autoSyncMockRestaurantsForOperator(authenticated);
    this.operatorSessionVerificationCache.set(sessionTokenHash, Date.now());
    return {
      sessionToken,
      authenticated,
      restaurants: await this.repository.listAccessibleRestaurants(authenticated.user.id),
    };
  }

  async loginPlatformAdmin(email: string, password: string) {
    const authenticated = await this.repository.authenticatePlatformAdmin(email, sha256(password));
    if (!authenticated) {
      throw new Error("Invalid admin email or password.");
    }
    const sessionToken = randomToken(32);
    const sessionTokenHash = sha256(sessionToken);
    await this.repository.createPlatformAdminSession({
      adminUserId: authenticated.user.id,
      sessionTokenHash,
      expiresAt: new Date(Date.now() + this.operatorSessionTtlMs).toISOString(),
    });
    await this.appendPlatformAdminAudit(
      authenticated,
      "platform_admin.login",
      `Platform admin ${authenticated.user.email} signed in.`,
    );
    return { sessionToken, authenticated };
  }

  async signupRestaurant(input: RestaurantSignupInput) {
    const identity = this.operatorAuth?.isEnabled()
      ? await this.operatorAuth.createUserWithPassword(input.ownerEmail, input.password, input.ownerFullName)
      : undefined;
    const authenticated = await this.repository.createRestaurantAccount({
      ...input,
      supabaseUserId: identity?.id,
    });
    const sessionToken = randomToken(32);
    const sessionTokenHash = sha256(sessionToken);
    const selectedMembership = authenticated.selectedMembership;
    await this.repository.createOperatorSession({
      operatorUserId: authenticated.user.id,
      selectedRestaurantId: selectedMembership.restaurantId,
      selectedLocationId: selectedMembership.locationId,
      sessionTokenHash,
      expiresAt: new Date(Date.now() + this.operatorSessionTtlMs).toISOString(),
    });
    await this.repository.appendAuditLog({
      restaurantId: selectedMembership.restaurantId,
      actorType: "manager",
      actorId: authenticated.user.id,
      action: "operator.signup",
      targetType: "operator_user",
      targetId: authenticated.user.id,
      summary: `Restaurant account created for ${authenticated.user.email}.`,
    });
    this.operatorSessionVerificationCache.set(sessionTokenHash, Date.now());
    return {
      sessionToken,
      authenticated,
      restaurants: await this.repository.listAccessibleRestaurants(authenticated.user.id),
    };
  }

  async discoverOnboardingAccount(provider: OnboardingProvider, query: string): Promise<OnboardingDiscoveredAccount> {
    const fixture = ONBOARDING_DISCOVERY_FIXTURES[provider];
    const normalizedQuery = query.trim().toLowerCase();
    const matchingLocations = fixture.locations.filter((location) => {
      const haystack = `${fixture.name} ${location.name} ${location.address}`.toLowerCase();
      return haystack.includes(normalizedQuery);
    });
    if (matchingLocations.length === 0) {
      throw new Error("No matching restaurants found for that search.");
    }
    return {
      ...fixture,
      locations: matchingLocations,
    };
  }

  async createOnboardingAccessRequest(input: OnboardingAccessRequestInput): Promise<OnboardingRequestRecord> {
    const discovered = ONBOARDING_DISCOVERY_FIXTURES[input.provider];
    const allowedLocationIds = new Set(discovered.locations.map((location) => location.id));
    const invalidLocation = input.providerLocationIds.find((locationId) => !allowedLocationIds.has(locationId));
    if (input.providerAccountId !== discovered.accountId) {
      throw new Error("Imported account does not match the selected provider account.");
    }
    if (invalidLocation) {
      throw new Error("One or more selected locations are not available for this provider account.");
    }
    return this.repository.createOnboardingRequest({
      provider: input.provider,
      providerAccountId: input.providerAccountId,
      providerLocationIds: input.providerLocationIds,
      accountName: discovered.name,
      email: input.email,
    });
  }

  async activateOnboarding(input: OnboardingActivateInput) {
    const discovered = ONBOARDING_DISCOVERY_FIXTURES[input.provider];
    if (input.providerAccountId !== discovered.accountId) {
      throw new Error("Imported account does not match the selected provider account.");
    }
    const locations = discovered.locations.filter((location) => input.providerLocationIds.includes(location.id));
    if (locations.length !== input.providerLocationIds.length) {
      throw new Error("One or more selected locations are not available for this provider account.");
    }
    const identity = this.operatorAuth?.isEnabled()
      ? await this.operatorAuth.createUserWithPassword(input.email, input.password, input.fullName)
      : undefined;
    const authenticated = await this.repository.createOnboardingOperatorAccount({
      activation: {
        ...input,
        supabaseUserId: identity?.id,
      },
      accountName: discovered.name,
      locations,
    });
    const sessionToken = randomToken(32);
    const sessionTokenHash = sha256(sessionToken);
    const selectedMembership = authenticated.selectedMembership;
    await this.repository.createOperatorSession({
      operatorUserId: authenticated.user.id,
      selectedRestaurantId: selectedMembership.restaurantId,
      selectedLocationId: selectedMembership.locationId,
      sessionTokenHash,
      expiresAt: new Date(Date.now() + this.operatorSessionTtlMs).toISOString(),
    });
    await this.repository.appendAuditLog({
      restaurantId: selectedMembership.restaurantId,
      actorType: "manager",
      actorId: authenticated.user.id,
      action: "operator.onboarding_activated",
      targetType: "operator_user",
      targetId: authenticated.user.id,
      summary: `Operator ${authenticated.user.email} completed onboarding.`,
    });
    await this.autoSyncMockRestaurantsForOperator(authenticated);
    this.operatorSessionVerificationCache.set(sessionTokenHash, Date.now());
    return {
      sessionToken,
      authenticated,
      restaurants: await this.repository.listAccessibleRestaurants(authenticated.user.id),
    };
  }

  async getOnboardingRequest(requestId: string): Promise<OnboardingRequestRecord> {
    const request = await this.repository.getOnboardingRequest(requestId);
    if (!request) {
      throw new Error("Onboarding request not found.");
    }
    return request;
  }

  async getOperatorSession(rawSessionToken: string) {
    return this.resolveOperatorSession(rawSessionToken, {
      includeRestaurants: true,
      forceRefreshIdentity: true,
    });
  }

  async getOperatorRequestSession(rawSessionToken: string) {
    return this.resolveOperatorSession(rawSessionToken, {
      includeRestaurants: false,
      forceRefreshIdentity: false,
    });
  }

  async getPlatformAdminSession(rawSessionToken: string) {
    const authenticated = await this.repository.getAuthenticatedPlatformAdminBySessionToken(sha256(rawSessionToken));
    if (!authenticated) {
      throw new Error("Not signed in.");
    }
    return authenticated;
  }

  async getPlatformAdminRequestSession(rawSessionToken: string) {
    return this.getPlatformAdminSession(rawSessionToken);
  }

  async logoutPlatformAdmin(rawSessionToken: string) {
    const sessionTokenHash = sha256(rawSessionToken);
    const authenticated = await this.repository.getAuthenticatedPlatformAdminBySessionToken(sessionTokenHash);
    await this.repository.deletePlatformAdminSession(sessionTokenHash);
    if (authenticated) {
      await this.appendPlatformAdminAudit(
        authenticated,
        "platform_admin.logout",
        `Platform admin ${authenticated.user.email} signed out.`,
      );
    }
  }

  async logoutOperator(rawSessionToken: string) {
    const sessionTokenHash = sha256(rawSessionToken);
    const authenticated = await this.repository.getAuthenticatedOperatorBySessionToken(sessionTokenHash);
    await this.repository.deleteOperatorSession(sessionTokenHash);
    this.operatorSessionVerificationCache.delete(sessionTokenHash);
    if (authenticated) {
      await this.repository.appendAuditLog({
        restaurantId: authenticated.selectedMembership.restaurantId,
        actorType: "manager",
        actorId: authenticated.user.id,
        action: "operator.logout",
        targetType: "operator_user",
        targetId: authenticated.user.id,
        summary: `Operator ${authenticated.user.email} signed out.`,
      });
    }
  }

  async selectOperatorTenant(rawSessionToken: string, restaurantId: string, locationId?: string) {
    const sessionTokenHash = sha256(rawSessionToken);
    const session = await this.getOperatorRequestSession(rawSessionToken);
    const membership =
      session.memberships.find((entry) => entry.restaurantId === restaurantId && entry.locationId === locationId) ??
      session.memberships.find((entry) => entry.restaurantId === restaurantId);
    if (!membership) {
      throw new Error("Operator does not have access to that restaurant.");
    }
    await this.repository.updateOperatorSessionSelection(sessionTokenHash, restaurantId, locationId);
    return {
      ...session,
      selectedMembership: membership,
      restaurants: await this.repository.listAccessibleRestaurants(session.user.id),
    };
  }

  private async resolveOperatorSession(
    rawSessionToken: string,
    options: { includeRestaurants: boolean; forceRefreshIdentity: boolean },
  ) {
    const sessionTokenHash = sha256(rawSessionToken);
    let authenticated = await this.repository.getAuthenticatedOperatorBySessionToken(sessionTokenHash);
    if (!authenticated) {
      throw new Error("Not signed in.");
    }

    const shouldRefreshIdentity =
      this.operatorAuth?.isEnabled() &&
      authenticated.user.supabaseUserId &&
      (
        options.forceRefreshIdentity ||
        (this.operatorSessionVerificationCache.get(sessionTokenHash) ?? 0) + this.operatorSessionAuthRefreshMs <
          Date.now()
      );

    if (shouldRefreshIdentity) {
      const selectedMembershipBeforeRefresh = authenticated.selectedMembership;
      const authUser = await this.operatorAuth.getUserById(authenticated.user.supabaseUserId);
      if (!authUser) {
        this.operatorSessionVerificationCache.delete(sessionTokenHash);
        throw new Error("Supabase Auth account is no longer active.");
      }
      const refreshed = await this.repository.reconcileOperatorIdentity(authUser, { updateLastLoginAt: false });
      if (refreshed) {
        const preservedSelection =
          refreshed.memberships.find(
            (entry) =>
              entry.restaurantId === selectedMembershipBeforeRefresh.restaurantId &&
              entry.locationId === selectedMembershipBeforeRefresh.locationId,
          ) ??
          refreshed.memberships.find(
            (entry) => entry.restaurantId === selectedMembershipBeforeRefresh.restaurantId,
          ) ??
          refreshed.selectedMembership;
        authenticated = {
          ...refreshed,
          selectedMembership: preservedSelection,
        };
      }
      this.operatorSessionVerificationCache.set(sessionTokenHash, Date.now());
    }

    if (!options.includeRestaurants) {
      return authenticated;
    }

    return {
      ...authenticated,
      restaurants: await this.repository.listAccessibleRestaurants(authenticated.user.id),
    };
  }

  assertOperatorAccess(authenticated: AuthenticatedOperator, restaurantId: string, allowedRoles?: OperatorRole[]) {
    const membership = authenticated.memberships.find((entry) => entry.restaurantId === restaurantId);
    if (!membership) {
      throw new Error("Operator does not have access to this restaurant.");
    }
    if (allowedRoles && !allowedRoles.includes(membership.role)) {
      throw new Error("Operator role does not allow this action.");
    }
    return membership;
  }

  async getRestaurant(restaurantId: string) {
    const restaurant = await this.repository.getRestaurant(restaurantId);
    if (!restaurant) {
      throw new Error(`Restaurant ${restaurantId} not found.`);
    }
    return restaurant;
  }

  async updateRestaurant(restaurantId: string, patch: Partial<Restaurant>) {
    const updated = await this.repository.updateRestaurant(restaurantId, {
      ...patch,
      updatedAt: new Date().toISOString(),
    });
    await this.repository.appendAuditLog({
      restaurantId,
      actorType: "manager",
      actorId: "demo_manager",
      action: "restaurant.updated",
      targetType: "restaurant",
      targetId: restaurantId,
      summary: "Restaurant profile/settings updated.",
    });
    return updated;
  }

  async getDashboard(restaurantId: string): Promise<DashboardSnapshot> {
    const [restaurant, posConnection, dashboardStats, recentActivity] = await Promise.all([
      this.getRestaurant(restaurantId),
      this.getPOSConnection(restaurantId),
      this.repository.getDashboardStats(restaurantId),
      this.repository.getRecentAuditLogs(restaurantId, 6),
    ]);

    return {
      restaurant,
      posConnectionStatus: posConnection.status,
      agentOrderingStatus: restaurant.agentOrderingEnabled ? "enabled" : "disabled",
      ordersThisWeek: dashboardStats.ordersThisWeek,
      revenueFromAgentOrdersCents: dashboardStats.revenueFromAgentOrdersCents,
      topItem: dashboardStats.topItem,
      ordersNeedingReview: dashboardStats.ordersNeedingReview,
      recentActivity,
    };
  }

  async getPOSConnection(restaurantId: string) {
    const connection = await this.repository.getPOSConnection(restaurantId);
    if (!connection) {
      throw new Error(`POS connection missing for restaurant ${restaurantId}.`);
    }
    return connection;
  }

  async testPOSConnection(restaurantId: string) {
    const connection = await this.getPOSConnection(restaurantId);
    const adapter = this.adapters.getAdapter(connection);
    const result = await adapter.testConnection(connection);
    await this.repository.updatePOSConnection(connection.id, {
      status: result.status,
      lastTestedAt: result.checkedAt,
    });
    await this.repository.appendAuditLog({
      restaurantId,
      actorType: "manager",
      actorId: "demo_manager",
      action: "pos_connection.tested",
      targetType: "pos_connection",
      targetId: connection.id,
      summary: result.message,
    });
    return result;
  }

  async getMenu(restaurantId: string) {
    return this.repository.getMenu(restaurantId);
  }

  async replaceCanonicalMenu(
    restaurantId: string,
    menu: CanonicalMenuReplacement,
    summary = "Canonical menu imported.",
    menuVersionId?: string,
  ) {
    const replacement = await this.repository.replaceCanonicalMenu(restaurantId, menu, menuVersionId);
    await this.repository.appendAuditLog({
      restaurantId,
      actorType: "system",
      actorId: "menu_import",
      action: "menu.imported",
      targetType: "restaurant",
      targetId: restaurantId,
      summary,
    });
    return replacement;
  }

  buildDeliverectChannelWebhookUrls(baseUrl: string) {
    return {
      statusUpdateURL: appendPath(baseUrl, "/api/webhooks/deliverect/channel/order-status"),
      menuUpdateURL: appendPath(baseUrl, "/api/webhooks/deliverect/channel/menu"),
      snoozeUnsnoozeURL: appendPath(baseUrl, "/api/webhooks/deliverect/channel/snooze"),
      busyModeURL: appendPath(baseUrl, "/api/webhooks/deliverect/channel/busy-mode"),
      updatePrepTimeURL: appendPath(baseUrl, "/api/webhooks/deliverect/channel/prep-time"),
      courierUpdateURL: appendPath(baseUrl, "/api/webhooks/deliverect/channel/courier"),
      paymentUpdateURL: appendPath(baseUrl, "/api/webhooks/deliverect/channel/payment"),
    };
  }

  private async saveProviderEventOnce(record: Omit<EventIngestionRecord, "id" | "createdAt">) {
    const duplicate = record.externalEventId
      ? await this.repository.findEventIngestion(record.provider, record.externalEventId)
      : record.payloadHash
        ? await this.repository.findEventIngestionByPayloadHash(record.provider, record.payloadHash, record.eventType)
        : null;
    if (duplicate) {
      log("info", "provider_event_deduped", {
        provider: record.provider,
        eventType: record.eventType,
        externalEventId: record.externalEventId ?? null,
        payloadHash: record.payloadHash ?? null,
        existingEventId: duplicate.id,
        orderId: record.orderId ?? null,
      });
      return duplicate;
    }
    return this.repository.saveEventIngestion(record);
  }

  async ingestDeliverectChannelRegistration(payload: Record<string, unknown>, baseUrl: string) {
    const payloadRecord = eventPayloadRecord(payload);
    const eventHash = payloadHash(payloadRecord);
    const channelLinkId = extractDeliverectChannelLinkId(payload);
    if (!channelLinkId) {
      throw new Error("Deliverect channel registration is missing channelLinkId.");
    }
    const externalEventId = readString(payload, "eventId", "event_id", "id", "_id");
    log("info", "deliverect_webhook_received", {
      eventType: "channel_registration",
      externalEventId: externalEventId ?? null,
      channelLinkId,
      payloadHash: eventHash,
    });
    const duplicateEvent = externalEventId
      ? await this.repository.findEventIngestion("deliverect", externalEventId)
      : await this.repository.findEventIngestionByPayloadHash("deliverect", eventHash, "channel_registration");
    if (duplicateEvent) {
      log("info", "deliverect_webhook_deduped", {
        eventType: "channel_registration",
        externalEventId: externalEventId ?? null,
        channelLinkId,
        existingEventId: duplicateEvent.id,
      });
    }
    const status = readString(payload, "status");
    const externalLocationId = readString(payload, "locationId", "location", "channelLocationId") ?? channelLinkId;
    const channelLocationId = readString(payload, "channelLocationId");
    const channelName = this.env?.deliverectScope || "mealops";
    const accounts = await this.repository.listProviderAccounts("deliverect");
    const externalAccountId = readString(payload, "accountId", "account") ?? this.env?.deliverectAccountId ?? accounts[0]?.externalAccountId;
    const account =
      accounts.find((entry) => entry.externalAccountId === externalAccountId) ??
      await this.repository.upsertProviderAccount({
        provider: "deliverect",
        externalAccountId: externalAccountId ?? "unknown_deliverect_account",
        displayName: readString(payload, "accountName") ?? "Deliverect Channel Account",
        environment: this.env?.deliverectBaseUrl.includes("staging") ? "sandbox" : "production",
        status: deliverectProviderStatusFromChannelStatus(status),
        metadata: { scope: channelName },
        lastSyncedAt: new Date().toISOString(),
      });
    const providerLocations = await this.repository.listProviderLocations(account.id);
    const existing = providerLocations.find(
      (location) =>
        location.provider === "deliverect" &&
        (location.channelLinkId === channelLinkId ||
          location.externalLocationId === externalLocationId ||
          (channelLocationId && location.externalLocationId === channelLocationId)),
    );
    const parsedLocationAddress = extractDeliverectLocationAddress(payload);
    const deliverectLocationDetails = isObject(payload.deliverectLocationDetails)
      ? payload.deliverectLocationDetails
      : isObject(payload.deliverect_location_details)
        ? payload.deliverect_location_details
        : undefined;
    const location = await this.repository.upsertProviderLocation({
      id: existing?.id,
      providerAccountId: account.id,
      provider: "deliverect",
      externalLocationId,
      externalStoreId: existing?.externalStoreId,
      channelLinkId,
      channelName: existing?.channelName ?? channelName,
      name:
        readString(deliverectLocationDetails, "name") ??
        readString(payload, "locationName", "location_name", "channelLinkName", "name") ??
        existing?.name ??
        `Deliverect channel ${channelLinkId}`,
      address: parsedLocationAddress?.formattedAddress ?? existing?.address,
      timezone: existing?.timezone,
      status: deliverectProviderStatusFromChannelStatus(status),
      mappedRestaurantId: existing?.mappedRestaurantId,
      rawProviderPayload: {
        ...(existing?.rawProviderPayload ?? {}),
        channelRegistration: payload,
        channelLocationId,
        lastChannelStatus: status,
      },
      lastSyncedAt: new Date().toISOString(),
    });
    const event = duplicateEvent ?? await this.saveProviderEventOnce({
      provider: "deliverect",
      eventType: "channel_registration",
      payload: payloadRecord,
      payloadHash: eventHash,
      externalEventId,
      status: "processed",
      processedAt: new Date().toISOString(),
    });
    log("info", "deliverect_provider_location_resolved", {
      eventType: "channel_registration",
      channelLinkId,
      providerLocationId: location.id,
      restaurantId: location.mappedRestaurantId ?? null,
      externalLocationId,
    });
    return {
      ok: true,
      provider: "deliverect" as const,
      eventType: "channel_registration",
      eventId: event.id,
      duplicate: Boolean(duplicateEvent),
      channelLinkId,
      providerLocationId: location.id,
      restaurantId: location.mappedRestaurantId,
      webhooks: this.buildDeliverectChannelWebhookUrls(baseUrl),
    };
  }

  async ingestDeliverectMenuUpdate(payload: unknown) {
    const channelLinkId = extractDeliverectChannelLinkId(payload);
    const payloadRecord = eventPayloadRecord(payload);
    const eventHash = payloadHash(payloadRecord);
    const externalEventId = extractDeliverectMenuEventId(payload);
    log("info", "deliverect_webhook_received", {
      eventType: "menu_update",
      externalEventId: externalEventId ?? null,
      channelLinkId: channelLinkId ?? null,
      payloadHash: eventHash,
    });
    const snapshot = await this.repository.saveProviderMenuSnapshot({
      provider: "deliverect",
      channelLinkId,
      payloadHash: eventHash,
      externalEventId,
      status: "received",
      rawPayload: payloadRecord,
      receivedAt: new Date().toISOString(),
    });
    log("info", "deliverect_raw_menu_snapshot_saved", {
      snapshotId: snapshot.id,
      externalEventId: externalEventId ?? null,
      channelLinkId: channelLinkId ?? null,
      payloadHash: eventHash,
    });
    if (!channelLinkId) {
      await this.repository.updateProviderMenuSnapshot(snapshot.id, {
        status: "failed",
        error: "Deliverect menu update is missing channelLinkId.",
        processedAt: new Date().toISOString(),
      });
      log("error", "deliverect_menu_normalization_failed", {
        snapshotId: snapshot.id,
        externalEventId: externalEventId ?? null,
        error: "Deliverect menu update is missing channelLinkId.",
      });
      throw new Error("Deliverect menu update is missing channelLinkId.");
    }

    const providerLocations = await this.repository.listProviderLocations();
    const providerLocation = providerLocations.find(
      (location) => location.provider === "deliverect" && location.channelLinkId === channelLinkId,
    );
    if (!providerLocation) {
      log("warn", "deliverect_provider_location_unresolved", {
        eventType: "menu_update",
        snapshotId: snapshot.id,
        channelLinkId,
      });
      await Promise.all([
        this.repository.updateProviderMenuSnapshot(snapshot.id, {
          status: "ignored",
          channelLinkId,
          error: `No Deliverect provider location is mapped for channelLinkId ${channelLinkId}.`,
          processedAt: new Date().toISOString(),
        }),
        this.saveProviderEventOnce({
          provider: "deliverect",
          eventType: "menu_update",
          payload: payloadRecord,
          payloadHash: eventHash,
          externalEventId,
          status: "ignored",
          processedAt: new Date().toISOString(),
        }),
      ]);
      throw new Error(`No Deliverect provider location is mapped for channelLinkId ${channelLinkId}.`);
    }
    if (!providerLocation.mappedRestaurantId) {
      log("warn", "deliverect_provider_location_unresolved", {
        eventType: "menu_update",
        snapshotId: snapshot.id,
        channelLinkId,
        providerLocationId: providerLocation.id,
        reason: "unmapped_restaurant",
      });
      await Promise.all([
        this.repository.updateProviderMenuSnapshot(snapshot.id, {
          status: "ignored",
          providerLocationId: providerLocation.id,
          channelLinkId,
          error: `Deliverect provider location ${providerLocation.id} is not mapped to a Phantom restaurant.`,
          processedAt: new Date().toISOString(),
        }),
        this.saveProviderEventOnce({
          provider: "deliverect",
          eventType: "menu_update",
          payload: payloadRecord,
          payloadHash: eventHash,
          externalEventId,
          status: "ignored",
          processedAt: new Date().toISOString(),
        }),
      ]);
      throw new Error(`Deliverect provider location ${providerLocation.id} is not mapped to a Phantom restaurant.`);
    }

    const restaurantId = providerLocation.mappedRestaurantId;
    log("info", "deliverect_provider_location_resolved", {
      eventType: "menu_update",
      snapshotId: snapshot.id,
      channelLinkId,
      providerLocationId: providerLocation.id,
      restaurantId,
    });
    await this.repository.updateProviderMenuSnapshot(snapshot.id, {
      providerLocationId: providerLocation.id,
      restaurantId,
      channelLinkId,
    });
    await syncRestaurantImageFromDeliverectMenu(this.repository, restaurantId, payload);

    const duplicateSnapshot = await this.repository.findProviderMenuSnapshot("deliverect", {
      externalEventId,
      payloadHash: eventHash,
      excludeId: snapshot.id,
    });
    if (duplicateSnapshot?.status === "processed") {
      log("info", "deliverect_webhook_deduped", {
        eventType: "menu_update",
        snapshotId: snapshot.id,
        previousSnapshotId: duplicateSnapshot.id,
        externalEventId: externalEventId ?? null,
        channelLinkId,
      });
      const event = await this.saveProviderEventOnce({
        provider: "deliverect",
        eventType: "menu_update",
        payload: payloadRecord,
        payloadHash: eventHash,
        externalEventId,
        status: "ignored",
        processedAt: new Date().toISOString(),
      });
      await this.repository.updateProviderMenuSnapshot(snapshot.id, {
        status: "ignored",
        error: `Duplicate menu payload already processed as snapshot ${duplicateSnapshot.id}.`,
        processedAt: new Date().toISOString(),
      });
      return {
        ok: true,
        provider: "deliverect" as const,
        eventType: "menu_update",
        eventId: event.id,
        duplicate: true,
        channelLinkId,
        providerLocationId: providerLocation.id,
        restaurantId,
        snapshotId: snapshot.id,
        previousSnapshotId: duplicateSnapshot.id,
      };
    }

    const normalized = normalizeDeliverectMenu(restaurantId, payload);
    if (normalized.items.length === 0) {
      log("error", "deliverect_menu_normalization_failed", {
        snapshotId: snapshot.id,
        restaurantId,
        channelLinkId,
        error: EMPTY_DELIVERECT_MENU_ERROR,
      });
      await Promise.all([
        this.repository.updateProviderMenuSnapshot(snapshot.id, {
          status: "failed",
          error: EMPTY_DELIVERECT_MENU_ERROR,
          processedAt: new Date().toISOString(),
        }),
        this.saveProviderEventOnce({
          provider: "deliverect",
          eventType: "menu_update",
          payload: payloadRecord,
          payloadHash: eventHash,
          externalEventId,
          status: "failed",
          processedAt: new Date().toISOString(),
        }),
      ]);
      throw new Error(EMPTY_DELIVERECT_MENU_ERROR);
    }

    const menuTypeFulfillment = resolveDeliverectMenuTypeFulfillment(payload);
    const menuVersion = await this.repository.createCanonicalMenuVersion({
      restaurantId,
      provider: "deliverect",
      providerMenuSnapshotId: snapshot.id,
      versionHash: payloadHash({ provider: "deliverect", channelLinkId, normalized }),
      status: "draft",
      itemCount: normalized.items.length,
      categoryCount: new Set(normalized.items.map((item) => item.category)).size,
      modifierGroupCount: normalized.modifierGroups.length,
      metadata: {
        channelLinkId,
        providerLocationId: providerLocation.id,
        deliverectMenuTypes: menuTypeFulfillment.rawMenuTypes,
        deliverectKnownMenuTypes: menuTypeFulfillment.knownMenuTypes,
        deliverectMenuTypeLabels: menuTypeFulfillment.labels,
        deliverectMenuTypeSignal: menuTypeFulfillment.signalPresent,
        phantomFulfillmentTypesFromMenuType: menuTypeFulfillment.fulfillmentTypes,
      },
    });

    try {
      const importedAt = new Date().toISOString();
      const versionedMenu: CanonicalMenuReplacement = {
        items: normalized.items.map((item) => ({ ...item, menuVersionId: menuVersion.id })),
        modifierGroups: normalized.modifierGroups.map((group) => ({ ...group, menuVersionId: menuVersion.id })),
        modifiers: normalized.modifiers.map((modifier) => ({ ...modifier, menuVersionId: menuVersion.id })),
        mappings: normalized.mappings,
      };
      const replacement = await this.replaceCanonicalMenu(
        restaurantId,
        versionedMenu,
        `Imported ${normalized.items.length} Deliverect menu item(s) from menu webhook for channel link ${channelLinkId}.`,
        menuVersion.id,
      );
      log("info", "deliverect_menu_normalization_succeeded", {
        snapshotId: snapshot.id,
        restaurantId,
        channelLinkId,
        menuVersionId: menuVersion.id,
        itemCount: normalized.items.length,
        modifierGroupCount: normalized.modifierGroups.length,
      });
      const publishedVersion = await this.repository.publishCanonicalMenuVersion(menuVersion.id);
      log("info", "canonical_menu_version_published", {
        provider: "deliverect",
        snapshotId: snapshot.id,
        restaurantId,
        channelLinkId,
        menuVersionId: publishedVersion.id,
      });
      const connection = await this.getPOSConnection(restaurantId);
      await this.repository.updatePOSConnection(connection.id, {
        lastSyncedAt: importedAt,
      });
      const [event] = await Promise.all([
        this.saveProviderEventOnce({
          provider: "deliverect",
          eventType: "menu_update",
          payload: payloadRecord,
          payloadHash: eventHash,
          externalEventId,
          status: "processed",
          processedAt: importedAt,
        }),
        this.repository.updateProviderMenuSnapshot(snapshot.id, {
          status: "processed",
          processedAt: importedAt,
        }),
      ]);

      return {
        ok: true,
        provider: "deliverect" as const,
        eventType: "menu_update",
        eventId: event.id,
        snapshotId: snapshot.id,
        menuVersionId: publishedVersion.id,
        channelLinkId,
        providerLocationId: providerLocation.id,
        restaurantId,
        importedAt,
        itemCount: replacement.items.length,
        modifierGroupCount: replacement.modifierGroups.length,
        modifierCount: replacement.modifiers.length,
        mappingCount: replacement.mappings.length,
        needsReview: replacement.items.filter((item) => item.mappingStatus === "needs_review").length,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log("error", "deliverect_menu_normalization_failed", {
        snapshotId: snapshot.id,
        restaurantId,
        channelLinkId,
        error: message,
      });
      await Promise.all([
        this.repository.updateProviderMenuSnapshot(snapshot.id, {
          status: "failed",
          error: message,
          processedAt: new Date().toISOString(),
        }),
        this.saveProviderEventOnce({
          provider: "deliverect",
          eventType: "menu_update",
          payload: payloadRecord,
          payloadHash: eventHash,
          externalEventId,
          status: "failed",
          processedAt: new Date().toISOString(),
        }),
      ]);
      throw error;
    }
  }

  async ingestDeliverectChannelSnoozeUpdate(payload: Record<string, unknown>) {
    const eventHash = payloadHash(payload);
    log("info", "deliverect_webhook_received", {
      eventType: "snooze_update",
      externalEventId: this.deliverectChannelEventId("snooze_update", payload) ?? null,
      channelLinkId: extractDeliverectChannelLinkId(payload) ?? null,
      payloadHash: eventHash,
    });
    const providerLocation = await this.requireDeliverectProviderLocationForPayload(payload, "snooze_update");
    const changed = providerLocation.mappedRestaurantId
      ? await this.applyDeliverectSnoozeUpdate(providerLocation.mappedRestaurantId, payload)
      : 0;
    const event = await this.saveProviderEventOnce({
      provider: "deliverect",
      eventType: "snooze_update",
      payload,
      payloadHash: eventHash,
      externalEventId: this.deliverectChannelEventId("snooze_update", payload),
      status: providerLocation.mappedRestaurantId ? "processed" : "ignored",
      processedAt: new Date().toISOString(),
    });
    await this.rememberDeliverectChannelState(providerLocation, "snooze", payload, providerLocation.status);
    log("info", "deliverect_provider_location_resolved", {
      eventType: "snooze_update",
      channelLinkId: providerLocation.channelLinkId ?? null,
      providerLocationId: providerLocation.id,
      restaurantId: providerLocation.mappedRestaurantId ?? null,
      changedItemCount: changed,
    });
    return {
      ok: true,
      provider: "deliverect" as const,
      eventType: "snooze_update",
      eventId: event.id,
      channelLinkId: providerLocation.channelLinkId,
      providerLocationId: providerLocation.id,
      restaurantId: providerLocation.mappedRestaurantId,
      changedItemCount: changed,
    };
  }

  async ingestDeliverectChannelBusyMode(payload: Record<string, unknown>) {
    const eventHash = payloadHash(payload);
    log("info", "deliverect_webhook_received", {
      eventType: "busy_mode",
      externalEventId: this.deliverectChannelEventId("busy_mode", payload) ?? null,
      channelLinkId: extractDeliverectChannelLinkId(payload) ?? null,
      payloadHash: eventHash,
    });
    const providerLocation = await this.requireDeliverectProviderLocationForPayload(payload, "busy_mode");
    const event = await this.saveProviderEventOnce({
      provider: "deliverect",
      eventType: "busy_mode",
      payload,
      payloadHash: eventHash,
      externalEventId: this.deliverectChannelEventId("busy_mode", payload),
      status: "processed",
      processedAt: new Date().toISOString(),
    });
    const status = deliverectProviderStatusFromChannelStatus(readString(payload, "status"));
    const updated = await this.rememberDeliverectChannelState(providerLocation, "busyMode", payload, status);
    log("info", "deliverect_provider_location_resolved", {
      eventType: "busy_mode",
      channelLinkId: updated.channelLinkId ?? null,
      providerLocationId: updated.id,
      restaurantId: updated.mappedRestaurantId ?? null,
      providerLocationStatus: updated.status,
    });
    return {
      ok: true,
      provider: "deliverect" as const,
      eventType: "busy_mode",
      eventId: event.id,
      channelLinkId: updated.channelLinkId,
      providerLocationId: updated.id,
      restaurantId: updated.mappedRestaurantId,
      providerLocationStatus: updated.status,
    };
  }

  async ingestDeliverectChannelEvent(eventType: string, payload: Record<string, unknown>) {
    const result = await this.ingestProviderEvent("deliverect", eventType, payload);
    return {
      ok: true,
      provider: "deliverect" as const,
      eventType,
      eventId: result.id,
      status: result.status,
      orderId: result.orderId,
      externalEventId: result.externalEventId,
    };
  }

  private async requireDeliverectProviderLocationForPayload(payload: Record<string, unknown>, eventType: string) {
    const channelLinkId = extractDeliverectChannelLinkId(payload);
    const locationId = readString(payload, "locationId", "location");
    const providerLocations = await this.repository.listProviderLocations();
    const providerLocation = providerLocations.find(
      (location) =>
        location.provider === "deliverect" &&
        ((channelLinkId && location.channelLinkId === channelLinkId) ||
          (locationId && location.externalLocationId === locationId)),
    );
    if (!providerLocation) {
      log("warn", "deliverect_provider_location_unresolved", {
        eventType,
        channelLinkId: channelLinkId ?? null,
        locationId: locationId ?? null,
      });
      await this.saveProviderEventOnce({
        provider: "deliverect",
        eventType,
        payload,
        payloadHash: payloadHash(payload),
        externalEventId: this.deliverectChannelEventId(eventType, payload),
        status: "ignored",
        processedAt: new Date().toISOString(),
      });
      throw new Error(`No Deliverect provider location is mapped for channelLinkId ${channelLinkId ?? "(missing)"}.`);
    }
    return providerLocation;
  }

  private deliverectChannelEventId(eventType: string, payload: Record<string, unknown>) {
    const explicitEventId = readString(payload, "eventId", "event_id", "id", "_id");
    if (explicitEventId) return explicitEventId;
    const orderReference = readString(payload, "orderId", "channelOrderId");
    const timestamp = readString(payload, "timeStamp", "timestamp", "updatedAt");
    if (!orderReference && !timestamp) return undefined;
    return [
      eventType,
      extractDeliverectChannelLinkId(payload) ?? readString(payload, "locationId", "location"),
      orderReference,
      readString(payload, "status", "action"),
      timestamp,
    ].filter(Boolean).join(":") || undefined;
  }

  private async rememberDeliverectChannelState(
    providerLocation: ProviderLocation,
    key: string,
    payload: Record<string, unknown>,
    status: ProviderLocation["status"],
  ) {
    return this.repository.upsertProviderLocation({
      id: providerLocation.id,
      providerAccountId: providerLocation.providerAccountId,
      provider: providerLocation.provider,
      externalLocationId: providerLocation.externalLocationId,
      externalStoreId: providerLocation.externalStoreId,
      channelLinkId: providerLocation.channelLinkId,
      channelName: providerLocation.channelName,
      name: providerLocation.name,
      address: providerLocation.address,
      timezone: providerLocation.timezone,
      status,
      mappedRestaurantId: providerLocation.mappedRestaurantId,
      rawProviderPayload: {
        ...providerLocation.rawProviderPayload,
        channelState: {
          ...(isObject(providerLocation.rawProviderPayload.channelState)
            ? providerLocation.rawProviderPayload.channelState
            : {}),
          [key]: {
            payload,
            receivedAt: new Date().toISOString(),
          },
        },
      },
      lastSyncedAt: providerLocation.lastSyncedAt,
    });
  }

  private async applyDeliverectSnoozeUpdate(restaurantId: string, payload: Record<string, unknown>) {
    const menu = await this.repository.getMenu(restaurantId);
    const referenceByItemId = new Map(
      menu.mappings
        .filter((mapping) => mapping.provider === "deliverect" && mapping.canonicalType === "item")
        .map((mapping) => [mapping.canonicalId, mapping.providerReference]),
    );
    const updates = new Map<string, "available" | "unavailable">();
    let completeSnoozeSet: Set<string> | null = null;
    const operations = Array.isArray(payload.operations) ? payload.operations : [];
    for (const operation of operations) {
      if (!isObject(operation)) continue;
      const action = readString(operation, "action")?.toLowerCase();
      const data = isObject(operation.data) ? operation.data : {};
      const itemReferences = Array.isArray(data.items) ? data.items.map((item) => readString(item, "plu")).filter(Boolean) : [];
      const allSnoozed = Array.isArray(data.allSnoozedItems)
        ? data.allSnoozedItems.map((item) => readString(item, "plu")).filter(Boolean)
        : null;
      if (allSnoozed) {
        completeSnoozeSet = new Set(allSnoozed);
      }
      for (const reference of itemReferences) {
        updates.set(reference!, action === "unsnooze" ? "available" : "unavailable");
      }
    }
    if (updates.size === 0 && !completeSnoozeSet) return 0;
    let changed = 0;
    const items = menu.items.map((item) => {
      const providerReference = item.posRef.provider === "deliverect" ? item.posRef.externalId : referenceByItemId.get(item.id);
      if (!providerReference) return item;
      const availability = completeSnoozeSet
        ? completeSnoozeSet.has(providerReference) ? "unavailable" : "available"
        : updates.get(providerReference);
      if (!availability || availability === item.availability) return item;
      changed += 1;
      return { ...item, availability };
    });
    if (changed === 0) return 0;
    await this.replaceCanonicalMenu(
      restaurantId,
      { ...menu, items },
      `Applied Deliverect snooze update to ${changed} canonical menu item(s).`,
    );
    return changed;
  }

  async syncMenu(restaurantId: string) {
    const context = await this.getPOSContext(restaurantId);
    const adapter = this.adapters.getAdapter(context.connection);
    await this.repository.appendAuditLog({
      restaurantId,
      actorType: "manager",
      actorId: "demo_manager",
      action: "menu.sync_started",
      targetType: "restaurant",
      targetId: restaurantId,
      summary: `Menu sync started for ${context.connection.provider}.`,
    });
    const result = await adapter.syncMenu(context.connection, context);
    await this.repository.updatePOSConnection(context.connection.id, {
      lastSyncedAt: result.syncedAt,
    });
    const posTimezone = extractPOSTimezone(context.connection.metadata);
    if (posTimezone && posTimezone !== context.restaurant.timezone) {
      await this.repository.updateRestaurant(restaurantId, {
        timezone: posTimezone,
        updatedAt: new Date().toISOString(),
      });
      await this.repository.appendAuditLog({
        restaurantId,
        actorType: "system",
        actorId: `${context.connection.provider}_timezone_sync`,
        action: "restaurant.timezone_synced",
        targetType: "restaurant",
        targetId: restaurantId,
        summary: `Restaurant timezone synced from ${context.connection.provider}.`,
      });
    }
    await this.repository.appendAuditLog({
      restaurantId,
      actorType: "manager",
      actorId: "demo_manager",
      action: "menu.sync_completed",
      targetType: "restaurant",
      targetId: restaurantId,
      summary: result.message,
    });
    return result;
  }

  async getPOSDiagnostics(restaurantId: string): Promise<POSDiagnosticsResult> {
    const context = await this.getPOSContext(restaurantId);
    const adapter = this.adapters.getAdapter(context.connection);
    if (adapter.diagnose) {
      return adapter.diagnose(context.connection, context);
    }
    return {
      provider: context.connection.provider,
      mode: context.connection.mode,
      overallOk: true,
      checks: [{ key: "adapter", ok: true, message: "No adapter-specific diagnostics are implemented." }],
    };
  }

  async getRules(restaurantId: string) {
    const rules = await this.repository.getRules(restaurantId);
    if (!rules) {
      throw new Error(`Rules missing for restaurant ${restaurantId}.`);
    }
    return rules;
  }

  async updateRules(restaurantId: string, patch: Record<string, unknown>) {
    const updated = await this.repository.updateRules(restaurantId, patch as any);
    await this.repository.appendAuditLog({
      restaurantId,
      actorType: "manager",
      actorId: "demo_manager",
      action: "rules.updated",
      targetType: "ordering_rules",
      targetId: updated.id,
      summary: "Ordering rules updated.",
    });
    return updated;
  }

  private async getPlatformAuditRestaurantId() {
    return (await this.repository.listRestaurants())[0]?.id ?? null;
  }

  private async appendPlatformAdminAudit(authenticated: AuthenticatedPlatformAdmin, action: string, summary: string, targetId = authenticated.user.id) {
    const restaurantId = await this.getPlatformAuditRestaurantId();
    if (!restaurantId) return;
    await this.repository.appendAuditLog({
      restaurantId,
      actorType: "manager",
      actorId: authenticated.user.id,
      action,
      targetType: "platform_admin_user",
      targetId,
      summary,
    });
  }

  private async createUniqueAgentSlug(name: string, excludeAgentId?: string) {
    const base = slugify(name);
    const partners = await this.repository.listPartners();
    const agents = (await Promise.all(partners.map((partner) => this.repository.listPartnerAgents(partner.id)))).flat();
    const existingSlugs = new Set(
      agents.filter((agent) => agent.id !== excludeAgentId).map((agent) => agent.slug),
    );
    if (!existingSlugs.has(base)) return base;

    let suffix = 2;
    let candidate = `${base}-${suffix}`;
    while (existingSlugs.has(candidate)) {
      suffix += 1;
      candidate = `${base}-${suffix}`;
    }
    return candidate;
  }

  private async createUniquePartnerSlug(name: string, excludePartnerId?: string) {
    const base = slugify(name);
    const existingSlugs = new Set(
      (await this.repository.listPartners())
        .filter((partner) => partner.id !== excludePartnerId)
        .map((partner) => partner.slug),
    );
    if (!existingSlugs.has(base)) return base;

    let suffix = 2;
    let candidate = `${base}-${suffix}`;
    while (existingSlugs.has(candidate)) {
      suffix += 1;
      candidate = `${base}-${suffix}`;
    }
    return candidate;
  }

  async listProviderAccounts(_authenticated: AuthenticatedPlatformAdmin, provider?: POSProvider) {
    return this.repository.listProviderAccounts(provider);
  }

  async listProviderLocations(_authenticated: AuthenticatedPlatformAdmin, providerAccountId?: string) {
    return this.repository.listProviderLocations(providerAccountId);
  }

  async listProviderEvents(
    _authenticated: AuthenticatedPlatformAdmin,
    filter: {
      provider?: Extract<POSProvider, "toast" | "deliverect">;
      status?: EventIngestionRecord["status"];
      limit?: number;
    } = {},
  ) {
    return this.repository.listEventIngestions(filter);
  }

  async getProviderEvent(_authenticated: AuthenticatedPlatformAdmin, eventId: string) {
    const event = await this.repository.getEventIngestion(eventId);
    if (!event) {
      throw new Error(`Provider event ${eventId} not found.`);
    }
    return {
      ...event,
      payload: redactSensitivePayload(event.payload) as Record<string, unknown>,
    };
  }

  async listProviderMenuSnapshots(
    _authenticated: AuthenticatedPlatformAdmin,
    filter: {
      provider?: POSProvider;
      providerLocationId?: string;
      restaurantId?: string;
      status?: "received" | "processed" | "failed" | "ignored";
      limit?: number;
    } = {},
  ) {
    return this.repository.listProviderMenuSnapshots(filter);
  }

  async getProviderMenuSnapshot(_authenticated: AuthenticatedPlatformAdmin, snapshotId: string) {
    const snapshot = await this.repository.getProviderMenuSnapshot(snapshotId);
    if (!snapshot) {
      throw new Error(`Provider menu snapshot ${snapshotId} not found.`);
    }
    return {
      ...snapshot,
      rawPayload: redactSensitivePayload(snapshot.rawPayload) as Record<string, unknown>,
    };
  }

  async listCanonicalMenuVersions(_authenticated: AuthenticatedPlatformAdmin, restaurantId?: string) {
    return this.repository.listCanonicalMenuVersions(restaurantId);
  }

  async listDeliverectWebhookDebug(
    _authenticated: AuthenticatedPlatformAdmin,
    filter: {
      status?: EventIngestionRecord["status"];
      limit?: number;
    } = {},
  ) {
    const limit = Math.min(Math.max(filter.limit ?? 50, 1), 200);
    const [events, providerLocations] = await Promise.all([
      this.repository.listEventIngestions({ provider: "deliverect", status: filter.status, limit }),
      this.repository.listProviderLocations(),
    ]);
    const deliverectLocations = providerLocations.filter((location) => location.provider === "deliverect");

    const items = await Promise.all(events.map(async (event) => {
      const channelLinkId = extractDeliverectChannelLinkId(event.payload);
      let order: AgentOrderRecord | null = null;
      if (event.orderId) {
        order = await this.repository.getOrderById(event.orderId);
      }
      const providerLocation =
        deliverectLocations.find((location) => channelLinkId && location.channelLinkId === channelLinkId) ??
        deliverectLocations.find((location) => order && location.mappedRestaurantId === order.restaurantId) ??
        null;

      return {
        id: event.id,
        provider: event.provider,
        eventType: event.eventType,
        providerEventId: event.externalEventId ?? null,
        payloadHash: event.payloadHash ?? null,
        processingStatus: event.status,
        receivedAt: event.createdAt,
        processedAt: event.processedAt ?? null,
        orderId: event.orderId ?? null,
        restaurantId: providerLocation?.mappedRestaurantId ?? order?.restaurantId ?? null,
        providerLocationId: providerLocation?.id ?? null,
        channelLinkId: channelLinkId ?? providerLocation?.channelLinkId ?? null,
        externalStatus: readExternalStatus(event.payload) ?? null,
        errorSummary: event.status === "failed" ? readEventErrorSummary(event.payload) ?? "Provider event failed." : null,
      };
    }));

    return { items };
  }

  async listDeliverectMenuDebug(
    _authenticated: AuthenticatedPlatformAdmin,
    filter: {
      providerLocationId?: string;
      restaurantId?: string;
      channelLinkId?: string;
      status?: "received" | "processed" | "failed" | "ignored";
      limit?: number;
    } = {},
  ) {
    const limit = Math.min(Math.max(filter.limit ?? 50, 1), 200);
    const snapshots = (await this.repository.listProviderMenuSnapshots({
      provider: "deliverect",
      providerLocationId: filter.providerLocationId,
      restaurantId: filter.restaurantId,
      status: filter.status,
      limit: filter.channelLinkId ? 200 : limit,
    }))
      .filter((snapshot) => !filter.channelLinkId || snapshot.channelLinkId === filter.channelLinkId)
      .slice(0, limit);

    const versionCache = new Map<string, Awaited<ReturnType<PlatformRepository["getLatestPublishedMenuVersion"]>>>();
    const menuCache = new Map<string, Awaited<ReturnType<PlatformRepository["getMenu"]>>>();
    const items = await Promise.all(snapshots.map(async (snapshot) => {
      let latestVersion = null;
      let menu = null;
      if (snapshot.restaurantId) {
        if (!versionCache.has(snapshot.restaurantId)) {
          versionCache.set(snapshot.restaurantId, await this.repository.getLatestPublishedMenuVersion(snapshot.restaurantId));
        }
        if (!menuCache.has(snapshot.restaurantId)) {
          menuCache.set(snapshot.restaurantId, await this.repository.getMenu(snapshot.restaurantId));
        }
        latestVersion = versionCache.get(snapshot.restaurantId) ?? null;
        menu = menuCache.get(snapshot.restaurantId) ?? null;
      }
      const availableItems = menu?.items.filter((item) => item.availability === "available").length ?? 0;
      const unavailableItems = menu?.items.filter((item) => item.availability === "unavailable").length ?? 0;
      const availableModifiers = menu?.modifiers.filter((modifier) => modifier.isAvailable).length ?? 0;
      const unavailableModifiers = menu?.modifiers.filter((modifier) => !modifier.isAvailable).length ?? 0;

      return {
        snapshotId: snapshot.id,
        provider: snapshot.provider,
        providerLocationId: snapshot.providerLocationId ?? null,
        restaurantId: snapshot.restaurantId ?? null,
        channelLinkId: snapshot.channelLinkId ?? null,
        providerEventId: snapshot.externalEventId ?? null,
        payloadHash: snapshot.payloadHash,
        normalizationStatus: snapshot.status,
        receivedAt: snapshot.receivedAt,
        processedAt: snapshot.processedAt ?? null,
        latestPublishedCanonicalMenuVersion: latestVersion
          ? {
              id: latestVersion.id,
              status: latestVersion.status,
              itemCount: latestVersion.itemCount,
              modifierGroupCount: latestVersion.modifierGroupCount,
              categoryCount: latestVersion.categoryCount,
              publishedAt: latestVersion.publishedAt ?? null,
            }
          : null,
        itemCount: latestVersion?.itemCount ?? menu?.items.length ?? 0,
        modifierGroupCount: latestVersion?.modifierGroupCount ?? menu?.modifierGroups.length ?? 0,
        availabilitySummary: {
          items: {
            total: menu?.items.length ?? 0,
            available: availableItems,
            unavailable: unavailableItems,
          },
          modifiers: {
            total: menu?.modifiers.length ?? 0,
            available: availableModifiers,
            unavailable: unavailableModifiers,
          },
        },
        errorSummary: snapshot.error ? truncateText(snapshot.error) ?? null : null,
      };
    }));

    return { items };
  }

  async listDeliverectOrderSubmissionDebug(
    _authenticated: AuthenticatedPlatformAdmin,
    filter: {
      restaurantId?: string;
      channelLinkId?: string;
      limit?: number;
    } = {},
  ) {
    const limit = Math.min(Math.max(filter.limit ?? 50, 1), 200);
    const [restaurants, providerLocations] = await Promise.all([
      filter.restaurantId ? Promise.resolve([await this.getRestaurant(filter.restaurantId)]) : this.repository.listRestaurants(),
      this.repository.listProviderLocations(),
    ]);
    const deliverectLocations = providerLocations.filter((location) => location.provider === "deliverect");
    const summaries: Array<Record<string, unknown>> = [];

    for (const restaurant of restaurants) {
      const [connection, activeOrders, diagnostics] = await Promise.all([
        this.repository.getPOSConnection(restaurant.id),
        this.repository.listOrders(restaurant.id),
        this.repository.getOperationalDiagnostics(restaurant.id),
      ]);
      const providerLocation =
        deliverectLocations.find((location) => connection?.providerLocationId && location.id === connection.providerLocationId) ??
        deliverectLocations.find((location) => location.mappedRestaurantId === restaurant.id) ??
        null;
      const channelLinkId =
        providerLocation?.channelLinkId ??
        normalizeText(connection?.metadata.channelLinkId) ??
        normalizeText(connection?.metadata.channel_link_id) ??
        normalizeText(connection?.metadata.deliverectChannelLinkId);
      if (filter.channelLinkId && channelLinkId !== filter.channelLinkId) {
        continue;
      }
      const orderIds = Array.from(new Set([
        ...activeOrders.map((order) => order.id),
        ...diagnostics.failedOrders.map((order) => order.orderId),
        ...diagnostics.stuckOrders.map((order) => order.orderId),
        ...diagnostics.posFailures.map((failure) => failure.orderId).filter((orderId): orderId is string => Boolean(orderId)),
      ]));

      for (const orderId of orderIds) {
        const detail = await this.getSingleOrderDetail(restaurant.id, orderId);
        if (!detail) continue;
        const submissions = detail.submissions.filter((submission) => submission.provider === "deliverect");
        const retries = (detail.retries ?? []).filter((retry) => retry.stage === "pos_submit");
        if (connection?.provider !== "deliverect" && submissions.length === 0 && retries.length === 0) {
          continue;
        }
        const latestSubmission = submissions[0] ?? null;
        const latestProviderStatus = detail.statusEvents.find((event) => event.provider === "deliverect") ?? null;
        const latestFailedRetry = retries.find((retry) => retry.status === "failed") ?? null;
        const latestFailedSubmission = submissions.find((submission) => submission.status === "failed") ?? null;
        const reusableSubmission = submissions.find((submission) => submission.status !== "failed" && Boolean(submission.externalOrderId)) ?? null;
        const submissionAttempts = Math.max(
          retries.length,
          submissions.reduce((total, submission) => total + (submission.attemptCount ?? 1), 0),
        );

        summaries.push({
          phantomOrderId: detail.order.id,
          restaurantId: detail.order.restaurantId,
          provider: "deliverect",
          channelLinkId: channelLinkId ?? null,
          canonicalStatus: detail.order.status,
          latestProviderStatus: latestProviderStatus
            ? {
                status: latestProviderStatus.status,
                externalStatus: latestProviderStatus.externalStatus ?? null,
                providerEventId: latestProviderStatus.providerEventId ?? null,
                rawEventRef: latestProviderStatus.rawEventRef ?? null,
                receivedAt: latestProviderStatus.createdAt,
              }
            : null,
          submissionAttempts,
          latestSubmissionId: latestSubmission?.id ?? null,
          latestExternalOrderId: latestSubmission?.externalOrderId ?? null,
          latestSubmissionStatus: latestSubmission?.status ?? null,
          lastError: latestFailedRetry?.errorMessage ?? readEventErrorSummary(latestFailedSubmission?.response ?? {}) ?? null,
          idempotencyKey: this.buildIdempotencyKey("submit", detail.order.orderIntent),
          duplicateReuseAvailable: Boolean(reusableSubmission),
          reusedSubmissionId: reusableSubmission?.id ?? null,
          submittedAt: latestSubmission?.submittedAt ?? null,
          updatedAt: detail.order.updatedAt,
          safeToRetry: !reusableSubmission && ["approved", "submitted_to_pos", "failed"].includes(detail.order.status),
        });
      }
    }

    summaries.sort((left, right) => {
      const leftTime = new Date(String(left.submittedAt ?? left.updatedAt ?? 0)).getTime();
      const rightTime = new Date(String(right.submittedAt ?? right.updatedAt ?? 0)).getTime();
      return rightTime - leftTime;
    });

    return { items: summaries.slice(0, limit) };
  }

  async addProviderLocation(
    authenticated: AuthenticatedPlatformAdmin,
    input: {
      provider: POSProvider;
      externalAccountId: string;
      accountDisplayName: string;
      environment?: ProviderAccount["environment"];
      externalLocationId: string;
      externalStoreId?: string;
      channelLinkId: string;
      channelName?: string;
      name: string;
      address?: string;
      timezone?: string;
      status?: ProviderLocation["status"];
      metadata?: Record<string, unknown>;
    },
  ): Promise<{ account: ProviderAccount; location: ProviderLocation }> {
    const now = new Date().toISOString();
    const account = await this.repository.upsertProviderAccount({
      provider: input.provider,
      externalAccountId: input.externalAccountId,
      displayName: input.accountDisplayName,
      environment: input.environment ?? "sandbox",
      status: input.status ?? "sandbox",
      metadata: {
        baseUrl: input.provider === "deliverect" ? this.env?.deliverectBaseUrl : undefined,
        scope: input.provider === "deliverect" ? this.env?.deliverectScope || "mealops" : undefined,
        source: "manual",
      },
      lastSyncedAt: now,
    });
    const location = await this.repository.upsertProviderLocation({
      providerAccountId: account.id,
      provider: input.provider,
      externalLocationId: input.externalLocationId,
      externalStoreId: input.externalStoreId ?? input.externalLocationId,
      channelLinkId: input.channelLinkId,
      channelName: input.channelName,
      name: input.name,
      address: input.address ?? extractDeliverectLocationAddress(input.metadata)?.formattedAddress,
      timezone: input.timezone,
      status: input.status ?? "sandbox",
      rawProviderPayload: {
        source: "manual",
        ...(input.metadata ?? {}),
      },
      lastSyncedAt: now,
    });
    await this.applyProviderLocationSettings(location);

    await this.appendPlatformAdminAudit(
      authenticated,
      "provider.location_added",
      `Added ${input.provider} provider location ${input.name}.`,
      location.id,
    );

    return { account, location };
  }

  async mapProviderLocationToRestaurant(
    authenticated: AuthenticatedPlatformAdmin,
    providerLocationId: string,
    restaurantId: string,
    mode: "mock" | "live" = "live",
    status: "sandbox" | "connected" = "sandbox",
  ) {
    const [restaurant, providerLocations] = await Promise.all([
      this.repository.getRestaurant(restaurantId),
      this.repository.listProviderLocations(),
    ]);
    if (!restaurant) {
      throw new Error(`Restaurant ${restaurantId} not found.`);
    }
    const providerLocation = providerLocations.find((entry) => entry.id === providerLocationId);
    if (!providerLocation) {
      throw new Error(`Provider location ${providerLocationId} not found.`);
    }

    const connection = await this.repository.mapProviderLocationToRestaurant({
      providerLocationId,
      restaurantId,
      mode,
      status,
    });
    await this.applyProviderLocationSettings({ ...providerLocation, mappedRestaurantId: restaurantId });
    await this.appendPlatformAdminAudit(
      authenticated,
      "provider.location_mapped",
      `Mapped ${providerLocation.provider} location ${providerLocation.name} to ${restaurant.name}.`,
      connection.id,
    );
    return connection;
  }

  async provisionProviderLocation(
    authenticated: AuthenticatedPlatformAdmin,
    providerLocationId: string,
    options?: { contactEmail?: string; contactPhone?: string },
  ) {
    const result = await this.repository.provisionRestaurantFromProviderLocation({
      providerLocationId,
      contactEmail: options?.contactEmail ?? "ops@mealops.ai",
      contactPhone: options?.contactPhone ?? "(000) 000-0000",
    });
    await this.appendPlatformAdminAudit(
      authenticated,
      result.created ? "provider.location_provisioned" : "provider.location_provision_skipped",
      result.created
        ? `Provisioned ${result.providerLocation.provider} location ${result.providerLocation.name} as ${result.restaurant.name}.`
        : `Provider location ${result.providerLocation.name} is already provisioned.`,
      result.restaurant.id,
    );
    return result;
  }

  async provisionProviderLocations(
    authenticated: AuthenticatedPlatformAdmin,
    providerAccountId?: string,
    options?: { contactEmail?: string; contactPhone?: string },
  ) {
    const locations = await this.repository.listProviderLocations(providerAccountId);
    const results = [];
    for (const location of locations) {
      results.push(await this.provisionProviderLocation(authenticated, location.id, options));
    }
    return {
      createdCount: results.filter((entry) => entry.created).length,
      existingCount: results.filter((entry) => !entry.created).length,
      results,
    };
  }

  private async applyProviderLocationSettings(providerLocation: ProviderLocation) {
    if (!providerLocation.mappedRestaurantId) return;
    const fulfillmentTypes = resolveFulfillmentTypesFromProviderLocation(providerLocation);
    const providerAddress = resolveProviderLocationAddress(providerLocation);
    if (fulfillmentTypes.length === 0 && !providerAddress) return;
    const [restaurant, rules] = await Promise.all([
      this.repository.getRestaurant(providerLocation.mappedRestaurantId),
      this.repository.getRules(providerLocation.mappedRestaurantId),
    ]);
    if (!restaurant || !rules) return;
    const restaurantPatch: Partial<Restaurant> = {
      updatedAt: new Date().toISOString(),
    };
    if (fulfillmentTypes.length > 0) {
      restaurantPatch.fulfillmentTypesSupported = fulfillmentTypes;
    }
    if (providerAddress) {
      restaurantPatch.location = providerAddress.formattedAddress;
    }

    const updates: Array<Promise<unknown>> = [
      this.repository.updateRestaurant(providerLocation.mappedRestaurantId, restaurantPatch),
    ];
    if (fulfillmentTypes.length > 0) {
      updates.push(this.repository.updateRules(providerLocation.mappedRestaurantId, {
        allowedFulfillmentTypes: fulfillmentTypes,
      }));
    }
    if (providerAddress) {
      updates.push(this.repository.updateLocation(providerLocation.mappedRestaurantId, providerAddress.locationPatch));
    }
    await Promise.all(updates);
  }

  async getPlatformAdminPartners(_authenticated: AuthenticatedPlatformAdmin): Promise<PlatformAdminPartnerRecord[]> {
    const partners = await this.repository.listPartners();
    return Promise.all(
      partners.map(async (partner) => {
        const [agents, credentials] = await Promise.all([
          this.repository.listPartnerAgents(partner.id),
          this.repository.listPartnerCredentials(partner.id),
        ]);
        const credentialSummaries = credentials.map(summarizePartnerCredential);
        return {
          partner,
          credentials: credentialSummaries,
          agents: agents.map((agent) => ({
            agent,
            credentials: credentialSummaries.filter((credential) => credential.agentId === agent.id),
          })),
        };
      }),
    );
  }

  async createAdminPartner(
    authenticated: AuthenticatedPlatformAdmin,
    name: string,
    contactEmail: string | undefined,
    status: "pending" | "approved" | "suspended" = "approved",
  ) {
    const partnerName = normalizeText(name);
    if (!partnerName) throw new Error("Partner name is required.");
    const partner = await this.repository.createPartner({
      name: partnerName,
      slug: await this.createUniquePartnerSlug(partnerName),
      status,
      contactEmail: normalizeText(contactEmail) ?? undefined,
    });
    const auditRestaurantId = await this.getPlatformAuditRestaurantId();
    await this.repository.appendAuditLog({
      restaurantId: auditRestaurantId ?? partner.id,
      actorType: "manager",
      actorId: authenticated.user.id,
      action: "partner.created",
      targetType: "partner",
      targetId: partner.id,
      summary: `Created partner ${partner.name}.`,
    });
    return partner;
  }

  async updateAdminPartner(
    authenticated: AuthenticatedPlatformAdmin,
    partnerId: string,
    name: string,
    contactEmail: string | undefined,
    status: "pending" | "approved" | "suspended",
  ) {
    const partnerName = normalizeText(name);
    if (!partnerName) throw new Error("Partner name is required.");
    const existing = (await this.repository.listPartners()).find((entry) => entry.id === partnerId);
    if (!existing) {
      throw new Error(`Partner ${partnerId} not found.`);
    }
    const updated = await this.repository.updatePartner(partnerId, {
      name: partnerName,
      slug: await this.createUniquePartnerSlug(partnerName, partnerId),
      status,
      contactEmail: normalizeText(contactEmail) ?? undefined,
    });
    const auditRestaurantId = await this.getPlatformAuditRestaurantId();
    await this.repository.appendAuditLog({
      restaurantId: auditRestaurantId ?? partnerId,
      actorType: "manager",
      actorId: authenticated.user.id,
      action: "partner.updated",
      targetType: "partner",
      targetId: partnerId,
      summary: `Updated partner ${updated.name}.`,
    });
    return updated;
  }

  async removeAdminPartner(authenticated: AuthenticatedPlatformAdmin, partnerId: string) {
    const partner = (await this.repository.listPartners()).find((entry) => entry.id === partnerId);
    if (!partner) {
      throw new Error(`Partner ${partnerId} not found.`);
    }
    const auditRestaurantId = await this.getPlatformAuditRestaurantId();
    await this.repository.deletePartner(partnerId);
    await this.repository.appendAuditLog({
      restaurantId: auditRestaurantId ?? partnerId,
      actorType: "manager",
      actorId: authenticated.user.id,
      action: "partner.removed",
      targetType: "partner",
      targetId: partnerId,
      summary: `Removed partner ${partner.name}.`,
    });
  }

  async createAdminPartnerCredential(
    authenticated: AuthenticatedPlatformAdmin,
    partnerId: string,
    agentId: string,
    label: string,
    scopes: AgentApiScope[],
    environment: PartnerCredentialEnvironment,
  ) {
    const auditRestaurantId = await this.getPlatformAuditRestaurantId();
    const created = await this.createPartnerCredential(
      auditRestaurantId ?? partnerId,
      partnerId,
      agentId,
      label,
      scopes,
      environment,
      authenticated.user.id,
    );
    return { rawKey: created.rawKey, credential: summarizePartnerCredential(created.credential) };
  }

  async createAdminPartnerAgent(
    authenticated: AuthenticatedPlatformAdmin,
    partnerId: string,
    name: string,
  ) {
    const agentName = normalizeText(name);
    if (!agentName) throw new Error("Agent name is required.");

    const partner = (await this.repository.listPartners()).find((entry) => entry.id === partnerId);
    if (!partner) {
      throw new Error(`Partner ${partnerId} not found.`);
    }

    const auditRestaurantId = await this.getPlatformAuditRestaurantId();
    const agent = await this.repository.createPartnerAgent({
      partnerId,
      name: agentName,
      slug: await this.createUniqueAgentSlug(agentName),
      description: "",
    });

    await this.repository.appendAuditLog({
      restaurantId: auditRestaurantId ?? partnerId,
      actorType: "manager",
      actorId: authenticated.user.id,
      action: "partner.agent_created",
      targetType: "agent",
      targetId: agent.id,
      summary: `Created agent ${agent.name} for partner ${partner.name}.`,
    });
    return agent;
  }

  async updateAdminPartnerAgent(
    authenticated: AuthenticatedPlatformAdmin,
    partnerId: string,
    agentId: string,
    name: string,
  ) {
    const agentName = normalizeText(name);
    if (!agentName) throw new Error("Agent name is required.");
    const existing = await this.getAgent(agentId);
    if (existing.partnerId !== partnerId) {
      throw new Error(`Agent ${agentId} does not belong to partner ${partnerId}.`);
    }
    const updated = await this.repository.updatePartnerAgent(partnerId, agentId, {
      name: agentName,
      slug: await this.createUniqueAgentSlug(agentName, agentId),
    });
    const auditRestaurantId = await this.getPlatformAuditRestaurantId();
    await this.repository.appendAuditLog({
      restaurantId: auditRestaurantId ?? partnerId,
      actorType: "manager",
      actorId: authenticated.user.id,
      action: "partner.agent_updated",
      targetType: "agent",
      targetId: agentId,
      summary: `Updated agent ${updated.name} for partner ${partnerId}.`,
    });
    return updated;
  }

  async removeAdminPartnerAgent(authenticated: AuthenticatedPlatformAdmin, partnerId: string, agentId: string) {
    const agent = await this.getAgent(agentId);
    if (agent.partnerId !== partnerId) {
      throw new Error(`Agent ${agentId} does not belong to partner ${partnerId}.`);
    }
    const auditRestaurantId = await this.getPlatformAuditRestaurantId();
    await this.repository.removePartnerAgent(partnerId, agentId);
    await this.repository.appendAuditLog({
      restaurantId: auditRestaurantId ?? partnerId,
      actorType: "manager",
      actorId: authenticated.user.id,
      action: "partner.agent_removed",
      targetType: "agent",
      targetId: agentId,
      summary: `Removed agent ${agent.name} from partner ${partnerId}.`,
    });
  }

  async rotateAdminPartnerCredential(
    authenticated: AuthenticatedPlatformAdmin,
    partnerId: string,
    credentialId: string,
    scopes: AgentApiScope[],
    environment: PartnerCredentialEnvironment,
  ) {
    const auditRestaurantId = await this.getPlatformAuditRestaurantId();
    const rotated = await this.rotatePartnerCredential(
      auditRestaurantId ?? partnerId,
      partnerId,
      credentialId,
      scopes,
      environment,
      authenticated.user.id,
    );
    return { rawKey: rotated.rawKey, credential: summarizePartnerCredential(rotated.credential) };
  }

  async revokeAdminPartnerCredential(authenticated: AuthenticatedPlatformAdmin, partnerId: string, credentialId: string) {
    const auditRestaurantId = await this.getPlatformAuditRestaurantId();
    const credential = await this.revokePartnerCredential(
      auditRestaurantId ?? partnerId,
      partnerId,
      credentialId,
      authenticated.user.id,
    );
    return summarizePartnerCredential(credential);
  }

  async updateAdminPartnerCredential(
    authenticated: AuthenticatedPlatformAdmin,
    partnerId: string,
    credentialId: string,
    label: string,
    scopes: AgentApiScope[],
    environment: PartnerCredentialEnvironment,
  ) {
    const credentialLabel = normalizeText(label);
    if (!credentialLabel) throw new Error("Credential label is required.");
    const existing = (await this.repository.listPartnerCredentials(partnerId)).find((entry) => entry.id === credentialId);
    if (!existing) {
      throw new Error(`Partner credential ${credentialId} not found.`);
    }
    const credential = await this.repository.updatePartnerCredential(credentialId, {
      label: credentialLabel,
      scopes,
      environment,
    });
    const auditRestaurantId = await this.getPlatformAuditRestaurantId();
    await this.repository.appendAuditLog({
      restaurantId: auditRestaurantId ?? partnerId,
      actorType: "manager",
      actorId: authenticated.user.id,
      action: "partner.credential_updated",
      targetType: "partner_credential",
      targetId: credentialId,
      summary: `Updated partner credential ${credential.label} for partner ${partnerId}.`,
    });
    return summarizePartnerCredential(credential);
  }

  async removeAdminPartnerCredential(authenticated: AuthenticatedPlatformAdmin, partnerId: string, credentialId: string) {
    const credential = (await this.repository.listPartnerCredentials(partnerId)).find((entry) => entry.id === credentialId);
    if (!credential) {
      throw new Error(`Partner credential ${credentialId} not found.`);
    }
    const auditRestaurantId = await this.getPlatformAuditRestaurantId();
    await this.repository.deletePartnerCredential(partnerId, credentialId);
    await this.repository.appendAuditLog({
      restaurantId: auditRestaurantId ?? partnerId,
      actorType: "manager",
      actorId: authenticated.user.id,
      action: "partner.credential_removed",
      targetType: "partner_credential",
      targetId: credentialId,
      summary: `Removed partner credential ${credential.label} for partner ${partnerId}.`,
    });
  }

  async listAgents(restaurantId: string) {
    return this.repository.listAgents(restaurantId);
  }

  async createAgentApiKey(restaurantId: string, agentId: string, label: string, scopes: AgentApiScope[]) {
    const agent = await this.getAgent(agentId);
    if (agent.partnerId) {
      throw new Error("Partner-managed agent credentials are managed in Phantom Admin.");
    }
    const rawKey = `phm_${randomToken(18)}`;
    const key = await this.repository.createAgentApiKey({
      agentId,
      label,
      keyPrefix: rawKey.slice(0, 8),
      keyHash: sha256(rawKey),
      scopes,
    });
    await this.repository.appendAuditLog({
      restaurantId,
      actorType: "manager",
      actorId: "operator",
      action: "agent.api_key_created",
      targetType: "agent_api_key",
      targetId: key.id,
      summary: `Created API key ${key.label} for agent ${agentId}.`,
    });
    return { rawKey, key };
  }

  async createPartnerCredential(
    restaurantId: string,
    partnerId: string,
    agentId: string,
    label: string,
    scopes: AgentApiScope[],
    environment: "test" | "live" = "test",
    actorId = "operator",
  ) {
    const partner = (await this.repository.listPartners()).find((entry) => entry.id === partnerId);
    if (!partner) {
      throw new Error(`Partner ${partnerId} not found.`);
    }
    const agent = await this.getAgent(agentId);
    if (agent.partnerId !== partnerId) {
      throw new Error(`Agent ${agentId} does not belong to partner ${partnerId}.`);
    }
    const rawKey = `phm_${randomToken(18)}`;
    const credential = await this.repository.createPartnerCredential({
      partnerId,
      agentId,
      label,
      keyPrefix: rawKey.slice(0, 8),
      keyHash: sha256(rawKey),
      scopes,
      environment,
    });
    await this.repository.appendAuditLog({
      restaurantId,
      actorType: "manager",
      actorId,
      action: "partner.credential_created",
      targetType: "partner_credential",
      targetId: credential.id,
      summary: `Created ${environment} partner credential ${credential.label} for partner ${partnerId}.`,
    });
    return { rawKey, credential };
  }

  async rotatePartnerCredential(
    restaurantId: string,
    partnerId: string,
    credentialId: string,
    scopes: AgentApiScope[],
    environment: "test" | "live" = "test",
    actorId = "operator",
  ) {
    const existing = (await this.repository.listPartnerCredentials(partnerId)).find((entry) => entry.id === credentialId);
    if (!existing) {
      throw new Error(`Partner credential ${credentialId} not found.`);
    }
    const rawKey = `phm_${randomToken(18)}`;
    const credential = await this.repository.updatePartnerCredential(credentialId, {
      keyPrefix: rawKey.slice(0, 8),
      keyHash: sha256(rawKey),
      scopes,
      environment,
      rotatedAt: new Date().toISOString(),
      revokedAt: undefined,
    });
    await this.repository.appendAuditLog({
      restaurantId,
      actorType: "manager",
      actorId,
      action: "partner.credential_rotated",
      targetType: "partner_credential",
      targetId: credential.id,
      summary: `Rotated partner credential ${credential.label} for partner ${partnerId}.`,
    });
    return { rawKey, credential };
  }

  async revokePartnerCredential(restaurantId: string, partnerId: string, credentialId: string, actorId = "operator") {
    const existing = (await this.repository.listPartnerCredentials(partnerId)).find((entry) => entry.id === credentialId);
    if (!existing) {
      throw new Error(`Partner credential ${credentialId} not found.`);
    }
    const credential = await this.repository.updatePartnerCredential(credentialId, {
      revokedAt: new Date().toISOString(),
    });
    await this.repository.appendAuditLog({
      restaurantId,
      actorType: "manager",
      actorId,
      action: "partner.credential_revoked",
      targetType: "partner_credential",
      targetId: credential.id,
      summary: `Revoked partner credential ${credential.label} for partner ${partnerId}.`,
    });
    return credential;
  }

  async rotateAgentApiKey(restaurantId: string, agentId: string, keyId: string, scopes: AgentApiScope[]) {
    const agent = await this.getAgent(agentId);
    if (agent.partnerId) {
      throw new Error("Partner-managed agent credentials are managed in Phantom Admin.");
    }
    const existing = (await this.repository.listAgentApiKeys(agentId)).find((entry) => entry.id === keyId);
    if (!existing) {
      throw new Error(`Agent API key ${keyId} not found.`);
    }
    const rawKey = `phm_${randomToken(18)}`;
    const updated = await this.repository.updateAgentApiKey(keyId, {
      keyPrefix: rawKey.slice(0, 8),
      keyHash: sha256(rawKey),
      scopes,
      rotatedAt: new Date().toISOString(),
      revokedAt: undefined,
    });
    await this.repository.appendAuditLog({
      restaurantId,
      actorType: "manager",
      actorId: "operator",
      action: "agent.api_key_rotated",
      targetType: "agent_api_key",
      targetId: updated.id,
      summary: `Rotated API key ${updated.label} for agent ${agentId}.`,
    });
    return { rawKey, key: updated };
  }

  async revokeAgentApiKey(restaurantId: string, agentId: string, keyId: string) {
    const agent = await this.getAgent(agentId);
    if (agent.partnerId) {
      throw new Error("Partner-managed agent credentials are managed in Phantom Admin.");
    }
    const existing = (await this.repository.listAgentApiKeys(agentId)).find((entry) => entry.id === keyId);
    if (!existing) {
      throw new Error(`Agent API key ${keyId} not found.`);
    }
    const updated = await this.repository.updateAgentApiKey(keyId, {
      revokedAt: new Date().toISOString(),
    });
    await this.repository.appendAuditLog({
      restaurantId,
      actorType: "manager",
      actorId: "operator",
      action: "agent.api_key_revoked",
      targetType: "agent_api_key",
      targetId: updated.id,
      summary: `Revoked API key ${updated.label} for agent ${agentId}.`,
    });
    return updated;
  }

  async updateAgentPermission(restaurantId: string, agentId: string, status: any, notes?: string) {
    await this.getAgent(agentId);
    const permission = await this.repository.getPermission(restaurantId, agentId);
    const lastActivityAt = new Date().toISOString();
    const updated = permission
      ? await this.repository.updatePermission(permission.id, {
          status,
          notes,
          lastActivityAt,
        })
      : await this.repository.createPermission({
          restaurantId,
          agentId,
          status,
          notes,
          lastActivityAt,
        });
    await this.repository.appendAuditLog({
      restaurantId,
      actorType: "manager",
      actorId: "demo_manager",
      action: "agent.permission_updated",
      targetType: "restaurant_agent_permission",
      targetId: updated.id,
      summary: `Agent permission set to ${status}.`,
    });
    return updated;
  }

  async listOrders(restaurantId: string) {
    const orders = await this.repository.listOrders(restaurantId);
    return this.groupOrdersForReview(orders);
  }

  async getOrder(restaurantId: string, orderId: string) {
    const detail = await this.getSingleOrderDetail(restaurantId, orderId);
    if (!detail) {
      throw new Error(`Order ${orderId} not found.`);
    }
    const groupOrders = await this.getDecisionGroupOrders(restaurantId, detail.order);
    if (groupOrders.length <= 1) {
      return detail;
    }
    return this.buildGroupedOrderDetail(restaurantId, groupOrders);
  }

  async updateOrderStatus(
    restaurantId: string,
    orderId: string,
    status: AgentOrderStatus,
    message: string,
    options: {
      refreshReporting?: boolean;
      source?: "manager" | "agent" | "system" | "provider";
      provider?: POSProvider;
      providerEventId?: string;
      externalStatus?: string;
      rawEventRef?: string;
      actorType?: "manager" | "agent" | "system";
      actorId?: string;
    } = {},
  ) {
    const updated = await this.repository.updateOrder(orderId, {
      status,
      updatedAt: new Date().toISOString(),
    });
    await Promise.all([
      this.repository.appendStatusEvent({
        orderId,
        status,
        message,
        source: options.source,
        provider: options.provider,
        providerEventId: options.providerEventId,
        externalStatus: options.externalStatus,
        rawEventRef: options.rawEventRef,
      }),
      this.repository.appendAuditLog({
        restaurantId,
        actorType: options.actorType ?? "manager",
        actorId: options.actorId ?? "demo_manager",
        action: `order.${status}`,
        targetType: "agent_order",
        targetId: orderId,
        summary: message,
      }),
    ]);
    if (options.refreshReporting !== false) {
      await this.repository.refreshReportingMetrics(restaurantId);
    }
    return updated;
  }

  async approveOrder(restaurantId: string, orderId: string) {
    const order = await this.requirePendingDecisionOrder(restaurantId, orderId);
    const groupOrders = await this.getDecisionGroupOrders(restaurantId, order);
    const representative = groupOrders[0] ?? order;
    const decisionMessage = this.buildGroupDecisionMessage(groupOrders, "approved");

    await Promise.all(
      groupOrders.map(async (groupOrder) => {
        log("info", "order_approved", {
          restaurantId,
          orderId: groupOrder.id,
          splitGroupId: representative.splitGroupId ?? null,
        });
        await this.updateOrderStatus(restaurantId, groupOrder.id, "approved", decisionMessage, {
          refreshReporting: false,
        });
      }),
    );
    await this.repository.refreshReportingMetrics(restaurantId);

    await Promise.all(
      groupOrders.map(async (groupOrder) => {
        try {
          await this.submitOrderToPOS(restaurantId, groupOrder.id);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          await Promise.all([
            this.repository.appendStatusEvent({
              orderId: groupOrder.id,
              status: "approved",
              message: `Order was approved, but POS submission needs attention: ${message}`,
            }),
            this.repository.appendAuditLog({
              restaurantId,
              actorType: "system",
              actorId: "pos_submit_after_approval",
              action: "order.pos_submission_attention_needed",
              targetType: "agent_order",
              targetId: groupOrder.id,
              summary: `Order was approved, but POS submission needs attention: ${message}`,
            }),
          ]);
          log("warn", "pos_submission_attention_needed", {
            restaurantId,
            orderId: groupOrder.id,
            correlationId: groupOrder.externalOrderReference,
            splitGroupId: representative.splitGroupId ?? null,
            error: message,
          });
        }
      }),
    );

    return this.getCurrentGroupedOrderState(restaurantId, representative.id);
  }

  async rejectOrder(restaurantId: string, orderId: string) {
    const order = await this.requirePendingDecisionOrder(restaurantId, orderId);
    const groupOrders = await this.getDecisionGroupOrders(restaurantId, order);
    const representative = groupOrders[0] ?? order;
    const decisionMessage = this.buildGroupDecisionMessage(groupOrders, "rejected");

    await Promise.all(
      groupOrders.map(async (groupOrder) => {
        log("warn", "order_rejected", {
          restaurantId,
          orderId: groupOrder.id,
          splitGroupId: representative.splitGroupId ?? null,
        });
        await this.updateOrderStatus(restaurantId, groupOrder.id, "rejected", decisionMessage, {
          refreshReporting: false,
        });
      }),
    );
    await this.repository.refreshReportingMetrics(restaurantId);

    return this.getCurrentGroupedOrderState(restaurantId, representative.id);
  }

  async submitOrderToPOS(restaurantId: string, orderId: string) {
    const detail = await this.requireSingleOrderDetail(restaurantId, orderId);
    const context = await this.getPOSContext(restaurantId);
    const priorSubmission = detail.submissions.find(
      (submission) =>
        submission.provider === context.connection.provider &&
        submission.status !== "failed" &&
        Boolean(submission.externalOrderId),
    );
    if (priorSubmission) {
      if (context.connection.provider === "deliverect") {
        log("info", "deliverect_create_order_duplicate_reuse", {
          restaurantId,
          orderId,
          correlationId: detail.order.externalOrderReference,
          submissionId: priorSubmission.id,
          externalOrderId: priorSubmission.externalOrderId,
        });
      }
      return priorSubmission;
    }
    const quote = await this.ensureFreshQuote(detail.order);
    await this.assertReadyForPOSSubmission(detail.order, quote);
    await this.updateOrderStatus(restaurantId, orderId, "submitting_to_pos", "Submitting order to POS.", {
      refreshReporting: false,
    });
    const adapter = this.adapters.getAdapter(context.connection);
    const payloadSnapshot = this.buildPayloadSnapshot(detail.order, quote, context);
    if (context.connection.provider === "deliverect") {
      const channelLinkId =
        normalizeText(context.connection.metadata.channelLinkId) ??
        normalizeText(context.connection.metadata.channel_link_id) ??
        normalizeText(context.connection.metadata.deliverectChannelLinkId);
      log("info", "deliverect_create_order_submitted", {
        restaurantId,
        orderId,
        correlationId: detail.order.externalOrderReference,
        channelLinkId: channelLinkId ?? null,
        idempotencyKey: payloadSnapshot.orderIdempotencyKey,
      });
    }
    const response = await this.withRetry(
      "pos_submit",
      orderId,
      payloadSnapshot,
      async () => adapter.submitOrder(detail.order.orderIntent, this.quoteToQuoteResult(quote), context),
      (error) => this.isTransientError(error),
      3,
    );
    const submission: POSOrderSubmission = {
      id: createId("sub"),
      orderId,
      provider: context.connection.provider,
      status: response.status,
      externalOrderId: response.externalOrderId ?? undefined,
      response: response.raw,
      payloadSnapshot,
      attemptCount: 1,
      submittedAt: new Date().toISOString(),
    };
    await this.repository.saveSubmission(submission);
    log(response.ok ? "info" : "error", "pos_submission", {
      restaurantId,
      orderId,
      correlationId: detail.order.externalOrderReference,
      status: response.status,
      externalOrderId: response.externalOrderId ?? undefined,
    });
    if (context.connection.provider === "deliverect" && !response.ok) {
      log("error", "deliverect_create_order_failed", {
        restaurantId,
        orderId,
        correlationId: detail.order.externalOrderReference,
        status: response.status,
      });
    }
    await this.updateOrderStatus(
      restaurantId,
      orderId,
      response.status === "accepted" ? "accepted" : response.status === "failed" ? "failed" : "submitted_to_pos",
      response.message,
    );
    return submission;
  }

  async getReporting(restaurantId: string, range?: ReportingDateRange): Promise<RestaurantReportingSnapshot> {
    return this.repository.getReporting(restaurantId, range);
  }

  async authenticateAgentKey(rawKey: string) {
    const keyRecord = await this.repository.authenticateAgentKey(sha256(rawKey));
    if (!keyRecord) {
      throw new Error("Invalid API key.");
    }
    if (keyRecord.revokedAt) {
      throw new Error("API key has been revoked.");
    }
    if (keyRecord.credentialType === "agent_api_key") {
      const agent = await this.getAgent(keyRecord.agentId);
      if (agent.partnerId) {
        throw new Error("Invalid API key.");
      }
    }
    return keyRecord;
  }

  assertAgentScope(key: AgentApiKey, scope: AgentApiScope) {
    if (scope === "payments:start" && key.scopes.includes("orders:submit")) {
      return;
    }
    if (!key.scopes.includes(scope)) {
      throw new Error(`Agent API key is missing required scope: ${scope}.`);
    }
  }

  async validateAgentAccess(restaurantId: string, agentId: string) {
    const restaurant = await this.getRestaurant(restaurantId);
    if (!restaurant.agentOrderingEnabled) {
      throw new Error("Restaurant has agent ordering disabled.");
    }
    const permission = await this.repository.getPermission(restaurantId, agentId);
    if (!permission || permission.status !== "allowed") {
      throw new Error("Agent is not allowed for this restaurant.");
    }
    return permission;
  }

  private async resolveOperatorLogin(email: string, password: string) {
    if (!this.operatorAuth?.isEnabled()) {
      const authenticated = await this.repository.authenticateOperator(email, password);
      if (!authenticated) {
        await this.auditFailedOperatorLogin(email);
        throw new Error("Invalid email or password.");
      }
      return authenticated;
    }

    try {
      const authUser = await this.operatorAuth.signInWithPassword(email, password);
      const authenticated = await this.repository.reconcileOperatorIdentity(authUser, {
        allowSeededDevBootstrap: true,
        updateLastLoginAt: true,
      });
      if (!authenticated) {
        throw new Error("No restaurant access is configured for this operator.");
      }
      return authenticated;
    } catch (error) {
      await this.auditFailedOperatorLogin(email);
      throw error;
    }
  }

  private async auditFailedOperatorLogin(email: string) {
    try {
      const operator = await this.repository.reconcileOperatorIdentity(
        { id: "audit-only", email, fullName: "Restaurant Operator" },
        { allowSeededDevBootstrap: false, updateLastLoginAt: false, linkIdentity: false },
      );
      if (!operator) {
        return;
      }
      await this.repository.appendAuditLog({
        restaurantId: operator.selectedMembership.restaurantId,
        actorType: "manager",
        actorId: operator.user.id,
        action: "operator.login_failed",
        targetType: "operator_user",
        targetId: operator.user.id,
        summary: `Failed sign-in attempt for ${email}.`,
      });
    } catch (error) {
      log("warn", "auth_failure_audit_skipped", {
        email,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
    log("warn", "auth_failure", { email });
  }

  private async autoSyncMockRestaurantsForOperator(authenticated: AuthenticatedOperator) {
    for (const membership of authenticated.memberships) {
      try {
        const connection = await this.repository.getPOSConnection(membership.restaurantId);
        if (!connection || connection.mode !== "mock") {
          continue;
        }
        await this.syncMenu(membership.restaurantId);
      } catch (error) {
        console.warn(`Auto-sync skipped for restaurant ${membership.restaurantId}:`, error);
      }
    }
  }

  async getOperationalDiagnostics(restaurantId: string) {
    return this.repository.getOperationalDiagnostics(restaurantId);
  }

  async replayFailedOrder(restaurantId: string, orderId: string) {
    return this.submitOrderToPOS(restaurantId, orderId);
  }

  async refreshOrderStatus(restaurantId: string, orderId: string) {
    const detail = await this.requireSingleOrderDetail(restaurantId, orderId);
    const latestSubmission = detail.submissions[0];
    if (!latestSubmission?.externalOrderId) {
      throw new Error("Order has no external POS order id.");
    }
    const context = await this.getPOSContext(restaurantId);
    const adapter = this.adapters.getAdapter(context.connection);
    const status = await this.withRetry(
      "status_poll",
      orderId,
      { externalOrderId: latestSubmission.externalOrderId },
      async () => adapter.getOrderStatus(latestSubmission.externalOrderId!, context),
      (error) => this.isTransientError(error),
      2,
    );
    await this.appendTimelineAndAuditForStatus(restaurantId, orderId, status.status, status.message);
    return status;
  }

  async ingestProviderEvent(provider: Extract<POSProvider, "toast" | "deliverect">, eventType: string, payload: Record<string, unknown>) {
    const eventHash = payloadHash(payload);
    if (provider === "deliverect") {
      const normalized = normalizeDeliverectEvent(eventType, payload);
      log("info", "deliverect_webhook_received", {
        eventType,
        externalEventId: normalized.externalEventId ?? null,
        externalOrderReference: normalized.externalOrderReference ?? null,
        channelLinkId: extractDeliverectChannelLinkId(payload) ?? null,
        payloadHash: eventHash,
      });
      const existing = normalized.externalEventId
        ? await this.repository.findEventIngestion(provider, normalized.externalEventId)
        : await this.repository.findEventIngestionByPayloadHash(provider, eventHash, eventType);
      if (existing) {
        log("info", "deliverect_webhook_deduped", {
          eventType,
          externalEventId: normalized.externalEventId ?? null,
          existingEventId: existing.id,
          orderId: existing.orderId ?? null,
        });
        return existing;
      }
      const orderIdFromPayload = typeof payload.orderId === "string" ? payload.orderId : undefined;
      const matchedOrderId =
        (orderIdFromPayload && (await this.repository.getOrderById(orderIdFromPayload)) ? orderIdFromPayload : null) ??
        (normalized.externalOrderReference ? await this.repository.findOrderIdByReference(normalized.externalOrderReference) : null);
      if (matchedOrderId && normalized.status) {
        const order = await this.repository.getOrderById(matchedOrderId);
        if (!order) {
          throw new Error(`Order ${matchedOrderId} not found.`);
        }
        if (!shouldApplyProviderStatus(order.status, normalized.status)) {
          log("warn", "deliverect_order_status_unmapped", {
            eventType,
            externalEventId: normalized.externalEventId ?? null,
            orderId: matchedOrderId,
            externalStatus: normalized.externalStatus ?? readExternalStatus(payload) ?? null,
            mappedStatus: normalized.status,
            currentStatus: order.status,
            reason: "out_of_order_or_terminal",
          });
          return this.saveProviderEventOnce({
            provider,
            eventType,
            payload,
            payloadHash: eventHash,
            externalEventId: normalized.externalEventId,
            orderId: matchedOrderId,
            status: "ignored",
            processedAt: new Date().toISOString(),
          });
        }
        await this.updateOrderStatus(order.restaurantId, matchedOrderId, normalized.status, normalized.message, {
          source: "provider",
          provider,
          providerEventId: normalized.externalEventId,
          externalStatus: normalized.externalStatus,
          rawEventRef: normalized.rawEventRef,
          actorType: "system",
          actorId: "deliverect_webhook",
        });
        log("info", "deliverect_order_status_mapped", {
          eventType,
          externalEventId: normalized.externalEventId ?? null,
          orderId: matchedOrderId,
          restaurantId: order.restaurantId,
          externalStatus: normalized.externalStatus ?? readExternalStatus(payload) ?? null,
          mappedStatus: normalized.status,
        });
        return this.saveProviderEventOnce({
          provider,
          eventType,
          payload,
          payloadHash: eventHash,
          externalEventId: normalized.externalEventId,
          orderId: matchedOrderId,
          status: "processed",
          processedAt: new Date().toISOString(),
        });
      }
      log("warn", "deliverect_order_status_unmapped", {
        eventType,
        externalEventId: normalized.externalEventId ?? null,
        externalOrderReference: normalized.externalOrderReference ?? null,
        orderId: matchedOrderId ?? orderIdFromPayload ?? null,
        externalStatus: normalized.externalStatus ?? readExternalStatus(payload) ?? null,
        reason: matchedOrderId ? "unmapped_status" : "order_not_found",
      });
      return this.saveProviderEventOnce({
        provider,
        eventType,
        payload,
        payloadHash: eventHash,
        externalEventId: normalized.externalEventId,
        orderId: matchedOrderId ?? orderIdFromPayload,
        status: matchedOrderId ? "received" : "ignored",
        processedAt: matchedOrderId ? undefined : new Date().toISOString(),
      });
    }
    const externalEventId = typeof payload.id === "string" ? payload.id : undefined;
    const existing = externalEventId
      ? await this.repository.findEventIngestion(provider, externalEventId)
      : await this.repository.findEventIngestionByPayloadHash(provider, eventHash, eventType);
    if (existing) return existing;
    return this.saveProviderEventOnce({
      provider,
      eventType,
      payload,
      payloadHash: eventHash,
      externalEventId,
      orderId: typeof payload.orderId === "string" ? payload.orderId : undefined,
      status: "received",
      processedAt: undefined,
    });
  }

  async validateOrder(orderInput: unknown): Promise<OrderValidationResult> {
    const parsed = canonicalOrderIntentSchema.parse(orderInput);
    return this.runIdempotent("validate", parsed, async (orderId, idempotencyKey) => {
      const result = await this.performRuleValidation(parsed, orderId);
      result.idempotencyKey = idempotencyKey;
      log("info", "order_validation", {
        restaurantId: parsed.restaurant_id,
        agentId: parsed.agent_id,
        orderId,
        correlationId: parsed.external_order_reference,
        idempotencyKey,
        valid: result.valid,
      });
      return result;
    });
  }

  async quoteOrder(orderInput: unknown): Promise<OrderQuote> {
    const parsed = canonicalOrderIntentSchema.parse(orderInput);
    return this.runIdempotent("quote", parsed, async (orderId, idempotencyKey) => {
      const validation = await this.performRuleValidation(parsed, orderId);
      const blockingIssues = validation.issues.filter(
        (issue) =>
          issue.severity === "error" &&
          !this.quoteAllowedValidationCodes.has(issue.code),
      );
      if (blockingIssues.length > 0) {
        throw new Error("Order is not valid for quoting.");
      }
      const quote = await this.withRetry(
        "quote",
        undefined,
        parsed,
        async () => this.buildQuote(parsed, orderId),
        (error) => this.isTransientError(error),
        2,
      );
      quote.idempotencyKey = idempotencyKey;
      log("info", "order_quote", {
        restaurantId: parsed.restaurant_id,
        agentId: parsed.agent_id,
        orderId,
        correlationId: parsed.external_order_reference,
        idempotencyKey,
        totalCents: quote.totalCents,
      });
      return quote;
    });
  }

  async startPaymentSession(
    orderInput: unknown,
    paymentSession: { successUrl: string; cancelUrl: string },
  ): Promise<POSPaymentSessionResult> {
    const parsed = canonicalOrderIntentSchema.parse(orderInput);
    await this.validateAgentAccess(parsed.restaurant_id, parsed.agent_id);
    const validation = await this.performRuleValidation(
      parsed,
      (await this.repository.findOrderIdByReference(parsed.external_order_reference)) ?? parsed.external_order_reference,
    );
    if (!validation.valid) {
      throw new Error("Order failed validation.");
    }
    const context = await this.getPOSContext(parsed.restaurant_id);
    const adapter = this.adapters.getAdapter(context.connection);
    if (!adapter.startPayment) {
      throw new Error(`POS provider ${context.connection.provider} does not support hosted payment starts.`);
    }
    const quote = await this.withRetry(
      "quote",
      undefined,
      parsed,
      async () => this.buildQuote(parsed, parsed.external_order_reference),
      (error) => this.isTransientError(error),
      2,
    );
    const quoteResult = this.quoteToQuoteResult(quote);
    const result = await adapter.startPayment(parsed, quoteResult, paymentSession, context);
    log("info", "payment_start", {
      restaurantId: parsed.restaurant_id,
      agentId: parsed.agent_id,
      correlationId: parsed.external_order_reference,
      paymentStatus: result.status,
      paymentReference: result.paymentReference ?? null,
    });
    return result;
  }

  async submitAgentOrder(orderInput: unknown): Promise<AgentOrderRecord> {
    const parsed = canonicalOrderIntentSchema.parse(orderInput);
    return this.runIdempotent("submit", parsed, async (orderId, idempotencyKey) => {
      await this.validateAgentAccess(parsed.restaurant_id, parsed.agent_id);
      const validation = await this.performRuleValidation(parsed, orderId);
      validation.idempotencyKey = idempotencyKey;
      if (!validation.valid) {
        throw new Error("Order failed validation.");
      }
      const quote = await this.withRetry(
        "quote",
        undefined,
        parsed,
        async () => this.buildQuote(parsed, orderId),
        (error) => this.isTransientError(error),
        2,
      );
      quote.idempotencyKey = idempotencyKey;
      const approvalRequired = await this.requiresApproval(parsed);
      const connection = await this.repository.getPOSConnection(parsed.restaurant_id);
      const autoAcceptedInMock = !approvalRequired && connection?.mode === "mock";
      const now = new Date().toISOString();
      const sourceQuoteTotalCents = this.readSourceQuoteTotalCents(parsed);
      const order: AgentOrderRecord = {
        id: orderId,
        restaurantId: parsed.restaurant_id,
        agentId: parsed.agent_id,
        externalOrderReference: parsed.external_order_reference,
        customerName: parsed.customer.name,
        customerEmail: parsed.customer.email,
        teamName: parsed.customer.teamName,
        fulfillmentType: parsed.fulfillment_type,
        requestedFulfillmentTime: parsed.requested_fulfillment_time,
        headcount: parsed.headcount,
        status: approvalRequired ? "needs_approval" : autoAcceptedInMock ? "accepted" : "approved",
        approvalRequired,
        totalEstimateCents: sourceQuoteTotalCents ?? quote.totalCents,
        createdAt: now,
        updatedAt: now,
        packagingInstructions: parsed.packaging_instructions,
        dietaryConstraints: parsed.dietary_constraints,
        orderIntent: parsed,
      };
      const { items, modifiers } = this.buildOrderRelations(orderId, parsed);
      await this.repository.createOrderGraph({
        order,
        items,
        modifiers,
        validationResult: validation,
        quote,
        statusEvents: [
          { orderId, status: "received", message: "Order received through agent API." },
          {
            orderId,
            status: order.status,
            message: approvalRequired
              ? "Order requires approval based on restaurant rules."
              : autoAcceptedInMock
                ? "Order auto-accepted by mock restaurant rules."
                : "Order auto-approved by restaurant rules.",
          },
        ],
        auditLog: {
          restaurantId: parsed.restaurant_id,
          actorType: "agent",
          actorId: parsed.agent_id,
          action: "order.submitted",
          targetType: "agent_order",
          targetId: order.id,
          summary: `Agent submitted order ${parsed.external_order_reference}.`,
        },
      });
      await this.repository.refreshReportingMetrics(parsed.restaurant_id);
      log("info", "order_submit", {
        restaurantId: parsed.restaurant_id,
        agentId: parsed.agent_id,
        orderId,
        correlationId: parsed.external_order_reference,
        idempotencyKey,
        status: order.status,
      });
      return order;
    });
  }

  async getAgentOrderStatus(orderId: string) {
    const order = await this.repository.getOrderById(orderId);
    if (!order) {
      throw new Error(`Order ${orderId} not found.`);
    }
    const latestSubmission = await this.repository.getLatestSubmission(orderId);
    if (latestSubmission?.externalOrderId) {
      try {
        const context = await this.getPOSContext(order.restaurantId);
        const adapter = this.adapters.getAdapter(context.connection);
        await this.withRetry(
          "status_poll",
          orderId,
          { externalOrderId: latestSubmission.externalOrderId },
          async () => adapter.getOrderStatus(latestSubmission.externalOrderId!, context),
          (error) => this.isTransientError(error),
          2,
        );
      } catch {
        // preserve last known state
      }
    }
    return {
      orderId,
      status: order.status,
      totalEstimateCents: order.totalEstimateCents,
      externalOrderId: latestSubmission?.externalOrderId ?? null,
      updatedAt: order.updatedAt,
    };
  }

  private async getAgent(agentId: string): Promise<Agent> {
    const agent = await this.repository.getAgent(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found.`);
    }
    return agent;
  }

  private async getPOSContext(restaurantId: string): Promise<POSContext> {
    const [restaurant, location, connection, menu] = await Promise.all([
      this.getRestaurant(restaurantId),
      this.repository.getLocation(restaurantId),
      this.getPOSConnection(restaurantId),
      this.repository.getMenu(restaurantId),
    ]);
    if (!location) {
      throw new Error("Restaurant location missing.");
    }
    return {
      restaurant,
      location,
      connection,
      menuVersion: menu.version,
      menuItems: menu.items,
      modifierGroups: menu.modifierGroups,
      modifiers: menu.modifiers,
      menuMappings: menu.mappings,
    };
  }

  private async performRuleValidation(order: CanonicalOrderIntent, orderId: string): Promise<OrderValidationResult> {
    const restaurant = await this.getRestaurant(order.restaurant_id);
    await this.validateAgentAccess(order.restaurant_id, order.agent_id);
    const rules = await this.getRules(order.restaurant_id);
    const context = await this.getPOSContext(order.restaurant_id);
    const issues: ValidationIssue[] = [];
    const minutesUntil = (new Date(order.requested_fulfillment_time).getTime() - Date.now()) / 60000;

    if (!restaurant.agentOrderingEnabled) {
      issues.push({
        code: "ordering_disabled",
        message: "Restaurant has disabled agent ordering.",
        severity: "error",
      });
    }

    if (minutesUntil < rules.minimumLeadTimeMinutes) {
      issues.push({
        code: "lead_time_too_short",
        message: `Minimum lead time is ${rules.minimumLeadTimeMinutes} minutes.`,
        field: "requested_fulfillment_time",
        severity: "error",
      });
    }

    if (order.headcount > rules.maxHeadcount) {
      issues.push({
        code: "headcount_too_large",
        message: `Maximum headcount is ${rules.maxHeadcount}.`,
        field: "headcount",
        severity: "error",
      });
    }

    const fulfillmentTypes = resolveEffectiveFulfillmentTypes(restaurant, rules, context.connection, context.menuVersion);
    if (!fulfillmentTypes.ruleTypes.includes(order.fulfillment_type)) {
      issues.push({
        code: "fulfillment_type_not_allowed",
        message: `Fulfillment type ${order.fulfillment_type} is not enabled for this restaurant.`,
        field: "fulfillment_type",
        severity: "error",
      });
    }

    const requestedMenuVersionId =
      normalizeText(order.metadata?.menu_version_id) ??
      normalizeText(order.metadata?.menuVersionId) ??
      normalizeText(order.metadata?.canonical_menu_version_id);
    if (context.menuVersion && requestedMenuVersionId && requestedMenuVersionId !== context.menuVersion.id) {
      issues.push({
        code: "menu_version_stale",
        message: "The cart was built against an older menu version. Refresh the restaurant menu and validate again.",
        field: "metadata.menu_version_id",
        severity: "error",
      });
    }

    const menuItemMap = new Map(context.menuItems.map((item) => [item.id, item]));
    const modifierGroupMap = new Map(context.modifierGroups.map((group) => [group.id, group]));
    const modifierMap = new Map(context.modifiers.map((modifier) => [modifier.id, modifier]));

    let aggregateItemQuantity = 0;
    let aggregateTotalCents = 0;

    order.items.forEach((item, index) => {
      aggregateItemQuantity += item.quantity;
      const menuItem = menuItemMap.get(item.item_id);
      if (!menuItem) {
        issues.push({
          code: "item_not_found",
          message: `Item ${item.item_id} is not in the canonical menu.`,
          field: `items.${index}.item_id`,
          severity: "error",
        });
        return;
      }
      aggregateTotalCents += menuItem.priceCents * item.quantity;
      if (menuItem.availability !== "available") {
        issues.push({
          code: "item_unavailable",
          message: `${menuItem.name} is currently unavailable.`,
          field: `items.${index}.item_id`,
          severity: "error",
        });
      }
      if (menuItem.mappingStatus === "needs_review") {
        issues.push({
          code: "mapping_needs_review",
          message: `${menuItem.name} still needs POS mapping review.`,
          field: `items.${index}.item_id`,
          severity: "warning",
        });
      }
      const modifierSelectionsByGroup = new Map<string, number>();
      item.modifiers.forEach((modifier, modifierIndex) => {
        const group = modifierGroupMap.get(modifier.modifier_group_id);
        const modifierRecord = modifierMap.get(modifier.modifier_id);
        modifierSelectionsByGroup.set(
          modifier.modifier_group_id,
          (modifierSelectionsByGroup.get(modifier.modifier_group_id) ?? 0) + modifier.quantity,
        );
        if (!group || !menuItem.modifierGroupIds.includes(group.id)) {
          issues.push({
            code: "modifier_group_invalid",
            message: `Modifier group ${modifier.modifier_group_id} is not valid for ${menuItem.name}.`,
            field: `items.${index}.modifiers.${modifierIndex}.modifier_group_id`,
            severity: "error",
          });
        }
        if (!modifierRecord || modifierRecord.modifierGroupId !== modifier.modifier_group_id) {
          issues.push({
            code: "modifier_invalid",
            message: `Modifier ${modifier.modifier_id} is not valid for group ${modifier.modifier_group_id}.`,
            field: `items.${index}.modifiers.${modifierIndex}.modifier_id`,
            severity: "error",
          });
        } else {
          if (!modifierRecord.isAvailable) {
            issues.push({
              code: "modifier_unavailable",
              message: `${modifierRecord.name} is currently unavailable.`,
              field: `items.${index}.modifiers.${modifierIndex}.modifier_id`,
              severity: "error",
            });
          }
          aggregateTotalCents += modifierRecord.priceCents * modifier.quantity;
        }
      });

      if (context.menuVersion) {
        menuItem.modifierGroupIds.forEach((groupId) => {
          const group = modifierGroupMap.get(groupId);
          if (!group) return;
          const selectionCount = modifierSelectionsByGroup.get(groupId) ?? 0;
          const minimum = Math.max(group.required ? 1 : 0, group.minSelections);
          if (selectionCount < minimum) {
            issues.push({
              code: "required_modifier_missing",
              message: `${group.name} requires at least ${minimum} selection${minimum === 1 ? "" : "s"}.`,
              field: `items.${index}.modifiers`,
              severity: "error",
            });
          }
          if (group.maxSelections != null && selectionCount > group.maxSelections) {
            issues.push({
              code: "too_many_modifiers",
              message: `${group.name} allows at most ${group.maxSelections} selection${group.maxSelections === 1 ? "" : "s"}.`,
              field: `items.${index}.modifiers`,
              severity: "error",
            });
          }
        });
      }
    });

    if (aggregateItemQuantity > rules.maxItemQuantity) {
      issues.push({
        code: "too_many_items",
        message: `Maximum total item quantity is ${rules.maxItemQuantity}.`,
        field: "items",
        severity: "error",
      });
    }

    const maxOrderCents = Math.round(rules.maxOrderDollarAmount * 100);
    if (aggregateTotalCents > maxOrderCents) {
      issues.push({
        code: "order_value_too_large",
        message: `Maximum order amount is $${rules.maxOrderDollarAmount.toFixed(2)} before tax and fees.`,
        severity: "error",
      });
    }

    return {
      id: createId("ovr"),
      orderId,
      valid: issues.every((issue) => issue.severity !== "error"),
      issues,
      checkedAt: new Date().toISOString(),
    };
  }

  private quoteToQuoteResult(quote: OrderQuote) {
    return {
      ok: true,
      subtotalCents: quote.subtotalCents,
      taxCents: quote.taxCents,
      feesCents: quote.feesCents,
      tipCents: quote.tipCents,
      totalCents: quote.totalCents,
      message: "Using stored quote.",
    };
  }

  private normalizeReplayResponse<T extends Record<string, unknown>>(
    scope: "validate" | "quote" | "submit",
    response: T,
  ): T {
    if (scope !== "quote") {
      return response;
    }

    const normalized = { ...response } as T & {
      subtotalCents?: unknown;
      taxCents?: unknown;
      feesCents?: unknown;
      tipCents?: unknown;
      totalCents?: unknown;
    };

    const subtotalCents = Number(normalized.subtotalCents ?? 0) || 0;
    const taxCents = Number(normalized.taxCents ?? 0) || 0;
    const feesCents = Number(normalized.feesCents ?? 0) || 0;
    const tipCents = Number(normalized.tipCents ?? 0) || 0;
    const totalCents = Number(normalized.totalCents ?? subtotalCents + taxCents + feesCents + tipCents) || 0;

    normalized.subtotalCents = subtotalCents;
    normalized.taxCents = taxCents;
    normalized.feesCents = feesCents;
    normalized.tipCents = tipCents;
    normalized.totalCents = totalCents;

    return normalized;
  }

  private readSourceQuoteTotalCents(order: CanonicalOrderIntent) {
    const raw = order.metadata?.source_quote_total_cents;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
  }

  private async buildQuote(order: CanonicalOrderIntent, orderId: string) {
    const context = await this.getPOSContext(order.restaurant_id);
    const adapter = this.adapters.getAdapter(context.connection);
    const quoteResult = await adapter.quoteOrder(order, context);
    return {
      id: createId("quote"),
      orderId,
      subtotalCents: quoteResult.subtotalCents,
      taxCents: quoteResult.taxCents,
      feesCents: quoteResult.feesCents,
      tipCents: quoteResult.tipCents,
      totalCents: quoteResult.totalCents,
      currency: "USD" as const,
      quotedAt: new Date().toISOString(),
    };
  }

  private buildPayloadSnapshot(order: AgentOrderRecord, quote: OrderQuote, context: POSContext) {
    return {
      canonicalOrder: order.orderIntent,
      quote: this.quoteToQuoteResult(quote),
      posProvider: context.connection.provider,
      menuVersionId: context.menuVersion?.id,
      orderIdempotencyKey: this.buildIdempotencyKey("submit", order.orderIntent),
      restaurantGuid: context.connection.restaurantGuid,
      locationId: context.connection.locationId,
      mappedItemIds: order.orderIntent.items.map((item) => item.item_id),
    };
  }

  private async quotePersistedOrder(order: AgentOrderRecord) {
    const quote = await this.buildQuote(order.orderIntent, order.id);
    await this.repository.saveQuote(quote);
    return quote;
  }

  private async requireFreshQuote(order: AgentOrderRecord) {
    const quote = await this.repository.getLatestQuote(order.id);
    if (!quote) {
      throw new Error("Order must be quoted before submitting to POS.");
    }
    const ageMs = Date.now() - new Date(quote.quotedAt).getTime();
    if (ageMs > this.quoteExpiryMs) {
      throw new Error("Stored quote has expired. Requote before submitting to POS.");
    }
    return quote;
  }

  private async ensureFreshQuote(order: AgentOrderRecord) {
    try {
      return await this.requireFreshQuote(order);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes("expired")) {
        throw error;
      }
      const refreshed = await this.withRetry(
        "quote",
        order.id,
        order.orderIntent,
        async () => this.quotePersistedOrder(order),
        (retryError) => this.isTransientError(retryError),
        2,
      );
      await this.repository.appendAuditLog({
        restaurantId: order.restaurantId,
        actorType: "system",
        actorId: "quote_refresh",
        action: "order.quote_refreshed",
        targetType: "agent_order",
        targetId: order.id,
        summary: "Stored quote expired and was refreshed before POS submission.",
      });
      await this.repository.appendStatusEvent({
        orderId: order.id,
        status: order.status,
        message: "Stored quote expired and was refreshed before POS submission.",
      });
      log("info", "order_quote_refreshed", {
        restaurantId: order.restaurantId,
        orderId: order.id,
        correlationId: order.externalOrderReference,
        totalCents: refreshed.totalCents,
      });
      return refreshed;
    }
  }

  private async appendTimelineAndAuditForStatus(restaurantId: string, orderId: string, status: AgentOrderStatus, message: string) {
    await this.repository.appendStatusEvent({ orderId, status, message });
    await this.repository.appendAuditLog({
      restaurantId,
      actorType: "system",
      actorId: "status_refresh",
      action: `order.${status}`,
      targetType: "agent_order",
      targetId: orderId,
      summary: message,
    });
  }

  private isTransientError(error: unknown) {
    const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
    return message.includes("timeout") || message.includes("tempor") || message.includes("429") || message.includes("5");
  }

  private async sleep(ms: number) {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async withRetry<T>(
    stage: "quote" | "pos_submit" | "status_poll",
    orderId: string | undefined,
    payloadSnapshot: Record<string, unknown>,
    task: () => Promise<T>,
    shouldRetry: (error: unknown) => boolean,
    maxAttempts: number,
  ) {
    let attempt = 0;
    let lastError: unknown;
    while (attempt < maxAttempts) {
      attempt += 1;
      try {
        const result = await task();
        await this.repository.saveRetryAttempt({
          orderId,
          stage,
          attemptNumber: attempt,
          status: "succeeded",
          payloadSnapshot,
          responseSnapshot: result && typeof result === "object" ? (result as Record<string, unknown>) : { result },
        });
        if (attempt > 1 || stage === "pos_submit") {
          log("info", "operation_retry_succeeded", {
            stage,
            orderId: orderId ?? null,
            attemptNumber: attempt,
          });
        }
        return result;
      } catch (error) {
        lastError = error;
        const message = error instanceof Error ? error.message : String(error);
        await this.repository.saveRetryAttempt({
          orderId,
          stage,
          attemptNumber: attempt,
          status: "failed",
          errorMessage: message,
          payloadSnapshot,
        });
        log(attempt >= maxAttempts || !shouldRetry(error) ? "error" : "warn", "operation_retry_failed", {
          stage,
          orderId: orderId ?? null,
          attemptNumber: attempt,
          willRetry: attempt < maxAttempts && shouldRetry(error),
          error: message,
        });
        if (attempt >= maxAttempts || !shouldRetry(error)) {
          throw error;
        }
        await this.sleep(this.retryBaseDelayMs * 2 ** (attempt - 1));
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  private buildIdempotencyKey(scope: "validate" | "quote" | "submit", order: CanonicalOrderIntent) {
    return String(order.metadata?.idempotency_key ?? `${scope}:${order.external_order_reference}`);
  }

  private isDuplicateIdempotencyError(error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return message.includes("api_idempotency_records_scope_restaurant_id_agent_id_idempo_key");
  }

  private async waitForIdempotentResult<T extends Record<string, unknown>>(
    scope: "validate" | "quote" | "submit",
    restaurantId: string,
    agentId: string,
    idempotencyKey: string,
    requestHash: string,
  ): Promise<T | null> {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const record = await this.repository.getIdempotencyRecord(scope, restaurantId, agentId, idempotencyKey);
      if (!record) {
        await this.sleep(25);
        continue;
      }
      if (record.requestHash !== requestHash) {
        throw new Error(`Idempotency key ${idempotencyKey} was already used for a different request.`);
      }
      if (record.status === "completed" && record.response) {
        return this.normalizeReplayResponse(scope, record.response as T);
      }
      if (record.status === "failed") {
        throw new Error(record.error || "A prior identical request failed.");
      }
      await this.sleep(50);
    }
    return null;
  }

  private async runIdempotent<T extends Record<string, unknown>>(
    scope: "validate" | "quote" | "submit",
    parsed: CanonicalOrderIntent,
    work: (orderId: string, idempotencyKey: string) => Promise<T>,
  ): Promise<T> {
    const idempotencyKey = this.buildIdempotencyKey(scope, parsed);
    const requestHash = sha256(JSON.stringify(buildStableIdempotencyPayload(parsed)));
    const existing = await this.repository.getIdempotencyRecord(scope, parsed.restaurant_id, parsed.agent_id, idempotencyKey);
    if (existing) {
      if (existing.requestHash !== requestHash) {
        throw new Error(`Idempotency key ${idempotencyKey} was already used for a different request.`);
      }
      if (existing.status === "completed" && existing.response) {
        return this.normalizeReplayResponse(scope, existing.response as T);
      }
      if (existing.status === "pending") {
        const pendingResult = await this.waitForIdempotentResult<T>(scope, parsed.restaurant_id, parsed.agent_id, idempotencyKey, requestHash);
        if (pendingResult) {
          return pendingResult;
        }
        throw new Error("An identical request is already in progress.");
      }
      await this.repository.updateIdempotencyRecord(existing.id, { status: "pending", error: undefined });
    } else {
      try {
        await this.repository.createIdempotencyRecord({
          scope,
          restaurantId: parsed.restaurant_id,
          agentId: parsed.agent_id,
          idempotencyKey,
          requestHash,
          status: "pending",
        });
      } catch (error) {
        if (!this.isDuplicateIdempotencyError(error)) {
          throw error;
        }
        const concurrentResult = await this.waitForIdempotentResult<T>(scope, parsed.restaurant_id, parsed.agent_id, idempotencyKey, requestHash);
        if (concurrentResult) {
          return concurrentResult;
        }
      }
    }
    const record = await this.repository.getIdempotencyRecord(scope, parsed.restaurant_id, parsed.agent_id, idempotencyKey);
    if (!record) {
      throw new Error("Failed to establish idempotency record.");
    }
    const orderId =
      scope === "submit"
        ? (await this.repository.findOrderIdByReference(parsed.external_order_reference)) ?? createId("order")
        : (await this.repository.findOrderIdByReference(parsed.external_order_reference)) ?? parsed.external_order_reference;
    try {
      const result = await work(orderId, idempotencyKey);
      const persistedOrderId =
        scope === "submit" && "id" in result && typeof result.id === "string"
          ? result.id
          : undefined;
      await this.repository.updateIdempotencyRecord(record.id, {
        status: "completed",
        response: result,
        orderId: persistedOrderId,
      });
      return result;
    } catch (error) {
      await this.repository.updateIdempotencyRecord(record.id, {
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private async assertReadyForPOSSubmission(order: AgentOrderRecord, quote: OrderQuote) {
    await this.validateAgentAccess(order.restaurantId, order.agentId);
    if (!quote.orderId || quote.orderId !== order.id) {
      throw new Error("Stored quote does not belong to this order.");
    }
    if (order.status !== "approved") {
      throw new Error("Order must be approved before live POS submission.");
    }
    const duplicateOrderId = await this.repository.findOrderIdByReference(order.externalOrderReference);
    if (duplicateOrderId && duplicateOrderId !== order.id) {
      throw new Error("Order external reference must be unique before POS submission.");
    }
    const requestedAt = new Date(order.requestedFulfillmentTime).getTime();
    if (Number.isNaN(requestedAt) || requestedAt <= Date.now()) {
      throw new Error("Order requested fulfillment time must be a valid future timestamp.");
    }

    const menu = await this.repository.getMenu(order.restaurantId);
    const mappedItems = new Set(
      menu.mappings.filter((mapping) => mapping.canonicalType === "item" && mapping.status === "mapped").map((mapping) => mapping.canonicalId),
    );
    const mappedGroups = new Set(
      menu.mappings
        .filter((mapping) => mapping.canonicalType === "modifier_group" && mapping.status === "mapped")
        .map((mapping) => mapping.canonicalId),
    );
    const mappedModifiers = new Set(
      menu.mappings
        .filter((mapping) => mapping.canonicalType === "modifier" && mapping.status === "mapped")
        .map((mapping) => mapping.canonicalId),
    );

    for (const item of order.orderIntent.items) {
      if (!mappedItems.has(item.item_id)) {
        throw new Error(`POS mapping is missing for item ${item.item_id}.`);
      }
      for (const modifier of item.modifiers) {
        if (!mappedGroups.has(modifier.modifier_group_id)) {
          throw new Error(`POS mapping is missing for modifier group ${modifier.modifier_group_id}.`);
        }
        if (!mappedModifiers.has(modifier.modifier_id)) {
          throw new Error(`POS mapping is missing for modifier ${modifier.modifier_id}.`);
        }
      }
    }
  }

  private async requirePendingDecisionOrder(restaurantId: string, orderId: string) {
    const order = (await this.requireSingleOrderDetail(restaurantId, orderId)).order;
    if (order.status !== "needs_approval") {
      throw new Error("Order decision is final and cannot be changed.");
    }
    return order;
  }

  private async getSingleOrderDetail(restaurantId: string, orderId: string) {
    return this.repository.getOrderDetail(restaurantId, orderId);
  }

  private async requireSingleOrderDetail(restaurantId: string, orderId: string) {
    const detail = await this.getSingleOrderDetail(restaurantId, orderId);
    if (!detail) {
      throw new Error(`Order ${orderId} not found.`);
    }
    return detail;
  }

  private getSplitGroupId(order: AgentOrderRecord | null | undefined) {
    return normalizeText(
      order?.splitGroupId ||
      order?.orderIntent?.metadata?.split_group_id,
    );
  }

  private buildGroupedOrderDetail(
    restaurantId: string,
    groupOrders: AgentOrderRecord[],
  ): Promise<OrderDetailRecord> {
    return (async () => {
      const sortedOrders = this.sortSplitGroupOrders(groupOrders);
      const details = await Promise.all(
        sortedOrders.map(async (order) => this.requireSingleOrderDetail(restaurantId, order.id)),
      );
      const representative = details[0]?.order ?? sortedOrders[0];
      const groupedOrder = this.buildGroupedOrder(
        details.map((detail) => detail.order),
        representative,
      );

      const timeline = details
        .flatMap((detail, index) => {
          const suborderIndex = index + 1;
          const suborderLabel = `Suborder ${suborderIndex} of ${details.length}`;
          return (detail.timeline ?? []).map((event) => ({
            ...event,
            message: `${suborderLabel}: ${event.message}`,
            details: {
              ...(event.details ?? {}),
              orderId: detail.order.id,
              externalOrderReference: detail.order.externalOrderReference,
              splitGroupIndex: detail.order.splitGroupIndex ?? suborderIndex,
              splitGroupSize: details.length,
            },
          }));
        })
        .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());

      return {
        order: groupedOrder,
        groupedOrders: details.map((detail) => detail.order),
        items: details.flatMap((detail, index) =>
          detail.items.map((item) => ({
            ...item,
            groupOrderId: detail.order.id,
            groupOrderIndex: detail.order.splitGroupIndex ?? index + 1,
            groupOrderSize: details.length,
          })),
        ),
        validationResults: details
          .flatMap((detail) => detail.validationResults)
          .sort((left, right) => new Date(right.checkedAt).getTime() - new Date(left.checkedAt).getTime()),
        quotes: details
          .flatMap((detail) => detail.quotes)
          .sort((left, right) => new Date(right.quotedAt).getTime() - new Date(left.quotedAt).getTime()),
        submissions: details
          .flatMap((detail) => detail.submissions)
          .sort((left, right) => new Date(right.submittedAt).getTime() - new Date(left.submittedAt).getTime()),
        statusEvents: details
          .flatMap((detail) => detail.statusEvents)
          .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()),
        auditLogs: details
          .flatMap((detail) => detail.auditLogs ?? [])
          .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()),
        retries: details
          .flatMap((detail) => detail.retries ?? [])
          .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()),
        timeline,
        diagnostics: {
          rawOrderIntent: groupedOrder.orderIntent,
          latestValidation: details.flatMap((detail) => detail.validationResults)[0],
          latestQuote: details.flatMap((detail) => detail.quotes)[0],
          latestSubmission: details.flatMap((detail) => detail.submissions)[0],
          mappedPayload: details.flatMap((detail) => detail.submissions)[0]?.payloadSnapshot,
          retries: details.flatMap((detail) => detail.retries ?? []),
        },
      };
    })();
  }

  private buildGroupedOrder(groupOrders: AgentOrderRecord[], representative: AgentOrderRecord): AgentOrderRecord {
    const sortedGroupOrders = this.sortSplitGroupOrders(groupOrders);

    if (groupOrders.length <= 1) {
      return representative;
    }

    return {
      ...representative,
      status: this.getGroupedOrderStatus(sortedGroupOrders, representative.status),
      totalEstimateCents: sortedGroupOrders.reduce((sum, order) => sum + Math.max(0, Number(order.totalEstimateCents || 0)), 0),
      headcount: sortedGroupOrders.reduce((sum, order) => sum + Math.max(0, Number(order.headcount || 0)), 0),
      splitGroupId: this.getSplitGroupId(representative) || undefined,
      splitGroupSize: sortedGroupOrders.length,
      groupedOrderIds: sortedGroupOrders.map((order) => order.id),
      orderIntent: {
        ...representative.orderIntent,
        metadata: {
          ...(representative.orderIntent?.metadata || {}),
          split_group_id: this.getSplitGroupId(representative) || undefined,
          split_group_size: sortedGroupOrders.length,
          split_child_order_ids: sortedGroupOrders.map((order) => order.id),
        },
      },
    };
  }

  private groupOrdersForReview(orders: AgentOrderRecord[]) {
    const grouped = new Map<string, AgentOrderRecord[]>();
    const standalone: AgentOrderRecord[] = [];

    for (const order of orders) {
      const splitGroupId = this.getSplitGroupId(order);
      if (!splitGroupId) {
        standalone.push(order);
        continue;
      }
      const bucket = grouped.get(splitGroupId) ?? [];
      bucket.push(order);
      grouped.set(splitGroupId, bucket);
    }

    const aggregated = Array.from(grouped.values()).map((groupOrders) => {
      const representative =
        this.sortSplitGroupOrders(groupOrders)[0] ?? groupOrders[0];
      return this.buildGroupedOrder(groupOrders, representative);
    });

    return [...standalone, ...aggregated].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  private async getCurrentGroupedOrderState(restaurantId: string, representativeOrderId: string) {
    const refreshedRepresentative = await this.repository.getOrderById(representativeOrderId);
    if (!refreshedRepresentative) {
      throw new Error(`Order ${representativeOrderId} not found.`);
    }
    const refreshedGroupOrders = await this.getDecisionGroupOrders(restaurantId, refreshedRepresentative);
    const refreshedRepresentativeOrder = refreshedGroupOrders[0] ?? refreshedRepresentative;
    return this.buildGroupedOrder(refreshedGroupOrders, refreshedRepresentativeOrder);
  }

  private async getDecisionGroupOrders(restaurantId: string, order: AgentOrderRecord) {
    const splitGroupId = this.getSplitGroupId(order);
    if (!splitGroupId) return [order];

    const orders = await this.repository.listOrders(restaurantId);
    const siblings = this.sortSplitGroupOrders(
      orders.filter((entry) => this.getSplitGroupId(entry) === splitGroupId),
    );

    return siblings.length ? siblings : [order];
  }

  private sortSplitGroupOrders(groupOrders: AgentOrderRecord[]) {
    return [...groupOrders].sort((left, right) => {
      const leftIndex = Number(left.splitGroupIndex ?? left.orderIntent?.metadata?.split_group_index ?? Number.MAX_SAFE_INTEGER);
      const rightIndex = Number(right.splitGroupIndex ?? right.orderIntent?.metadata?.split_group_index ?? Number.MAX_SAFE_INTEGER);
      return leftIndex - rightIndex || left.createdAt.localeCompare(right.createdAt);
    });
  }

  private getGroupedOrderStatus(groupOrders: AgentOrderRecord[], fallbackStatus: AgentOrderStatus) {
    const statuses = groupOrders
      .map((order) => normalizeText(order.status))
      .filter((status): status is AgentOrderStatus => Boolean(status));

    if (!statuses.length) {
      return fallbackStatus;
    }

    if (statuses.some((status) => status === "failed")) return "failed";
    if (statuses.some((status) => status === "cancelled")) return "cancelled";
    if (statuses.some((status) => status === "rejected")) return "rejected";
    if (statuses.some((status) => status === "completed")) return "completed";
    if (statuses.some((status) => status === "ready")) return "ready";
    if (statuses.some((status) => status === "preparing")) return "preparing";
    if (statuses.some((status) => status === "accepted")) return "accepted";
    if (statuses.some((status) => status === "submitted_to_pos")) return "submitted_to_pos";
    if (statuses.some((status) => status === "approved")) return "approved";
    if (statuses.some((status) => status === "submitting_to_pos")) return "submitting_to_pos";
    if (statuses.every((status) => status === "needs_approval")) return "needs_approval";

    return fallbackStatus;
  }

  private buildGroupDecisionMessage(groupOrders: AgentOrderRecord[], decision: "approved" | "rejected") {
    if (groupOrders.length <= 1) {
      return decision === "approved" ? "Manager approved the order." : "Manager rejected the order.";
    }

    return decision === "approved"
      ? `Manager approved split order bundle (${groupOrders.length} linked orders).`
      : `Manager rejected split order bundle (${groupOrders.length} linked orders).`;
  }

  private async requiresApproval(order: CanonicalOrderIntent) {
    const rules = await this.getRules(order.restaurant_id);
    if (order.approval_requirements?.manager_approval_required) {
      return true;
    }
    if (rules.autoAcceptEnabled) {
      return false;
    }
    return true;
  }

  private buildOrderRelations(orderId: string, parsed: CanonicalOrderIntent) {
    const items: AgentOrderItemRecord[] = [];
    const modifiers: AgentOrderModifierRecord[] = [];
    parsed.items.forEach((item) => {
      const itemId = createId("order_item");
      items.push({
        id: itemId,
        orderId,
        menuItemId: item.item_id,
        quantity: item.quantity,
        notes: item.notes,
      });
      item.modifiers.forEach((modifier) => {
        modifiers.push({
          id: createId("order_mod"),
          orderItemId: itemId,
          modifierGroupId: modifier.modifier_group_id,
          modifierId: modifier.modifier_id,
          quantity: modifier.quantity,
        });
      });
    });
    return { items, modifiers };
  }
}
