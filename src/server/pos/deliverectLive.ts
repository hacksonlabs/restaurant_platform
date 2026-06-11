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
    this.assertConfigured(connection, context);
    return {
      status: "success",
      syncedAt: new Date().toISOString(),
      itemCount: context.menuItems.length,
      categoryCount: new Set(context.menuItems.map((item) => item.category)).size,
      modifierGroupCount: context.modifierGroups.length,
      message: "Deliverect Channel API menu sync is handled through inbound menu push/import; canonical catalog is ready for order payload mapping.",
    };
  }

  async validateOrder(order: CanonicalOrderIntent, context: POSContext): Promise<OrderValidationResult> {
    this.assertConfigured(context.connection, context);
    const issues = this.localReadinessIssues(order, context);
    return {
      id: `deliverect_live_validation_${Date.now()}`,
      orderId: order.external_order_reference,
      valid: issues.length === 0,
      issues,
      checkedAt: new Date().toISOString(),
    };
  }

  async quoteOrder(order: CanonicalOrderIntent, context: POSContext): Promise<OrderQuoteResult> {
    this.assertConfigured(context.connection, context);
    const totals = this.calculateChannelTotals(order, context);
    return {
      ok: true,
      subtotalCents: totals.subtotalCents,
      taxCents: totals.taxCents,
      feesCents: totals.feesCents,
      tipCents: totals.tipCents,
      totalCents: totals.totalCents,
      message: "Deliverect Channel API local quote generated from canonical menu prices.",
    };
  }

  async startPayment(
    order: CanonicalOrderIntent,
    quote: OrderQuoteResult,
    paymentSession: { successUrl: string; cancelUrl: string },
    context: POSContext,
  ): Promise<POSPaymentSessionResult> {
    this.assertConfigured(context.connection, context);
    return {
      ok: false,
      status: "failed",
      redirectUrl: null,
      paymentReference: null,
      totalCents: quote.totalCents,
      currency: "USD",
      message: "Deliverect Channel API expects payment to be handled by the channel before order submission.",
      raw: {
        successUrl: paymentSession.successUrl,
        cancelUrl: paymentSession.cancelUrl,
        orderReference: order.external_order_reference,
      },
    };
  }

  async submitOrder(order: CanonicalOrderIntent, quote: OrderQuoteResult, context: POSContext): Promise<POSSubmissionResult> {
    this.assertConfigured(context.connection, context);
    const channelName = this.channelName(context.connection);
    const channelLinkId = this.channelLinkId(context.connection, context);
    const payload = this.buildChannelOrderPayload(order, quote, context);
    const response = await this.deliverectFetch(`/${channelName}/order/${channelLinkId}`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    const responsePayload = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 408 || response.status === 429 || response.status >= 500) {
        throw deliverectError(`Deliverect channel order transient failure: ${response.status} ${this.readError(responsePayload)}`);
      }
      return {
        ok: false,
        externalOrderId: null,
        status: "failed",
        message: `Deliverect channel order failed: ${response.status} ${this.readError(responsePayload)}`,
        raw: responsePayload,
      };
    }

    const externalOrderId =
      this.readString(responsePayload, "channelOrderId") ??
      this.readString(responsePayload, "orderId") ??
      this.readString(responsePayload, "id") ??
      order.external_order_reference;

    return {
      ok: true,
      externalOrderId,
      status: "submitted",
      message: `Deliverect channel order submitted. Total submitted: ${quote.totalCents} cents.`,
      raw: responsePayload,
    };
  }

  async getOrderStatus(posOrderId: string, context: POSContext): Promise<POSOrderStatusResult> {
    this.assertConfigured(context.connection, context);
    return {
      ok: true,
      externalOrderId: posOrderId,
      status: "submitted_to_pos",
      message: "Deliverect Channel API status is asynchronous; waiting for order status webhook.",
    };
  }

  async diagnose(connection: POSConnection, context: POSContext): Promise<POSDiagnosticsResult> {
    const checks: POSDiagnosticsResult["checks"] = [];
    const configured = this.hasMinimumConfiguration(connection, context);
    checks.push({ key: "config", ok: configured.ok, message: configured.message });
    checks.push({
      key: "account_id",
      ok: true,
      message: this.accountId(connection)
        ? "Deliverect account ID is available for diagnostics."
        : "Deliverect account ID was not provided; Channel order routing will use channelLinkId.",
    });
    checks.push({
      key: "store_id",
      ok: true,
      message: this.storeId(connection)
        ? "Deliverect store ID is available for diagnostics."
        : "Deliverect store ID was not provided; Channel order routing will use channelLinkId.",
    });
    checks.push({
      key: "channel_link_id",
      ok: Boolean(this.channelLinkId(connection, context)),
      message: this.channelLinkId(connection, context)
        ? "Deliverect channel link ID is configured."
        : "Missing Deliverect channel link ID for Channel API order requests.",
    });
    checks.push({
      key: "channel_name",
      ok: Boolean(this.channelName(connection)),
      message: this.channelName(connection)
        ? `Deliverect channel name/scope is configured as ${this.channelName(connection)}.`
        : "Missing Deliverect channel name/scope for Channel API order requests.",
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
      await this.getAccessToken();
      checks.push({ key: "auth", ok: true, message: "Deliverect authentication succeeded for Channel API requests." });
    } catch (error) {
      checks.push({ key: "auth", ok: false, message: error instanceof Error ? error.message : "Deliverect authentication failed." });
    }

    const hasMenuItems = context.menuItems.length > 0;
    const mappingReady = hasMenuItems && context.menuItems.every((item) => item.mappingStatus === "mapped");
    checks.push({
      key: "quote_readiness",
      ok: mappingReady,
      message: mappingReady
        ? "Menu items are mapped and ready for Deliverect Channel API order creation."
        : hasMenuItems
          ? "At least one canonical item still has mappingStatus=needs_review."
          : "No imported canonical menu items are available for Deliverect Channel API order creation.",
    });
    checks.push({
      key: "submit_readiness",
      ok: mappingReady && checks.every((check) => check.ok),
      message: mappingReady
        ? "Live Channel API order submission can proceed once the order is quoted and approved."
        : "Live Channel API order flow blocked by mapping or configuration gaps.",
    });
    return buildChecks(checks);
  }

  private assertConfigured(connection: POSConnection, context?: POSContext) {
    const ok = this.hasMinimumConfiguration(connection, context);
    if (!ok.ok) {
      throw deliverectError(ok.message);
    }
  }

  private hasMinimumConfiguration(connection?: POSConnection, context?: POSContext) {
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
    if (!this.channelLinkId(connection, context)) {
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

  private channelLinkId(connection?: POSConnection, context?: POSContext) {
    return (
      this.readMetadataString(context?.menuVersion, "channelLinkId") ||
      this.readMetadataString(connection, "channelLinkId") ||
      this.readMetadataString(connection, "channel_link_id") ||
      this.readMetadataString(connection, "deliverectChannelLinkId") ||
      this.env?.deliverectChannelLinkId ||
      ""
    );
  }

  private channelName(connection?: POSConnection) {
    return (
      this.readMetadataString(connection, "deliverectChannelName") ||
      this.readMetadataString(connection, "channelName") ||
      this.env?.deliverectScope ||
      ""
    ).replace(/^genericChannel:/, "");
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
        Accept: "application/json",
      },
      body: JSON.stringify({
        client_id: env.deliverectClientId,
        client_secret: env.deliverectClientSecret,
        audience: env.deliverectAudience || env.deliverectBaseUrl,
        grant_type: env.deliverectGrantType || "token",
        ...(env.deliverectScope ? { scope: env.deliverectScope } : {}),
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
    const expiresIn = this.readTokenTtlSeconds(payload);
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
    const timeoutMs = env.deliverectRequestTimeoutMs || 10_000;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(`${env.deliverectBaseUrl.replace(/\/$/, "")}${path}`, {
        ...init,
        headers,
        signal: init.signal ?? controller.signal,
      });
    } catch (error) {
      if (controller.signal.aborted) {
        throw deliverectError(`Deliverect request timeout after ${timeoutMs}ms.`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private calculateChannelTotals(order: CanonicalOrderIntent, context: POSContext) {
    const menuItemMap = new Map(context.menuItems.map((item) => [item.id, item]));
    const modifierMap = new Map(context.modifiers.map((modifier) => [modifier.id, modifier]));
    const subtotalCents = order.items.reduce((sum, item) => {
      const menuItem = menuItemMap.get(item.item_id);
      const itemSubtotal = (menuItem?.priceCents ?? 0) * item.quantity;
      const modifierSubtotal = item.modifiers.reduce((modifierSum, modifier) => {
        const modifierRecord = modifierMap.get(modifier.modifier_id);
        return modifierSum + (modifierRecord?.priceCents ?? 0) * modifier.quantity;
      }, 0);
      return sum + itemSubtotal + modifierSubtotal;
    }, 0);
    const taxCents = this.metadataInteger(order, "tax_cents", "taxCents") ?? Math.round(subtotalCents * 0.09);
    const feesCents =
      this.metadataInteger(order, "fees_cents", "feesCents") ??
      (this.metadataInteger(order, "delivery_cost_cents", "deliveryCostCents") ?? 0) +
        (this.metadataInteger(order, "service_charge_cents", "serviceChargeCents") ?? 0);
    const tipCents = this.tipCents(order);
    return {
      subtotalCents,
      taxCents,
      feesCents,
      tipCents,
      totalCents: subtotalCents + taxCents + feesCents + tipCents,
    };
  }

  private localReadinessIssues(order: CanonicalOrderIntent, context: POSContext): OrderValidationResult["issues"] {
    const issues: OrderValidationResult["issues"] = [];
    const menuItemMap = new Map(context.menuItems.map((item) => [item.id, item]));
    const modifierMap = new Map(context.modifiers.map((modifier) => [modifier.id, modifier]));

    if (order.fulfillment_type === "catering") {
      issues.push({
        code: "deliverect_channel_order_type_unsupported",
        message: "Deliverect Channel API supports pickup, delivery, eat-in, and curbside order types; catering is not mapped yet.",
        field: "fulfillment_type",
        severity: "error",
      });
    }

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

  private buildChannelOrderPayload(order: CanonicalOrderIntent, quote: OrderQuoteResult, context: POSContext) {
    const orderType = this.channelOrderType(order);
    const deliveryIsAsap = this.deliveryIsAsap(order);
    const requestedTime = new Date(order.requested_fulfillment_time).toISOString();
    const paymentDue = order.payment_policy === "invoice_manual" ? quote.totalCents : 0;
    const serviceCharge = this.metadataInteger(order, "service_charge_cents", "serviceChargeCents") ?? quote.feesCents;
    const deliveryCost = this.metadataInteger(order, "delivery_cost_cents", "deliveryCostCents") ?? 0;
    const serviceChargeTax = this.metadataInteger(order, "service_charge_tax_cents", "serviceChargeTaxCents") ?? 0;
    const deliveryCostTax = this.metadataInteger(order, "delivery_cost_tax_cents", "deliveryCostTaxCents") ?? 0;
    const discountTotal = this.metadataInteger(order, "discount_total_cents", "discountTotalCents") ?? 0;
    const discounts = Array.isArray(order.metadata?.discounts) ? order.metadata.discounts : undefined;
    const note = [
      order.packaging_instructions,
      order.dietary_constraints.length > 0 ? `Dietary constraints: ${order.dietary_constraints.join(", ")}` : "",
      this.metadataString(order, "note", "order_note", "orderNote"),
    ].filter(Boolean).join("\n");

    return {
      _id: order.external_order_reference,
      channelOrderId: order.external_order_reference,
      channelOrderDisplayId: this.displayOrderId(order.external_order_reference),
      channelLinkId: this.channelLinkId(context.connection, context),
      orderType,
      deliveryIsAsap,
      ...(orderType === 2 ? { deliveryTime: requestedTime } : {}),
      pickupTime: requestedTime,
      placedTime: new Date().toISOString(),
      courier: this.metadataString(order, "courier") ?? "restaurant",
      decimalDigits: 2,
      payment: {
        amount: quote.totalCents,
        type: order.payment_policy === "invoice_manual" ? 1 : 0,
        due: paymentDue,
        rebate: this.metadataInteger(order, "rebate_cents", "rebateCents") ?? 0,
        commissionType: this.metadataString(order, "commission_type", "commissionType") ?? "",
      },
      taxes: quote.taxCents > 0 ? [{ name: "Sales tax", total: quote.taxCents }] : [],
      taxRemitted: this.metadataInteger(order, "tax_remitted_cents", "taxRemittedCents") ?? 0,
      items: order.items.map((item) => this.mapChannelOrderItem(item, context)),
      includeCutlery: Boolean(order.metadata?.include_cutlery ?? order.metadata?.includeCutlery ?? false),
      orderIsAlreadyPaid: order.payment_policy !== "invoice_manual",
      ...(note ? { note } : {}),
      numberOfCustomers: order.headcount,
      customer: {
        name: order.customer.name,
        companyName: order.customer.teamName,
        phoneNumber: order.customer.phone,
        email: order.customer.email,
      },
      ...(order.fulfillment_type === "delivery" && order.fulfillment_address
        ? { deliveryAddress: this.mapDeliveryAddress(order) }
        : {}),
      deliveryCost,
      deliveryCostTax,
      serviceCharge,
      serviceChargeTax,
      tip: quote.tipCents,
      driverTip: this.metadataInteger(order, "driver_tip_cents", "driverTipCents") ?? 0,
      bagFee: this.metadataInteger(order, "bag_fee_cents", "bagFeeCents") ?? 0,
      ...(discountTotal !== 0 ? { discountTotal: discountTotal > 0 ? -discountTotal : discountTotal } : {}),
      ...(discounts ? { discounts } : {}),
    };
  }

  private channelOrderType(order: CanonicalOrderIntent) {
    if (order.fulfillment_type === "pickup") return 1;
    if (order.fulfillment_type === "delivery") return 2;
    if (order.fulfillment_type === "eat_in") return 3;
    if (order.fulfillment_type === "curbside") return 4;
    throw deliverectError(`Deliverect Channel API does not support fulfillment type ${order.fulfillment_type}.`);
  }

  private deliveryIsAsap(order: CanonicalOrderIntent) {
    const override = order.metadata?.deliveryIsAsap ?? order.metadata?.delivery_is_asap;
    if (typeof override === "boolean") return override;
    const requestedAt = new Date(order.requested_fulfillment_time).getTime();
    return Number.isFinite(requestedAt) && requestedAt - Date.now() <= 30 * 60 * 1000;
  }

  private displayOrderId(reference: string) {
    return reference.length > 32 ? reference.slice(-32) : reference;
  }

  private mapDeliveryAddress(order: CanonicalOrderIntent) {
    const address = order.fulfillment_address;
    if (!address) return undefined;
    return {
      street: address.address1,
      postalCode: address.postal_code,
      city: address.city,
      country: this.metadataString(order, "country", "delivery_country") ?? "US",
      extraAddressInfo: address.notes,
    };
  }

  private mapChannelOrderItem(item: CanonicalOrderIntent["items"][number], context: POSContext) {
    const menuItem = context.menuItems.find((entry) => entry.id === item.item_id);
    const itemReference =
      menuItem?.posRef.provider === "deliverect"
        ? menuItem.posRef.externalId
        : this.providerReference(context, "item", item.item_id);
    return {
      plu: itemReference ?? item.item_id,
      name: menuItem?.name ?? item.item_id,
      price: menuItem?.priceCents ?? 0,
      quantity: item.quantity,
      ...(item.notes ? { remark: item.notes } : {}),
      subItems: item.modifiers.map((modifier) => {
        const modifierRecord = context.modifiers.find((entry) => entry.id === modifier.modifier_id);
        return {
          plu: this.providerReference(context, "modifier", modifier.modifier_id) ?? modifierRecord?.id ?? modifier.modifier_id,
          name: modifierRecord?.name ?? modifier.modifier_id,
          price: modifierRecord?.priceCents ?? 0,
          quantity: modifier.quantity,
        };
      }),
    };
  }

  private providerReference(context: POSContext, canonicalType: "item" | "modifier_group" | "modifier", canonicalId: string) {
    return context.menuMappings?.find(
      (mapping) =>
        mapping.provider === "deliverect" &&
        mapping.canonicalType === canonicalType &&
        mapping.canonicalId === canonicalId &&
        mapping.status === "mapped",
    )?.providerReference;
  }

  private metadataString(order: CanonicalOrderIntent, ...keys: string[]) {
    for (const key of keys) {
      const value = order.metadata?.[key];
      if (typeof value === "string" && value.trim()) return value.trim();
      if (typeof value === "number" && Number.isFinite(value)) return String(value);
    }
    return undefined;
  }

  private metadataInteger(order: CanonicalOrderIntent, ...keys: string[]) {
    for (const key of keys) {
      const value = order.metadata?.[key];
      if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
      if (typeof value === "string" && value.trim() && !Number.isNaN(Number(value))) return Math.round(Number(value));
    }
    return undefined;
  }

  private readError(payload: unknown) {
    return (
      this.readString(payload, "description") ??
      this.readString(payload, "message") ??
      this.readString((payload as any).error, "message") ??
      "Unknown Deliverect error"
    );
  }

  private readMetadataString(source: { metadata: Record<string, unknown> } | undefined, key: string) {
    const value = source?.metadata?.[key];
    return typeof value === "string" ? value : "";
  }

  private readString(payload: unknown, key: string) {
    if (!isObject(payload)) {
      return undefined;
    }
    const value = payload[key];
    return typeof value === "string" ? value : typeof value === "number" ? String(value) : undefined;
  }

  private readTokenTtlSeconds(payload: unknown) {
    const expiresAt = Number(
      this.readString(payload, "expires_at") ??
      this.readString((payload as any).token, "expires_at"),
    );
    if (Number.isFinite(expiresAt) && expiresAt > 0) {
      const expiresAtMs = expiresAt > 10_000_000_000 ? expiresAt : expiresAt * 1000;
      return Math.max(60, Math.floor((expiresAtMs - Date.now()) / 1000));
    }

    const expiresIn = Number(
      this.readString(payload, "expires_in") ??
      this.readString((payload as any).token, "expires_in") ??
      3600,
    );
    return Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 3600;
  }

  private tipCents(order: CanonicalOrderIntent) {
    return Math.max(0, Math.round(Number(order.tip_cents ?? 0) || 0));
  }

}
