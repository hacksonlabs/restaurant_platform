import { describe, expect, it } from "vitest";
import { normalizeDeliverectEvent } from "../src/server/providers/deliverectEventNormalizer";

describe("normalizeDeliverectEvent", () => {
  it("maps checkout events to Phantom order status updates", () => {
    const event = normalizeDeliverectEvent("checkout.completed", {
      id: "evt_123",
      checkoutId: "checkout_123",
      status: "completed",
      metadata: {
        phantomOrderReference: "external-order-123",
      },
    });

    expect(event).toEqual({
      eventType: "checkout.completed",
      externalEventId: "evt_123",
      externalOrderId: "checkout_123",
      externalOrderReference: "external-order-123",
      status: "completed",
      externalStatus: "completed",
      rawEventRef: "evt_123",
      message: "Deliverect checkout.completed reported completed.",
    });
  });

  it("maps cancelled and failed events conservatively", () => {
    expect(normalizeDeliverectEvent("checkout.cancelled", { status: "cancelled" }).status).toBe("cancelled");
    expect(normalizeDeliverectEvent("checkout.failed", { status: "failed" }).status).toBe("failed");
    expect(normalizeDeliverectEvent("checkout.unknown", { status: "waiting" }).status).toBeUndefined();
  });

  it("maps Deliverect Channel order status payloads by numeric status and channel order id", () => {
    const event = normalizeDeliverectEvent("order_status", {
      orderId: "deliverect_order_123",
      status: 20,
      timeStamp: "2026-06-09T18:30:00.000Z",
      channelOrderId: "phantom-order-123",
      channelLink: "channel_link_123",
    });

    expect(event).toEqual(
      expect.objectContaining({
        externalOrderId: "deliverect_order_123",
        externalOrderReference: "phantom-order-123",
        status: "accepted",
      }),
    );
    expect(event.externalEventId).toContain("deliverect_order_123");
  });
});
