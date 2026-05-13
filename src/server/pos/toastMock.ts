import { createId } from "../utils/ids";
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

export class ToastAdapterMock implements POSAdapter {
  provider = "toast" as const;

  async testConnection(connection: POSConnection): Promise<ConnectionTestResult> {
    return {
      ok: true,
      status: connection.status === "not_connected" ? "sandbox" : connection.status,
      message: "Mock Toast sandbox connection is healthy.",
      checkedAt: new Date().toISOString(),
    };
  }

  async syncMenu(_connection: POSConnection, context: POSContext): Promise<MenuSyncResult> {
    return {
      status: "success",
      syncedAt: new Date().toISOString(),
      itemCount: context.menuItems.length,
      categoryCount: new Set(context.menuItems.map((item) => item.category)).size,
      modifierGroupCount: context.modifierGroups.length,
      message: "Mock Toast menu sync completed from seeded catalog.",
    };
  }

  async validateOrder(order: CanonicalOrderIntent): Promise<OrderValidationResult> {
    return {
      id: createId("ovr"),
      orderId: order.external_order_reference,
      valid: true,
      issues: [],
      checkedAt: new Date().toISOString(),
    };
  }

  async quoteOrder(order: CanonicalOrderIntent, context: POSContext): Promise<OrderQuoteResult> {
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
    const taxCents = Math.round(subtotalCents * 0.09);
    const feesCents = Math.round(subtotalCents * 0.03);

    return {
      ok: true,
      subtotalCents,
      taxCents,
      feesCents,
      totalCents: subtotalCents + taxCents + feesCents,
      message: "Mock Toast quote generated.",
    };
  }

  async startPayment(
    order: CanonicalOrderIntent,
    quote: OrderQuoteResult,
    paymentSession: { successUrl: string; cancelUrl: string },
  ): Promise<POSPaymentSessionResult> {
    const redirectUrl = new URL(paymentSession.successUrl);
    redirectUrl.searchParams.set("provider", "phantom");
    redirectUrl.searchParams.set("payment_provider", "toast_mock");

    return {
      ok: true,
      status: "redirect_required",
      redirectUrl: redirectUrl.toString(),
      paymentReference: `toast_pay_${order.external_order_reference}`,
      totalCents: quote.totalCents,
      currency: "USD",
      message: "Mock restaurant-owned payment redirect created.",
      raw: {
        paymentStatus: "pending",
        checkoutFlow: "redirect",
        cancelUrl: paymentSession.cancelUrl,
      },
    };
  }

  async submitOrder(
    order: CanonicalOrderIntent,
    quote: OrderQuoteResult,
  ): Promise<POSSubmissionResult> {
    return {
      ok: true,
      externalOrderId: `toast_mock_${order.external_order_reference}`,
      status: "accepted",
      message: "Order accepted by mock Toast adapter.",
      raw: {
        acceptedAt: new Date().toISOString(),
        totalCents: quote.totalCents,
      },
    };
  }

  async getOrderStatus(posOrderId: string): Promise<POSOrderStatusResult> {
    return {
      ok: true,
      externalOrderId: posOrderId,
      status: "accepted",
      message: "Mock Toast reports the order as accepted.",
    };
  }

  async diagnose(_connection: POSConnection, context: POSContext): Promise<POSDiagnosticsResult> {
    return {
      provider: "toast",
      mode: "mock",
      overallOk: true,
      checks: [
        { key: "config", ok: true, message: "Mock Toast mode requires no external credentials." },
        {
          key: "menu_sync",
          ok: context.menuItems.length > 0,
          message: context.menuItems.length > 0
            ? `Mock catalog is loaded with ${context.menuItems.length} canonical items.`
            : "Mock catalog is empty.",
        },
        { key: "quote_readiness", ok: true, message: "Mock pricing is ready." },
        { key: "submit_readiness", ok: true, message: "Mock order submission is ready." },
      ],
    };
  }
}
