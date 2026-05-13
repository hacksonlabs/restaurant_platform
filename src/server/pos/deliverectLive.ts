import type { AppEnv } from "../config/env";
import type {
  CanonicalOrderIntent,
  ConnectionTestResult,
  POSAdapter,
  POSConnection,
  POSContext,
  POSDiagnosticsResult,
  POSOrderStatusResult,
  POSPaymentSessionResult,
  POSSubmissionResult,
  MenuSyncResult,
  OrderQuoteResult,
  OrderValidationResult,
} from "../../shared/types";

interface DeliverectTokenCache {
  accessToken: string;
  expiresAt: number;
}

function deliverectError(message: string): Error {
  return new Error(message);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function buildChecks(checks: Array<{ key: string; ok: boolean; message: string }>): POSDiagnosticsResult {
  return {
    provider: "deliverect",
    mode: "live",
    overallOk: checks.every((check) => check.ok),
    checks,
  };
}

export class DeliverectAdapterLive implements POSAdapter {
  provider = "deliverect" as const;
  private tokenCache: DeliverectTokenCache | null = null;

  constructor(private env?: AppEnv) {}

  async testConnection(connection: POSConnection): Promise<ConnectionTestResult> {
    const diagnostics = await this.diagnose(connection, {
      restaurant: {} as any,
      location: {} as any,
      connection,
      menuItems: [],
      modifierGroups: [],
      modifiers: [],
    });
    const authCheck = diagnostics.checks.find((check) => check.key === "auth");
    return {
      ok: diagnostics.overallOk,
      status: diagnostics.overallOk ? "connected" : "error",
      message: authCheck?.message ?? "Deliverect live diagnostics completed.",
      checkedAt: new Date().toISOString(),
    };
  }

  async syncMenu(connection: POSConnection, context: POSContext): Promise<MenuSyncResult> {
    this.assertConfigured(connection);
    const menus = await this.deliverectFetch(
      `/commerce/${this.accountId(connection)}/stores/${this.storeId(connection)}/menus`,
    );
    const payload = await menus.json().catch(() => ({}));
    if (!menus.ok) {
      throw deliverectError(`Deliverect store menus request failed: ${menus.status} ${this.readError(payload)}`);
    }
    const menuCount = Array.isArray(payload) ? payload.length : Array.isArray((payload as any).data) ? (payload as any).data.length : undefined;
    return {
      status: "success",
      syncedAt: new Date().toISOString(),
      itemCount: context.menuItems.length,
      categoryCount: new Set(context.menuItems.map((item) => item.category)).size,
      modifierGroupCount: context.modifierGroups.length,
      message: `Deliverect store menus fetched successfully${typeof menuCount === "number" ? ` (${menuCount} published menu(s)).` : "."}`,
    };
  }

  async validateOrder(order: CanonicalOrderIntent, context: POSContext): Promise<OrderValidationResult> {
    this.assertConfigured(context.connection);
    const issues = this.localReadinessIssues(order, context);
    if (issues.length === 0) {
      try {
        await this.createBasket(order, context, true);
      } catch (error) {
        issues.push({
          code: "deliverect_basket_validation_failed",
          message: error instanceof Error ? error.message : "Deliverect basket validation failed.",
          severity: "error",
        });
      }
    }
    return {
      id: `deliverect_live_validation_${Date.now()}`,
      orderId: order.external_order_reference,
      valid: issues.length === 0,
      issues,
      checkedAt: new Date().toISOString(),
    };
  }

  async quoteOrder(order: CanonicalOrderIntent, context: POSContext): Promise<OrderQuoteResult> {
    this.assertConfigured(context.connection);
    const basket = await this.createBasket(order, context, false);
    const totals = this.extractBasketTotals(basket);
    return {
      ok: true,
      subtotalCents: totals.subtotalCents,
      taxCents: totals.taxCents,
      feesCents: totals.feesCents,
      totalCents: totals.totalCents,
      message: "Deliverect basket quote generated.",
    };
  }

  async startPayment(
    order: CanonicalOrderIntent,
    quote: OrderQuoteResult,
    paymentSession: { successUrl: string; cancelUrl: string },
    context: POSContext,
  ): Promise<POSPaymentSessionResult> {
    this.assertConfigured(context.connection);
    const basket = await this.createBasket(order, context, false);
    const basketId = this.readBasketId(basket);
    if (!basketId) {
      return {
        ok: false,
        status: "failed",
        redirectUrl: null,
        paymentReference: null,
        totalCents: quote.totalCents,
        currency: "USD",
        message: "Deliverect basket creation succeeded but no basket ID was returned.",
        raw: basket,
      };
    }

    const gateway = await this.getPreferredGateway(context.connection);
    const response = await this.deliverectFetch(
      `/pay/channel/${this.channelLinkId(context.connection)}/payments`,
      {
        method: "POST",
        body: JSON.stringify({
          basketId,
          amount: quote.totalCents,
          currency: "USD",
          gatewayId: gateway.gatewayId,
          returnUrl: paymentSession.successUrl,
          cancelUrl: paymentSession.cancelUrl,
          reference: order.external_order_reference,
          metadata: {
            phantomOrderReference: order.external_order_reference,
            phantomRestaurantId: order.restaurant_id,
            phantomAgentId: order.agent_id,
          },
        }),
      },
    );
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        status: "failed",
        redirectUrl: null,
        paymentReference: null,
        totalCents: quote.totalCents,
        currency: "USD",
        message: `Deliverect payment request failed: ${response.status} ${this.readError(payload)}`,
        raw: payload,
      };
    }

    const paymentReference = this.readString(payload, "paymentId") ?? this.readString(payload, "id") ?? null;
    const redirectUrl =
      this.readString(payload, "redirectUrl") ??
      this.readString(payload, "url") ??
      this.readString((payload as any).links, "checkout") ??
      this.readString((payload as any).links, "payment") ??
      null;

    if (!redirectUrl) {
      return {
        ok: false,
        status: "failed",
        redirectUrl: null,
        paymentReference,
        totalCents: quote.totalCents,
        currency: "USD",
        message: "Deliverect payment request succeeded but no redirect URL was returned.",
        raw: payload,
      };
    }

    return {
      ok: true,
      status: "redirect_required",
      redirectUrl,
      paymentReference,
      totalCents: quote.totalCents,
      currency: "USD",
      message: "Deliverect Pay session created.",
      raw: {
        ...payload,
        gatewayId: gateway.gatewayId,
        basketId,
      },
    };
  }

  async submitOrder(order: CanonicalOrderIntent, quote: OrderQuoteResult, context: POSContext): Promise<POSSubmissionResult> {
    this.assertConfigured(context.connection);
    const basket = await this.createBasket(order, context, false);
    const basketId = this.readBasketId(basket);
    if (!basketId) {
      return {
        ok: false,
        externalOrderId: null,
        status: "failed",
        message: "Deliverect basket creation succeeded but no basket ID was returned.",
        raw: basket,
      };
    }

    const paymentPayload = await this.buildCheckoutPaymentPayload(order, basketId, context.connection);
    const response = await this.deliverectFetch(`/commerce/${this.accountId(context.connection)}/v2/checkouts`, {
      method: "POST",
      body: JSON.stringify({
        basketId,
        payment: paymentPayload,
        metadata: {
          phantomOrderReference: order.external_order_reference,
          phantomRestaurantId: order.restaurant_id,
          phantomAgentId: order.agent_id,
        },
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        externalOrderId: null,
        status: "failed",
        message: `Deliverect checkout failed: ${response.status} ${this.readError(payload)}`,
        raw: payload,
      };
    }

    const externalOrderId =
      this.readString(payload, "checkoutId") ??
      this.readString(payload, "id") ??
      this.readString(payload, "orderId") ??
      basketId;

    return {
      ok: true,
      externalOrderId,
      status: "submitted",
      message: `Deliverect checkout created. Total submitted: ${quote.totalCents} cents.`,
      raw: payload,
    };
  }

  async getOrderStatus(posOrderId: string, context: POSContext): Promise<POSOrderStatusResult> {
    this.assertConfigured(context.connection);
    const response = await this.deliverectFetch(`/commerce/${this.accountId(context.connection)}/v2/checkouts/${posOrderId}`);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw deliverectError(`Deliverect checkout status lookup failed: ${response.status} ${this.readError(payload)}`);
    }
    return {
      ok: true,
      externalOrderId: posOrderId,
      status: this.mapCheckoutStatus(payload),
      message: "Deliverect checkout status retrieved.",
    };
  }

  async diagnose(connection: POSConnection, context: POSContext): Promise<POSDiagnosticsResult> {
    const checks: POSDiagnosticsResult["checks"] = [];
    const configured = this.hasMinimumConfiguration(connection);
    checks.push({ key: "config", ok: configured.ok, message: configured.message });
    checks.push({
      key: "account_id",
      ok: Boolean(this.accountId(connection)),
      message: this.accountId(connection) ? "Deliverect account ID is configured." : "Missing Deliverect account ID.",
    });
    checks.push({
      key: "store_id",
      ok: Boolean(this.storeId(connection)),
      message: this.storeId(connection) ? "Deliverect store ID is configured." : "Missing Deliverect store ID.",
    });
    checks.push({
      key: "channel_link_id",
      ok: Boolean(this.channelLinkId(connection)),
      message: this.channelLinkId(connection)
        ? "Deliverect channel link ID is configured."
        : "Missing Deliverect channel link ID for basket and checkout requests.",
    });
    checks.push({
      key: "menu_sync",
      ok: context.menuItems.length > 0,
      message: context.menuItems.length > 0
        ? `Canonical catalog has ${context.menuItems.length} items available for Deliverect mapping.`
        : "No canonical menu items are available for Deliverect sync or quote requests.",
    });

    if (!configured.ok) {
      checks.push({ key: "auth", ok: false, message: "Auth check skipped because required Deliverect credentials are incomplete." });
      checks.push({ key: "quote_readiness", ok: false, message: "Quote readiness blocked until Deliverect credentials and channel metadata are configured." });
      checks.push({ key: "submit_readiness", ok: false, message: "Submit readiness blocked until quote readiness passes." });
      return buildChecks(checks);
    }

    try {
      const response = await this.deliverectFetch(`/commerce/${this.accountId(connection)}/stores/${this.storeId(connection)}`);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw deliverectError(`Deliverect store lookup failed: ${response.status} ${this.readError(payload)}`);
      }
      checks.push({ key: "auth", ok: true, message: "Deliverect authentication and store lookup succeeded." });
    } catch (error) {
      checks.push({ key: "auth", ok: false, message: error instanceof Error ? error.message : "Deliverect authentication failed." });
    }

    const mappingReady = context.menuItems.every((item) => item.mappingStatus === "mapped");
    checks.push({
      key: "quote_readiness",
      ok: mappingReady,
      message: mappingReady
        ? "Menu items are mapped and ready for Deliverect basket creation."
        : "At least one canonical item still has mappingStatus=needs_review.",
    });
    checks.push({
      key: "submit_readiness",
      ok: mappingReady && checks.every((check) => check.ok),
      message: mappingReady
        ? "Live checkout flow can proceed once the order is quoted and approved."
        : "Live checkout flow blocked by mapping or configuration gaps.",
    });
    return buildChecks(checks);
  }

  private assertConfigured(connection: POSConnection) {
    const ok = this.hasMinimumConfiguration(connection);
    if (!ok.ok) {
      throw deliverectError(ok.message);
    }
  }

  private hasMinimumConfiguration(connection?: POSConnection) {
    const env = this.env;
    if (!env) {
      return { ok: false, message: "Deliverect live adapter is missing application environment configuration." };
    }
    if (!env.deliverectBaseUrl) {
      return { ok: false, message: "DELIVERECT_BASE_URL is required for live Deliverect mode." };
    }
    if (!(env.deliverectAccessToken || (env.deliverectClientId && env.deliverectClientSecret))) {
      return {
        ok: false,
        message: "Provide DELIVERECT_ACCESS_TOKEN or DELIVERECT_CLIENT_ID and DELIVERECT_CLIENT_SECRET before enabling live Deliverect mode.",
      };
    }
    if (!this.accountId(connection)) {
      return { ok: false, message: "Deliverect account ID is required for live Deliverect mode." };
    }
    if (!this.storeId(connection)) {
      return { ok: false, message: "Deliverect store ID is required for live Deliverect mode." };
    }
    if (!this.channelLinkId(connection)) {
      return { ok: false, message: "Deliverect channel link ID is required for live Deliverect mode." };
    }
    return { ok: true, message: "Live Deliverect config is present." };
  }

  private accountId(connection?: POSConnection) {
    return this.readMetadataString(connection, "deliverectAccountId") || this.env?.deliverectAccountId || "";
  }

  private storeId(connection?: POSConnection) {
    return this.readMetadataString(connection, "deliverectStoreId") || this.env?.deliverectStoreId || "";
  }

  private channelLinkId(connection?: POSConnection) {
    return this.readMetadataString(connection, "deliverectChannelLinkId") || this.env?.deliverectChannelLinkId || "";
  }

  private readBasketId(payload: unknown) {
    return this.readString(payload, "basketId") ?? this.readString(payload, "id");
  }

  private async getAccessToken() {
    const env = this.env;
    if (!env) {
      throw deliverectError("Deliverect live adapter is missing application environment configuration.");
    }
    if (env.deliverectAccessToken) {
      return env.deliverectAccessToken;
    }
    if (this.tokenCache && this.tokenCache.expiresAt > Date.now() + 60_000) {
      return this.tokenCache.accessToken;
    }
    if (!env.deliverectClientId || !env.deliverectClientSecret) {
      throw deliverectError("Deliverect client credentials are required to request an access token.");
    }
    const response = await fetch(`${env.deliverectBaseUrl.replace(/\/$/, "")}/oauth/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        grantType: "client_credentials",
        clientId: env.deliverectClientId,
        clientSecret: env.deliverectClientSecret,
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw deliverectError(`Deliverect authentication failed: ${response.status} ${this.readError(payload)}`);
    }
    const accessToken =
      this.readString(payload, "access_token") ??
      this.readString((payload as any).token, "access_token") ??
      this.readString((payload as any).data, "access_token");
    if (!accessToken) {
      throw deliverectError("Deliverect authentication succeeded but no access token was returned.");
    }
    const expiresIn = Number(
      this.readString(payload, "expires_in") ??
      this.readString((payload as any).token, "expires_in") ??
      3600,
    );
    this.tokenCache = {
      accessToken,
      expiresAt: Date.now() + expiresIn * 1000,
    };
    return accessToken;
  }

  private async deliverectFetch(path: string, init: RequestInit = {}) {
    const env = this.env;
    if (!env) {
      throw deliverectError("Deliverect live adapter is missing application environment configuration.");
    }
    const accessToken = await this.getAccessToken();
    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      ...(init.headers ?? {}),
    };
    return fetch(`${env.deliverectBaseUrl.replace(/\/$/, "")}${path}`, {
      ...init,
      headers,
    });
  }

  private localReadinessIssues(order: CanonicalOrderIntent, context: POSContext): OrderValidationResult["issues"] {
    const issues: OrderValidationResult["issues"] = [];
    const menuItemMap = new Map(context.menuItems.map((item) => [item.id, item]));
    const modifierMap = new Map(context.modifiers.map((modifier) => [modifier.id, modifier]));

    order.items.forEach((item, index) => {
      const menuItem = menuItemMap.get(item.item_id);
      if (!menuItem) {
        issues.push({
          code: "deliverect_item_missing",
          message: `Canonical item ${item.item_id} could not be mapped to a Deliverect product.`,
          field: `items.${index}.item_id`,
          severity: "error",
        });
      } else if (menuItem.mappingStatus !== "mapped") {
        issues.push({
          code: "deliverect_mapping_unready",
          message: `Canonical item ${item.item_id} is not mapped for Deliverect live submission.`,
          field: `items.${index}.item_id`,
          severity: "error",
        });
      }

      item.modifiers.forEach((modifier, modifierIndex) => {
        const modifierRecord = modifierMap.get(modifier.modifier_id);
        if (!modifierRecord) {
          issues.push({
            code: "deliverect_modifier_missing",
            message: `Modifier ${modifier.modifier_id} could not be mapped to a Deliverect product.`,
            field: `items.${index}.modifiers.${modifierIndex}.modifier_id`,
            severity: "error",
          });
        }
      });
    });

    return issues;
  }

  private async createBasket(order: CanonicalOrderIntent, context: POSContext, validateOnly: boolean) {
    const body = {
      channelLinkId: this.channelLinkId(context.connection),
      fulfillment: this.mapFulfillment(order),
      items: order.items.map((item) => this.mapBasketItem(item, context)),
      customer: {
        name: order.customer.name,
        email: order.customer.email,
        phoneNumber: order.customer.phone,
      },
      metadata: {
        phantomOrderReference: order.external_order_reference,
        phantomRestaurantId: order.restaurant_id,
        phantomAgentId: order.agent_id,
        validateOnly,
      },
    };
    const response = await this.deliverectFetch(`/commerce/${this.accountId(context.connection)}/baskets`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw deliverectError(`Deliverect basket creation failed: ${response.status} ${this.readError(payload)}`);
    }
    return payload;
  }

  private extractSourcePaymentProfile(order: CanonicalOrderIntent) {
    const source = order.metadata?.source_payment_profile;
    return isObject(source) ? source : null;
  }

  private async getPreferredGateway(connection: POSConnection) {
    const configuredGatewayId = this.readMetadataString(connection, "deliverectGatewayId");
    if (configuredGatewayId) {
      return { gatewayId: configuredGatewayId };
    }

    const response = await this.deliverectFetch(`/pay/channel/${this.channelLinkId(connection)}/gateways`);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw deliverectError(`Deliverect payment gateways lookup failed: ${response.status} ${this.readError(payload)}`);
    }

    const gateways = Array.isArray(payload)
      ? payload
      : Array.isArray((payload as any).data)
        ? (payload as any).data
        : Array.isArray((payload as any).gateways)
          ? (payload as any).gateways
          : [];

    const preferredGateway = gateways.find((gateway) => isObject(gateway) && this.readString(gateway, "id"));
    const gatewayId = preferredGateway ? this.readString(preferredGateway, "id") : null;
    if (!gatewayId) {
      throw deliverectError("No Deliverect payment gateway is configured for this channel link.");
    }
    return { gatewayId };
  }

  private async buildCheckoutPaymentPayload(order: CanonicalOrderIntent, basketId: string, connection: POSConnection) {
    const sourcePaymentProfile = this.extractSourcePaymentProfile(order);
    const paymentProof = isObject(sourcePaymentProfile?.payment_proof)
      ? (sourcePaymentProfile?.payment_proof as Record<string, unknown>)
      : null;
    const paymentReference =
      this.readString(paymentProof, "paymentReference") ??
      this.readString(paymentProof, "payment_reference") ??
      this.readString(paymentProof, "providerOrderId") ??
      this.readString(paymentProof, "provider_order_id") ??
      this.readString(sourcePaymentProfile, "provider_payment_reference");

    if (!paymentReference) {
      return {
        type: "third_party",
        externalId: order.external_order_reference,
        isPrepaid: order.payment_policy !== "invoice_manual",
        instrumentType: "online",
      };
    }

    const paymentStatus = await this.fetchPaymentStatus(connection, paymentReference);
    if (!paymentStatus.authorized) {
      throw deliverectError(
        `Deliverect payment ${paymentReference} is not ready for checkout (${paymentStatus.status || "pending"}).`,
      );
    }

    return {
      type: "deliverect_pay",
      paymentId: paymentReference,
      basketId,
      isPrepaid: true,
      instrumentType: "online",
    };
  }

  private async fetchPaymentStatus(connection: POSConnection, paymentReference: string) {
    const response = await this.deliverectFetch(
      `/pay/channel/${this.channelLinkId(connection)}/payments/${paymentReference}`,
    );
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw deliverectError(
        `Deliverect payment status lookup failed: ${response.status} ${this.readError(payload)}`,
      );
    }

    const rawStatus =
      this.readString(payload, "status") ??
      this.readString((payload as any).payment, "status") ??
      "";
    const normalized = rawStatus.toLowerCase();
    const authorized =
      normalized.includes("authorized") ||
      normalized.includes("paid") ||
      normalized.includes("succeeded") ||
      normalized.includes("captured");

    return {
      authorized,
      status: rawStatus,
      payload,
    };
  }

  private mapFulfillment(order: CanonicalOrderIntent) {
    return {
      type: order.fulfillment_type,
      scheduledTime: order.requested_fulfillment_time,
      address: order.fulfillment_address
        ? {
            address1: order.fulfillment_address.address1,
            city: order.fulfillment_address.city,
            state: order.fulfillment_address.state,
            postalCode: order.fulfillment_address.postal_code,
            notes: order.fulfillment_address.notes,
          }
        : undefined,
    };
  }

  private mapBasketItem(item: CanonicalOrderIntent["items"][number], context: POSContext) {
    const menuItem = context.menuItems.find((entry) => entry.id === item.item_id);
    return {
      plu: menuItem?.posRef.externalId ?? item.item_id,
      quantity: item.quantity,
      name: menuItem?.name ?? item.item_id,
      subItems: item.modifiers.map((modifier) => {
        const modifierRecord = context.modifiers.find((entry) => entry.id === modifier.modifier_id);
        return {
          plu: modifierRecord?.id ?? modifier.modifier_id,
          quantity: modifier.quantity,
          name: modifierRecord?.name ?? modifier.modifier_id,
        };
      }),
    };
  }

  private extractBasketTotals(payload: unknown) {
    const subtotalCents = this.findNumericValue(payload, ["subTotal", "subtotal", "subtotalAmount"]);
    const taxCents = this.findNumericValue(payload, ["tax", "taxTotal", "taxAmount"]);
    const feesCents =
      this.findNumericValue(payload, ["serviceCharge", "serviceFee"]) +
      this.findNumericValue(payload, ["deliveryCost", "deliveryFee"]) +
      this.findNumericValue(payload, ["bagFee", "smallOrderFee"]);
    const fallbackTotal = subtotalCents + taxCents + feesCents;
    const totalCents = this.findNumericValue(payload, ["total", "totalAmount", "paymentAmount"]) || fallbackTotal;
    return { subtotalCents, taxCents, feesCents, totalCents };
  }

  private findNumericValue(payload: unknown, keys: string[]) {
    if (!isObject(payload)) {
      return 0;
    }
    for (const key of keys) {
      const value = payload[key];
      if (typeof value === "number" && Number.isFinite(value)) {
        return Math.round(value);
      }
      if (typeof value === "string" && value.trim() && !Number.isNaN(Number(value))) {
        return Math.round(Number(value));
      }
    }
    return 0;
  }

  private mapCheckoutStatus(payload: unknown): POSOrderStatusResult["status"] {
    const rawStatus =
      this.readString(payload, "status") ??
      this.readString((payload as any).checkout, "status") ??
      "pending";
    const normalized = rawStatus.toLowerCase();
    if (normalized.includes("completed") || normalized.includes("success")) return "accepted";
    if (normalized.includes("failed") || normalized.includes("cancel")) return "failed";
    return "submitted_to_pos";
  }

  private readError(payload: unknown) {
    return (
      this.readString(payload, "description") ??
      this.readString(payload, "message") ??
      this.readString((payload as any).error, "message") ??
      "Unknown Deliverect error"
    );
  }

  private readMetadataString(connection: POSConnection | undefined, key: string) {
    const value = connection?.metadata?.[key];
    return typeof value === "string" ? value : "";
  }

  private readString(payload: unknown, key: string) {
    if (!isObject(payload)) {
      return undefined;
    }
    const value = payload[key];
    return typeof value === "string" ? value : typeof value === "number" ? String(value) : undefined;
  }
}
