import type { AgentOrderStatus } from "../../shared/types";

export interface NormalizedDeliverectEvent {
  eventType: string;
  externalEventId?: string;
  externalOrderId?: string;
  externalOrderReference?: string;
  status?: AgentOrderStatus;
  externalStatus?: string;
  rawEventRef?: string;
  message: string;
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

function firstString(...values: Array<string | undefined>) {
  return values.find((value) => value && value.trim());
}

const NUMERIC_STATUS_MAP: Record<string, AgentOrderStatus> = {
  "20": "accepted",
  "30": "preparing",
  "40": "ready",
  "70": "completed",
  "80": "completed",
  "90": "completed",
  "100": "cancelled",
  "110": "cancelled",
  "120": "failed",
};

function normalizeStatus(value: string | undefined): AgentOrderStatus | undefined {
  const status = value?.toLowerCase();
  if (!status) return undefined;
  const numericStatus = NUMERIC_STATUS_MAP[status];
  if (numericStatus) return numericStatus;
  if (["accepted", "confirmed", "pos_accepted", "injected", "submitted", "created"].some((entry) => status.includes(entry))) {
    return "accepted";
  }
  if (["preparing", "preparation", "in_kitchen", "kitchen"].some((entry) => status.includes(entry))) {
    return "preparing";
  }
  if (["ready", "pickup_ready"].some((entry) => status.includes(entry))) {
    return "ready";
  }
  if (["completed", "complete", "delivered", "collected", "picked_up", "success"].some((entry) => status.includes(entry))) {
    return "completed";
  }
  if (["rejected", "reject", "declined"].some((entry) => status.includes(entry))) {
    return "rejected";
  }
  if (["cancelled", "canceled", "cancel"].some((entry) => status.includes(entry))) {
    return "cancelled";
  }
  if (["failed", "failure", "error"].some((entry) => status.includes(entry))) {
    return "failed";
  }
  return undefined;
}

export function normalizeDeliverectEvent(eventType: string, payload: Record<string, unknown>): NormalizedDeliverectEvent {
  const checkout = isObject(payload.checkout) ? payload.checkout : {};
  const order = isObject(payload.order) ? payload.order : {};
  const metadata =
    (isObject(payload.metadata) && payload.metadata) ||
    (isObject(checkout.metadata) && checkout.metadata) ||
    (isObject(order.metadata) && order.metadata) ||
    {};
  const rawStatus = firstString(
    readString(payload, "status", "checkoutStatus", "orderStatus"),
    readString(checkout, "status", "checkoutStatus"),
    readString(order, "status", "orderStatus"),
    eventType,
  );
  const status = normalizeStatus(rawStatus);
  const externalOrderId = firstString(
    readString(payload, "checkoutId", "externalOrderId", "orderId", "id"),
    readString(checkout, "checkoutId", "id", "orderId"),
    readString(order, "orderId", "id"),
  );
  const externalOrderReference = firstString(
    readString(metadata, "phantomOrderReference", "external_order_reference", "externalOrderReference"),
    readString(payload, "phantomOrderReference", "externalOrderReference", "external_order_reference", "reference", "channelOrderId"),
    readString(checkout, "reference", "externalOrderReference"),
    readString(order, "reference", "externalOrderReference"),
  );
  const timestamp = readString(payload, "timestamp", "timeStamp", "updatedAt", "createdAt");
  const syntheticEventId = [externalOrderId, externalOrderReference, rawStatus, timestamp].filter(Boolean).join(":") || undefined;
  const externalEventId = firstString(readString(payload, "eventId", "id"), readString(payload, "_id"), syntheticEventId);

  return {
    eventType,
    externalEventId,
    externalOrderId,
    externalOrderReference,
    status,
    externalStatus: rawStatus,
    rawEventRef: externalEventId ?? syntheticEventId,
    message: status
      ? `Deliverect ${eventType} reported ${status}.`
      : `Deliverect ${eventType} received without a mapped Phantom status.`,
  };
}
