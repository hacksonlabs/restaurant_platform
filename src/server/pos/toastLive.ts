import type { AppEnv } from "../config/env";
import type {
  CanonicalOrderIntent,
  ConnectionTestResult,
  POSAdapter,
  POSConnection,
  POSContext,
  POSDiagnosticsResult,
  POSOrderStatusResult,
  POSSubmissionResult,
  MenuSyncResult,
  OrderQuoteResult,
  OrderValidationResult,
} from "../../shared/types";

interface ToastTokenCache {
  accessToken: string;
  expiresAt: number;
}

function toastError(message: string): Error {
  return new Error(message);
}

function buildChecks(checks: Array<{ key: string; ok: boolean; message: string }>): POSDiagnosticsResult {
  return {
    provider: "toast",
    mode: "live",
    overallOk: checks.every((check) => check.ok),
    checks,
  };
}

function isFutureOrder(order: CanonicalOrderIntent) {
  return new Date(order.requested_fulfillment_time).getTime() > Date.now() + 5 * 60 * 1000;
}

export class ToastAdapterLive implements POSAdapter {
  provider = "toast" as const;
  private tokenCache: ToastTokenCache | null = null;

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
      message: authCheck?.message ?? "Toast live diagnostics completed.",
      checkedAt: new Date().toISOString(),
    };
  }

  async syncMenu(_connection: POSConnection, context: POSContext): Promise<MenuSyncResult> {
    this.assertConfigured();
    return {
      status: "warning",
      syncedAt: new Date().toISOString(),
      itemCount: context.menuItems.length,
      categoryCount: new Set(context.menuItems.map((item) => item.category)).size,
      modifierGroupCount: context.modifierGroups.length,
      message: "Toast live menu sync scaffold is ready. Confirm menu scopes and location metadata before enabling writes.",
    };
  }

  async validateOrder(order: CanonicalOrderIntent, context: POSContext): Promise<OrderValidationResult> {
    this.assertConfigured();
    const issues = this.localToastReadinessIssues(order, context);
    return {
      id: `toast_live_validation_${Date.now()}`,
      orderId: order.external_order_reference,
      valid: issues.length === 0,
      issues,
      checkedAt: new Date().toISOString(),
    };
  }

  async quoteOrder(order: CanonicalOrderIntent, context: POSContext): Promise<OrderQuoteResult> {
    this.assertConfigured();
    const requestBody = this.mapCanonicalOrderToToastOrder(order, context);
    const response = await this.toastFetch("/orders/v2/prices", {
      method: "POST",
      body: JSON.stringify(requestBody),
      headers: this.toastHeaders(context.connection.restaurantGuid ?? this.env?.toastRestaurantGuid ?? ""),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw toastError(`Toast /prices failed: ${response.status} ${this.readToastError(payload)}`);
    }
    const totals = this.extractToastTotals(payload);
    return {
      ok: true,
      subtotalCents: totals.subtotalCents,
      taxCents: totals.taxCents,
      feesCents: totals.feesCents,
      totalCents: totals.totalCents,
      message: "Toast sandbox/live quote generated.",
    };
  }

  async submitOrder(
    order: CanonicalOrderIntent,
    quote: OrderQuoteResult,
    context: POSContext,
  ): Promise<POSSubmissionResult> {
    this.assertConfigured();
    const pricedOrder = await this.getPricedToastOrder(order, context);
    const response = await this.toastFetch("/orders/v2/orders", {
      method: "POST",
      body: JSON.stringify(pricedOrder),
      headers: this.toastHeaders(context.connection.restaurantGuid ?? this.env?.toastRestaurantGuid ?? ""),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        externalOrderId: null,
        status: "failed",
        message: `Toast /orders failed: ${response.status} ${this.readToastError(payload)}`,
        raw: payload,
      };
    }

    return {
      ok: true,
      externalOrderId: payload.guid ?? payload.orderGuid ?? order.external_order_reference,
      status: payload.voidDate ? "failed" : "submitted",
      message: `Toast order created after pricing. Total submitted: ${quote.totalCents} cents.`,
      raw: payload,
    };
  }

  async getOrderStatus(posOrderId: string, context: POSContext): Promise<POSOrderStatusResult> {
    this.assertConfigured();
    const response = await this.toastFetch(`/orders/v2/orders/${posOrderId}`, {
      headers: this.toastHeaders(context.connection.restaurantGuid ?? this.env?.toastRestaurantGuid ?? ""),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw toastError(`Toast order status lookup failed: ${response.status} ${this.readToastError(payload)}`);
    }
    return {
      ok: true,
      externalOrderId: payload.guid ?? posOrderId,
      status: this.mapToastStatus(payload),
      message: "Toast live order status retrieved.",
    };
  }

  async diagnose(connection: POSConnection, context: POSContext): Promise<POSDiagnosticsResult> {
    const checks: POSDiagnosticsResult["checks"] = [];
    const configured = this.hasMinimumConfiguration(connection);
    checks.push({
      key: "config",
      ok: configured.ok,
      message: configured.message,
    });
    checks.push({
      key: "restaurant_guid",
      ok: Boolean(connection.restaurantGuid || this.env?.toastRestaurantGuid),
      message: connection.restaurantGuid || this.env?.toastRestaurantGuid
        ? "Restaurant GUID is configured."
        : "Missing Toast restaurant GUID.",
    });
    checks.push({
      key: "menu_sync",
      ok: context.menuItems.length > 0,
      message: context.menuItems.length > 0
        ? `Menu sync seam has ${context.menuItems.length} canonical items available for mapping.`
        : "No canonical menu items are available for sync or quote requests.",
    });

    if (!configured.ok) {
      checks.push({
        key: "auth",
        ok: false,
        message: "Auth check skipped because required live credentials are incomplete.",
      });
      checks.push({
        key: "quote_readiness",
        ok: false,
        message: "Quote readiness blocked until config, menu mappings, and auth are configured.",
      });
      checks.push({
        key: "submit_readiness",
        ok: false,
        message: "Submit readiness blocked until quote readiness passes.",
      });
      return buildChecks(checks);
    }

    try {
      await this.getAccessToken();
      checks.push({
        key: "auth",
        ok: true,
        message: "Toast authentication is available for this environment.",
      });
    } catch (error) {
      checks.push({
        key: "auth",
        ok: false,
        message: error instanceof Error ? error.message : "Toast authentication failed.",
      });
    }

    const mappingReady = context.menuItems.every((item) => item.mappingStatus === "mapped");
    checks.push({
      key: "quote_readiness",
      ok: mappingReady,
      message: mappingReady
        ? "Menu items are mapped and ready for Toast pricing requests."
        : "At least one canonical item still has mappingStatus=needs_review.",
    });
    checks.push({
      key: "submit_readiness",
      ok: mappingReady && checks.every((check) => check.ok),
      message: mappingReady
        ? "Live submit flow can proceed once the order is quoted and approved."
        : "Live submit flow blocked by mapping or auth readiness gaps.",
    });

    return buildChecks(checks);
  }

  private assertConfigured() {
    const ok = this.hasMinimumConfiguration();
    if (!ok.ok) {
      throw toastError(ok.message);
    }
  }

  private hasMinimumConfiguration(connection?: POSConnection) {
    const env = this.env;
    if (!env) {
      return { ok: false, message: "Toast live adapter is missing application environment configuration." };
    }
    if (!env.toastBaseUrl) {
      return { ok: false, message: "TOAST_BASE_URL is required for live Toast mode." };
    }
    if (!(env.toastAccessToken || (env.toastClientId && env.toastClientSecret))) {
      return {
        ok: false,
        message: "Provide TOAST_ACCESS_TOKEN or TOAST_CLIENT_ID and TOAST_CLIENT_SECRET before enabling live Toast mode.",
      };
    }
    if (!(connection?.restaurantGuid || env.toastRestaurantGuid)) {
      return {
        ok: false,
        message: "Toast restaurant GUID is required for live Toast mode.",
      };
    }
    return { ok: true, message: "Live Toast config is present." };
  }

  private async getAccessToken() {
    const env = this.env;
    if (!env) {
      throw toastError("Toast live adapter is missing application environment configuration.");
    }
    if (env.toastAccessToken) {
      return env.toastAccessToken;
    }
    if (this.tokenCache && this.tokenCache.expiresAt > Date.now() + 60_000) {
      return this.tokenCache.accessToken;
    }
    if (!env.toastClientId || !env.toastClientSecret) {
      throw toastError("Toast client credentials are required to request an access token.");
    }
    const response = await fetch(`${env.toastBaseUrl.replace(/\/$/, "")}/authentication/v1/authentication/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        clientId: env.toastClientId,
        clientSecret: env.toastClientSecret,
        userAccessType: "TOAST_MACHINE_CLIENT",
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw toastError(`Toast authentication failed: ${response.status} ${this.readToastError(payload)}`);
    }
    const accessToken = payload?.token?.accessToken;
    if (!accessToken) {
      throw toastError("Toast authentication succeeded but no access token was returned.");
    }
    const expiresIn = Number(payload?.token?.expiresIn ?? 3600);
    this.tokenCache = {
      accessToken,
      expiresAt: Date.now() + expiresIn * 1000,
    };
    return accessToken;
  }

  private toastHeaders(restaurantGuid: string) {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.env?.toastAccessToken ?? ""}`,
      "Toast-Restaurant-External-ID": restaurantGuid,
    };
  }

  private async toastFetch(path: string, init: RequestInit & { headers?: Record<string, string> }) {
    const env = this.env;
    if (!env) {
      throw toastError("Toast live adapter is missing application environment configuration.");
    }
    const accessToken = await this.getAccessToken();
    const headers = {
      ...(init.headers ?? {}),
      Authorization: `Bearer ${accessToken}`,
    };
    return fetch(`${env.toastBaseUrl.replace(/\/$/, "")}${path}`, {
      ...init,
      headers,
    });
  }

  private localToastReadinessIssues(order: CanonicalOrderIntent, context: POSContext): OrderValidationResult["issues"] {
    const issues: OrderValidationResult["issues"] = [];
    const menuItemMap = new Map(context.menuItems.map((item) => [item.id, item]));
    order.items.forEach((item, index) => {
      const menuItem = menuItemMap.get(item.item_id);
      if (!menuItem) {
        issues.push({
          code: "toast_item_missing",
          message: `Canonical item ${item.item_id} could not be mapped to a Toast selection.`,
          field: `items.${index}.item_id`,
          severity: "error",
        });
      }
      if (menuItem?.mappingStatus !== "mapped") {
        issues.push({
          code: "toast_mapping_unready",
          message: `Canonical item ${item.item_id} is not mapped for Toast live submission.`,
          field: `items.${index}.item_id`,
          severity: "error",
        });
      }
    });
    if (isFutureOrder(order) && !order.requested_fulfillment_time) {
      issues.push({
        code: "toast_promised_date_missing",
        message: "Future Toast orders require a promisedDate.",
        field: "requested_fulfillment_time",
        severity: "error",
      });
    }
    return issues;
  }

  private mapCanonicalOrderToToastOrder(order: CanonicalOrderIntent, context: POSContext) {
    const menuItemMap = new Map(context.menuItems.map((item) => [item.id, item]));
    const modifierMap = new Map(context.modifiers.map((modifier) => [modifier.id, modifier]));
    const openedDate = isFutureOrder(order) ? order.requested_fulfillment_time : new Date().toISOString();
    const promisedDate = isFutureOrder(order) ? order.requested_fulfillment_time : null;

    return {
      entityType: "Order",
      externalId: order.external_order_reference,
      source: "API",
      openedDate,
      promisedDate,
      numberOfGuests: order.headcount,
      checks: [
        {
          entityType: "Check",
          customer: {
            firstName: order.customer.name,
            email: order.customer.email ?? undefined,
            phone: order.customer.phone ?? undefined,
          },
          selections: order.items.map((item) => {
            const menuItem = menuItemMap.get(item.item_id);
            return {
              item: {
                externalId: menuItem?.posRef.externalId ?? item.item_id,
              },
              quantity: item.quantity,
              specialInstructions: item.notes ?? undefined,
              modifiers: item.modifiers.map((modifier) => ({
                optionGroup: {
                  externalId: modifier.modifier_group_id,
                },
                item: {
                  externalId: modifierMap.get(modifier.modifier_id)?.name ? modifier.modifier_id : modifier.modifier_id,
                },
                quantity: modifier.quantity,
              })),
            };
          }),
          paymentStatus: order.payment_policy === "invoice_manual" ? "OPEN" : "OPEN",
        },
      ],
    };
  }

  private async getPricedToastOrder(order: CanonicalOrderIntent, context: POSContext) {
    const requestBody = this.mapCanonicalOrderToToastOrder(order, context);
    const response = await this.toastFetch("/orders/v2/prices", {
      method: "POST",
      body: JSON.stringify(requestBody),
      headers: this.toastHeaders(context.connection.restaurantGuid ?? this.env?.toastRestaurantGuid ?? ""),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw toastError(`Toast /prices failed: ${response.status} ${this.readToastError(payload)}`);
    }
    return payload;
  }

  private extractToastTotals(payload: any) {
    const check = payload?.checks?.[0];
    const subtotal = Number(check?.amount ?? check?.displaySubtotal ?? check?.subtotal ?? 0);
    const tax = Number(check?.taxAmount ?? check?.tax ?? 0);
    const total = Number(check?.totalAmount ?? check?.total ?? subtotal + tax);
    return {
      subtotalCents: Math.round(subtotal * 100),
      taxCents: Math.round(tax * 100),
      feesCents: Math.max(0, Math.round(total * 100) - Math.round(subtotal * 100) - Math.round(tax * 100)),
      totalCents: Math.round(total * 100),
    };
  }

  private mapToastStatus(payload: any): POSOrderStatusResult["status"] {
    if (payload?.voidDate) return "cancelled";
    if (payload?.paidDate || payload?.completedDate) return "completed";
    if (payload?.estimatedFulfillmentDate) return "accepted";
    return "submitted_to_pos";
  }

  private readToastError(payload: any) {
    if (typeof payload?.message === "string") return payload.message;
    if (typeof payload?.error === "string") return payload.error;
    if (typeof payload?.status === "string") return payload.status;
    return "Unknown Toast error";
  }
}
